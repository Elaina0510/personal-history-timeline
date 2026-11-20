# 部署到 Cloudflare（静态站点 + 多端同步）

## 为什么不是 GitHub Pages

GitHub Pages 是纯静态托管，只有 GET，没有写入口。时间轴的数据存在每个浏览器的
localStorage 里，所以「手机上改的，电脑上看不到」。

Cloudflare 这套只多了一件事：一个 Worker 加一份 KV，用来存整份数据快照。
同一个 Worker 同时吐静态文件和 `/api/*`，所以是**同源**，不需要处理跨域 cookie。

```
浏览器 ──GET /            ──► Worker ──► ASSETS（./dist）
        ──GET/PUT /api/data ──► Worker ──► KV: snapshot
```

## 一次性准备

```bash
npx wrangler login                              # 浏览器里点允许
npx wrangler kv namespace create TIMELINE_KV    # 把返回的 id 填进 wrangler.toml
npx wrangler secret put SYNC_TOKEN              # 输入同步口令（随便长一点的字符串）
```

## 部署

```bash
npm run build        # 产出 dist（Worker 的 ASSETS 目录）
npm run cf:deploy    # wrangler deploy
```

部署完地址形如 `https://personal-history-timeline.<你的子域>.workers.dev`。

## 在设备上打开同步

页面工具栏点「同步」：

- 服务地址：部署在自己 Worker 上时填 `/api`；从 GitHub Pages 打开时填
  `https://<worker 域名>/api`（Worker 会按请求 Origin 回 CORS 头）。
- 同步口令：就是上一步 `SYNC_TOKEN` 的值。
- 自动同步：默认开。改动后 1.5 秒推送；打开页面时，这台设备没同步过就先拉云端，
  同步过且有本地改动就推上去，否则拉一次。

## 冲突怎么处理

推送时带 `baseRevision`。云端 revision 对不上就返回 409，并把云端快照一起带回来，
面板里会让你选「用云端覆盖本地」或「用本地覆盖云端」。**不会静默覆盖**——
两台设备同时改的时候，静默 last-write-wins 是真会丢记录的。

## 数据与体积

- 整份 JSON 存一个 KV 值（key `snapshot`），KV 单值上限 25MB，Worker 侧限 10MB。
- 封面图是 base64 内嵌在 JSON 里的，会一并上云。私密照片别往时间轴里贴。
- KV 免费额度：1GB 存储 / 每日 10 万读 / 1000 写。个人用足够。

## 本地联调（不上云也能验）

```bash
npm run build
npm run sync:dev          # http://127.0.0.1:3100，口令 local-dev-token
```

`scripts/dev-sync.mjs` 把静态文件和 `/api/*` 一起跑起来，KV 用内存 Map 顶替，
跑的是 `worker/index.js` 本身——所以本地验过的逻辑和线上的同一份。
