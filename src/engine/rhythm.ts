/**
 * rhythm.ts —— 多声部排练谱小节对齐核对引擎
 *
 * 约定：
 * - 所有位置以“全音符分数”为单位：全音符 = 1，二分 = 1/2，四分 = 1/4 …
 * - 附点：× 3/2；三连音：× 2/3；二者同时出现恰好抵消，仍为原时值。
 * - 拍号 numerator/denominator：一小节 = numerator/denominator 个全音符。
 * - 事件顺序录入，从各声部第 0 个位置开始首尾相接。
 * - 跨小节事件按实际小节线拆成显示片段，片段保留事件原 id。
 * - 标称小节号按“实际起始小节 = floor(start / 小节长度) + 1”核对。
 * - 全部计算使用 Fraction（整数分数），报告数值均可按有理数复算。
 */

import {
  Fraction,
  Rational,
  ZERO,
  add,
  ceilDiv,
  compare,
  equal,
  floorDiv,
  frac,
  isZero,
  scaleInt,
  sub,
  toRational,
} from './fraction';

/** 允许的时值分母：全 1、二分 2、四分 4、八分 8、十六分 16、三十二分 32。 */
export const DURATION_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const;
export type DurationDenominator = (typeof DURATION_DENOMINATORS)[number];

export const TIME_DENOMINATORS = [4, 8] as const;
export type TimeDenominator = (typeof TIME_DENOMINATORS)[number];

export const MIN_NUMERATOR = 2;
export const MAX_NUMERATOR = 12;
export const MIN_VOICES = 1;
export const MAX_VOICES = 4;
export const MIN_EVENTS = 1;
export const MAX_EVENTS_PER_VOICE = 120;

/** 录入端事件（标称小节号从 1 开始）。 */
export interface EventSpec {
  readonly id: string;
  /** 标称小节号（排练员手写/原谱标注）。 */
  readonly measure: number;
  readonly durationDenominator: DurationDenominator;
  readonly dotted: boolean;
  readonly triplet: boolean;
}

export interface VoiceSpec {
  readonly id: string;
  readonly name: string;
  readonly events: readonly EventSpec[];
}

export interface ScoreSpec {
  readonly numerator: number;
  readonly denominator: TimeDenominator;
  readonly voices: readonly VoiceSpec[];
}

// ---------- 输出（JSON 安全，有理数为字符串分子分母） ----------

export interface FragmentJson {
  /** 所属事件的原 id，跨小节拆分后各片段保持一致。 */
  readonly eventId: string;
  readonly eventIndex: number;
  readonly fragmentIndex: number;
  readonly measureIndex: number;
  readonly start: Rational;
  readonly end: Rational;
  /** 相对本小节起点的偏移。 */
  readonly offsetInMeasure: Rational;
  readonly length: Rational;
  /** 是否为跨小节事件被拆出的部分（片段数 > 1）。 */
  readonly split: boolean;
  /** 是否为原事件的起始片段。 */
  readonly first: boolean;
}

export interface EventReportJson {
  readonly id: string;
  readonly index: number;
  readonly nominalMeasure: number;
  readonly actualStartMeasure: number;
  readonly measureMatches: boolean;
  readonly start: Rational;
  readonly end: Rational;
  readonly duration: Rational;
  readonly dotted: boolean;
  readonly triplet: boolean;
  readonly durationDenominator: DurationDenominator;
  readonly crossesBarline: boolean;
  readonly fragments: FragmentJson[];
}

export interface VoiceEndingJson {
  readonly voiceId: string;
  readonly name: string;
  readonly eventCount: number;
  readonly totalDuration: Rational;
  /** 本声部实际占据的小节数（含未补足的最后一小节）。 */
  readonly measureSpan: number;
  readonly endsOnBarline: boolean;
  /** 到本声部自身下一完整小节线的精确差额；已在线上则为 0。 */
  readonly shortfallToOwnBarline: Rational;
  /** 到全体声部最长终点的精确差额；已在最长终点则为 0。 */
  readonly shortfallToReference: Rational;
  readonly isLongest: boolean;
  /** 是否与全体声部在同一完整小节线结束。 */
  readonly aligned: boolean;
}

export interface MeasureMismatchJson {
  readonly voiceId: string;
  readonly voiceName: string;
  readonly eventId: string;
  readonly eventIndex: number;
  readonly nominalMeasure: number;
  readonly actualMeasure: number;
  readonly start: Rational;
}

export interface AnalysisReport {
  readonly timeSignature: { readonly numerator: number; readonly denominator: TimeDenominator };
  /** 小节长度（全音符分数）。 */
  readonly measureLength: Rational;
  readonly voices: ReadonlyArray<{
    readonly voiceId: string;
    readonly name: string;
    readonly totalDuration: Rational;
    readonly measureSpan: number;
    readonly events: readonly EventReportJson[];
  }>;
  readonly endings: readonly VoiceEndingJson[];
  /** 全体声部中最长终点位置。 */
  readonly referenceEnd: Rational;
  /** 共同结束应对齐的完整小节线索引（0 基）。 */
  readonly referenceMeasureIndex: number;
  /** 最长声部终点本身是否恰好落在完整小节线上。 */
  readonly referenceIsBarline: boolean;
  readonly longestVoiceId: string;
  readonly allEndAligned: boolean;
  /** 最早的一处小节号错误（按起点、声部、事件次序判定），无则 null。 */
  readonly firstError: MeasureMismatchJson | null;
  readonly mismatchCount: number;
  /** 原样回放输入，保证 JSON 自包含、可离线复算。 */
  readonly input: ScoreSpec;
}

// ---------- 纯分数运算 ----------

/** 单个事件时值：1/d ×（附点 ? 3/2）×（三连音 ? 2/3）。 */
export function eventDuration(
  event: Pick<EventSpec, 'durationDenominator' | 'dotted' | 'triplet'>,
): Fraction {
  let d = frac(1, event.durationDenominator);
  if (event.dotted) d = mulFrac(d, frac(3, 2));
  if (event.triplet) d = mulFrac(d, frac(2, 3));
  return d;
}

function mulFrac(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.num, a.den * b.den);
}

/** 小节长度 = 分子/分母（全音符分数）。 */
export function measureLengthFor(numerator: number, denominator: number): Fraction {
  return frac(numerator, denominator);
}

/** 某位置所在小节索引（0 基）与小节内偏移。 */
function measureAt(position: Fraction, measureLength: Fraction): { index: bigint; offset: Fraction } {
  const index = floorDiv(position, measureLength);
  const offset = sub(position, scaleInt(index, measureLength));
  return { index, offset };
}

/**
 * 把 [start, end) 的事件按小节线切成片段。
 * 每个片段记录所在小节、起止（全音符分数）与小节内偏移，保留原事件 id。
 */
export function splitAcrossBarlines(
  start: Fraction,
  end: Fraction,
  measureLength: Fraction,
): Array<{
  measureIndex: bigint;
  start: Fraction;
  end: Fraction;
  offsetInMeasure: Fraction;
  length: Fraction;
}> {
  if (compare(end, start) < 0) throw new Error('事件终点早于起点');
  if (equal(start, end)) return [];

  const fragments: ReturnType<typeof splitAcrossBarlines> = [];
  let cursor = start;
  let guard = 0;
  while (compare(cursor, end) < 0) {
    const { index, offset } = measureAt(cursor, measureLength);
    const barline = scaleInt(index + 1n, measureLength);
    const fragmentEnd = compare(barline, end) < 0 ? barline : end;
    fragments.push({
      measureIndex: index,
      start: cursor,
      end: fragmentEnd,
      offsetInMeasure: offset,
      length: sub(fragmentEnd, cursor),
    });
    cursor = fragmentEnd;
    guard += 1;
    if (guard > MAX_EVENTS_PER_VOICE * 4) {
      throw new Error('跨小节拆分异常：片段数超限');
    }
  }
  return fragments;
}

/** 轻量输入校验（UI 层另有更细的表单校验，引擎只守底线）。 */
export function validateSpec(spec: ScoreSpec): string | null {
  const { numerator, denominator, voices } = spec;
  if (!Number.isInteger(numerator) || numerator < MIN_NUMERATOR || numerator > MAX_NUMERATOR) {
    return `拍号分子须为 ${MIN_NUMERATOR}–${MAX_NUMERATOR} 的整数`;
  }
  if (!TIME_DENOMINATORS.includes(denominator as TimeDenominator)) {
    return '拍号分母仅支持 4 或 8';
  }
  if (!Array.isArray(voices) || voices.length < MIN_VOICES || voices.length > MAX_VOICES) {
    return `声部数须为 ${MIN_VOICES}–${MAX_VOICES}`;
  }
  const seenVoiceIds = new Set<string>();
  for (const voice of voices) {
    if (!voice.id || seenVoiceIds.has(voice.id)) return '声部 id 缺失或重复';
    seenVoiceIds.add(voice.id);
    if (!voice.events.length || voice.events.length > MAX_EVENTS_PER_VOICE) {
      return `声部「${voice.name}」事件数须为 ${MIN_EVENTS}–${MAX_EVENTS_PER_VOICE}`;
    }
    const eventIds = new Set<string>();
    for (const event of voice.events) {
      if (!event.id || eventIds.has(event.id)) return `声部「${voice.name}」存在缺失或重复的事件 id`;
      eventIds.add(event.id);
      if (!Number.isInteger(event.measure) || event.measure < 1) {
        return `事件 ${event.id} 的标称小节号须为不小于 1 的整数`;
      }
      if (!DURATION_DENOMINATORS.includes(event.durationDenominator)) {
        return `事件 ${event.id} 的时值分母非法`;
      }
    }
  }
  return null;
}

function compareRational(a: Rational, b: Rational): -1 | 0 | 1 {
  const lhs = BigInt(a.num) * BigInt(b.den);
  const rhs = BigInt(b.num) * BigInt(a.den);
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

/** 核对入口：整数分数累计每声部起止，产出完整报告。 */
export function analyzeScore(spec: ScoreSpec): AnalysisReport {
  const invalid = validateSpec(spec);
  if (invalid) throw new Error(invalid);

  const measureLength = measureLengthFor(spec.numerator, spec.denominator);

  const voiceResults: AnalysisReport['voices'][number][] = [];
  const totals = new Map<string, Fraction>();
  const endingBuilders: Array<Omit<VoiceEndingJson, 'shortfallToReference' | 'isLongest' | 'aligned'>> = [];
  const mismatches: MeasureMismatchJson[] = [];

  for (const voice of spec.voices) {
    let cursor = ZERO;
    const eventReports: EventReportJson[] = [];

    for (let i = 0; i < voice.events.length; i++) {
      const event = voice.events[i];
      const duration = eventDuration(event);
      const start = cursor;
      const end = add(start, duration);
      const { index: startMeasure } = measureAt(start, measureLength);
      const actualMeasure = Number(startMeasure) + 1;
      const rawFragments = splitAcrossBarlines(start, end, measureLength);
      const split = rawFragments.length > 1;

      const fragments: FragmentJson[] = rawFragments.map((f, fi) => ({
        eventId: event.id,
        eventIndex: i,
        fragmentIndex: fi,
        measureIndex: Number(f.measureIndex),
        start: toRational(f.start),
        end: toRational(f.end),
        offsetInMeasure: toRational(f.offsetInMeasure),
        length: toRational(f.length),
        split,
        first: fi === 0,
      }));

      if (event.measure !== actualMeasure) {
        mismatches.push({
          voiceId: voice.id,
          voiceName: voice.name,
          eventId: event.id,
          eventIndex: i,
          nominalMeasure: event.measure,
          actualMeasure,
          start: toRational(start),
        });
      }

      eventReports.push({
        id: event.id,
        index: i,
        nominalMeasure: event.measure,
        actualStartMeasure: actualMeasure,
        measureMatches: event.measure === actualMeasure,
        start: toRational(start),
        end: toRational(end),
        duration: toRational(duration),
        dotted: event.dotted,
        triplet: event.triplet,
        durationDenominator: event.durationDenominator,
        crossesBarline: split,
        fragments,
      });

      cursor = end;
    }

    const total = cursor;
    totals.set(voice.id, total);
    const measureSpanBig = ceilDiv(total, measureLength);
    const measureSpan = Number(measureSpanBig);
    const floorBig = floorDiv(total, measureLength);
    const endsOnBarline = equal(total, scaleInt(floorBig, measureLength));
    const ownBarline = scaleInt(measureSpanBig, measureLength);
    const ownShortfall = sub(ownBarline, total);

    voiceResults.push({
      voiceId: voice.id,
      name: voice.name,
      totalDuration: toRational(total),
      measureSpan,
      events: eventReports,
    });

    endingBuilders.push({
      voiceId: voice.id,
      name: voice.name,
      eventCount: voice.events.length,
      totalDuration: toRational(total),
      measureSpan,
      endsOnBarline,
      shortfallToOwnBarline: toRational(ownShortfall),
    });
  }

  // 全体声部共同结束线 = 最长声部终点；据此计算每声部精确差额。
  let longestVoiceId = spec.voices[0].id;
  for (const voice of spec.voices.slice(1)) {
    const cur = totals.get(voice.id)!;
    const best = totals.get(longestVoiceId)!;
    if (compare(cur, best) > 0) longestVoiceId = voice.id;
  }
  const referenceEnd = totals.get(longestVoiceId)!;
  const referenceFloor = floorDiv(referenceEnd, measureLength);
  const referenceIsBarline = equal(referenceEnd, scaleInt(referenceFloor, measureLength));
  const referenceBarlineIndex = referenceIsBarline ? referenceFloor : referenceFloor + 1n;

  const endings: VoiceEndingJson[] = endingBuilders.map((b) => {
    const total = totals.get(b.voiceId)!;
    const shortfallToReference = sub(referenceEnd, total);
    // 与全体在同一完整小节线结束：差额恰为 0、最长终点在线上、自身也在线上。
    const aligned = isZero(shortfallToReference) && referenceIsBarline && b.endsOnBarline;
    return {
      ...b,
      shortfallToReference: toRational(shortfallToReference),
      isLongest: b.voiceId === longestVoiceId,
      aligned,
    };
  });

  const allEndAligned = endings.every((e) => e.aligned);

  // 最早错误：起点最小（分数精确比较），其次声部顺序、事件顺序。
  const voiceOrder = new Map<string, number>();
  spec.voices.forEach((v, i) => voiceOrder.set(v.id, i));
  mismatches.sort((a, b) => {
    const c = compareRational(a.start, b.start);
    if (c !== 0) return c;
    const va = voiceOrder.get(a.voiceId)!;
    const vb = voiceOrder.get(b.voiceId)!;
    if (va !== vb) return va - vb;
    return a.eventIndex - b.eventIndex;
  });
  const firstError = mismatches[0] ?? null;

  return {
    timeSignature: { numerator: spec.numerator, denominator: spec.denominator },
    measureLength: toRational(measureLength),
    voices: voiceResults,
    endings,
    referenceEnd: toRational(referenceEnd),
    referenceMeasureIndex: Number(referenceBarlineIndex),
    referenceIsBarline,
    longestVoiceId,
    allEndAligned,
    firstError,
    mismatchCount: mismatches.length,
    input: spec,
  };
}

/** 人类可读的时值名称，如「附点八分音符」「三连音四分音符」。 */
export function durationName(
  denominator: DurationDenominator,
  dotted: boolean,
  triplet: boolean,
): string {
  const base: Record<DurationDenominator, string> = {
    1: '全音符',
    2: '二分音符',
    4: '四分音符',
    8: '八分音符',
    16: '十六分音符',
    32: '三十二分音符',
  };
  const prefix = `${triplet ? '三连音' : ''}${dotted ? '附点' : ''}`;
  return `${prefix}${base[denominator]}`;
}
