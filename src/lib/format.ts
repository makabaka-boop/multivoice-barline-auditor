/**
 * format.ts —— 仅用于显示的格式化工具
 *
 * 注意：toNumber 的结果只允许进入 CSS 宽度/百分比；
 * 小节判定、差额、错误等核对结论一律来自引擎的 Rational。
 */

import { Rational } from '../engine/fraction';
import {
  DurationDenominator,
  TimeDenominator,
  durationName,
} from '../engine/rhythm';

/** "p/q"（整数不带分母）。 */
export function rationalText(r: Rational): string {
  return BigInt(r.den) === 1n ? r.num : `${r.num}/${r.den}`;
}

/** 把全音符分数换算成“以拍号分母音符为一拍”的拍点文本，如 1+1/2 拍。 */
export function beatText(r: Rational, timeDenominator: TimeDenominator): string {
  // 1 拍 = 1/timeDenominator 全音符；拍数 = r × timeDenominator。
  let den = BigInt(r.den);
  const num = BigInt(r.num) * BigInt(timeDenominator);
  const whole = num / den;
  let rem = num % den;
  // 余数约分，避免显示 1+4/8 这类未约分形式。
  if (rem !== 0n) {
    let a = rem;
    let b = den;
    while (b !== 0n) {
      const t = a % b;
      a = b;
      b = t;
    }
    rem /= a;
    den /= a;
  }
  if (rem === 0n) return `${whole} 拍`;
  const fracText = `${rem}/${den}`;
  return whole === 0n ? `${fracText} 拍` : `${whole}+${fracText} 拍`;
}

/** 屏幕近似百分比：仅用于布局。 */
export function pctOf(r: Rational, total: Rational): number {
  const v = (Number(r.num) / Number(r.den)) / (Number(total.num) / Number(total.den));
  return Math.max(0, Math.min(100, v * 100));
}

export function durationLabel(
  d: DurationDenominator,
  dotted: boolean,
  triplet: boolean,
): string {
  return durationName(d, dotted, triplet);
}

/** 差额头文字：「缺 1/4 个全音符（1 拍）」之类。 */
export function shortfallText(r: Rational, timeDenominator: TimeDenominator): string {
  if (r.num === '0') return '已对齐';
  return `缺 ${rationalText(r)} 全音符（${beatText(r, timeDenominator).replace(' 拍', '')}）`;
}
