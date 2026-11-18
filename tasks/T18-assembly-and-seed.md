---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T18 装配、首屏与示例种子

- **对应模块**: MOD-015（后半）+ 种子内容
- **依赖**: 全部（T01~T17）
- **可并行**: 否（收口）

## 目标
把所有模块接起来跑通首屏：创建 Port → `new Store` → 载种子 → `init` → `subscribe` 驱动重绘 → 绑定事件；并给出 2 条示例种子。

## 允许改动的文件
```
src/main.ts
public/data/events.json
```

## 装配顺序（不可调换）
```ts
const storage = createStorage();
const clock   = createClock();
const store   = new Store({ storage, clock, appVersion: '0.0.1' });

const seedRaw = await loadSeedRaw();
const init = store.init(seedRaw);

store.subscribe((s) => render(s));
render(store.getState());      // 首屏
bindActions(handler);          // 只调一次，必须在首次 render 之后

// init.issues 按 severity 分流：error → toast；STORAGE_UNAVAILABLE → 顶部常驻警示条
```

## handler 分派表（`data-action` → 行为）
`new-event` / `edit-event` / `delete-event` → formModal 与 confirmDialog
`add-record` / `edit-record` / `delete-record` → formModal
`toggle-card` → `store.toggleExpanded(id)`
`open-lightbox` → `openLightbox(cover)`
`jump-relation` → §6.5 流程（可见则滚动+flash；不可见则 clearFilters + toast）
`toggle-filter-category` / `toggle-filter-rating` / `clear-filters` / `toggle-sort` → filterBar
`jump-year` / `scroll-top` → yearNav
`open-import` / `open-export` / `restore-backup` → importExport
`keydown:Escape` / `/` → 关闭浮层 / 聚焦搜索框

## 种子（`public/data/events.json`）必须验证的能力
放 2 条示例，**故意覆盖这些路径**：
1. 事件 A：含 1 条外链封面（`https://`）、2 条外链、2 条记录（不同日期、不同星级，其中一条带碎碎念）。
2. 事件 B：与 A 互相关联（只写 A 的 `relatedIds` 含 B，验证反向索引能让 B 侧也显示），含 1 条记录、无封面。
3. 两条日期跨年，验证年份分组与跨度文案。
内容用中性示例（如「示例事件」），不要放真实个人数据。

## 严禁
- `main.ts` 内不得出现业务计算（超过 80 行即说明有逻辑漏在装配层）。
- 不在 `subscribe` 回调里做条件判断以外的逻辑（就是 `render(s)`）。
- 不重复调用 `bindActions`。

## 完成标准
- `npm run build` 后 `dist/data/events.json` 存在，直接打开 `dist/index.html`（或 `npm run dev`）能看到 2 条示例、年份分组、展开态、关联与跨度。
- 断网 / 删除种子文件后仍能启动并显示空态。
- 清空 localStorage 后重开，示例种子重新出现一次。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T18 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-015、§2.1 依赖方向、§4.6 DOM 契约与 data-action 表、§6.5 关联跳转、§7.2 场景表；以及 proposal.md 的 REQ-008/017/021。

任务：写 src/main.ts（装配与首屏）与 public/data/events.json（2 条示例种子）。

装配顺序必须是：createStorage/createClock → new Store → loadSeedRaw → store.init(seedRaw) → store.subscribe(s => render(s)) → render(store.getState()) → bindActions(handler)。bindActions 只许调一次，且必须在首次 render 之后——先绑定后首屏渲染即为缺陷。

handler 按文档的 data-action 表分派，不得遗漏：new/edit/delete event、add/edit/delete record、toggle-card、open-lightbox、jump-relation、筛选类、jump-year/scroll-top、open-import/export/restore-backup。

种子要求：2 条示例，事件 A 带外链封面与 2 条记录（不同日期不同星级，其一带碎碎念），事件 B 与 A 互相关联但只在 A 的 relatedIds 里写 B（验证反向索引），两条跨年。内容用中性示例，不放真实个人数据。

严禁：main.ts 里写业务计算（超 80 行就是有逻辑漏在这儿）；subscribe 回调里做 render 以外的逻辑；重复调用 bindActions。

完成标准：npm run build 后 dist/data/events.json 存在；打开页面能看到 2 条示例、年份分组、展开态、关联与跨度；删除种子文件后仍能启动并显示空态。每条验收写成可复现断言（打开哪个 URL、点哪个元素、期望看到什么），随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run build 的真实输出必须贴出。
```
