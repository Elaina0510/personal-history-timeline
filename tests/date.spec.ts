/**
 * tests/date.spec.ts - MOD-002 日期与跨度计算规格测试
 *
 * 覆盖 detailed-design.md §8.1 的 D1~D13 全部用例，以及 §6.7 四条样例文案逐字校验。
 *
 * 关于 D12 时区独立性测试说明：
 * 1. 测试用例在运行时动态切换 process.env.TZ 为 'America/Los_Angeles' 与 'Asia/Shanghai'，
 *    验证 daysBetween('2024-03-02', '2026-11-18') 恒为 991。
 * 2. 针对 Windows 等部分操作系统可能无法在单进程内热切换 C 运行时底层时区的情况，
 *    用例同时断言 dayNumber/daysBetween 仅依赖 Date.UTC(y, m-1, d) 零点差，
 *    代码实现中绝不调用任何本地时区 API（如 new Date(y, m, d)、getFullYear() 等），
 *    确保跨时区结果严格恒等。
 */

import { describe, it, expect } from 'vitest';
import {
  parseDate,
  isValidDateString,
  formatDate,
  dayNumber,
  daysBetween,
  calendarSpan,
  spanText,
  yearOf,
  todayString,
  addMonthsClamped,
  DAY_MS,
} from '../src/core/date';

describe('MOD-002 Date & Span Specification (D1 ~ D13)', () => {
  // D1: parseDate '2026-11-18' -> {y:2026, m:11, d:18}
  it('D1: parseDate correctly parses YYYY-MM-DD into {y, m, d}', () => {
    const res = parseDate('2026-11-18');
    expect(res).toEqual({ y: 2026, m: 11, d: 18 });
  });

  // D2: isValidDateString '2026-02-30' -> false
  it('D2: isValidDateString detects overflow day (2026-02-30) as false', () => {
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(parseDate('2026-02-30')).toBeNull();
  });

  // D3: isValidDateString '2026-2-8' -> false（必须零填充）
  it('D3: isValidDateString requires zero-padding (2026-2-8 is false)', () => {
    expect(isValidDateString('2026-2-8')).toBe(false);
    expect(isValidDateString('2026-02-8')).toBe(false);
    expect(isValidDateString('2026-2-08')).toBe(false);
    expect(isValidDateString('2026-02-08')).toBe(true);
  });

  // D4: daysBetween('2024-03-02', '2026-11-18') -> 991
  it('D4: daysBetween calculates accurate day distance (991 days)', () => {
    expect(daysBetween('2024-03-02', '2026-11-18')).toBe(991);
  });

  // D5: calendarSpan('2024-03-02', '2026-11-18') -> {years:2, months:8, days:16, totalDays:991}
  it('D5: calendarSpan calculates natural calendar difference', () => {
    expect(calendarSpan('2024-03-02', '2026-11-18')).toEqual({
      years: 2,
      months: 8,
      days: 16,
      totalDays: 991,
    });
  });

  // D6: calendarSpan('2025-02-15', '2025-03-15') -> {years:0, months:1, days:0, totalDays:28}
  it('D6: calendarSpan handles exact 1 month difference across February', () => {
    expect(calendarSpan('2025-02-15', '2025-03-15')).toEqual({
      years: 0,
      months: 1,
      days: 0,
      totalDays: 28,
    });
  });

  // D7: calendarSpan('2026-01-31', '2026-03-01') -> {years:0, months:1, days:1, totalDays:29}
  it('D7: calendarSpan handles month-end clamping (2026-01-31 to 2026-03-01)', () => {
    expect(calendarSpan('2026-01-31', '2026-03-01')).toEqual({
      years: 0,
      months: 1,
      days: 1,
      totalDays: 29,
    });
  });

  // D8: 参数顺序反转（b 早于 a）结果与 D5 完全一致（对称）
  it('D8: calendarSpan is symmetric when argument order is reversed', () => {
    const spanNormal = calendarSpan('2024-03-02', '2026-11-18');
    const spanReversed = calendarSpan('2026-11-18', '2024-03-02');
    expect(spanReversed).toEqual(spanNormal);
    expect(spanReversed).toEqual({
      years: 2,
      months: 8,
      days: 16,
      totalDays: 991,
    });
    // daysBetween 对称性
    expect(daysBetween('2026-11-18', '2024-03-02')).toBe(991);
  });

  // D9: '2026-05-10' 与自身 -> spanText(..., 'same') -> '同一天'
  it('D9: spanText returns "同一天" when dir is "same"', () => {
    expect(spanText('2026-05-10', '2026-05-10', 'same')).toBe('同一天');
  });

  // D10: D5 数据 + 'before' -> spanText 含 '2 年'、'8 个月'、'991 天'
  it('D10: spanText matches D5 data with "before" direction', () => {
    const text = spanText('2024-03-02', '2026-11-18', 'before');
    expect(text).toContain('2 年');
    expect(text).toContain('8 个月');
    expect(text).toContain('16 天');
    expect(text).toContain('991 天');
    expect(text).toBe('此前 2 年 8 个月 16 天（共 991 天）');
  });

  // D11: '2026-03-01' 与 '2026-03-20' -> spanText 不含 '0 个月'，含 '19 天'
  it('D11: spanText suppresses zero months/years and shows only days when y=0 and m=0', () => {
    const text = spanText('2026-03-01', '2026-03-20', 'after');
    expect(text).not.toContain('0 个月');
    expect(text).not.toContain('0 年');
    expect(text).toContain('19 天');
    expect(text).toBe('此后 19 天（共 19 天）');
  });

  // D12: 进程时区设为 America/Los_Angeles 与 Asia/Shanghai 各跑一次，均为 991
  describe('D12: Timezone independence', () => {
    it('runs daysBetween under America/Los_Angeles and Asia/Shanghai consistently yielding 991', () => {
      const origTZ = process.env.TZ;
      try {
        process.env.TZ = 'America/Los_Angeles';
        const laResult = daysBetween('2024-03-02', '2026-11-18');
        expect(laResult).toBe(991);

        process.env.TZ = 'Asia/Shanghai';
        const shResult = daysBetween('2024-03-02', '2026-11-18');
        expect(shResult).toBe(991);

        process.env.TZ = 'UTC';
        const utcResult = daysBetween('2024-03-02', '2026-11-18');
        expect(utcResult).toBe(991);
      } finally {
        process.env.TZ = origTZ;
      }
    });

    it('verifies dayNumber calculation relies purely on UTC midnight without local timezone shift', () => {
      // 2026-11-18 UTC
      const expectedDay = Date.UTC(2026, 10, 18) / DAY_MS;
      expect(dayNumber('2026-11-18')).toBe(expectedDay);

      // 2024-03-02 UTC
      const expectedDay2 = Date.UTC(2024, 2, 2) / DAY_MS;
      expect(dayNumber('2024-03-02')).toBe(expectedDay2);

      expect(expectedDay - expectedDay2).toBe(991);
    });
  });

  // D13: '2024-02-29' 与 '2025-02-28' -> {years:1, months:0, days:0}（闰日收敛）
  it('D13: leap day clamps to non-leap Feb 28th as exactly 1 year', () => {
    expect(calendarSpan('2024-02-29', '2025-02-28')).toEqual({
      years: 1,
      months: 0,
      days: 0,
      totalDays: 365,
    });
  });
});

describe('§6.7 验收样例逐字校验', () => {
  it('样例 1: 2024-03-02 ~ 2026-11-18 (before)', () => {
    expect(spanText('2024-03-02', '2026-11-18', 'before')).toBe(
      '此前 2 年 8 个月 16 天（共 991 天）'
    );
  });

  it('样例 2: 2025-02-15 ~ 2025-03-15 (after)', () => {
    expect(spanText('2025-02-15', '2025-03-15', 'after')).toBe('此后 1 个月（共 28 天）');
  });

  it('样例 3: 2026-01-31 ~ 2026-03-01 (after)', () => {
    expect(spanText('2026-01-31', '2026-03-01', 'after')).toBe('此后 1 个月 1 天（共 29 天）');
  });

  it('样例 4: 2026-05-10 ~ 2026-05-10 (same)', () => {
    expect(spanText('2026-05-10', '2026-05-10', 'same')).toBe('同一天');
  });
});

describe('边界情况与错误防护（严禁返回 undefined，非法输入返回 null）', () => {
  it('formatDate formats {y, m, d} with zero-padding', () => {
    expect(formatDate({ y: 2026, m: 3, d: 5 })).toBe('2026-03-05');
  });

  it('yearOf returns 4-digit year string or empty string on invalid', () => {
    expect(yearOf('2026-11-18')).toBe('2026');
    expect(yearOf('invalid')).toBe('');
  });

  it('todayString extracts YYYY-MM-DD from ClockPort ISO string', () => {
    expect(todayString('2026-11-18T21:30:00+08:00')).toBe('2026-11-18');
    expect(todayString('2026-05-01T00:00:00.000Z')).toBe('2026-05-01');
    expect(todayString('not-an-iso')).toBe('');
  });

  it('addMonthsClamped clamps to target month max days', () => {
    // 1-31 + 1 month -> 2-28 (2026)
    expect(addMonthsClamped({ y: 2026, m: 1, d: 31 }, 1)).toEqual({ y: 2026, m: 2, d: 28 });
    // 1-31 + 1 month -> 2-29 (2024 leap)
    expect(addMonthsClamped({ y: 2024, m: 1, d: 31 }, 1)).toEqual({ y: 2024, m: 2, d: 29 });
    // 8-31 + 1 month -> 9-30
    expect(addMonthsClamped({ y: 2026, m: 8, d: 31 }, 1)).toEqual({ y: 2026, m: 9, d: 30 });
  });

  it('illegal inputs return null, never undefined', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('abc')).toBeNull();
    expect(parseDate('2025-02-29')).toBeNull(); // 2025 不是闰年
    expect(parseDate('2026-13-01')).toBeNull(); // 月份越界
    expect(parseDate('2026-00-10')).toBeNull();
    expect(parseDate('2026-04-31')).toBeNull(); // 4月只有30天

    expect(dayNumber('invalid')).toBeNull();
    expect(daysBetween('2026-01-01', 'invalid')).toBeNull();
    expect(daysBetween('invalid', '2026-01-01')).toBeNull();
    expect(calendarSpan('2026-01-01', 'invalid')).toBeNull();
    expect(calendarSpan('invalid', '2026-01-01')).toBeNull();
  });
});
