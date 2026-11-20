import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Store } from '../src/core/store';
import { SyncService } from '../src/ui/sync';
import worker from '../worker/index.js';
import type { ClockPort, StoragePort } from '../src/core/types';
import {
  configFromRaw,
  isDirty,
  isEndpointUsable,
  metaFromRaw,
  normalizeEndpoint,
  parseRemoteSnapshot,
} from '../src/core/sync';

class MemoryStorage implements StoragePort {
  private map = new Map<string, string>();
  read(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  write(key: string, value: string) {
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
  isAvailable() {
    return true;
  }
}

class FakeClock implements ClockPort {
  constructor(private iso = '2026-11-20T23:40:00+08:00') {}
  nowMs() {
    return Date.parse(this.iso);
  }
  nowIso() {
    return this.iso;
  }
  set(iso: string) {
    this.iso = iso;
  }
}

class FakeKV {
  private map = new Map<string, string>();
  async get(key: string, type?: string) {
    const raw = this.map.get(key);
    if (raw === undefined) return null;
    return type === 'json' ? JSON.parse(raw) : raw;
  }
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
}

const TOKEN = 'unit-test-token';
const seed = readFileSync('public/data/events.json', 'utf8');

/** 把浏览器端的 fetch 直接接到真 Worker 的 fetch 上：没有网络，但走的是同一份代码 */
function makeFetch(envForWorker: any) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://timeline.example.com').toString();
    return (worker as any).fetch(new Request(url, init), envForWorker);
  }) as typeof fetch;
}

function makeWorkerEnv(token = TOKEN) {
  return { SYNC_TOKEN: token, TIMELINE_KV: new FakeKV() };
}

function makeDevice(workerEnv: any, endpoint = '/api', token = TOKEN) {
  const storage = new MemoryStorage();
  const clock = new FakeClock();
  const store = new Store({ storage, clock, appVersion: '0.0.3' });
  store.init(seed);
  const sync = new SyncService({ store, storage, clock, fetchImpl: makeFetch(workerEnv) });
  sync.saveConfig({ endpoint, token, auto: true });
  return { store, storage, clock, sync };
}

describe('core/sync 纯函数', () => {
  it('normalizeEndpoint 去空格与尾斜杠', () => {
    expect(normalizeEndpoint('  /api/  ')).toBe('/api');
    expect(normalizeEndpoint('')).toBe('');
    expect(normalizeEndpoint(null)).toBe('');
  });

  it('isEndpointUsable 只认相对路径与 http(s)', () => {
    expect(isEndpointUsable('/api')).toBe(true);
    expect(isEndpointUsable('https://x.workers.dev/api')).toBe(true);
    expect(isEndpointUsable('ftp://x')).toBe(false);
    expect(isEndpointUsable('')).toBe(false);
  });

  it('configFromRaw 坏 JSON 回落到默认值', () => {
    expect(configFromRaw('{oops').endpoint).toBe('/api');
    expect(configFromRaw(null).auto).toBe(true);
    expect(configFromRaw(JSON.stringify({ endpoint: 'https://a/api/', token: ' t ', auto: false }))).toEqual({
      endpoint: 'https://a/api',
      token: ' t ',
      auto: false,
    });
  });

  it('metaFromRaw 换了 endpoint 就重置 revision', () => {
    const raw = JSON.stringify({ endpoint: '/api', revision: 7, lastSyncedAt: 'x', lastSyncedText: 'y' });
    expect(metaFromRaw(raw, '/api').revision).toBe(7);
    expect(metaFromRaw(raw, '/other').revision).toBe(0);
    expect(metaFromRaw(raw, '/other').lastSyncedText).toBe('');
  });

  it('isDirty：没同步过一律算脏', () => {
    expect(isDirty('{"a":1}', metaFromRaw(null, '/api'))).toBe(true);
    const meta = { endpoint: '/api', revision: 1, lastSyncedAt: null, lastSyncedText: '{"a":1}' };
    expect(isDirty('{"a":1}', meta)).toBe(false);
    expect(isDirty('{"a":2}', meta)).toBe(true);
  });

  it('parseRemoteSnapshot 拒绝没有 events 的 payload', () => {
    expect(parseRemoteSnapshot({ revision: 1, payload: { nope: true } })).toBeNull();
    expect(parseRemoteSnapshot({ revision: 1, payload: null })?.revision).toBe(1);
  });
});

describe('SyncService ↔ Worker 端到端（本地假 KV）', () => {
  it('设备 A 首次推送成功，revision 从 0 变 1，本地变干净', async () => {
    const envW = makeWorkerEnv();
    const a = makeDevice(envW);
    expect(a.sync.status().ready).toBe(true);
    expect(a.sync.status().dirty).toBe(true);

    const pushed = await a.sync.push(false);
    expect(pushed.ok).toBe(true);
    if (pushed.ok) expect(pushed.revision).toBe(1);
    expect(a.sync.status().revision).toBe(1);
    expect(a.sync.status().dirty).toBe(false);
  });

  it('设备 B 拉到设备 A 推的数据（事件数一致）', async () => {
    const envW = makeWorkerEnv();
    const a = makeDevice(envW);
    a.store.createEvent({ date: '2026-11-21', title: '只在 A 上建的事件' });
    await a.sync.push(false);

    // B 是另一台设备：本地先被种子污染成 18 条，云端是 19 条
    const b = makeDevice(envW);
    expect(b.store.getState().data.events).toHaveLength(18);

    const pulled = await b.sync.pull();
    expect(pulled.ok).toBe(true);
    if (pulled.ok) expect(pulled.applied).toBe(true);
    const titles = b.store.getState().data.events.map((e) => e.title);
    expect(titles).toContain('只在 A 上建的事件');
    expect(b.sync.status().dirty).toBe(false);
  });

  it('B 在旧 revision 上推，得到 409 冲突并带回云端快照，而不是静默覆盖', async () => {
    const envW = makeWorkerEnv();
    const a = makeDevice(envW);
    await a.sync.push(false); // v1

    const b = makeDevice(envW);
    b.sync.applyRemoteSnapshot({ revision: 1, savedAt: null, payload: JSON.parse(b.store.exportJson()) });
    b.store.createEvent({ date: '2026-11-22', title: 'B 的改动' });

    a.store.createEvent({ date: '2026-11-23', title: 'A 又改了' });
    await a.sync.push(false); // v2

    const conflict = await b.sync.push(false);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.kind).toBe('conflict');
      expect(conflict.remote?.revision).toBe(2);
      expect(JSON.stringify(conflict.remote?.payload)).toContain('A 又改了');
    }
  });

  it('冲突后可以选择用本地强制覆盖云端', async () => {
    const envW = makeWorkerEnv();
    const a = makeDevice(envW);
    await a.sync.push(false);

    const b = makeDevice(envW);
    b.sync.applyRemoteSnapshot({ revision: 1, savedAt: null, payload: JSON.parse(b.store.exportJson()) });
    b.store.createEvent({ date: '2026-11-22', title: 'B 的改动' });

    a.store.createEvent({ date: '2026-11-23', title: 'A 又改了' });
    await a.sync.push(false);

    const forced = await b.sync.push(true);
    expect(forced.ok).toBe(true);
    if (forced.ok) expect(forced.revision).toBe(3);

    const pulled = await a.sync.pull();
    expect(pulled.ok).toBe(true);
    const titles = a.store.getState().data.events.map((e) => e.title);
    expect(titles).toContain('B 的改动');
  });

  it('口令错 → unauthorized；服务端没设口令 → server', async () => {
    const envW = makeWorkerEnv();
    const wrongToken = makeDevice(envW, '/api', 'wrong-token');
    const r1 = await wrongToken.sync.push(false);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.kind).toBe('unauthorized');

    const noSecret = makeDevice(makeWorkerEnv(''));
    const r2 = await noSecret.sync.push(false);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.kind).toBe('server');
  });

  it('云端为空时 pull 返回 applied:false，提示先推送', async () => {
    const envW = makeWorkerEnv();
    const a = makeDevice(envW);
    const r = await a.sync.pull();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.applied).toBe(false);
      expect(r.message).toContain('还没有数据');
    }
  });

  it('health 探测返回云端版本', async () => {
    const envW = makeWorkerEnv();
    const a = makeDevice(envW);
    await a.sync.push(false);
    const h = await a.sync.health();
    expect(h.ok).toBe(true);
    expect(h.message).toContain('v1');
  });

  it('网络失败被兜成 network，不抛异常', async () => {
    const storage = new MemoryStorage();
    const clock = new FakeClock();
    const store = new Store({ storage, clock, appVersion: '0.0.3' });
    store.init(seed);
    const boom = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const sync = new SyncService({ store, storage, clock, fetchImpl: boom });
    sync.saveConfig({ endpoint: 'https://offline.example/api', token: 'x', auto: true });
    const r = await sync.push(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('network');
  });
});
