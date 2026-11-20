/**
 * MOD-022: 云端同步的浏览器实现
 *
 * 职责：把 src/core/sync.ts 的纯逻辑接到 fetch / storage / store 上。
 * 不做 DOM 渲染（那是 parts/syncPanel.ts 的事），不做 UI 文案之外的业务判断。
 */

import type { Store } from '../core/store';
import type { StoragePort, ClockPort } from '../core/types';
import { validateTopShape } from '../core/validate';
import {
  buildPushBody,
  configFromRaw,
  emptyMeta,
  isConfigReady,
  isDirty,
  metaFromRaw,
  normalizeEndpoint,
  parseRemoteSnapshot,
  SYNC_CONFIG_KEY,
  SYNC_META_KEY,
  type RemoteSnapshot,
  type SyncConfig,
  type SyncMeta,
} from '../core/sync';
import type { TimelineData } from '../core/types';

export type SyncFailureKind =
  | 'unconfigured'
  | 'unauthorized'
  | 'conflict'
  | 'network'
  | 'server'
  | 'empty';

export interface SyncStatus {
  ready: boolean;
  endpoint: string;
  revision: number;
  lastSyncedAt: string | null;
  dirty: boolean;
  auto: boolean;
}

export type PullResult =
  | { ok: true; applied: boolean; revision: number; message: string }
  | { ok: false; kind: SyncFailureKind; message: string; remote?: RemoteSnapshot };

export type PushResult =
  | { ok: true; revision: number; message: string }
  | { ok: false; kind: SyncFailureKind; message: string; remote?: RemoteSnapshot };

export interface SyncServiceDeps {
  store: Store;
  storage: StoragePort;
  clock: ClockPort;
  fetchImpl?: typeof fetch;
}

export class SyncService {
  private deps: SyncServiceDeps;
  private fetchImpl: typeof fetch;

  constructor(deps: SyncServiceDeps) {
    this.deps = deps;
    this.fetchImpl =
      deps.fetchImpl ??
      ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  }

  // ---------- 配置 ----------

  getConfig(): SyncConfig {
    return configFromRaw(this.deps.storage.read(SYNC_CONFIG_KEY));
  }

  saveConfig(config: SyncConfig): SyncConfig {
    const next: SyncConfig = {
      endpoint: normalizeEndpoint(config.endpoint),
      token: config.token.trim(),
      auto: config.auto,
    };
    this.deps.storage.write(SYNC_CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  getMeta(): SyncMeta {
    const endpoint = this.getConfig().endpoint;
    return metaFromRaw(this.deps.storage.read(SYNC_META_KEY), endpoint);
  }

  private writeMeta(meta: SyncMeta): void {
    this.deps.storage.write(SYNC_META_KEY, JSON.stringify(meta));
  }

  status(): SyncStatus {
    const config = this.getConfig();
    const meta = this.getMeta();
    return {
      ready: isConfigReady(config),
      endpoint: config.endpoint,
      revision: meta.revision,
      lastSyncedAt: meta.lastSyncedAt,
      dirty: isDirty(this.deps.store.exportJson(), meta),
      auto: config.auto,
    };
  }

  // ---------- 请求 ----------

  private url(path: string): string {
    const endpoint = this.getConfig().endpoint;
    return `${endpoint}/${path}`;
  }

  private headers(): HeadersInit {
    const token = this.getConfig().token;
    return {
      'content-type': 'application/json',
      'x-sync-token': token,
    };
  }

  private localData(): TimelineData {
    // store.exportJson() 已做规范化，这里只为拿到对象形态
    return JSON.parse(this.deps.store.exportJson()) as TimelineData;
  }

  private markSynced(revision: number): void {
    this.writeMeta({
      endpoint: this.getConfig().endpoint,
      revision,
      lastSyncedAt: this.deps.clock.nowIso(),
      lastSyncedText: this.deps.store.exportJson(),
    });
  }

  private describeHttpError(status: number): { kind: SyncFailureKind; message: string } {
    if (status === 401) {
      return { kind: 'unauthorized', message: '口令不对，检查同步口令是否与服务端一致' };
    }
    if (status === 413) {
      return { kind: 'server', message: '数据太大，云端拒收（超过 10MB）' };
    }
    if (status === 500) {
      return { kind: 'server', message: '服务端未配置同步口令（SYNC_TOKEN），先去 Worker 里设好' };
    }
    if (status === 404) {
      return { kind: 'unconfigured', message: '服务地址不对，找不到同步接口' };
    }
    return { kind: 'server', message: `服务端返回 ${status}` };
  }

  // ---------- 拉取 ----------

  async pull(): Promise<PullResult> {
    const config = this.getConfig();
    if (!isConfigReady(config)) {
      return { ok: false, kind: 'unconfigured', message: '先填服务地址和口令' };
    }

    let res: Response;
    try {
      res = await this.fetchImpl(this.url('data'), { method: 'GET', headers: this.headers() });
    } catch {
      return { ok: false, kind: 'network', message: '连不上服务地址（网络或 CORS）' };
    }

    if (!res.ok) {
      const { kind, message } = this.describeHttpError(res.status);
      return { ok: false, kind, message };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, kind: 'server', message: '服务端返回的不是 JSON' };
    }

    const snapshot = parseRemoteSnapshot(body);
    if (!snapshot) {
      return { ok: false, kind: 'server', message: '云端数据结构不符合要求' };
    }
    if (snapshot.payload === null) {
      return { ok: true, applied: false, revision: snapshot.revision, message: '云端还没有数据，先推送一次' };
    }

    const applied = this.applyRemoteSnapshot(snapshot);
    if (!applied.ok) {
      return { ok: false, kind: 'server', message: applied.message };
    }
    return {
      ok: true,
      applied: true,
      revision: snapshot.revision,
      message: `已拉取云端数据（v${snapshot.revision}）`,
    };
  }

  /** 用远端快照覆盖本地（走 applyImport 的 overwrite，自带备份） */
  applyRemoteSnapshot(snapshot: RemoteSnapshot): { ok: true } | { ok: false; message: string } {
    const shape = validateTopShape(snapshot.payload);
    if (!shape.ok || !shape.data) {
      return { ok: false, message: '云端数据结构不符合要求' };
    }
    const report = this.deps.store.applyImport({
      raw: JSON.stringify(shape.data),
      mode: 'overwrite',
    });
    if (!report.ok) {
      return { ok: false, message: report.issues[0]?.message ?? '写入本地失败' };
    }
    this.markSynced(snapshot.revision);
    return { ok: true };
  }

  // ---------- 推送 ----------

  async push(force = false): Promise<PushResult> {
    const config = this.getConfig();
    if (!isConfigReady(config)) {
      return { ok: false, kind: 'unconfigured', message: '先填服务地址和口令' };
    }

    const meta = this.getMeta();
    const payload = buildPushBody(this.localData(), meta.revision);
    const target = force ? `${this.url('data')}?force=1` : this.url('data');

    let res: Response;
    try {
      res = await this.fetchImpl(target, {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
    } catch {
      return { ok: false, kind: 'network', message: '连不上服务地址（网络或 CORS）' };
    }

    if (res.status === 409) {
      let remote: RemoteSnapshot | null = null;
      try {
        const body = await res.json();
        remote = parseRemoteSnapshot((body as { remote?: unknown }).remote ?? null);
      } catch {
        remote = null;
      }
      return {
        ok: false,
        kind: 'conflict',
        message: '云端有比本地更新的版本，需要你决定用哪一份',
        remote: remote ?? undefined,
      };
    }

    if (!res.ok) {
      const { kind, message } = this.describeHttpError(res.status);
      return { ok: false, kind, message };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, kind: 'server', message: '服务端返回的不是 JSON' };
    }
    const revision = (body as { revision?: unknown }).revision;
    if (typeof revision !== 'number') {
      return { ok: false, kind: 'server', message: '服务端没返回版本号' };
    }
    this.markSynced(revision);
    return { ok: true, revision, message: `已推送到云端（v${revision}）` };
  }

  /** 探测服务地址是否可用（不需要口令） */
  async health(): Promise<{ ok: boolean; message: string }> {
    const config = this.getConfig();
    if (normalizeEndpoint(config.endpoint) === '') {
      return { ok: false, message: '先填服务地址' };
    }
    try {
      const res = await this.fetchImpl(this.url('health'), { method: 'GET' });
      if (!res.ok) {
        return { ok: false, message: `健康检查返回 ${res.status}` };
      }
      const body = (await res.json()) as { configured?: boolean; revision?: number };
      if (body.configured === false) {
        return { ok: false, message: '服务端还没设同步口令（SYNC_TOKEN）' };
      }
      return { ok: true, message: `服务可用，云端版本 v${body.revision ?? 0}` };
    } catch {
      return { ok: false, message: '连不上服务地址' };
    }
  }

  /** 清空同步元数据（换地址或想重新对齐时用），不动本地事件 */
  resetMeta(): void {
    this.writeMeta(emptyMeta(this.getConfig().endpoint));
  }
}
