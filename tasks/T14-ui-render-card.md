---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T14 时间轴渲染与卡片

- **对应模块**: MOD-010
- **依赖**: T07（select）、T11（dom）、T12（styles）
- **可并行**: 与 T15 并行

## 目标
读 `AppState` 全量重建 `#timeline-root`，渲染年份分组、折叠态与展开态卡片、空态。**焦点与滚动恢复是本任务的核心风险点**。

## 允许改动的文件
```
src/ui/render.ts
src/ui/parts/card.ts
src/ui/parts/yearGroup.ts
```

## 接口
```ts
export function render(state: AppState): void;
export function renderCard(view: CardView, expanded: boolean): HTMLElement;
```

## 折叠态必须且只能展示六项（REQ-013）
发生日期、分类 chip、**最新记录**星级、标题、最新记录的简评、`记录数 / 关联数`。文本单行省略（CSS `text-overflow`），不得换行撑高。**不得**出现碎碎念正文、配图、外链。

## 展开态（REQ-014）
按 `sortedRecords()` 顺序列出全部记录（每条含日期、星级、简评、碎碎念），再展示封面图（点击 → `openLightbox`）、外链列表（`rel="noopener noreferrer"`）、关联区（chip 含日期+标题+方向+跨度，点击 → `jump-relation`）、操作区（编辑/删除事件、每条记录旁的新增/编辑/删除）。

## 展开条件
`CardView.expandable` 为 false 时不渲染箭头，点击整卡无响应（REQ-014）。

## 重绘恢复（§2.3，必须实现）
```
render(state):
  1. focusKey = activeElement?.dataset.focusKey; selStart/selEnd（若是 input/textarea）
  2. scrollY = window.scrollY
  3. groups = buildCards(...)   ← 来自 core/select，本文件不得自己算
  4. root.replaceChildren(...)
  5. 恢复 focus（CSS.escape 后 querySelector）、选区、scrollTo({top: scrollY, behavior:'instant'})
  6. 若 state.view.flashId 存在 → 给对应卡片加 .is-flash，2000ms 后移除
```

## 空态
- 全站 0 条：「还没有任何记录，写下第一条吧」+ 新建按钮。
- 筛选后 0 条：「没有符合条件的事件」+ 清空筛选按钮。
- 无记录的卡片：星级与简评位置显示「暂无记录」（REQ-005），不得显示 0 星。

## 严禁
- 不自己算最新记录、跨度、筛选命中（一律用 `CardView` 字段）。
- 不用 `innerHTML`。
- 不在此处绑定事件（全部走 `data-action` 委托）。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 在搜索框输入触发重绘后，光标仍在输入框且 `selectionStart` 未跳位。
- 3 条记录均只有简评的事件，卡片可展开并看到全部 3 条。
- 只有 1 条记录且无任何附加项的事件，无展开箭头且点击无响应。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T14 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-010、§2.3 重绘边界规则、§4.6 DOM 契约、§6.4 渲染与恢复、§6.6 展开条件；proposal.md 的 REQ-012/013/014/018。

任务：实现 src/ui/render.ts、src/ui/parts/card.ts、src/ui/parts/yearGroup.ts。

硬性要求：
1. 折叠态只显示六项：日期、分类、最新记录星级、标题、最新记录简评、记录数/关联数。不得出现碎碎念正文、配图、外链。
2. 展开态按 sortedRecords 顺序列记录，含配图（点击开灯箱）、外链（rel="noopener noreferrer"）、关联 chip、操作区。
3. 必须实现重绘前后的焦点与滚动恢复：存 data-focus-key、selectionStart/End、window.scrollY，重绘后恢复。
4. 所有派生数据从 CardView 取，不得自己算最新记录、跨度或筛选命中。
5. 无记录事件的星级位置显示「暂无记录」，不能显示 0 星。

严禁：自己实现业务计算、使用 innerHTML、在这里绑定事件、在重绘流程里调用 bindActions。

完成标准：验收三条（搜索框输入触发重绘后光标与选区不丢；3 条纯简评记录的事件可展开且全部可见；单条无附加项事件无展开箭头）。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run typecheck 无错误，并贴真实输出。
```
