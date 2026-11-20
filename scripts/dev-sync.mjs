/**
 * 本地同步联调服务器（不碰 Cloudflare，只为了能在本机验证前后端同一份代码）
 *
 * - 静态文件：./dist
 * - /api/*：交给 worker/index.js 的 fetch（KV 用内存 Map 顶替）
 *
 * 用法：node scripts/dev-sync.mjs   （默认 127.0.0.1:3100，TOKEN 默认 local-dev-token）
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3100;
const TOKEN = process.env.SYNC_TOKEN || 'local-dev-token';

const kvMap = new Map();
const env = {
  SYNC_TOKEN: TOKEN,
  TIMELINE_KV: {
    async get(key, type) {
      const raw = kvMap.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key, value) {
      kvMap.set(key, value);
    },
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA 回退
    const index = path.join(DIST, 'index.html');
    if (!fs.existsSync(index)) {
      res.writeHead(404).end('dist 还没构建：先 npm run build');
      return;
    }
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(fs.readFileSync(index));
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const request = new Request(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const response = await worker.fetch(request, env);
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const text = await response.text();
    res.writeHead(response.status, headers);
    res.end(text);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`dev sync server: http://127.0.0.1:${PORT}  (token: ${TOKEN})`);
});
