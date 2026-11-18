/**
 * MOD-007: 容量估算与水位判定
 *
 * 负责估算序列化后的占用字节、判定水位状态、估算剩余可存配图张数。
 * 纯逻辑函数，零 DOM、零异步、不探测 navigator.storage.estimate()。
 */

import {
  CAPACITY_WARN_BYTES,
  CAPACITY_BLOCK_BYTES,
  MAX_COVER_BYTES,
  type TimelineData,
} from './types';

/**
 * 估算 JSON 字符串序列化后在 localStorage 中的占用字节数。
 *
 * 注：localStorage 按 UTF-16 编码存储字符串，每字符按 2 字节计（json.length * 2）。
 * 这是估算口径，用于容量水位判定与预警，最终以 write() 抛错为最终准绳。
 */
export function estimateBytes(json: string): number {
  return json.length * 2;
}

/**
 * 判定当前存储字节数所处的水位档位。
 * - < CAPACITY_WARN_BYTES (4194304) -> 'ok'
 * - >= CAPACITY_WARN_BYTES (4194304) 且 < CAPACITY_BLOCK_BYTES (4718592) -> 'warn'
 * - >= CAPACITY_BLOCK_BYTES (4718592) -> 'block'
 * 边界值计入更严重的一档。
 */
export function capacityState(bytes: number): 'ok' | 'warn' | 'block' {
  if (bytes >= CAPACITY_BLOCK_BYTES) {
    return 'block';
  }
  if (bytes >= CAPACITY_WARN_BYTES) {
    return 'warn';
  }
  return 'ok';
}

/**
 * 估算剩余还可存入的配图张数。
 *
 * 口径：
 * - 取 data 中所有 cover 以 'data:' 开头者的平均字节数作为均值；
 * - 若无此类配图，则使用 MAX_COVER_BYTES (307200) 作为均值兜底；
 * - 返回 Math.max(0, Math.floor((CAPACITY_BLOCK_BYTES - usedBytes) / avg))。
 */
export function estimateRemainingImages(data: TimelineData, usedBytes: number): number {
  const dataCovers = (data.events ?? [])
    .map((e) => e.cover)
    .filter((cover): cover is string => typeof cover === 'string' && cover.startsWith('data:'));

  const avg =
    dataCovers.length > 0
      ? dataCovers.reduce((sum, c) => sum + c.length, 0) / dataCovers.length
      : MAX_COVER_BYTES;

  if (avg <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor((CAPACITY_BLOCK_BYTES - usedBytes) / avg));
}
