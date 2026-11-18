/**
 * MOD-003: Core ID 生成
 * 生成 evt_<13位毫秒>_<6位36进制> 与 rec_<13位毫秒>_<6位36进制> 形式的主键，并提供供校验复用的正则。
 */

export const ID_PATTERN: RegExp = /^(evt|rec)_\d{13}_[0-9a-z]{6}$/;

const BASE36_SPACE = 36 ** 6; // 2176782336
const BASE36_MAX = BASE36_SPACE - 1; // 2176782335

/**
 * 生成实体主键
 * @param prefix 前缀 'evt' 或 'rec'
 * @param nowMs 当前时间戳（13位毫秒）
 * @param rand 随机数生成器函数，返回值期望在 [0, 1) 区间内
 */
export function createId(prefix: 'evt' | 'rec', nowMs: number, rand: () => number): string {
  const raw = Math.floor(rand() * BASE36_SPACE);
  const clamped = Math.min(BASE36_MAX, Math.max(0, raw));
  const randPart = clamped.toString(36).padStart(6, '0');
  return `${prefix}_${Math.floor(nowMs)}_${randPart}`;
}
