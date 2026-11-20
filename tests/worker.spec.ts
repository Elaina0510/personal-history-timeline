import { describe, expect, it } from 'vitest';
import worker from '../worker/index.js';

/** 最小 KV 假实现：只支持 get(key,'json') / put */
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
  size() {
    return this.map.size;
  }
}

const TOKEN = 'test-token-123';
const URL_BASE = 'https://timeline.example.com';

function env(over: Record<string, unknown> = {}) {
  return { SYNC_TOKEN: TOKEN, TIMELINE_KV: new FakeKV(), ...over } as any;
}

function call(path: string, init: RequestInit = {}, e = env()) {
  return (worker as any).fetch(new Request(URL_BASE + path, init), e);
}

const payload = {
  schemaVersion: 1,
  appVersion: '0.0.3',
  savedAt: '2026-11-20T23:30:00+08:00',
  ui: { sortOrder: 'desc' },
  events: [{ id: 'evt_1700000000001_aaaaaa', date: '2026-11-19', title: 'x', links: [], relatedIds: [], records: [], createdAt: '2026-11-19T12:00:00+08:00', updatedAt: '2026-11-19T12:00:00+08:00' }],
};

function put(events: unknown, baseRevision: number, e = env(), token = TOKEN) {
  return call(
    '/api/data',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-sync-token': token },
      body: JSON.stringify({ baseRevision, payload: { ...payload, events } }),
    },
    e
  );
}

describe('Worker 同步 API', () => {
  it('GET /api/health 不需要口令，返回 configured 与 revision', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(true);
    expect(body.revision).toBe(0);
  });

  it('口令不对返回 401，且不落库', async () => {
    const e = env();
    const res = await call('/api/data', { headers: { 'x-sync-token': 'wrong' } }, e);
    expect(res.status).toBe(401);
    expect((e.TIMELINE_KV as FakeKV).size()).toBe(0);
  });

  it('Bearer 头也能通过鉴权', async () => {
    const res = await call('/api/data', { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(200);
  });

  it('空库 GET 返回 empty:true', async () => {
    const res = await call('/api/data', { headers: { 'x-sync-token': TOKEN } });
    const body = await res.json();
    expect(body.empty).toBe(true);
    expect(body.revision).toBe(0);
  });

  it('首次 PUT baseRevision=0 成功，revision 变 1；GET 读回同一份 payload', async () => {
    const e = env();
    const push = await put(payload.events, 0, e);
    expect(push.status).toBe(200);
    expect((await push.json()).revision).toBe(1);

    const pull = await call('/api/data', { headers: { 'x-sync-token': TOKEN } }, e);
    const body = await pull.json();
    expect(body.revision).toBe(1);
    expect(body.payload.events).toHaveLength(1);
    expect(body.payload.appVersion).toBe('0.0.3');
  });

  it('baseRevision 落后时返回 409 并带回云端快照', async () => {
    const e = env();
    await put(payload.events, 0, e); // revision 1
    await put([...payload.events, { ...payload.events[0], id: 'evt_1700000000002_bbbbbb' }], 1, e); // revision 2

    const stale = await put(payload.events, 1, e); // 本地还以为在 1
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.conflict).toBe(true);
    expect(body.remote.revision).toBe(2);
    expect(body.remote.payload.events).toHaveLength(2);
  });

  it('force=1 跳过 revision 检查，强制覆盖', async () => {
    const e = env();
    await put(payload.events, 0, e);
    await put(payload.events, 1, e);
    const res = await call(
      '/api/data?force=1',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-sync-token': TOKEN },
        body: JSON.stringify({ baseRevision: 0, payload: { ...payload, events: [] } }),
      },
      e
    );
    expect(res.status).toBe(200);
    const after = await (await call('/api/data', { headers: { 'x-sync-token': TOKEN } }, e)).json();
    expect(after.revision).toBe(3);
    expect(after.payload.events).toHaveLength(0);
  });

  it('形状不对的 payload 返回 400', async () => {
    const res = await call('/api/data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-sync-token': TOKEN },
      body: JSON.stringify({ baseRevision: 0, payload: { nope: 1 } }),
    });
    expect(res.status).toBe(400);
  });

  it('坏 JSON 返回 400', async () => {
    const res = await call('/api/data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-sync-token': TOKEN },
      body: '{oops',
    });
    expect(res.status).toBe(400);
  });

  it('X-Sync-Token 不走 CORS 预检失败：OPTIONS 返回 204 且带允许头', async () => {
    const res = await call('/api/data', {
      method: 'OPTIONS',
      headers: { Origin: 'https://elaina0510.github.io', 'access-control-request-method': 'PUT' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://elaina0510.github.io');
    expect(res.headers.get('access-control-allow-headers')).toContain('x-sync-token');
  });

  it('非 /api 路径交给静态资源绑定', async () => {
    const assets = { fetch: () => new Response('asset-hit', { status: 200 }) };
    const res = await call('/index.html', {}, env({ ASSETS: assets }));
    expect(await res.text()).toBe('asset-hit');
  });

  it('未配置 SYNC_TOKEN 时鉴权接口报 500 而不是放行', async () => {
    const res = await call('/api/data', { headers: { 'x-sync-token': 'whatever' } }, env({ SYNC_TOKEN: '' }));
    expect(res.status).toBe(500);
  });
});
