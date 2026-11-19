---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T26 渲染层 —— 行布局与条目

- **对应模块**: MOD-010（`render.ts` + `yearGroup.ts` + 新建 `entry.ts`，删除 `card.ts`）
- **依赖**: T23（core 类型）、T24（类名）
- **可并行**: 与 T27 可同时开发，但 T27 的验收必须等 T26 落地

## 目标

把「年份分组 → 月份小节 → 卡片」改成「年份分隔条 → 月份胶囊 → 事件行」，事件行里只有日期与标题。删除卡片、折叠态、展开态、哈希伪随机槽位。

## 允许改动的文件

```
src/ui/render.ts
src/ui/parts/entry.ts        （新建）
src/ui/parts/yearGroup.ts
src/ui/parts/card.ts         （删除此文件）
```

## 一、`entry.ts`（新建）

```ts
import type { CardView } from '../../core/select';
export function renderEntry(view: CardView, seq: number, side: 'left' | 'right'): HTMLElement;
```

返回**一整行**（不是条目片段），DOM 结构固定：

```html
<div class="htl-row is-right" data-event-id="evt_…" data-seq="0">
  <div class="htl-cell--entry">
    <article class="htl-entry">
      <span class="htl-entry__date">2026-11-18</span>
      <button type="button" class="htl-entry__title"
              data-action="open-detail" data-id="evt_…"
              data-focus-key="entry.evt_…">标题文字</button>
    </article>
  </div>
  <div class="htl-cell--axis">
    <span class="htl-node" aria-hidden="true"></span>
    <span class="htl-link" aria-hidden="true"></span>
  </div>
</div>
```

- `is-right` / `is-left` 由传入的 `side` 决定，`class` 里只有其中一个。
- `data-seq` 写 `String(seq)`。
- 日期用 `view.event.date` 原样输出（`YYYY-MM-DD`）。
- 标题用 `view.event.title`；超长截断交给 CSS，**不许**在 TS 里裁剪字符串。
- 只有标题是交互元素（`data-action="open-detail"`）；日期不可点；行本身不绑 action。

**不许**出现的东西：星级（`.htl-star`）、分类 chip、简评、记录数/关联数、展开箭头、`data-action="toggle-card"`、`aria-expanded`。

## 二、`yearGroup.ts`（改写）

签名改为接收全局序号表：

```ts
export function renderYearGroup(group: YearGroup, seqOf: ReadonlyMap<string, number>): HTMLElement;
```

- 保留：年份 `section.htl-year-group[data-year]`、`h2.htl-year-heading[data-year][data-focus-key="year.<Y>"]`、月份 `section.htl-month-group[data-month][data-year]`、`h3.htl-month-heading[data-month][data-year][data-focus-key="month.<Y>.<MM>"]`、空月份不占位、`group.months` 缺失时的扁平兼容分支。
- 删除：`hashString()`、`is-up/is-down`、`--lift`/`--gap` 行内样式、`.htl-axis-node` 两个节点元素、`expandedIds` 参数与 `isExpanded` 逻辑。
- 生成行：对每个 card 取 `seq = seqOf.get(card.event.id) ?? 0`，`side = seq % 2 === 0 ? 'right' : 'left'`，调用 `renderEntry` 并 append。
- **左右不得按月组或年组重置**：序号一律从 `seqOf` 取，跨年月连续计数（这决定了第 1 个事件在右、第 2 个在左）。

## 三、`render.ts`（改）

- 删 `export { renderCard }`，改为 `export { renderEntry } from './parts/entry';`
- `render()` 里：
  ```
  const groups = buildCards(state.data.events, state.view.filters, state.view.sortOrder);
  const flat = groups.flatMap(g => g.months.flatMap(m => m.cards));
  const seqOf = new Map<string, number>();
  flat.forEach((v, i) => seqOf.set(v.event.id, i));
  ...
  root.replaceChildren(...groups.map(g => renderYearGroup(g, seqOf)));
  ```
  （`g.months` 缺失时用 `g.cards` 拍平，兼容分支要与 yearGroup 一致）
- 删 `state.view.expandedIds` 的传递。
- **不动**：重绘前的 `focusKey` / `setSelectionRange` / `scrollY` 捕获与恢复、两种空态、`drawAxis(root)` 调用、`flashId` 高亮与 2000ms 计时器、`filterBarRenderer` / `yearNavRenderer` 的调用容错。

## 严禁

- 不许保留 `card.ts` 文件（删掉，不是留空）。
- 不许在 `render.ts` 里自己算左右、序号或筛选（一律走 `seqOf` 与 `CardView`）。
- 不许自己算「最新记录」用于展示——本版条目根本不展示星级与简评。
- 不许用 `innerHTML`、不许在此文件绑定事件。
- 不许改 `drawAxis` 的调用位置与时机（T27 会重写 axis.ts 内部）。
- 不许动 `dom.ts` 的 `el()` 签名。

## 验收清单（可复现断言，派发方复跑）

1. `document.querySelectorAll('.htl-card, .htl-slot').length === 0`；`document.querySelector('[data-action="toggle-card"]') === null`。
2. 前四行：`[...document.querySelectorAll('.htl-row')].slice(0,4).map(r => r.classList.contains('is-right') ? 'R' : 'L')` 等于 `['R','L','R','L']`。
3. 任一 `.htl-entry` 的 `children.length === 2`，且子元素类名为 `htl-entry__date` 与 `htl-entry__title`。
4. 点某行 `.htl-entry__date` → 无浮层出现（`.htl-detail === null`）；点 `.htl-entry__title` → 出现（此条依赖 T29，T29 未落地前只验 `data-action` 属性值为 `open-detail`）。
5. 3 条记录的事件与 0 条记录的事件：两行 `getBoundingClientRect().height` 相等（容差 1px）。
6. 跨 3 年 3 个月的数据：`.htl-year-group` 数 3、某年内 `.htl-month-group` 数 3、各月 `.htl-row` 数量之和等于该年行数。
7. 在搜索框输入触发重绘后，光标仍在搜索框、`selectionStart` 不跳位（重绘恢复没被改坏）。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T26 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

前置：T21/T22/T23 已完成（core 里没有 category / expandable / toggleExpanded），T24 已完成（CSS 里有 .htl-row / .htl-entry / .htl-node / .htl-link 这些类名）。当前 render.ts、yearGroup.ts、card.ts 会因为引用已删除的类型而编译失败，你的任务就是把它们修好。

先读（只读）：
- detailed-design-v0.0.2.md 的 §5.2（render 族接口）、§5.4、§6.5（左右交替序号）
- tasks-v0.0.2/README.md 的「三、类名与变量契约」
- proposal-v0.0.2.md 的 REQ-013 / REQ-014

任务：新建 src/ui/parts/entry.ts；改写 yearGroup.ts；改 render.ts；删除 src/ui/parts/card.ts。

硬性要求：
1. renderEntry(view, seq, side) 返回整行 .htl-row.is-left/.is-right[data-event-id][data-seq]，内含 .htl-cell--entry（.htl-entry > .htl-entry__date + button.htl-entry__title[data-action="open-detail"]）与 .htl-cell--axis（.htl-node + .htl-link）。
2. 条目里只有日期和标题两样东西。不许出现星级、分类、简评、记录数、展开箭头、toggle-card。
3. 只有标题可点，日期不可点，行本身不绑 action。
4. 左右由全局序号决定：第 1 个（seq=0）在右、第 2 个在左。序号从 render.ts 用 Map<eventId, seq> 传进来，yearGroup 不得按月组/年组重置计数。
5. render.ts 计算 seqOf 的方式：groups 拍平成 cards 数组后按下标建 Map，再传给每个 renderYearGroup。
6. 重绘前的 focusKey / 选区 / scrollY 捕获与恢复、两种空态、drawAxis 调用、flashId 高亮、filterBar/yearNav 容错调用，统统不许动。
7. yearGroup.ts 删掉 hashString、is-up/is-down、--lift/--gap、.htl-axis-node，月份与年份的类名和 data 属性保持原样。

严禁：
- 保留 card.ts 文件
- 在 render.ts 里自己算筛选/排序/左右
- 用 innerHTML、在这里绑事件
- 改 drawAxis 的调用时机（axis.ts 内部由另一个任务重写）
- 改 dom.ts 的 el() 签名

完成标准：
- npm run typecheck 零错误（render/yearGroup/entry 自身），贴真实输出
- 交付可复现断言清单：前四行 R/L 交替；.htl-entry children 恰好 2 个；toggle-card 不存在；3 条记录与 0 条记录的行高相等；搜索框打字后光标与选区不丢。DOM 断言由派发方用浏览器复跑，你不要自述「已验证」。
```
