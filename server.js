import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 本地仓库里构建产物在 dist/，纯部署仓库里产物就在根目录
const DIST_DIR = fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : __dirname;

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const BLOCKED_PATHS = new Set([
  '/server.js',
  '/package.json',
  '/package-lock.json',
]);

app.use((req, res, next) => {
  if (BLOCKED_PATHS.has(req.path) || req.path.startsWith('/node_modules')) {
    return res.status(404).end();
  }
  next();
});

app.use(express.static(DIST_DIR, { dotfiles: 'ignore' }));

// SPA 回退：无扩展名的 GET 一律给 index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !path.extname(req.path)) {
    return res.sendFile(path.join(DIST_DIR, 'index.html'));
  }
  next();
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT} (serving ${DIST_DIR})`);
});
