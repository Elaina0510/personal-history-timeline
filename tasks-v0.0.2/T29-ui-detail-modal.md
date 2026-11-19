---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T29 详情浮层（新增模块）

- **对应模块**: MOD-019 `src/ui/parts/detailModal.ts`（新建）
- **依赖**: T24（类名与样式）、T25（`scrollLock`）、T26（`entry.ts` 的 `open-detail` action 名）
- **可并行**: 否。它是本版唯一的新增交互，必须在装配前独立跑通
- **验收口径要分段**：`main.ts` 里还没有 `open-detail` 分支（那是 T30 的事），所以本任务交付时「点标题能打开」在浏览器里**点不出来**。W4 阶段的验收走控制台 `openDetail(id, window.__htl_store)`；「点标题 → 浮层」这条入口断言留到 T30 之后复跑。不要为了让它能点而私自去改 `main.ts`。

## 目标

点击条目标题打开覆盖式详情浮层，展示该事件的全部内容；浮层打开期间数据变化要能就地刷新；三种关闭方式都生效；滚动锁不与其他浮层打架。

## 允许改动的文件

```
src/ui/parts/detailModal.ts   （新建）
```

**不许改** `main.ts`（装配是 T30）、不许改 `lightbox.ts` / `formModal.ts`、不许改 CSS（类名照 T24）。

## 一、接口

```ts
import type { AppState } from '../../core/types';
import type { Store } from '../../core/store';

export function openDetail(eventId: string, store: Store): void;
export function closeDetail(): void;
export function refreshDetail(state: Readonly<AppState>): void;
export function isDetailOpen(): boolean;
```

模块级状态：`let currentEventId: string | null`、`let currentRoot: HTMLElement | null`、`let currentStore: Store | null`、`let lastPanelScrollTop = 0`。

**打开状态不进 `ViewState`**。理由写死在注释里：进视图状态会触发全量重绘 `#timeline-root`，而浮层不在重建范围内，纯属浪费。

## 二、DOM（严格照抄，类名一个不许改）

见 `detailed-design-v0.0.2 §5.5`。要点复述：

```
.htl-detail[data-detail][role="dialog"][aria-modal="true"][aria-label="事件详情"]
  .htl-detail__panel
    header.htl-detail__head
      span.htl-detail__date       ← event.date
      h2.htl-detail__title        ← event.title
      button[data-action="close-detail"]
    .htl-detail__body
      .htl-detail__records
        .htl-detail__record[data-record-id]
          .htl-detail__record-head（日期 + .htl-star + 编辑/删除按钮）
          p.htl-detail__record-summary
          p.htl-detail__record-detail（detail 非空才渲染）
      .htl-detail__cover img[data-action="open-lightbox"][data-id="{src}"]
      .htl-detail__links a.htl-chip[rel="noopener noreferrer"]
      .htl-detail__relations button.htl-chip[data-action="jump-relation"]
      .htl-detail__actions（add-record / edit-event / delete-event）
```

挂载点：`#overlay-root`（不存在就建，照 `lightbox.ts` 的 `getOverlayRoot()` 写法）。

## 三、数据来源（不许自己算派生数据）

```ts
import { buildCards, sortedRecords } from '../../core/select';
const EMPTY_FILTER: FilterState = { ratings: [], minFour: false, keyword: '' };
const groups = buildCards(state.data.events, EMPTY_FILTER, state.view.sortOrder);
const view = groups.flatMap(g => g.months.flatMap(m => m.cards)).find(v => v.event.id === currentEventId);
```

- 记录用 `sortedRecords(view.event)`（已按日期升序、同日按创建时间升序）。
- 关联用 `view.relations`（含 `dir`、`spanText`），**不许**自己算方向或跨度。
- 星级用 `record.rating`，`★` 重复次数与 `☆` 补齐，照 `card.ts` 原来的写法（`'★'.repeat(rating) + '☆'.repeat(5-rating)`）。
- 记录为空：`.htl-detail__records` 内渲染一行「还没有记录」，不渲染任何星级或计数。

## 四、行为

| 动作 | 行为 |
|------|------|
| `openDetail(id, store)` | 事件不存在 → error toast 并返回；已打开 → 复用浮层重建 `panel`；否则 `lockScroll()` 后挂载 |
| `closeDetail()` | 幂等；摘除 DOM → `unlockScroll()` → 清空 `currentEventId` |
| `refreshDetail(state)` | 未打开 → no-op；事件不存在 → `closeDetail()` + error toast「事件不存在或已被删除」；否则重建 `panel` 内容，并恢复 `panel.scrollTop`（夹到 `scrollHeight - clientHeight` 范围内） |
| 点遮罩 | `ev.target === 浮层根` 时关闭（点 panel 内部的空白不关闭） |
| `[data-action="close-detail"]` | 关闭 |
| ESC | **不在这里绑定**，由 `main.ts` 统一调 `closeDetail()`（T30） |

**操作按钮不在这里处理**：`add-record` / `edit-record` / `delete-record` / `edit-event` / `delete-event` / `open-lightbox` / `jump-relation` 全部靠 `bindActions` 的委托，`main.ts` 的 handler 已有分支。本模块只负责渲染 `data-action` 属性。

**重建时的事件监听**：只绑浮层根上的关闭相关监听（遮罩点击、关闭按钮可走委托则不必单独绑）。不要 `document` 级 keydown。

## 严禁

- 不许把打开状态塞进 `ViewState` 或 store。
- 不许自己算最新记录、跨度、方向、筛选命中（一律取 `CardView` / `sortedRecords`）。
- 不许用 `innerHTML`。
- 不许在浮层内自己处理增删改（交给既有 action 委托）。
- 不许自己 `classList.add('is-locked')`（必须走 `lockScroll`）。
- 不许加 `document` 级 keydown 监听（会和 lightbox / formModal 的 ESC 打架）。
- 不许做详情深链接（URL hash）。

## 验收清单（可复现断言，派发方复跑）

> 本任务在 T30 之前交付，入口还没接通。第 1 条按「控制台直调」验；标了 ⏳T30 的条目等装配完再补跑。

1. 控制台 `openDetail('<某个真实事件 id>', window.__htl_store)` → `document.querySelector('.htl-detail') !== null`；`document.body.classList.contains('is-locked') === true`；再 `closeDetail()` → 两者都回到空 / false。
2. ⏳T30：点某行 `.htl-entry__title` → 同样的浮层出现（这条验的是 `main.ts` 的 `open-detail` 分支，本任务不负责）。
3. 该事件有 3 条记录时：`.htl-detail__record` 数量 3，日期文本自上而下递增；每条的 `.htl-star` 存在且与其 `rating` 对应。
4. 有配图 → `.htl-detail__cover img` 存在；点它出现 `.htl-lightbox`，关灯箱后 `.htl-detail` 仍在且 `is-locked` 仍为 `true`。
5. 有关联 → `.htl-detail__relations button` 数量等于关联数，文本含方向箭头与跨度。
6. `.htl-detail__actions` 里有 add-record / edit-event / delete-event 三个按钮。
7. ⏳T30：ESC 关闭（`main.ts` 那行 `closeDetail()` 加完才生效）；点遮罩、点关闭按钮两条本任务内就能验。三种关闭后 `is-locked === false`。
8. 浮层开着时用 `store.addRecord(...)` 新增一条记录 → 浮层内 `.htl-detail__record` 数量 +1（验证 `refreshDetail`），且浮层没有闪一下消失。
9. 浮层开着时 `store.deleteEvent(当前id)` → 浮层自动消失并出现错误 toast。
10. 内容超长时：`window.scrollY` 不随滚轮变化，`.htl-detail__panel.scrollTop` 变化。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T29 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

前置：T24 已完成（CSS 里有 .htl-detail / __panel / __head / __title / __date / __record / __record-head / __record-summary / __record-detail / __cover / __actions）；T25 已完成（src/ui/parts/scrollLock.ts 导出 lockScroll / unlockScroll / resetScrollLock）；T26 已完成（条目标题是 button[data-action="open-detail"][data-id]）。

先读（只读）：
- detailed-design-v0.0.2.md 的 §5.5（DOM 契约）、§6.2/§6.3（打开与关闭流程）、§7.2（边界）
- proposal-v0.0.2.md 的 REQ-031

任务：新建 src/ui/parts/detailModal.ts，导出 openDetail / closeDetail / refreshDetail / isDetailOpen。

硬性要求：
1. 浮层挂在 #overlay-root（不存在就建），根元素 .htl-detail[data-detail][role="dialog"][aria-modal="true"]，内部结构严格照 §5.5，类名一个都不许改。
2. 打开时用 lockScroll()，关闭用 unlockScroll()。不许自己操作 classList 的 is-locked。
3. 数据来源：buildCards(state.data.events, {ratings:[],minFour:false,keyword:''}, state.view.sortOrder) 拍平后 find(v => v.event.id === currentEventId) 拿到 CardView；记录用 sortedRecords(view.event)；关联用 view.relations。绝对不许自己算最新记录、跨度、方向。
4. 记录为空时只渲染一行「还没有记录」。
5. refreshDetail(state)：未打开时 no-op；事件不存在时 closeDetail() + toast('事件不存在或已被删除','error')；否则重建 panel 并恢复 panel.scrollTop（夹到合法范围）。
6. 增删改全部交给 data-action 委托（main.ts 的 handler 已有分支），本模块只负责渲染按钮。不许自己处理 add-record / edit-event 等。
7. ESC 不在本模块绑定，由 main.ts 统一处理。点遮罩（ev.target === 浮层根）和 close-detail 按钮负责关闭。
8. 打开状态用模块级 currentEventId，不许加进 ViewState 或 store。

严禁：
- 用 innerHTML
- document 级 keydown 监听
- 自己做 is-locked 的 add/remove
- 自己做详情深链接（URL hash）
- 改 main.ts / lightbox.ts / formModal.ts / 任何 CSS

完成标准：
- npm run typecheck 零错误，贴真实输出
- 交付可复现断言清单：控制台 openDetail 后浮层出现且 is-locked 为 true、closeDetail 后回到空/false；3 条记录按日期递增且星级正确；配图点开灯箱后关灯箱详情仍在、锁仍在；关联数与跨度文本正确；点遮罩/点关闭按钮两种关闭生效且 is-locked 变 false（ESC 与点标题依赖 T30 装配，标注为 ⏳T30 待补）；浮层开着时 store.addRecord 后记录数 +1；store.deleteEvent 后浮层自动关闭并出 toast；滚轮只滚 panel 不滚页面。DOM 断言由派发方用浏览器复跑，不要自述「已验证」。
```
