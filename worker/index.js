/**
 * Cloudflare Worker：同一个 Worker 同时提供
 *   1. 静态站点（Workers Static Assets，目录 ./dist）
 *   2. 同步 API（/api/*，数据落在 Workers KV）
 *
 * 设计要点
 * - 单一口令鉴权：口令存在 Worker secret（env.SYNC_TOKEN），绝不进前端代码。
 * - 乐观并发：PUT 必须带 baseRevision，与云端 revision 不符就 409 并回传云端快照，
 *   由前端决定「用云端 / 覆盖云端」，不允许静默 last-write-wins。
 * - 整份快照存 KV（key: snapshot），value 形如
 *   { revision, savedAt, updatedAt, payload: { schemaVersion, appVersion, savedAt, ui, events } }
 */

const SNAPSHOT_KEY = 'snapshot';
const MAX_PUSH_BYTES = 10 * 1024 * 1024; // KV 单值上限 25MB，这里留足余量

const BASE_CORS = {
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, x-sync-token',
  'access-control-max-age': '86400',
};

function corsHeaders(request) {
  const headers = { ...BASE_CORS };
  const origin = request.headers.get('Origin');
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'Origin';
  }
  return headers;
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

/** 常数时间比较，避免口令爆破时泄露前缀 */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function readToken(request) {
  const direct = request.headers.get('x-sync-token');
  if (direct) {
    return direct.trim();
  }
  const auth = request.headers.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  return '';
}

function readSnapshot(kv) {
  return kv.get(SNAPSHOT_KEY, 'json');
}

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/health' && request.method === 'GET') {
    const snapshot = await readSnapshot(env.TIMELINE_KV);
    return jsonResponse(request, {
      ok: true,
      service: 'personal-history-timeline-sync',
      configured: typeof env.SYNC_TOKEN === 'string' && env.SYNC_TOKEN.length > 0,
      revision: snapshot && typeof snapshot.revision === 'number' ? snapshot.revision : 0,
    });
  }

  if (path !== '/api/data') {
    return jsonResponse(request, { error: 'not_found' }, 404);
  }

  if (typeof env.SYNC_TOKEN !== 'string' || env.SYNC_TOKEN.length === 0) {
    return jsonResponse(request, { error: 'server_not_configured' }, 500);
  }
  if (!sameSecret(readToken(request), env.SYNC_TOKEN)) {
    return jsonResponse(request, { error: 'unauthorized' }, 401);
  }

  if (request.method === 'GET') {
    const snapshot = await readSnapshot(env.TIMELINE_KV);
    if (!snapshot) {
      return jsonResponse(request, { empty: true, revision: 0, savedAt: null, payload: null });
    }
    return jsonResponse(request, {
      empty: false,
      revision: snapshot.revision,
      savedAt: snapshot.savedAt ?? null,
      payload: snapshot.payload ?? null,
    });
  }

  if (request.method !== 'PUT') {
    return jsonResponse(request, { error: 'method_not_allowed' }, 405);
  }

  const raw = await request.text();
  if (raw.length > MAX_PUSH_BYTES) {
    return jsonResponse(request, { error: 'payload_too_large', limit: MAX_PUSH_BYTES }, 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(request, { error: 'invalid_json' }, 400);
  }
  if (!body || typeof body !== 'object' || !body.payload || !Array.isArray(body.payload.events)) {
    return jsonResponse(request, { error: 'invalid_shape' }, 400);
  }

  const baseRevision = Number.isInteger(body.baseRevision) ? body.baseRevision : 0;
  const force = url.searchParams.get('force') === '1';
  const current = await readSnapshot(env.TIMELINE_KV);
  const currentRevision = current && Number.isInteger(current.revision) ? current.revision : 0;

  if (!force && baseRevision !== currentRevision) {
    return jsonResponse(
      request,
      {
        conflict: true,
        remote: {
          revision: currentRevision,
          savedAt: current ? current.savedAt ?? null : null,
          payload: current ? current.payload ?? null : null,
        },
      },
      409
    );
  }

  const next = {
    revision: currentRevision + 1,
    savedAt: typeof body.payload.savedAt === 'string' ? body.payload.savedAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    payload: body.payload,
  };
  await env.TIMELINE_KV.put(SNAPSHOT_KEY, JSON.stringify(next));

  return jsonResponse(request, { ok: true, revision: next.revision, savedAt: next.savedAt });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      if (!env.TIMELINE_KV) {
        return jsonResponse(request, { error: 'kv_not_bound' }, 500);
      }
      return handleApi(request, env, url);
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404, headers: corsHeaders(request) });
  },
};

export { sameSecret, readToken };
