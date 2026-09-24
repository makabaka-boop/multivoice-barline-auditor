import { describe, expect, it } from 'vitest';
import { beatText, pctOf, rationalText, shortfallText } from './format';

describe('显示格式化（不参与判定）', () => {
  it('rationalText 整数不带分母', () => {
    expect(rationalText({ num: '1', den: '1' })).toBe('1');
    expect(rationalText({ num: '11', den: '12' })).toBe('11/12');
  });

  it('beatText 以拍号分母音符为一拍', () => {
    expect(beatText({ num: '0', den: '1' }, 4)).toBe('0 拍');
    expect(beatText({ num: '3', den: '8' }, 4)).toBe('1+1/2 拍'); // 3/8 全音符 = 1.5 个四分拍
    expect(beatText({ num: '1', den: '12' }, 8)).toBe('2/3 拍'); // 1/12 全音符 = 8/12 个八分拍
    expect(beatText({ num: '1', den: '1' }, 8)).toBe('8 拍');
  });

  it('shortfallText 零值即已对齐，否则给全音符与拍数', () => {
    expect(shortfallText({ num: '0', den: '1' }, 4)).toBe('已对齐');
    expect(shortfallText({ num: '1', den: '4' }, 4)).toBe('缺 1/4 全音符（1）');
    expect(shortfallText({ num: '3', den: '2' }, 4)).toBe('缺 3/2 全音符（6）');
  });

  it('pctOf 仅用于布局且被夹在 0–100', () => {
    expect(pctOf({ num: '1', den: '2' }, { num: '1', den: '1' })).toBeCloseTo(50);
    expect(pctOf({ num: '0', den: '1' }, { num: '1', den: '1' })).toBe(0);
    expect(pctOf({ num: '3', den: '4' }, { num: '3', den: '4' })).toBe(100);
  });
});
