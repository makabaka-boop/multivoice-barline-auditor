import { describe, expect, it } from 'vitest';
import { demoSpec, emptySpec } from '../lib/demo';
import { analyzeScore } from '../engine/rhythm';
import {
  editorReducer,
  initialEditorState,
  parseNumerator,
  stateFromSpec,
  toScoreSpec,
  validateEditor,
} from './editor';

describe('编辑器状态与校验', () => {
  it('空谱合法：一个声部一个事件、拍号 4/4', () => {
    const s = stateFromSpec(emptySpec());
    expect(validateEditor(s)).toHaveLength(0);
    const spec = toScoreSpec(s);
    expect(spec.voices).toHaveLength(1);
    expect(spec.voices[0].events).toHaveLength(1);
  });

  it('添加声部与事件、删除事件均生成不重复 id', () => {
    let s = stateFromSpec(emptySpec());
    s = editorReducer(s, { type: 'addVoice' });
    s = editorReducer(s, { type: 'addEvent', voiceId: s.voices[0].id });
    s = editorReducer(s, { type: 'addEvent', voiceId: s.voices[1].id });
    expect(s.voices).toHaveLength(2);
    expect(s.voices[0].events).toHaveLength(2);
    expect(s.voices[1].events).toHaveLength(2);
    const ids = s.voices.flatMap((v) => v.events.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('删除后再新增 id 不复用（seq 单调）', () => {
    let s = stateFromSpec(emptySpec());
    const firstId = s.voices[0].events[0].id;
    s = editorReducer(s, { type: 'addEvent', voiceId: s.voices[0].id });
    const secondId = s.voices[0].events[1].id;
    s = editorReducer(s, { type: 'removeEvent', voiceId: s.voices[0].id, eventId: secondId });
    s = editorReducer(s, { type: 'addEvent', voiceId: s.voices[0].id });
    const thirdId = s.voices[0].events[1].id;
    expect(thirdId).not.toBe(firstId);
    expect(thirdId).not.toBe(secondId);
  });

  it('任何编辑都会置 dirty；markClean 复位', () => {
    let s = stateFromSpec(emptySpec());
    expect(s.dirty).toBe(false);
    s = editorReducer(s, { type: 'setNumerator', value: '6' });
    expect(s.dirty).toBe(true);
    expect(s.numeratorInput).toBe('6');
    s = editorReducer(s, { type: 'markClean' });
    expect(s.dirty).toBe(false);
  });

  it('非法分子与空小节号被校验拦截', () => {
    let s = stateFromSpec(emptySpec());
    s = editorReducer(s, { type: 'setNumerator', value: '13' });
    expect(parseNumerator('13')).toBeNull();
    expect(validateEditor(s).length).toBeGreaterThan(0);
    s = editorReducer(s, { type: 'setNumerator', value: '4' });
    s = editorReducer(s, {
      type: 'setEventMeasure',
      voiceId: s.voices[0].id,
      eventId: s.voices[0].events[0].id,
      value: '',
    });
    expect(validateEditor(s).some((i) => i.message.includes('标称小节号'))).toBe(true);
  });

  it('声部不能超过 4、事件不能超过 120（通过 action 守卫）', () => {
    let s = stateFromSpec(emptySpec());
    for (let i = 0; i < 5; i++) s = editorReducer(s, { type: 'addVoice' });
    expect(s.voices).toHaveLength(4);
    const vid = s.voices[0].id;
    for (let i = 0; i < 130; i++) s = editorReducer(s, { type: 'addEvent', voiceId: vid });
    expect(s.voices[0].events.length).toBe(120);
  });

  it('示例可往返分析：首错为长笛 fl-e7，结尾缺 3/2', () => {
    const s = stateFromSpec(demoSpec());
    expect(validateEditor(s)).toHaveLength(0);
    const report = analyzeScore(toScoreSpec(s));
    expect(report.firstError?.eventId).toBe('fl-e7');
    // 声部 id 在载入时重新生成（事件 id 保留），按声部名取单簧管。
    const clarinet = report.endings.find((e) => e.name === '单簧管')!;
    expect(clarinet.shortfallToReference).toEqual({ num: '3', den: '2' });
  });

  it('初始状态即空 4/4 谱', () => {
    const s = initialEditorState();
    expect(s.numeratorInput).toBe('4');
    expect(s.denominator).toBe(4);
    expect(validateEditor(s)).toHaveLength(0);
  });
});
