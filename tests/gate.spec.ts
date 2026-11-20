import { describe, expect, it, afterEach } from 'vitest';
import { probeApiMode, verifyToken } from '../src/ui/gate';

const realFetch = globalThis.fetch;

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = impl as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('同步门禁探测', () => {
  it('没有 /api/health（GitHub Pages）→ static，不上锁', async () => {
    stubFetch(async () => new Response('<html>404</html>', { status: 404 }));
    const probe = await probeApiMode();
    expect(probe.mode).toBe('static');
  });

  it('探测到自己的 health JSON → api，并带上云端 revision', async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({ ok: true, service: 'personal-history-timeline-sync', configured: true, revision: 4 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const probe = await probeApiMode();
    expect(probe.mode).toBe('api');
    expect(probe.revision).toBe(4);
  });

  it('别家的健康检查（没有 timeline 标识）不算 API 模式', async () => {
    stubFetch(async () => new Response(JSON.stringify({ ok: true, service: 'other' }), { status: 200 }));
    const probe = await probeApiMode();
    expect(probe.mode).toBe('static');
  });

  it('网络异常按 static 处理，绝不把人锁死在外面', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const probe = await probeApiMode();
    expect(probe.mode).toBe('static');
  });

  it('verifyToken：200 才算有效，401 无效，空串直接无效', async () => {
    stubFetch(async () => new Response('{"events":[]}', { status: 200 }));
    expect(await verifyToken({ endpoint: '/api', token: 'good', auto: true })).toBe(true);

    stubFetch(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    expect(await verifyToken({ endpoint: '/api', token: 'bad', auto: true })).toBe(false);

    expect(await verifyToken({ endpoint: '/api', token: '   ', auto: true })).toBe(false);
  });

  it('verifyToken 发给 /data 且带上口令头', async () => {
    let seenUrl = '';
    let seenToken: string | null = null;
    stubFetch(async (input, init) => {
      seenUrl = String(input);
      const headers = new Headers(init?.headers);
      seenToken = headers.get('x-sync-token');
      return new Response('{"events":[]}', { status: 200 });
    });
    await verifyToken({ endpoint: '/api', token: 'abc123', auto: true });
    expect(seenUrl).toBe('/api/data');
    expect(seenToken).toBe('abc123');
  });
});
