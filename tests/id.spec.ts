import { describe, expect, it } from 'vitest';
import { createId, ID_PATTERN } from '../src/core/id';

/**
 * 确定性线性同余伪随机数生成器 (LCG)
 * 用于确定性测试，避免 Math.random 的概率性问题
 */
function createLcg(seed = 123456789): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('MOD-003 id: createId & ID_PATTERN', () => {
  it('I1: nowMs=1770000000000, rand 恒返回 0 生成 evt_1770000000000_000000', () => {
    const nowMs = 1770000000000;
    const id = createId('evt', nowMs, () => 0);
    expect(id).toMatch(ID_PATTERN);
    expect(id).toBe('evt_1770000000000_000000');
    expect(id.endsWith('evt_1770000000000_000000')).toBe(true);
  });

  it('I2: rand 恒返回 0.9999999999 末 6 位为 zzzzzz（不溢出到 7 位）', () => {
    const nowMs = 1770000000000;
    const id = createId('evt', nowMs, () => 0.9999999999);
    expect(id).toMatch(ID_PATTERN);
    expect(id.endsWith('_zzzzzz')).toBe(true);
    expect(id).toBe('evt_1770000000000_zzzzzz');
  });

  it('I2b: rand 恒返回 1（越界注入）仍为 6 位 zzzzzz，产出 7 位即失败', () => {
    const nowMs = 1770000000000;
    const id = createId('evt', nowMs, () => 1);
    expect(id).toMatch(ID_PATTERN);
    expect(id.endsWith('_zzzzzz')).toBe(true);
    expect(id).toBe('evt_1770000000000_zzzzzz');
    // 确保末尾段严格为 6 位字符
    const parts = id.split('_');
    expect(parts[2]).toHaveLength(6);
  });

  it('I3: 任意参数，prefix 为 rec 时以 rec_ 开头', () => {
    const id = createId('rec', 1770000000000, () => 0.123456);
    expect(id).toMatch(ID_PATTERN);
    expect(id.startsWith('rec_')).toBe(true);
  });

  it('I4: 固定 nowMs，rand 用确定性伪随机序列（种子化 LCG）连续生成 1000 个全不相同', () => {
    const nowMs = 1770000000000;
    const lcg = createLcg(42);
    const set = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const id = createId('evt', nowMs, lcg);
      expect(id).toMatch(ID_PATTERN);
      set.add(id);
    }

    expect(set.size).toBe(1000);
  });
});
