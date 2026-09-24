import { describe, expect, it } from 'vitest';
import {
  AnalysisReport,
  DurationDenominator,
  EventSpec,
  ScoreSpec,
  VoiceSpec,
  analyzeScore,
  durationName,
  eventDuration,
  splitAcrossBarlines,
  validateSpec,
} from './rhythm';
import { equal, frac, fromRational } from './fraction';

function evt(
  id: string,
  measure: number,
  durationDenominator: DurationDenominator,
  dotted = false,
  triplet = false,
): EventSpec {
  return { id, measure, durationDenominator, dotted, triplet };
}

function voice(id: string, name: string, events: EventSpec[]): VoiceSpec {
  return { id, name, events };
}

function score(
  numerator: number,
  denominator: 4 | 8,
  voices: VoiceSpec[],
): ScoreSpec {
  return { numerator, denominator, voices };
}

/** 重复 n 个同类型事件，标称小节号由 actualFor 决定时可在报告上另测。 */
function repeat(
  prefix: string,
  n: number,
  d: DurationDenominator,
  measureOf: (i: number) => number,
  opts: { dotted?: boolean; triplet?: boolean } = {},
): EventSpec[] {
  return Array.from({ length: n }, (_, i) =>
    evt(`${prefix}-${i + 1}`, measureOf(i), d, opts.dotted, opts.triplet),
  );
}

describe('时值：附点 / 三连音', () => {
  it('附点乘 3/2', () => {
    expect(equal(eventDuration(evt('a', 1, 2, true)), frac(3, 4))).toBe(true); // 附点二分 = 3/4 全音符
    expect(equal(eventDuration(evt('b', 1, 8, true)), frac(3, 16))).toBe(true); // 附点八分
  });

  it('三连音乘 2/3', () => {
    expect(equal(eventDuration(evt('a', 1, 4, false, true)), frac(1, 6))).toBe(true); // 三连音四分 = 1/6
    expect(equal(eventDuration(evt('b', 1, 8, false, true)), frac(1, 12))).toBe(true); // 三连音八分 = 1/12
  });

  it('附点与三连音同时出现恰好抵消', () => {
    expect(equal(eventDuration(evt('a', 1, 4, true, true)), frac(1, 4))).toBe(true);
  });

  it('时值名称', () => {
    expect(durationName(8, true, false)).toBe('附点八分音符');
    expect(durationName(4, false, true)).toBe('三连音四分音符');
  });
});

describe('三连音整数分数累计：恰在小节线不被误判', () => {
  it('小数累加 6 个四分三连音确有误差，而分数严格等于一小节', () => {
    let floatAcc = 0;
    for (let i = 0; i < 6; i++) floatAcc += 1 / 6;
    expect(floatAcc).toBeLessThan(1); // 0.9999999999999999：小数判定会把下一小节首拍误归前一小节

    // 4/4：6 个四分三连音（各 1/6）铺满第一小节，随后四分音符必须落在第 2 小节
    const events = [
      ...repeat('t', 6, 4, () => 1, { triplet: true }),
      evt('downbeat', 2, 4),
    ];
    const report = analyzeScore(score(4, 4, [voice('v1', '声部一', events)]));
    const last = report.voices[0].events[6];
    expect(last.start).toEqual({ num: '1', den: '1' });
    expect(last.actualStartMeasure).toBe(2);
    expect(last.measureMatches).toBe(true);
    expect(report.mismatchCount).toBe(0);
  });

  it('6 个三连音四分严格铺满一小节', () => {
    const events = repeat('t', 6, 4, () => 1, { triplet: true });
    const report = analyzeScore(score(4, 4, [voice('v', 'v', events)]));
    expect(report.endings[0].totalDuration).toEqual({ num: '1', den: '1' });
    expect(report.endings[0].endsOnBarline).toBe(true);
  });
});

describe('跨小节拆分（保留原 id）', () => {
  const measure = frac(1); // 4/4

  it('splitAcrossBarlines：附点二分从小节中点跨到下一小节，长度各半', () => {
    const fragments = splitAcrossBarlines(frac(1, 2), frac(5, 4), measure);
    expect(fragments).toHaveLength(2);
    expect(equal(fragments[0].start, frac(1, 2))).toBe(true);
    expect(equal(fragments[0].end, frac(1))).toBe(true);
    expect(equal(fragments[0].length, frac(1, 2))).toBe(true);
    expect(fragments[0].measureIndex).toBe(0n);
    expect(equal(fragments[1].start, frac(1))).toBe(true);
    expect(equal(fragments[1].end, frac(5, 4))).toBe(true);
    expect(equal(fragments[1].length, frac(1, 4))).toBe(true);
    expect(fragments[1].measureIndex).toBe(1n);
  });

  it('三连音事件跨线：11/12 起、时值 1/12 + 1/12', () => {
    const fragments = splitAcrossBarlines(frac(11, 12), frac(13, 12), measure);
    expect(fragments).toHaveLength(2);
    expect(equal(fragments[0].length, frac(1, 12))).toBe(true);
    expect(equal(fragments[1].offsetInMeasure, frac(0))).toBe(true);
    expect(equal(fragments[1].length, frac(1, 12))).toBe(true);
  });

  it('端点恰落小节线不拆；铺满小节后的下一拍在第 2 小节', () => {
    const events = [...repeat('q', 4, 4, () => 1), evt('q5', 2, 4)];
    const report = analyzeScore(score(4, 4, [voice('v', 'v', events)]));
    expect(report.voices[0].events[3].crossesBarline).toBe(false);
    expect(report.voices[0].events[3].fragments).toHaveLength(1);
    expect(report.voices[0].events[4].actualStartMeasure).toBe(2);
  });

  it('报告片段保留事件原 id 与顺序', () => {
    // 四分 + 四分 + 附点二分（跨线）
    const events = [evt('e1', 1, 4), evt('e2', 1, 4), evt('e3-cross', 1, 2, true)];
    const report = analyzeScore(score(4, 4, [voice('v', 'v', events)]));
    const crossing = report.voices[0].events[2];
    expect(crossing.crossesBarline).toBe(true);
    expect(crossing.fragments).toHaveLength(2);
    expect(crossing.fragments.map((f) => f.eventId)).toEqual(['e3-cross', 'e3-cross']);
    expect(crossing.fragments[0].first).toBe(true);
    expect(crossing.fragments[1].first).toBe(false);
    expect(crossing.fragments.map((f) => f.measureIndex)).toEqual([0, 1]);
  });
});

describe('标称小节号核对与最早错误', () => {
  it('报出最早错误：按起点位置、再按声部/事件次序', () => {
    // 声部 A：先两拍正确，第 3 拍标称 3（实际 2）——起点 1/2
    const a = voice(
      'a',
      'A',
      [evt('a1', 1, 4), evt('a2', 1, 4), evt('a3-wrong', 3, 4)],
    );
    // 声部 B：第一个事件就标称 2（实际 1）——起点 0，更早
    const b = voice('b', 'B', [evt('b1-wrong', 2, 4), evt('b2', 1, 4)]);
    const report = analyzeScore(score(4, 4, [a, b]));
    expect(report.mismatchCount).toBe(2);
    expect(report.firstError?.eventId).toBe('b1-wrong');
    expect(report.firstError?.nominalMeasure).toBe(2);
    expect(report.firstError?.actualMeasure).toBe(1);
  });

  it('同一起点按声部顺序取较早声部首例', () => {
    const a = voice('a', 'A', [evt('a-wrong', 2, 4)]);
    const b = voice('b', 'B', [evt('b-wrong', 3, 4)]);
    const report = analyzeScore(score(4, 4, [a, b]));
    expect(report.firstError?.voiceId).toBe('a');
  });

  it('跨线事件的标称小节号按起始片段所在小节核对', () => {
    const events = [evt('e1', 1, 4), evt('e2', 1, 4), evt('e3-cross', 2, 2, true)];
    const r1 = analyzeScore(score(4, 4, [voice('v', 'v', events)]));
    expect(r1.voices[0].events[2].measureMatches).toBe(false); // 起点 1/2 仍在第 1 小节
    expect(r1.firstError?.eventId).toBe('e3-cross');
  });
});

describe('多声部结尾对齐', () => {
  it('一声部少 1/4：标出未补足声部与精确差额', () => {
    const a = voice('a', '长笛', repeat('a', 4, 4, () => 1)); // 总 1
    const b = voice('b', '单簧管', repeat('b', 3, 4, () => 1)); // 总 3/4
    const report = analyzeScore(score(4, 4, [a, b]));
    expect(report.allEndAligned).toBe(false);
    expect(report.longestVoiceId).toBe('a');
    expect(report.referenceIsBarline).toBe(true);
    expect(report.referenceMeasureIndex).toBe(1);

    const endA = report.endings.find((e) => e.voiceId === 'a')!;
    const endB = report.endings.find((e) => e.voiceId === 'b')!;
    expect(endA.aligned).toBe(true);
    expect(endA.shortfallToReference).toEqual({ num: '0', den: '1' });
    expect(endB.aligned).toBe(false);
    expect(endB.endsOnBarline).toBe(false);
    expect(endB.shortfallToOwnBarline).toEqual({ num: '1', den: '4' });
    expect(endB.shortfallToReference).toEqual({ num: '1', den: '4' });
  });

  it('不同完整小节线结束：差额为整小节', () => {
    const a = voice('a', 'A', repeat('a', 8, 4, () => 1)); // 总 2
    const b = voice('b', 'B', repeat('b', 4, 4, () => 1)); // 总 1
    const report = analyzeScore(score(4, 4, [a, b]));
    const endB = report.endings.find((e) => e.voiceId === 'b')!;
    expect(endB.shortfallToReference).toEqual({ num: '1', den: '1' });
    expect(endB.measureSpan).toBe(1);
    expect(report.endings.find((e) => e.voiceId === 'a')!.measureSpan).toBe(2);
  });

  it('最长声部自身不在线上：参考线无效，全体不算对齐', () => {
    const a = voice('a', 'A', [...repeat('a', 4, 4, () => 1), evt('extra', 2, 4)]); // 5/4
    const b = voice('b', 'B', repeat('b', 4, 4, () => 1)); // 1
    const report = analyzeScore(score(4, 4, [a, b]));
    expect(report.referenceIsBarline).toBe(false);
    expect(report.referenceMeasureIndex).toBe(2);
    expect(report.allEndAligned).toBe(false);
    const endA = report.endings.find((e) => e.voiceId === 'a')!;
    expect(endA.endsOnBarline).toBe(false);
    expect(endA.shortfallToOwnBarline).toEqual({ num: '3', den: '4' });
    expect(endA.shortfallToReference).toEqual({ num: '0', den: '1' });
    expect(endA.isLongest).toBe(true);
  });

  it('3/8：三拍齐、两声部同线结束则全部对齐', () => {
    const a = voice('a', 'A', repeat('a', 3, 8, () => 1));
    const b = voice('b', 'B', repeat('b', 3, 8, () => 1));
    const report = analyzeScore(score(3, 8, [a, b]));
    expect(report.measureLength).toEqual({ num: '3', den: '8' });
    expect(report.allEndAligned).toBe(true);
    expect(report.endings.every((e) => e.aligned)).toBe(true);
  });

  it('12/8：12 个八分音符严格铺满一小节（3/2 全音符）', () => {
    const v = voice('v', 'V', repeat('v', 12, 8, () => 1));
    const report = analyzeScore(score(12, 8, [v]));
    expect(report.measureLength).toEqual({ num: '3', den: '2' });
    expect(report.endings[0].endsOnBarline).toBe(true);
    expect(report.endings[0].measureSpan).toBe(1);
  });
});

describe('输入校验', () => {
  it('拍号分子越界、分母非 4/8、声部/事件数越界均被拒', () => {
    expect(validateSpec(score(1, 4, [voice('v', 'v', [evt('a', 1, 4)])]))).not.toBeNull();
    expect(validateSpec(score(13, 4, [voice('v', 'v', [evt('a', 1, 4)])]))).not.toBeNull();
    expect(
      validateSpec({ ...score(4, 16 as 4, [voice('v', 'v', [evt('a', 1, 4)])]) }),
    ).not.toBeNull();
    expect(validateSpec(score(4, 4, []))).not.toBeNull();
    expect(
      validateSpec(score(4, 4, [voice('v', 'v', [])])),
    ).not.toBeNull();
    expect(() => analyzeScore(score(1, 4, [voice('v', 'v', [evt('a', 1, 4)])]))).toThrow();
  });

  it('事件 id 重复被拒', () => {
    const dup = voice('v', 'v', [evt('x', 1, 4), evt('x', 1, 4)]);
    expect(() => analyzeScore(score(4, 4, [dup]))).toThrow(/重复/);
  });
});

describe('报告自包含可复算', () => {
  it('input 原样回放，Rational 能还原为分数重算', () => {
    const events = [...repeat('t', 12, 8, () => 1, { triplet: true }), evt('x', 2, 4)];
    const spec = score(4, 4, [voice('v', 'v', events)]);
    const report: AnalysisReport = analyzeScore(spec);
    const again = analyzeScore(report.input);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));

    const ml = fromRational(report.measureLength);
    expect(equal(ml, frac(1))).toBe(true);
  });
});
