---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T30 装配 —— main.ts、版本号、种子清理

- **对应模块**: MOD-015（装配半）
- **依赖**: T26、T27、T28、T29
- **可并行**: 否，必须最后做

## 目标

把详情浮层接进 action 总线与订阅；删掉 `toggle-card`；把版本号推到 `0.0.2`；把种子数据里的分类字段清干净。做完这一任务，整站在浏览器里能真跑。

## 允许改动的文件

```
src/main.ts
package.json
public/data/events.json
```

## 一、`main.ts`

### 1. 导入

```ts
import { openDetail, closeDetail, refreshDetail } from './ui/parts/detailModal';
```

### 2. 订阅（关键）

```ts
// 原来：store.subscribe((s) => render(s));
store.subscribe((s) => {
  render(s);
  refreshDetail(s);   // 未打开详情时是 no-op
});
```

顺序不许反过来：先重绘主轴，再刷新浮层。

### 3. action 分支

| 改动 | 内容 |
|------|------|
| 删 | `case 'toggle-card'` |
| 增 | `case 'open-detail': if (id) openDetail(id, store); break;` |
| 增 | `case 'close-detail': closeDetail(); break;` |
| 改 | `case 'delete-event'`：删除成功后**先** `closeDetail()` 再 `toast('已删除')`；确认框文案与关联解除数量逻辑不变 |
| 改 | `case 'jump-relation'`：进入分支第一句先 `closeDetail()`（不然滚动被锁住，`scrollIntoView` 无效）；`scrollIntoView` 的 `block` 由 `'start'` 改为 `'center'`；其余（找不到就 `clearFilters` 再查、`flash`）不动 |

### 4. ESC

```ts
if (e.key === 'Escape') { closeLightbox(); closeFormModal(); closeDetail(); }
```

### 5. 版本

```ts
store = new Store({ storage, clock, appVersion: '0.0.2' });
```

`__htl_store` 挂载、种子加载、`renderToolbar`、`mountCapacityBar`、`bindActions`、初始化 issue 的提示逻辑全部不动。

## 二、`package.json`

`"version": "0.0.1"` → `"version": "0.0.2"`。`scripts` 与依赖一个不动。

## 三、`public/data/events.json`（种子）

1. 删根对象上的整个 `"categories": [...]` 数组。
2. 删每个事件对象里的 `"category": "..."` 键（当前 10 条事件各有一个）。
3. `"appVersion"` 由 `"0.0.1"` 改为 `"0.0.2"`。
4. 其余一律不动：`schemaVersion`、`savedAt`、`ui`、10 条事件的 `id` / `date` / `title` / `cover` / `links` / `relatedIds` / `records` / `createdAt` / `updatedAt`。
5. 保持合法 JSON（无尾逗号），`node -e "JSON.parse(require('fs').readFileSync('public/data/events.json','utf8'))"` 能过。

**注意**：这份种子只在本地无任何数据时载入一次（REQ-008）。清干净的目的是不让新导出的文件带脏字段，也避免每次首屏都靠归一化兜底。

## 严禁

- 不许改 `render` / `refreshDetail` 的调用顺序。
- 不许保留 `toggle-card` 分支做兼容（旧 DOM 已经不存在）。
- 不许在 `delete-event` 里忘记关详情（否则浮层挂在已删事件上，直到下次刷新）。
- 不许动 `store.init` / 种子加载 / `bindActions` 的既有顺序。
- 不许改 `public/data/events.json` 的条目数量、id 或记录内容。
- 不许加版本迁移代码。

## 验收清单

1. `npm run typecheck` 零错误、`npm run build` 成功，贴真实输出。
2. `npm run test` 全绿（7 个 spec），贴真实输出。
3. `node -e "..."` 解析种子 JSON 通过；`grep -c "category" public/data/events.json` 返回 0。
4. `grep -n "toggle-card" src/` 返回 0。
5. 浏览器全流程（派发方复跑）：
   - 清空 localStorage 后首屏：种子 10 条事件全部显示，轴竖向；
   - 点任一标题 → 详情浮层；详情内点「编辑事件」→ 表单叠开 → 关表单 → 详情仍在且 `is-locked` 仍为 `true`；
   - 详情内点关联项 → 详情关闭、页面滚到目标行并高亮；
   - 详情内点「删除事件」→ 确认 → 浮层关闭、行消失；
   - 导出 JSON：不含 `categories`，事件不含 `category`；
   - 导入一份 v0.0.1 旧导出文件：预览错误数 0，导入成功，事件合并且无分类字段。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T30 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。这是 v0.0.2 的最后一个任务。

前置：T21~T29 全部已完成（core 无分类字段、render 出 .htl-row、axis 是竖向、detailModal.ts 已导出 openDetail/closeDetail/refreshDetail/isDetailOpen、scrollLock 已就位）。

先读（只读）：
- detailed-design-v0.0.2.md 的 §5.6（main.ts 装配契约）、§6.2~§6.4
- proposal-v0.0.2.md 的 REQ-021、REQ-029、REQ-031

任务：改 src/main.ts、package.json、public/data/events.json。

硬性要求：
1. 订阅改成 store.subscribe((s) => { render(s); refreshDetail(s); })，顺序不能反。
2. 删掉 case 'toggle-card'；新增 case 'open-detail'（调 openDetail(id, store)）与 case 'close-detail'。
3. delete-event 删除成功后先 closeDetail() 再 toast。
4. jump-relation 分支第一句先 closeDetail()；scrollIntoView 的 block 从 'start' 改 'center'；其余逻辑不动。
5. ESC 分支加上 closeDetail()。
6. appVersion 传 '0.0.2'；package.json 的 version 改 0.0.2。
7. 种子 public/data/events.json：删根上的 categories 数组、删 10 条事件里各自的 category 键、appVersion 改 0.0.2，其它一个字都不许动，改完必须是合法 JSON。

严禁：
- 反了 render 与 refreshDetail 的顺序
- 留着 toggle-card 做兼容
- delete-event 里忘了关详情
- 动种子的事件数量、id、记录内容
- 加任何版本迁移代码

完成标准：
- npm run typecheck 零错误、npm run build 成功、npm run test 全绿，三条都贴真实输出
- grep -c "category" public/data/events.json 返回 0，贴输出
- grep -n "toggle-card" src/ 返回 0，贴输出
- 交付可复现断言清单（清空 localStorage 后首屏 10 条、点标题开详情、详情内开表单再关后锁仍在、关联跳转先关详情、删除事件后浮层关闭、导出不含分类、导入旧文件错误 0）。DOM 断言由派发方用浏览器复跑，不要自述「已验证」。
```
