/**
 * demo.ts —— 空谱与内置示例
 *
 * 示例为 4/4、两声部（每小节 = 1 个全音符）：
 * - 长笛共 3 小节，含附点、三连音与一个跨小节的附点二分音符；
 *   fl-e7 标称小节号故意写成 3（实际起点恰在第 2 小节线 1 上，应为 2），
 *   演示“恰在小节线上”的核对；
 * - 单簧管只到 1+1/2，比长笛少 3/2（到共同结束线），自身距下一小节线差 1/2。
 */

import { DurationDenominator, EventSpec, ScoreSpec, VoiceSpec } from '../engine/rhythm';

type Ev = [measure: number, d: DurationDenominator, dotted?: boolean, triplet?: boolean];

function build(voiceId: string, name: string, rows: Ev[]): VoiceSpec {
  const events: EventSpec[] = rows.map(([measure, d, dotted, triplet], i) => ({
    id: `${voiceId}-e${i + 1}`,
    measure,
    durationDenominator: d,
    dotted: dotted ?? false,
    triplet: triplet ?? false,
  }));
  return { id: voiceId, name, events };
}

export function emptySpec(): ScoreSpec {
  return {
    numerator: 4,
    denominator: 4,
    voices: [
      {
        id: 'voice-1',
        name: '声部一',
        events: [
          { id: 'evt-seed-1', measure: 1, durationDenominator: 4, dotted: false, triplet: false },
        ],
      },
    ],
  };
}

export function demoSpec(): ScoreSpec {
  // 第一小节（合计恰为 1）：
  //   四分 1/4 + 附点四分 3/8 + 八分 1/8 + 三个三连音八分各 1/12
  //   = 6/24 + 9/24 + 3/24 + 6/24 = 24/24
  // 第二小节：二分 1/2 + 附点二分 3/4（后者从 3/2 走到 9/4，跨过第 2、3 小节线）
  // 第三小节：两个附点四分各 3/8，补齐到 3。
  const fluteRows: Ev[] = [
    [1, 4], // 0 -> 1/4
    [1, 4, true], // 1/4 -> 5/8
    [1, 8], // 5/8 -> 3/4
    [1, 8, false, true], // 3/4 -> 5/6
    [1, 8, false, true], // 5/6 -> 11/12
    [1, 8, false, true], // 11/12 -> 1（三连音群终点恰在小节线上）
    [3, 2], // 标称 3（错，实际 2）：1 -> 3/2
    [2, 2, true], // 附点二分跨线：3/2 -> 9/4
    [3, 4, true], // 9/4 -> 21/8
    [3, 4, true], // 21/8 -> 3
  ];

  // 总时长 1+1/2：附点四分 3/8 + 八分 1/8 + 二分 1/2（铺满第 1 小节）+ 二分 1/2。
  const clarinetRows: Ev[] = [
    [1, 4, true],
    [1, 8],
    [1, 2],
    [2, 2],
  ];

  return {
    numerator: 4,
    denominator: 4,
    voices: [build('fl', '长笛', fluteRows), build('cl', '单簧管', clarinetRows)],
  };
}
