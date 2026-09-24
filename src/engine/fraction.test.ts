import { describe, expect, it } from 'vitest';
import {
  ZERO,
  add,
  ceilDiv,
  compare,
  div,
  equal,
  floorDiv,
  frac,
  fromRational,
  mul,
  sub,
  toRational,
  toString,
} from './fraction';

describe('Fraction 整数分数', () => {
  it('约分并保持分母为正', () => {
    expect(toString(frac(2, 4))).toBe('1/2');
    expect(toString(frac(3, -9))).toBe('-1/3');
    expect(toString(frac(0, 5))).toBe('0');
  });

  it('四则运算', () => {
    expect(equal(add(frac(1, 3), frac(2, 3)), frac(1))).toBe(true);
    expect(equal(sub(frac(1), frac(1, 3)), frac(2, 3))).toBe(true);
    expect(equal(mul(frac(3, 2), frac(2, 3)), frac(1))).toBe(true);
    expect(equal(div(frac(1, 2), frac(3, 4)), frac(2, 3))).toBe(true);
  });

  it('floorDiv / ceilDiv（小节索引与补足小节数）', () => {
    const measure = frac(1); // 4/4 以全音符为 1
    expect(floorDiv(frac(1), measure)).toBe(1n);
    expect(floorDiv(frac(3, 4), measure)).toBe(0n);
    expect(ceilDiv(frac(3, 4), measure)).toBe(1n);
    expect(ceilDiv(frac(1), measure)).toBe(1n);
    expect(ceilDiv(ZERO, measure)).toBe(0n);
  });

  it('三连音分数连加严格等于整拍（小数累加会漂移）', () => {
    const sixth = frac(1, 6);
    const floatSixth = 1 / 6;
    const floatSum = Array.from({ length: 6 }, () => floatSixth).reduce((a, b) => a + b, 0);
    expect(floatSum).toBeLessThan(1); // 0.9999999999999999：小节线判定会前移一拍

    let acc = ZERO;
    for (let i = 0; i < 6; i++) acc = add(acc, sixth);
    expect(compare(acc, frac(1))).toBe(0);
  });

  it('Rational 可序列化还原', () => {
    const f = frac(7, 96);
    const json = JSON.stringify(toRational(f));
    const restored = fromRational(JSON.parse(json));
    expect(equal(restored, f)).toBe(true);
  });
});
