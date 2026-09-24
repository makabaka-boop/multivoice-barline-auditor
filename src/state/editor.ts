/**
 * editor.ts —— 录入台状态（React useReducer）
 *
 * - 拍号分子 2–12、分母 4/8；声部 1–4；每声部事件 1–120。
 * - 事件 id 在整张谱内唯一、自动生成、不可手改；声部 id 同。
 * - dirty：自最近一次核对以来是否又编辑过。旧报告会被标记为“已失效”，
 *   下载按钮在重新核对前禁用，避免导出陈旧结论。
 */

import {
  DurationDenominator,
  EventSpec,
  MAX_EVENTS_PER_VOICE,
  MAX_NUMERATOR,
  MAX_VOICES,
  MIN_EVENTS,
  MIN_NUMERATOR,
  MIN_VOICES,
  ScoreSpec,
  TIME_DENOMINATORS,
  TimeDenominator,
  VoiceSpec,
} from '../engine/rhythm';
import { demoSpec, emptySpec } from '../lib/demo';

export interface EventDraft {
  id: string;
  measureInput: string;
  durationDenominator: DurationDenominator;
  dotted: boolean;
  triplet: boolean;
}

export interface VoiceDraft {
  id: string;
  name: string;
  events: EventDraft[];
}

export interface EditorState {
  numeratorInput: string;
  denominator: TimeDenominator;
  voices: VoiceDraft[];
  /** 全局自增序号，保证 id 即便删除/重排也不复用。 */
  seq: number;
  dirty: boolean;
  /** 最近一次把示例载入/操作反馈用。 */
  notice: string | null;
}

export type EditorAction =
  | { type: 'setNumerator'; value: string }
  | { type: 'setDenominator'; value: TimeDenominator }
  | { type: 'renameVoice'; voiceId: string; name: string }
  | { type: 'addVoice' }
  | { type: 'removeVoice'; voiceId: string }
  | { type: 'addEvent'; voiceId: string }
  | { type: 'removeEvent'; voiceId: string; eventId: string }
  | { type: 'moveEvent'; voiceId: string; eventId: string; dir: -1 | 1 }
  | { type: 'setEventMeasure'; voiceId: string; eventId: string; value: string }
  | { type: 'setEventDuration'; voiceId: string; eventId: string; value: DurationDenominator }
  | { type: 'toggleEventFlag'; voiceId: string; eventId: string; field: 'dotted' | 'triplet' }
  | { type: 'loadSpec'; spec: ScoreSpec }
  | { type: 'loadDemo' }
  | { type: 'loadEmpty' }
  | { type: 'markClean' }
  | { type: 'clearNotice' };

const DEFAULT_VOICE_NAMES = ['长笛', '单簧管', '双簧管', '巴松'];

function nextId(kind: 'v' | 'e', seq: number): { id: string; seq: number } {
  return { id: `${kind}${seq}`, seq: seq + 1 };
}

function makeEvent(seq: number, measure: number, event?: Partial<EventSpec>): { draft: EventDraft; seq: number } {
  const { id, seq: next } = nextId('e', seq);
  return {
    draft: {
      id,
      measureInput: String(measure),
      durationDenominator: event?.durationDenominator ?? 4,
      dotted: event?.dotted ?? false,
      triplet: event?.triplet ?? false,
    },
    seq: next,
  };
}

export function stateFromSpec(spec: ScoreSpec): EditorState {
  let seq = 1;
  const voices: VoiceDraft[] = spec.voices.map((v) => {
    const vid = nextId('v', seq);
    seq = vid.seq;
    const events: EventDraft[] = [];
    for (const e of v.events) {
      const made = makeEvent(seq, e.measure, e);
      // 载入谱时保留外部既有 id（下载 JSON 复算时可对应）。
      made.draft = { ...made.draft, id: e.id };
      seq = made.seq;
      events.push(made.draft);
    }
    return { id: vid.id, name: v.name, events };
  });
  return {
    numeratorInput: String(spec.numerator),
    denominator: spec.denominator,
    voices,
    seq,
    dirty: false,
    notice: null,
  };
}

export function initialEditorState(): EditorState {
  return stateFromSpec(emptySpec());
}

function clone(state: EditorState): EditorState {
  return {
    ...state,
    voices: state.voices.map((v) => ({ ...v, events: v.events.map((e) => ({ ...e })) })),
  };
}

function touched(state: EditorState): EditorState {
  return { ...state, dirty: true, notice: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setNumerator':
      return touched({ ...state, numeratorInput: action.value.replace(/[^0-9]/g, '').slice(0, 2) });

    case 'setDenominator':
      return touched({ ...state, denominator: action.value });

    case 'renameVoice': {
      const s = touched(clone(state));
      const v = s.voices.find((x) => x.id === action.voiceId);
      if (v) v.name = action.name;
      return s;
    }

    case 'addVoice': {
      if (state.voices.length >= MAX_VOICES) return { ...state, notice: `最多 ${MAX_VOICES} 个声部` };
      const s = touched(clone(state));
      const { id, seq } = nextId('v', s.seq);
      const made = makeEvent(seq, 1);
      s.seq = made.seq;
      s.voices.push({
        id,
        name: DEFAULT_VOICE_NAMES[s.voices.length] ?? `声部 ${s.voices.length + 1}`,
        events: [made.draft],
      });
      return s;
    }

    case 'removeVoice': {
      if (state.voices.length <= MIN_VOICES) return { ...state, notice: `至少保留 ${MIN_VOICES} 个声部` };
      const s = touched(clone(state));
      s.voices = s.voices.filter((v) => v.id !== action.voiceId);
      return s;
    }

    case 'addEvent': {
      const s = touched(clone(state));
      const v = s.voices.find((x) => x.id === action.voiceId);
      if (!v) return s;
      if (v.events.length >= MAX_EVENTS_PER_VOICE) {
        return { ...state, notice: `每声部最多 ${MAX_EVENTS_PER_VOICE} 个事件` };
      }
      // 新事件标称小节号预填为与末事件相同（最常见场景），用户可改。
      const lastMeasure = v.events[v.events.length - 1]?.measureInput ?? '1';
      const made = makeEvent(s.seq, Number(lastMeasure) || 1);
      s.seq = made.seq;
      v.events.push(made.draft);
      return s;
    }

    case 'removeEvent': {
      const s = touched(clone(state));
      const v = s.voices.find((x) => x.id === action.voiceId);
      if (!v || v.events.length <= MIN_EVENTS) return state;
      v.events = v.events.filter((e) => e.id !== action.eventId);
      return s;
    }

    case 'moveEvent': {
      const s = touched(clone(state));
      const v = s.voices.find((x) => x.id === action.voiceId);
      if (!v) return s;
      const i = v.events.findIndex((e) => e.id === action.eventId);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= v.events.length) return s;
      [v.events[i], v.events[j]] = [v.events[j], v.events[i]];
      return s;
    }

    case 'setEventMeasure': {
      const s = touched(clone(state));
      const e = s.voices
        .find((x) => x.id === action.voiceId)
        ?.events.find((x) => x.id === action.eventId);
      if (!e) return s;
      e.measureInput = action.value.replace(/[^0-9]/g, '').slice(0, 3);
      return s;
    }

    case 'setEventDuration': {
      const s = touched(clone(state));
      const e = s.voices
        .find((x) => x.id === action.voiceId)
        ?.events.find((x) => x.id === action.eventId);
      if (!e) return s;
      e.durationDenominator = action.value;
      return s;
    }

    case 'toggleEventFlag': {
      const s = touched(clone(state));
      const e = s.voices
        .find((x) => x.id === action.voiceId)
        ?.events.find((x) => x.id === action.eventId);
      if (!e) return s;
      e[action.field] = !e[action.field];
      return s;
    }

    case 'loadSpec':
      return stateFromSpec(action.spec);

    case 'loadDemo':
      return stateFromSpec(demoSpec());

    case 'loadEmpty':
      return stateFromSpec(emptySpec());

    case 'markClean':
      return { ...state, dirty: false };

    case 'clearNotice':
      return { ...state, notice: null };

    default:
      return state;
  }
}

// ---------- 校验与 ScoreSpec 导出 ----------

export interface ValidationIssue {
  readonly voiceId: string;
  readonly eventId?: string;
  readonly message: string;
}

export function parseNumerator(input: string): number | null {
  if (!/^\d+$/.test(input)) return null;
  const n = Number(input);
  return n >= MIN_NUMERATOR && n <= MAX_NUMERATOR ? n : null;
}

export function validateEditor(state: EditorState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (parseNumerator(state.numeratorInput) === null) {
    issues.push({ voiceId: '', message: `拍号分子须为 ${MIN_NUMERATOR}–${MAX_NUMERATOR} 的整数` });
  }
  if (!TIME_DENOMINATORS.includes(state.denominator)) {
    issues.push({ voiceId: '', message: '拍号分母仅支持 4 或 8' });
  }
  if (state.voices.length < MIN_VOICES || state.voices.length > MAX_VOICES) {
    issues.push({ voiceId: '', message: `声部数须为 ${MIN_VOICES}–${MAX_VOICES}` });
  }
  const allIds = new Set<string>();
  for (const v of state.voices) {
    if (!v.name.trim()) issues.push({ voiceId: v.id, message: '声部名称不能为空' });
    if (v.events.length < MIN_EVENTS || v.events.length > MAX_EVENTS_PER_VOICE) {
      issues.push({ voiceId: v.id, message: `事件数须为 ${MIN_EVENTS}–${MAX_EVENTS_PER_VOICE}` });
    }
    for (const e of v.events) {
      if (allIds.has(e.id)) {
        issues.push({ voiceId: v.id, eventId: e.id, message: `事件 id ${e.id} 重复` });
      }
      allIds.add(e.id);
      if (!/^\d+$/.test(e.measureInput) || Number(e.measureInput) < 1) {
        issues.push({ voiceId: v.id, eventId: e.id, message: `事件 ${e.id} 标称小节号须 ≥ 1` });
      }
    }
  }
  return issues;
}

/** 导出为引擎输入；调用前应先 validateEditor。 */
export function toScoreSpec(state: EditorState): ScoreSpec {
  const numerator = parseNumerator(state.numeratorInput);
  if (numerator === null) throw new Error('拍号分子非法');
  const voices: VoiceSpec[] = state.voices.map((v) => ({
    id: v.id,
    name: v.name.trim() || v.id,
    events: v.events.map<EventSpec>((e) => ({
      id: e.id,
      measure: Number(e.measureInput),
      durationDenominator: e.durationDenominator,
      dotted: e.dotted,
      triplet: e.triplet,
    })),
  }));
  return { numerator, denominator: state.denominator, voices };
}
