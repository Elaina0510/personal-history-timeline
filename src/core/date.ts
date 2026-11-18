/**
 * MOD-002: 日期与跨度计算核心模块
 * Traces to: REQ-020 [P0]
 * SSOT: 拥有全部日期口径（DAY_MS、日历差算法、跨度文案格式）
 * 零第三方依赖、绝不使用本地时区 API（纯 UTC 零点计算）。
 */

export interface CalendarSpan {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

export const DAY_MS = 86400000;

/**
 * 判断是否为闰年（公历）
 */
function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * 获取指定年月的最大天数（1-based 月份）
 */
function daysInMonth(y: number, m: number): number {
  if (m === 2) {
    return isLeapYear(y) ? 29 : 28;
  }
  if (m === 4 || m === 6 || m === 9 || m === 11) {
    return 30;
  }
  return 31;
}

/**
 * 比较两个日期先后：小于返回负数，等于返回 0，大于返回正数
 */
function compareDateParts(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number }
): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

/**
 * 月末收敛推进：目标月不存在该日时收敛到该月最后一天（如 1-31 加一月 → 2-28 或 2-29）
 */
export function addMonthsClamped(
  d: { y: number; m: number; d: number },
  n: number
): { y: number; m: number; d: number } {
  const totalMonths = d.y * 12 + (d.m - 1) + n;
  const targetY = Math.floor(totalMonths / 12);
  const targetM = (totalMonths % 12) + 1;
  const maxDays = daysInMonth(targetY, targetM);
  const targetD = Math.min(d.d, maxDays);
  return { y: targetY, m: targetM, d: targetD };
}

/** 解析 'YYYY-MM-DD'；非法返回 null（含 2026-02-30 这类溢出日期） */
export function parseDate(s: string): { y: number; m: number; d: number } | null {
  if (typeof s !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return null;
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1 || y > 9999) return null;
  if (m < 1 || m > 12) return null;
  const maxDays = daysInMonth(y, m);
  if (d < 1 || d > maxDays) return null;
  return { y, m, d };
}

export function isValidDateString(s: string): boolean {
  return parseDate(s) !== null;
}

export function formatDate(p: { y: number; m: number; d: number }): string {
  const y = String(p.y).padStart(4, '0');
  const m = String(p.m).padStart(2, '0');
  const d = String(p.d).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 以 UTC 零点差计算，绝不做本地时区换算 */
export function dayNumber(s: string): number | null {
  const p = parseDate(s);
  if (!p) return null;
  return Date.UTC(p.y, p.m - 1, p.d) / DAY_MS;
}

export function daysBetween(a: string, b: string): number | null {
  const da = dayNumber(a);
  const db = dayNumber(b);
  if (da === null || db === null) return null;
  return Math.abs(db - da);
}

export function calendarSpan(a: string, b: string): CalendarSpan | null {
  const pa = parseDate(a);
  const pb = parseDate(b);
  if (!pa || !pb) return null;

  let lo: { y: number; m: number; d: number };
  let hi: { y: number; m: number; d: number };

  if (compareDateParts(pa, pb) <= 0) {
    lo = pa;
    hi = pb;
  } else {
    lo = pb;
    hi = pa;
  }

  const totalDays = Math.abs(dayNumber(formatDate(hi))! - dayNumber(formatDate(lo))!);

  // 取不超过终点的最大整年数
  let years = Math.max(0, hi.y - lo.y);
  while (years > 0 && compareDateParts(addMonthsClamped(lo, 12 * years), hi) > 0) {
    years--;
  }

  const dYear = addMonthsClamped(lo, 12 * years);

  // 在余下区间取不超过终点的最大整月数
  let months = 11;
  while (months > 0 && compareDateParts(addMonthsClamped(dYear, months), hi) > 0) {
    months--;
  }

  const dMonth = addMonthsClamped(dYear, months);
  const days = Math.abs(dayNumber(formatDate(hi))! - dayNumber(formatDate(dMonth))!);

  return {
    years,
    months,
    days,
    totalDays,
  };
}

/** direction 由调用方按日期比较后传入 */
export function spanText(a: string, b: string, dir: 'before' | 'after' | 'same'): string {
  if (dir === 'same') {
    return '同一天';
  }

  const span = calendarSpan(a, b);
  if (!span) {
    return '';
  }

  const prefix = dir === 'before' ? '此前' : '此后';
  const { years, months, days, totalDays } = span;

  const parts: string[] = [];
  if (years > 0) {
    parts.push(`${years} 年`);
  }
  if (months > 0) {
    parts.push(`${months} 个月`);
  }

  if (years > 0 || months > 0) {
    if (days > 0) {
      parts.push(`${days} 天`);
    }
  } else {
    parts.push(`${totalDays} 天`);
  }

  return `${prefix} ${parts.join(' ')}（共 ${totalDays} 天）`;
}

export function yearOf(s: string): string {
  const p = parseDate(s);
  if (!p) return '';
  return String(p.y).padStart(4, '0');
}

export function todayString(nowIso: string): string {
  if (typeof nowIso !== 'string') return '';
  const parts = nowIso.split('T');
  const datePart = parts[0];
  if (!datePart || !isValidDateString(datePart)) return '';
  return datePart;
}
