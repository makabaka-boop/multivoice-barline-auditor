/**
 * fraction.ts —— 不可变整数分数（有理数）
 *
 * 全音符分数体系下，所有节拍位置（起点、终点、小节线、缺口差额）
 * 都必须用整数分数累加，禁止先转二进制小数再相加：
 * 例如三连音 1/3 在二进制浮点中无法精确表示，连续累加后会出现
 * 3.0000000000000004，把“恰在小节线上”的音符误判到前一小节。
 *
 * 内部使用 bigint 分子/分母，始终约分、分母恒正；
 * 序列化时分子分母以十进制字符串输出，可被排练员按有理数手工复算。
 */

export interface Fraction {
  readonly num: bigint;
  readonly den: bigint;
}

/** 可跨 JSON 边界传输的有理数（字符串防止大整数精度丢失）。 */
export interface Rational {
  readonly num: string;
  readonly den: string;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x === 0n ? 1n : x;
}

/** 构造并约分；分母会被规整为正数。 */
export function frac(numerator: bigint | number, denominator: bigint | number = 1): Fraction {
  const num = BigInt(numerator);
  let den = BigInt(denominator);
  if (den === 0n) throw new Error('分数分母不能为 0');
  if (den < 0n) {
    den = -den;
    // 分母规整为正时符号必须随分子一起翻转
    return frac(-numerator, Number(den));
  }
  if (num === 0n) return { num: 0n, den: 1n };
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

export const ZERO: Fraction = frac(0);
export const ONE: Fraction = frac(1);

export function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.den + b.num * a.den, a.den * b.den);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.den - b.num * a.den, a.den * b.den);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return frac(a.num * b.num, a.den * b.den);
}

export function div(a: Fraction, b: Fraction): Fraction {
  if (b.num === 0n) throw new Error('不能以 0 为除数');
  return frac(a.num * b.den, a.den * b.num);
}

export function negate(a: Fraction): Fraction {
  return { num: -a.num, den: a.den };
}

/** -1 / 0 / 1 */
export function compare(a: Fraction, b: Fraction): -1 | 0 | 1 {
  const lhs = a.num * b.den;
  const rhs = b.num * a.den;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
}

export function equal(a: Fraction, b: Fraction): boolean {
  return compare(a, b) === 0;
}

export function isZero(a: Fraction): boolean {
  return a.num === 0n;
}

/** 是否为整数（恰好落在以全音符为 1 的整数拍点上）。 */
export function isWhole(a: Fraction): boolean {
  return a.den === 1n;
}

/** 对正分数向上取整 ceil(a/b)，a、b 均须非负且 b>0。 */
export function ceilDiv(a: Fraction, b: Fraction): bigint {
  if (compare(a, ZERO) < 0 || compare(b, ZERO) <= 0) {
    throw new Error('ceilDiv 仅支持非负被除数与正除数');
  }
  const n = a.num * b.den;
  const d = a.den * b.num;
  return (n + d - 1n) / d;
}

/** 向下取整 floor(a/b)（小节索引），a>=0、b>0。 */
export function floorDiv(a: Fraction, b: Fraction): bigint {
  if (compare(a, ZERO) < 0 || compare(b, ZERO) <= 0) {
    throw new Error('floorDiv 仅支持非负被除数与正除数');
  }
  return (a.num * b.den) / (a.den * b.num);
}

/** 整数 × 分数。 */
export function scaleInt(k: bigint, a: Fraction): Fraction {
  return frac(k * a.num, a.den);
}

/** 序列化为可入 JSON 的字符串分子分母。 */
export function toRational(a: Fraction): Rational {
  return { num: a.num.toString(), den: a.den.toString() };
}

/** 从 JSON 有理数还原为分数。 */
export function fromRational(r: Rational): Fraction {
  return frac(BigInt(r.num), BigInt(r.den));
}

/**
 * 仅供屏幕像素/百分比使用的近似值；
 * 核对逻辑（小节判定、缺口、错误报告）一律不得使用此函数。
 */
export function toNumber(a: Fraction): number {
  return Number(a.num) / Number(a.den);
}

/** "p/q"（整数则不带分母）。 */
export function toString(a: Fraction): string {
  return a.den === 1n ? a.num.toString() : `${a.num}/${a.den}`;
}
