/**
 * MOD-021: 云端同步的纯逻辑与契约
 *
 * 只放「不碰 DOM、不碰 fetch、不碰 storage」的纯函数与类型，
 * 供 src/ui/sync.ts（浏览器实现）与测试共用。
 *
 * 协议（与 worker/index.js 一一对应）：
 *   GET  <endpoint>/data          → { empty, revision, savedAt, payload }
 *   PUT  <endpoint>/data          → body { baseRevision, payload }，成功 { ok, revision, savedAt }
 *                                    baseRevision 与云端不一致 → 409 { conflict, remote }
 *   PUT  <endpoint>/data?force=1  → 跳过冲突检查，强制覆盖
 *   GET  <endpoint>/health        → { ok, configured, revision }
 * 鉴权：请求头 x-sync-token（或 Authorization: Bearer）。
 */

import type { TimelineData } from './types';

export interface SyncConfig {
  endpoint: string;
  token: string;
  auto: boolean;
}

export interface SyncMeta {
  endpoint: string;
  revision: number;
  lastSyncedAt: string | null;
  /** 上次同步时的本地导出文本，用于判断本地是否有未推送改动 */
  lastSyncedText: string;
}

export interface RemoteSnapshot {
  revision: number;
  savedAt: string | null;
  payload: unknown;
}

export const SYNC_CONFIG_KEY = 'timeline_sync_v1';
export const SYNC_META_KEY = 'timeline_sync_meta_v1';

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  endpoint: '/api',
  token: '',
  auto: true,
};

export function emptyMeta(endpoint = ''): SyncMeta {
  return { endpoint, revision: 0, lastSyncedAt: null, lastSyncedText: '' };
}

/** 去掉尾部斜杠；空串视为未配置 */
export function normalizeEndpoint(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

/** 相对路径（/api）或 http(s) 绝对地址才算可用 */
export function isEndpointUsable(endpoint: string): boolean {
  if (endpoint === '') {
    return false;
  }
  if (endpoint.startsWith('/')) {
    return true;
  }
  return /^https?:\/\//i.test(endpoint);
}

export function configFromRaw(raw: string | null): SyncConfig {
  if (!raw) {
    return { ...DEFAULT_SYNC_CONFIG };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return {
      endpoint: normalizeEndpoint(parsed.endpoint) || DEFAULT_SYNC_CONFIG.endpoint,
      token: typeof parsed.token === 'string' ? parsed.token : '',
      auto: parsed.auto !== false,
    };
  } catch {
    return { ...DEFAULT_SYNC_CONFIG };
  }
}

export function isConfigReady(config: SyncConfig): boolean {
  return isEndpointUsable(config.endpoint) && config.token.trim() !== '';
}

export function metaFromRaw(raw: string | null, endpoint: string): SyncMeta {
  if (!raw) {
    return emptyMeta(endpoint);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    if (parsed.endpoint !== endpoint) {
      // 换了服务地址，旧 revision 失去意义
      return emptyMeta(endpoint);
    }
    return {
      endpoint,
      revision: typeof parsed.revision === 'number' && parsed.revision >= 0 ? parsed.revision : 0,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      lastSyncedText: typeof parsed.lastSyncedText === 'string' ? parsed.lastSyncedText : '',
    };
  } catch {
    return emptyMeta(endpoint);
  }
}

/** 本地相对上次同步是否有改动 */
export function isDirty(currentExport: string, meta: SyncMeta): boolean {
  return meta.lastSyncedText === '' || currentExport !== meta.lastSyncedText;
}

export function buildPushBody(data: TimelineData, baseRevision: number): { baseRevision: number; payload: TimelineData } {
  return { baseRevision, payload: data };
}

/** 云端响应 → 规范化快照；形状不对返回 null */
export function parseRemoteSnapshot(json: unknown): RemoteSnapshot | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null;
  }
  const obj = json as Record<string, unknown>;
  const revision = typeof obj.revision === 'number' && obj.revision >= 0 ? obj.revision : 0;
  const savedAt = typeof obj.savedAt === 'string' ? obj.savedAt : null;
  const payload = obj.payload ?? null;
  if (payload !== null) {
    const p = payload as Record<string, unknown>;
    if (!p || typeof p !== 'object' || !Array.isArray((p as { events?: unknown }).events)) {
      return null;
    }
  }
  return { revision, savedAt, payload };
}
