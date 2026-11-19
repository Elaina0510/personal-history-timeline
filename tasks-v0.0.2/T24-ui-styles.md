---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T24 样式层 —— 竖轴布局与详情浮层

- **对应模块**: MOD-014 `theme.css` + `components.css`
- **依赖**: 无（纯 CSS）
- **可并行**: 是。但它是 UI 层瓶颈：T26 与 T29 引用它的类名，**必须先交付类名清单**

## 目标

删掉横向主轴的槽位/卡片/分类配色，建立竖向三列行的几何、条目样式与详情浮层样式。类名严格照 `README.md §三` 与 `detailed-design-v0.0.2 §5.5`，执行者不许自创命名。

**前置事实**：`components.css` 末尾还压着一整套 v0.0.1-R5 的横向布局（`display:flex; flex-direction:row` + 940px 固定高 + `overflow-y:hidden`），它会直接把竖排压回横向。这一步没做，后面所有类名写得再对也白搭，细则见 §2.0。

## 允许改动的文件

```
src/ui/styles/theme.css
src/ui/styles/components.css
```

不许动任何 `.ts` 文件。这一条是硬的：CSS 先落地、TS 后适配，两边通过类名契约对齐。

## 一、`theme.css` 的改动

### 删除

- 分类色板 6 槽：`--htl-cat-1` ~ `--htl-cat-6` 及注释块

### 改名

- `--htl-card-max-width: 800px` → `--htl-timeline-max-width: 800px`。使用点共三处，全部改到新名：`components.css:114`（`.htl-timeline`）、`:244`（`.htl-card`，随卡片一起删）、`:504`（`.htl-modal__content`，这条**要保留**，别漏）。漏掉 504 不会报错——`var(--htl-card-max-width, 800px)` 会静默吃 fallback，但变量就此变成死名。

### 新增

```css
--htl-axis-col: 88px;      /* 轴列宽 */
--htl-axis-wave: 26px;     /* 节点在轴列内的左右摆动幅度 */
--htl-entry-gap: 16px;     /* 条目与轴列的间距 */
--htl-row-min-h: 64px;     /* 事件行最小高度 */
```

### 保留不动

颜色语义变量、字体、间距、圆角、层级（`--htl-z-*`）、动效时长、`prefers-reduced-motion` 块。

## 二、`components.css` 的改动

### 2.0 先把两代横向布局拆干净（这一步做错，后面全是白做）

`components.css` 里叠了两代横向布局，最后一代（以注释 `横向跳动主视觉（v0.0.2-R5）` 开头，一直到文件末尾）把 `.htl-timeline` 定成 `display:flex; flex-direction:row; height:940px; overflow-y:hidden`，把 `.htl-year-group` / `.htl-month-group` 定成 `display:flex; flex-direction:row; height:100%`，把年份/月份标题定成 `position:absolute; top:50%; left:0`。

**这几条留着，竖排物理上不可能成立**——行会横着并排，940px 之外的内容被裁掉。所以：

1. 从该注释起至文件末尾的整段（含段内的媒体查询）全部删除。
2. `.htl-timeline`、`.htl-year-group`、`.htl-month-group`、`.htl-year-heading`、`.htl-month-heading` 这五条规则**整条替换**成 2.3 / 2.5 给的新规则，**不要在旧规则后面追加覆盖**：旧规则里的 `left:0`、`top:50%`、`height:100%`、`padding-left`、`flex: 0 0 auto` 不会被新规则自动清掉。
3. 删掉 `.htl-month-heading::before`（那个小圆点）。

自检口径：三行 `.htl-row` 的 `getBoundingClientRect().top` 必须互不相等且逐行递增；`.htl-timeline` 的 `height` 必须是内容撑出来的高度，不是 940px。

### 2.1 整段删除（一个选择器都不许留）

`.htl-card`、`.htl-card:hover`、`.htl-card--expanded`、`.htl-card__date`、`.htl-card__title`、`.htl-card--expanded .htl-card__title`、`.htl-card__summary`、`.htl-card--expanded .htl-card__summary`、`.htl-card__meta`、`.htl-card__records`、`.htl-card__record`、`.htl-card__record-detail`、`.htl-card__cover`、`.htl-card__cover img`、`.htl-card__links`、`.htl-card__relations`、`.htl-card__actions`、`.htl-card__node`、`.htl-slot`、`.htl-slot.is-up`、`.htl-slot.is-down`、`.htl-slot > .htl-card`、`.htl-slot .htl-chip`、`.htl-slot .htl-star`、`.htl-chip--cat-1` ~ `.htl-chip--cat-6`（含 `--active` 变体 12 条）、`.htl-filter-categories`、`.htl-axis-node`、`.htl-axis-node--year`、`.htl-axis-node--year::after`、`.htl-axis-node--month`、`.htl-month-group:has(.htl-card--expanded) .htl-axis-node--month`、`.htl-month-group .htl-card`、`.htl-timeline > .htl-year-group > .htl-card`、`.htl-timeline::before`（旧呼吸主轴）、`.htl-timeline::after`（旧流动高光）。

### 2.2 必须保留

`.htl-app`、`.htl-timeline`、`.htl-year-group`、`.htl-year-heading`、`.htl-month-group`、`.htl-month-heading`（这五个的**类名保留**，但规则按 §2.0 与 2.3 整条替换，不是留着旧声明）、`.htl-chip`（详情内仍在用）、`.htl-star`、`.htl-filter-bar`、`.htl-year-nav`、`.htl-toolbar`、`.htl-capacity-bar`、`.htl-modal`、`.htl-lightbox`、`.htl-toast`、`.is-flash`、`.is-hidden`、`.is-locked`、`.is-open`、`prefers-reduced-motion` 块、媒体查询（内容改写）。

### 2.3 新增骨架（数值可微调，结构与选择器不许改）

```css
/* 容器：竖向单列，不再固定高度、不再横向滚动 */
.htl-timeline {
  display: block;
  max-width: var(--htl-timeline-max-width, 800px);
  height: auto;
  min-height: 0;
  margin: 0 auto;
  padding: var(--htl-space-4);
  overflow: visible;
}
.htl-year-group,
.htl-month-group {
  display: block;
  position: relative;
  flex: none;
  height: auto;
  margin: 0 0 var(--htl-space-4);
  padding: 0;
}

/* 竖向三列：条目列 / 轴列 / 条目列 */
.htl-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr var(--htl-axis-col) 1fr;
  column-gap: var(--htl-entry-gap);
  align-items: center;
  min-height: var(--htl-row-min-h);
}
.htl-row.is-right .htl-cell--entry { grid-column: 3; }
.htl-row.is-left  .htl-cell--entry { grid-column: 1; }
.htl-cell--axis { grid-column: 2; position: relative; align-self: stretch; }

/* 条目：日期在上、标题在下，都向轴靠拢 */
.htl-entry { display: block; }
.htl-row.is-left .htl-entry { text-align: right; }
.htl-entry__date {
  display: block;
  font-family: var(--htl-font-mono);
  font-size: var(--htl-fs-xs);
  color: var(--htl-color-text-muted);
  white-space: nowrap;
}
.htl-entry__title {
  display: block; width: 100%;
  background: none; border: 0; padding: 0;
  text-align: inherit;
  font-size: var(--htl-fs-md); font-weight: 600;
  color: var(--htl-color-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer;
}
.htl-entry__title:hover { color: var(--htl-color-accent); }

/* 轴上的节点：交替偏离轴列中心，折线因此必然 zigzag */
.htl-node {
  position: absolute; top: 50%; left: 50%;
  width: 15px; height: 15px; margin: -7.5px 0 0 -7.5px;
  border-radius: 50%;
  background: var(--htl-color-accent);
  border: 3px solid var(--htl-color-bg);
  box-shadow: 0 0 0 1.5px var(--htl-color-accent), 0 0 10px var(--htl-color-accent);
  z-index: 12;
}
.htl-row.is-right .htl-node { transform: translateX(var(--htl-axis-wave)); }
.htl-row.is-left  .htl-node { transform: translateX(calc(var(--htl-axis-wave) * -1)); }

/* 图层：折线 10 < 节点 12 < 月份胶囊 13 < 年份吸顶条 14
   吸顶条必须盖住折线与节点，否则滚动时节点从年份条上穿过去 */

/* 引线：从节点中心水平走到条目列的边缘
   宽度 = 轴半宽 - 摆动幅度 + entry-gap，正好跨出轴列、吃掉间距、不压字 */
.htl-link {
  position: absolute; top: 50%; height: 1px;
  background: var(--htl-color-accent); opacity: .45;
}
.htl-row.is-right .htl-link {
  left: calc(50% + var(--htl-axis-wave)); right: auto;
  width: calc(var(--htl-axis-col) / 2 - var(--htl-axis-wave) + var(--htl-entry-gap));
}
.htl-row.is-left .htl-link {
  right: calc(50% + var(--htl-axis-wave)); left: auto;
  width: calc(var(--htl-axis-col) / 2 - var(--htl-axis-wave) + var(--htl-entry-gap));
}
.htl-cell--axis { overflow: visible; }

/* 年份是横跨全轴的吸顶分隔条，背景色让折线在它下面断开 */
.htl-year-heading {
  position: sticky; top: 0; z-index: 14;
  margin: 0 0 var(--htl-space-2);
  padding: var(--htl-space-2) var(--htl-space-3);
  background: var(--htl-color-bg);
  border-left: 3px solid var(--htl-color-accent);
  font-size: var(--htl-fs-lg);
}

/* 月份是轴列上的小胶囊，居中压在轴上 */
.htl-month-heading {
  position: relative; z-index: 13;
  width: 54px; margin: var(--htl-space-2) auto var(--htl-space-1);
  padding: 1px 0;
  background: var(--htl-color-surface);
  border: 1px solid var(--htl-color-border);
  border-radius: 999px;
  font-size: var(--htl-fs-xs); font-weight: 500;
  color: var(--htl-color-text-muted);
  text-align: center;
}

/* 折线层 */
.htl-axis-svg { position: absolute; top: 0; left: 0; overflow: visible; pointer-events: none; z-index: 10; }
.htl-axis-path {
  stroke: var(--htl-color-accent);
  stroke-width: 4;
  stroke-linejoin: round;
  stroke-linecap: round;
  filter: drop-shadow(0 0 6px var(--htl-color-accent));
}
```

### 2.4 详情浮层（对应 `detailed-design-v0.0.2 §5.5` 的 DOM）

```css
.htl-detail {
  position: fixed; inset: 0; z-index: var(--htl-z-modal);
  background: var(--htl-color-overlay);
  display: flex; align-items: center; justify-content: center;
  padding: var(--htl-space-5);
}
.htl-detail__panel {
  width: min(720px, 92vw); max-height: 90vh; overflow-y: auto;
  background: var(--htl-color-surface);
  border-radius: var(--htl-radius-lg);
  box-shadow: 0 20px 60px #00000040;
  padding: var(--htl-space-4) var(--htl-space-5);
}
.htl-detail__head {
  display: flex; align-items: baseline; gap: var(--htl-space-2);
  position: sticky; top: 0; z-index: 1;
  background: var(--htl-color-surface);
  padding-bottom: var(--htl-space-3);
  border-bottom: 1px solid var(--htl-color-border);
}
.htl-detail__title { flex: 1; margin: 0; font-size: var(--htl-fs-lg); }
.htl-detail__date { font-family: var(--htl-font-mono); font-size: var(--htl-fs-sm); color: var(--htl-color-text-muted); }
.htl-detail__record { padding: var(--htl-space-3) 0; }
.htl-detail__record + .htl-detail__record { border-top: 1px solid var(--htl-color-border); }
.htl-detail__record-head { display: flex; align-items: center; gap: var(--htl-space-2); }
.htl-detail__record-summary { margin: var(--htl-space-1) 0 0; font-size: var(--htl-fs-sm); }
.htl-detail__record-detail { margin: var(--htl-space-1) 0 0; font-size: var(--htl-fs-sm); color: var(--htl-color-text-muted); white-space: pre-wrap; }
.htl-detail__cover img { display: block; max-width: 100%; border-radius: var(--htl-radius-md); cursor: zoom-in; }
.htl-detail__actions { display: flex; gap: var(--htl-space-2); padding-top: var(--htl-space-3); border-top: 1px solid var(--htl-color-border); }
```

### 2.5 媒体查询（`max-width: 767.98px`）

```css
--htl-axis-col: 56px;  --htl-axis-wave: 14px;  --htl-entry-gap: 10px;  --htl-row-min-h: 56px;
.htl-entry__title { font-size: var(--htl-fs-sm); }
.htl-detail { padding: 0; }
.htl-detail__panel { width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; }
```

## 严禁

- 不许保留任何 `.htl-card*`、`.htl-slot*`、`--htl-cat-*`、`.htl-filter-categories`、`.htl-axis-node*` 选择器。
- 不许把 `.htl-star` 与 `.htl-chip` 当「旧卡片样式」一起删掉——详情里还在用。
- 不许自创类名（`.timeline-row`、`.event-entry` 这类一律不许）。
- 不许在 CSS 里写死颜色（一律走 `var(--htl-color-*)`，REQ-022）。
- 不许动 `index.html` 或任何 JS 文件。

## 验收清单（改成可复现断言）

- `grep -c "htl-card\|htl-slot\|htl-cat-\|htl-axis-node\|htl-filter-categories" src/ui/styles/*.css` 返回 0。
- `grep -c "htl-star\|htl-chip" src/ui/styles/components.css` 大于 0（没误删）。
- **容器复位**（最容易被漏的一条）：在浏览器控制台把 `#timeline-root` 的内容换成手写的三行 `is-right / is-left / is-right` 行（渲染只在下一次 store 通知时才覆盖，插入后不会自动重建），然后
  - `[...document.querySelectorAll('.htl-row')].map(r => r.getBoundingClientRect().top)` 得到三个互不相等、逐行递增的值；
  - `getComputedStyle(root).display === 'block'`、`overflowY === 'visible'`、`height` 等于内容高度而不是 `940px`；
  - `getComputedStyle(document.querySelector('.htl-year-heading')).position === 'sticky'`，`top` 不为 `50%`。
- **引线够到条目**：右行 `.htl-link` 的 `right` 与同行 `.htl-entry` 的 `left` 之差 ≤ 1px（桌面实测应为 `34px` 宽：`88/2 - 26 + 16`），左行对称；`.htl-link` 不得压到 `.htl-entry__title` 的文字上。
- 把 `--htl-axis-wave` 改成 0 后节点回到轴列中心（说明偏移由变量控制而非写死）；同时 `.htl-link` 的宽度应随之变化（说明宽度也是 calc 出来的）。
- 打开现有站点（此时 TS 还没改）允许视觉错乱，但不得出现横向滚动条。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T24 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

先读（只读）：
- detailed-design-v0.0.2.md 的 §2.2（改动分布）、§5.5（详情浮层 DOM 契约）
- tasks-v0.0.2/README.md 的「三、类名与变量契约」

任务：只改 src/ui/styles/theme.css 与 src/ui/styles/components.css。

硬性要求：
0. 先看 §2.0：components.css 末尾有一整套 v0.0.1 的横向布局（注释「横向跳动主视觉（v0.0.2-R5）」起到文件末尾），把 .htl-timeline 定成 flex row + 940px 固定高 + overflow-y:hidden，把 .htl-year-group / .htl-month-group 定成 flex row + height:100%，把年/月标题定成 position:absolute + top:50%。这一整段必须删掉，并且 .htl-timeline / .htl-year-group / .htl-month-group / .htl-year-heading / .htl-month-heading 这五条规则要「整条替换」成新写法，不是在旧规则后面追加——旧规则里的 left:0 / top:50% / height:100% / padding-left 不会被新规则自动清掉。
1. theme.css：删掉 --htl-cat-1 ~ --htl-cat-6；--htl-card-max-width 改名 --htl-timeline-max-width（使用点 114 / 244 / 504 三处，504 在 .htl-modal__content 里，要保留这条规则）；新增 --htl-axis-col / --htl-axis-wave / --htl-entry-gap / --htl-row-min-h 四个变量。
2. components.css：把 .htl-card*、.htl-slot*、.htl-axis-node*、.htl-chip--cat-*、.htl-filter-categories、.htl-timeline::before/::after、.htl-month-heading::before 这些选择器整段删除，一个不留。
3. 新增竖向布局骨架：.htl-timeline 改 block / height:auto / overflow:visible；.htl-row 三列 grid（1fr / var(--htl-axis-col) / 1fr）、.htl-cell--entry 按 is-left/is-right 分列、.htl-node 交替 translateX(±--htl-axis-wave)、.htl-year-heading 吸顶并遮住折线、.htl-month-heading 居中胶囊。
4. 引线 .htl-link 必须从节点中心走到条目列边缘，宽度写 calc(var(--htl-axis-col) / 2 - var(--htl-axis-wave) + var(--htl-entry-gap))（桌面 = 34px）。用 right:0 / left:0 只会得到一条 18px、够不到条目的短棍。
5. 层级固定：折线 10 < 节点 12 < 月份胶囊 13 < 年份吸顶条 14。节点压在吸顶条上面是错的。
6. 新增详情浮层样式：.htl-detail / __panel / __head / __title / __date / __record / __record-head / __record-summary / __record-detail / __cover / __actions，面板最大高度 90vh 且内部滚动。
7. 手机媒体查询里改轴列宽 56px、摆动 14px、间距 10px，详情面板占满全屏。
8. .htl-star 与 .htl-chip 必须保留（详情里还在用）。

严禁：
- 保留任何旧卡片/槽位/分类配色/旧轴节点选择器
- 自创类名
- 在 CSS 里写死颜色（必须用 var(--htl-color-*)）
- 改任何 .ts 或 .html 文件

完成标准：
- grep -c "htl-card\|htl-slot\|htl-cat-\|htl-axis-node\|htl-filter-categories" src/ui/styles/*.css 返回 0，贴输出
- 贴出你最终确定的类名清单（供 T26/T29 照抄）
- 不要自述「已验证」视觉效果；DOM/视觉断言由派发方用浏览器复跑
```
