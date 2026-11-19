# 个人历史时间轴 — 详细设计 V0.0.2（detailed design v0.0.2）

文档版本：**V0.0.2-R1**（对应产品版本 v0.0.2）｜ 最近更新：2026-11-19 ｜ 上游基线：`proposal-v0.0.2.md` **V0.0.2**（Open Questions 按「浮层 / 严格交替 / 保留筛选」三项正文口径实现）｜ 状态：待实现

本文件是下游任务拆分与代码生成的**权威冻结快照**。凡本文件与需求文档冲突，以实现本文件与需求文档中更严格的一条为准，并回填修订记录。

### 修订记录

| 文档版本 | 日期 | 修订内容 | 依据 |
|---------|------|---------|------|
| V0.0.2 初稿 | 2026-11-19 | 竖向主轴（MOD-018 axis.ts 重写、MOD-010 行布局）、取消字段级分类（MOD-001/004/005/006/008/011/013/014 连锁清理）、条目瘦身与详情浮层（新增 MOD-019 detailModal、scrollLock 并入 MOD-016）、既有滚动锁缺陷修复、core 测试用例增删清单 | `proposal-v0.0.2.md` V0.0.2 三项变更 + 现状代码核实 |
| V0.0.2-R1 | 2026-11-19 | 复核修订：补上 `formModal.ts:1790` 这第四个锁点；修正 §8.2 V-A1 的错误断言；`renderYearGroup` 签名统一为 `seqOf`；SVG 宽度只保留一个公式；灵动层目标元素与 `.htl-node` 的 transform 冲突写明；AC-26 补 zigzag 断言、AC-27 补引线几何断言；`.htl-timeline` 的 R5 横向段列为必须拆除项；`--htl-card-max-width` 使用点更正为 3 处；`jump-relation` 查询选择器统一为 `[data-id]` | 任务文件派发前复核 + 浏览器实测 |

---

## 0. 前置事实与已核实现状

本版不是从零开工，是对已交付 v0.0.1 代码的定向改造。下表全部经 `grep` / `read` 核实，不是记忆。

| 项目 | 核实结论 | 核实方式 |
|------|---------|---------|
| 现有模块 | 17 个（MOD-001~017），文件均在 `src/` 下，路径已在 v0.0.1 设计中冻结 | `find src -type f` |
| 主轴现状 | 横向 SVG 折线：`axis.ts` 的 `sharpPath()` 逐点 `L` 连斜线，首尾水平延伸出容器；节点类名 `.htl-card__node`；浮动层 `startFloat()` 让卡片正弦 `translateY` 并每帧重算路径 | 读 `src/ui/parts/axis.ts` 全 245 行 |
| 槽位现状 | `yearGroup.ts` 用 `hashString(id|date|title)` 决定 `is-up / is-down`、`--lift: 70~180px`、`--gap: 44~104px`，卡片 `position:absolute` 钉在轴两侧 | 读 `src/ui/parts/yearGroup.ts` 全 120 行 |
| 卡片现状 | 折叠态渲染六项（日期 / 分类 chip / 星级 / 标题 / 简评 / 记录关联数），展开态渲染全部记录 + 配图 + 外链 + 关联 + 操作区 | 读 `src/ui/parts/card.ts` 全 302 行 |
| 分类耦合面 | 分布在 8 个文件：`types.ts`、`validate.ts`、`merge.ts`、`store.ts`、`select.ts`、`card.ts`、`filterBar.ts`、`formModal.ts` | `grep -rlc "categor" src/` |
| 分类相关代码位置 | `types.ts:21,39,87,95,114,144,149,245,259,280,294`（字段/常量/两个 IssueCode）；`validate.ts:101-106,351-370,547-574`；`store.ts:89,180-218,262,547-557,599-604,647-653,1004-1035`；`select.ts:203-208`；`merge.ts:73,240-280,327-419,544-558`；`filterBar.ts:52-62,123,208-240`；`formModal.ts:156,319-380,1005-1011,1089,1130,1201` | `grep -n "categor" src/**` |
| 展开态耦合面 | `ViewState.expandedIds`（`types.ts:123`）、`store.toggleExpanded`（`store.ts:1073`）、`store.deleteEvent` 里的展开态清理（`store.ts:683-687`）、`select.isExpandable`（`select.ts:126`）、`CardView.expandable`（`select.ts:31`） | `grep -n "expandable\|expandedIds" src/` |
| 浮层现状 | `lightbox.ts` 与 `formModal.ts` 在打开时 `body.classList.add('is-locked')`、关闭时无条件 `remove`；实测共 4 处：lightbox 30/81、formModal 103（remove）/1211（事件表单 add）/**1790（记录表单 add）** | `grep -n "is-locked" src/ui/parts/*.ts` |
| 既有缺陷 | 两个浮层叠开时（详情内点「编辑事件」），关闭上层表单会把 `is-locked` 摘掉，导致下层浮层打开期间背景仍可滚动 | 代码推理 + 下方 §7.4 手工复现步骤 |
| 测试现状 | 7 个 spec；分类/展开相关断言分布：`store.spec` 32 处、`validate.spec` 29 处、`select.spec` 11 处、`merge.spec` 7 处、`capacity.spec` 2 处 | `grep -c` 逐文件统计 |
| 构建脚本 | `typecheck`=`tsc --noEmit`、`test`=`vitest run`、`build`=`tsc --noEmit && vite build`；`package.json version` 为 `0.0.1` | 读 `package.json` |
| 技术栈 | Vite + 原生 TypeScript + Vitest，无框架，Core/UI 双层，单 localStorage key `timeline_data_v1` | 读 `src/core/types.ts:68` + 目录结构 |

---

## 1. 范围与 Non-Goals

### 1.1 In Scope

1. 主轴由横向 SVG 折线改为竖向 SVG 折线，事件条目沿轴左右交替分布（REQ-026 / REQ-027 / REQ-028 / REQ-030）。
2. 彻底移除分类字段、分类字典、分类筛选、分类表单控件、分类配色（REQ-002 / REQ-006 废弃 / REQ-015 / REQ-029）。
3. 轴上条目只保留日期与标题，点击标题打开覆盖式详情浮层；删除所有折叠/展开态（REQ-013 / REQ-014 / REQ-031）。
4. 移除 `ViewState.expandedIds` 与 `store.toggleExpanded`（第 3 项的连带清理）。
5. 新增详情浮层模块与滚动锁计数模块；修复浮层叠开时滚动锁被提前摘除的缺陷。

### 1.2 Non-Goals（对执行者的硬约束，越界即视为缺陷）

- **不保留横向布局**：不写 `layout: 'horizontal' | 'vertical'` 开关、不留横向 CSS 分支、不留 `is-up / is-down` 兼容类。
- **不保留分类的任何形态**：不做标签、不做多选分类、不做分类颜色、不在导出里写空 `category: ""`、不为旧文件写「分类恢复」入口。
- **不升存储键、不写 schemaVersion 迁移分支**：`LS_KEY` 仍为 `timeline_data_v1`，`schemaVersion` 仍为 `1`；旧字段在归一化阶段直接剥离，不写版本判断。
- **不改导入导出文件结构之外的任何格式**：不加 `deletedCategories`、不加迁移日志字段。
- **不做详情深链接**：URL hash / query 不记录当前打开的事件，刷新后详情不自动恢复。
- **不引入任何依赖**：不加布局库、动画库、状态库、UI 框架。
- **不动无关模块**：`date.ts`、`id.ts`、`capacity.ts` 一行不改；`importExport.ts` 的导入预览与备份逻辑不改（只随 `merge.ts` / `validate.ts` 的签名变化被动适配）。
- **不做条目 hover 预览、不做详情内的记录时间线可视化、不做拖动/缩放的迷你地图**。
- **不为性能重写渲染管线**：仍是全量重绘 `#timeline-root`，只允许加「节点数超阈值时关闭灵动层」这一处降级。

---

## 2. 架构与边界

### 2.1 分层与依赖方向（不变）

```
core/（零 DOM，Vitest 覆盖）  ←  ui/（薄视图，手工验收）  ←  main.ts（装配）
```

本版**没有**新增 core 模块，只删字段与方法；新增的两个模块都在 ui 层。

### 2.2 改动分布

```
core/types.ts     删字段/常量/两个 IssueCode
core/validate.ts  删分类校验（事件侧 + 根对象归一）
core/merge.ts     删分类并集 + 导入条目分类校验
core/select.ts    删分类筛选分支 + isExpandable + CardView.expandable
core/store.ts     删 addCategory / toggleExpanded / expandedIds / 分类写路径
ui/render.ts      改为按全局序号渲染行，移除 expandedIds 透传
ui/parts/yearGroup.ts  槽位改为 grid 行 + 左右列（删哈希伪随机）
ui/parts/card.ts → ui/parts/entry.ts   重写为「日期 + 标题」条目
ui/parts/axis.ts  sharpPath 改竖向（折线沿 y 轴，节点左右摆动形成 zigzag）
ui/parts/detailModal.ts   ★新增
ui/parts/scrollLock.ts    ★新增（引用计数）
ui/parts/filterBar.ts    删分类 chips
ui/parts/formModal.ts    删分类字段块
ui/parts/lightbox.ts     改为调用 scrollLock（2 行）
ui/parts/formModal.ts    改为调用 scrollLock（3 行：103 remove 与 1211/1790 两个 add）
ui/styles/theme.css      删 --htl-cat-*；--htl-card-max-width 改名 --htl-timeline-max-width（使用点 3 处：`.htl-timeline`、`.htl-card`（随卡片删除）、`.htl-modal__content`（保留））；
                          加 --htl-axis-col / --htl-axis-wave / --htl-entry-gap / --htl-row-min-h
ui/styles/components.css 删 .htl-slot/.htl-card* 布局，加 .htl-row/.htl-entry/.htl-node/.htl-link/.htl-detail；
                          并整段删除文件末尾的 R5 横向布局（`.htl-timeline` 的 flex row + 940px 定高、`.htl-year-group`/`.htl-month-group` 的 flex row + height:100%、年/月标题的 absolute + top:50%），
                          `.htl-timeline` / `.htl-year-group` / `.htl-month-group` / `.htl-year-heading` / `.htl-month-heading` 五条规则整条替换而非追加覆盖
main.ts           装配 detailModal、subscription 加 refreshDetail、ESC 加 closeDetail
package.json      version 0.0.1 → 0.0.2
```

### 2.3 重绘边界（本版新增一条）

`#timeline-root` 仍整体重建；**详情浮层挂在 `#overlay-root`，永不参与重绘**。因此必须显式处理「浮层开着时数据变了」：

- `main.ts` 的订阅回调由 `store.subscribe(s => render(s))` 改为 `store.subscribe(s => { render(s); refreshDetail(s); })`。
- `refreshDetail` 在未打开详情时是 no-op，幂等，不抛错。
- 详情里打开的表单（编辑事件/记录）走的是 `formModal` 既有单例，不受影响。

**为什么详情打开状态不进 `ViewState`**：`ViewState` 每次变更都触发 `notify()` → 全量重绘 `#timeline-root`，而浮层不在重建范围内；把 `openDetailId` 放进去会白白重绘轴与全部条目，且让 store 继续承担纯 UI 状态（`expandedIds` 正是这种污染，本版借机删掉）。detailModal 用模块级单例状态，与 `formModal` / `lightbox` 保持一致。

### 2.4 竖向布局的几何契约（三方案取舍）

| 方案 | 做法 | 优点 | 代价 |
|------|------|------|------|
| **A（采纳）** | 每个事件一行 CSS Grid：`1fr var(--htl-axis-col) 1fr`；条目按左右侧放进第 1 或第 3 列；节点在中间轴列内交替偏移 `±--htl-axis-wave`；SVG 读节点中心坐标画折线 | 行高自适应、不外溢、无重叠；左右交替由行序号决定，可测；响应式只需改两个变量 | 折线强度受行高限制，靠 wave 与节点光晕补张力 |
| B | 沿用 v0.0.1 的绝对定位 + 伪随机 `--lift/--gap`，只把方向转 90° | 复用现有代码多 | 竖向后行高不确定，绝对定位极易与下一行重叠；`--lift` 语义反转后难以调试 |
| C | 纯 CSS 竖线（伪元素）+ 无 SVG | 零 JS | 画不出「折线」，与 REQ-026 硬冲突 |

采纳 A。B 被判为「改法最少但最容易做出穿行重叠」，C 直接不满足折线要求。

---

## 3. 模块表（1:1 对应下游任务文件）

| 模块 | 文件 | 类型 | 依赖 | 本版动作 |
|------|------|------|------|---------|
| MOD-001 | `src/core/types.ts` | SSOT | 无 | 改：删分类与展开态相关字段 |
| MOD-002 | `src/core/date.ts` | core | 无 | 不动 |
| MOD-003 | `src/core/id.ts` | core | 无 | 不动 |
| MOD-004 | `src/core/validate.ts` | core | MOD-001 | 改：删分类校验 |
| MOD-005 | `src/core/merge.ts` | core | MOD-001/004 | 改：删分类并集与校验 |
| MOD-006 | `src/core/select.ts` | core | MOD-001/002 | 改：删分类筛选与 expandable |
| MOD-007 | `src/core/capacity.ts` | core | MOD-001 | 不动 |
| MOD-008 | `src/core/store.ts` | core | MOD-001/004/005 | 改：删分类写路径与展开态 |
| MOD-009 | `src/ui/platform.ts` | ui | MOD-001 | 不动 |
| MOD-010 | `src/ui/render.ts` + `parts/yearGroup.ts` + `parts/entry.ts`（原 `card.ts` 改名） | ui | MOD-006 | 重写布局与条目 |
| MOD-011 | `src/ui/parts/formModal.ts` | ui | MOD-008 | 删分类字段块 |
| MOD-012 | `src/ui/parts/importExport.ts` | ui | MOD-008 | 不动（随签名被动适配） |
| MOD-013 | `src/ui/parts/filterBar.ts` + `yearNav.ts` | ui | MOD-008 | 删分类 chips |
| MOD-014 | `src/ui/styles/theme.css` + `components.css` | ui | 无 | 删卡片与分类样式，加竖向样式与详情浮层样式 |
| MOD-015 | `index.html` + `src/main.ts` + `vite.config.ts` | 装配 | 全部 | 改：装配详情、订阅、ESC |
| MOD-016 | `src/ui/bind.ts` + `parts/dom.ts` + 新增 `parts/scrollLock.ts` | ui 基建 | 无 | 新增 scrollLock |
| MOD-017 | `src/ui/parts/toast.ts` + `confirm.ts` + `lightbox.ts` | ui 浮层 | MOD-016 | lightbox 改调 scrollLock |
| MOD-018 | `src/ui/parts/axis.ts` | ui 视觉 | MOD-010 | 重写为竖向折线 |
| **MOD-019** | `src/ui/parts/detailModal.ts` | ui 浮层 | MOD-006/016 | ★新增 |

> 模块编号续用 v0.0.1 的编号（MOD-018 沿用原 axis.ts 的位置），详情浮层顺延为 MOD-019。任务拆分时一个模块对应一个任务文件，`entry.ts` 与 `yearGroup.ts` 同属 MOD-010，可拆两个任务但必须同一波次提交，否则类型不齐。

---

## 4. 数据模型（字段级）

### 4.1 `TimelineData`（持久化根对象，即导出文件内容）

```ts
export interface TimelineData {
  schemaVersion: 1;          // 不变
  appVersion: string;        // 写入 '0.0.2'
  savedAt: string;           // ISO8601 带本地时区偏移
  ui: UiPrefs;               // { sortOrder: 'desc' | 'asc' }
  events: TimelineEvent[];   // 不保证有序
  // 删除：categories: string[]
}
```

**空值语义：** 旧数据中的 `categories` 键在归一化阶段被 `delete` 掉，不保留为 `[]`，也不报错。导出时该键不存在。

### 4.2 `TimelineEvent`

```ts
export interface TimelineEvent {
  id: string;                // ^(evt)_\d{13}_[0-9a-z]{6}$
  date: string;              // 'YYYY-MM-DD'，必填
  title: string;             // 1..60，必填
  cover?: string;            // 缺省 = 无图
  links: EventLink[];        // 0..10，缺省 []
  relatedIds: string[];      // 0..10，缺省 []
  records: PersonalRecord[]; // 0..20
  createdAt: string;
  updatedAt: string;
  // 删除：category: string
}
```

**空值语义：** 导入的旧文件若带 `category`，读取时丢弃；`category` 为空串**不再**触发 `MISSING_REQUIRED`，也不产生任何 warning。新代码不存在任何读取 `event.category` 的路径（`tsc` 会在类型层面拦住）。

### 4.3 `FilterState`

```ts
export interface FilterState {
  ratings: Rating[];   // 删除 categories: string[]
  minFour: boolean;
  keyword: string;
}
```

**空值语义：** `DEFAULT_FILTERS` 为 `{ ratings: [], minFour: false, keyword: '' }`。旧 `localStorage` 里 `ui` 不含 filters（filters 本来就不持久化，只在内存），无迁移问题。

### 4.4 `ViewState`

```ts
export interface ViewState {
  readonly sortOrder: SortOrder;
  readonly filters: FilterState;
  readonly flashId: string | null;
  readonly storageMode: 'persistent' | 'memory';
  readonly capacity: { bytes: number; level: 'ok' | 'warn' | 'block'; remainingImages: number };
  readonly lastIssue: Issue | null;
  // 删除：expandedIds: ReadonlySet<string>
}
```

### 4.5 输入契约

```ts
export interface EventInput { date: string; title: string; }        // 删除 category
export interface EventPatch {                                        // 删除 category
  date?: string;
  title?: string;
  cover?: string | null;
  links?: EventLink[];
}
```

### 4.6 常量与 IssueCode 删除清单

删除常量：`CATEGORY_MAX`、`PRESET_CATEGORIES`。

删除 `IssueCode`：`UNKNOWN_CATEGORY_ADDED`、`CATEGORY_EXISTS`；`ISSUE_MESSAGES` 同步删除对应两行（`Record<IssueCode, string>` 的类型完备性会强制这一点）。

> 保留但不再使用的 code 一个不留：`tsc` 在 `Record<IssueCode, string>` 上会报缺项，`ISSUE_MESSAGES` 也禁止留孤儿条目。

### 4.7 `CardView`（`select.ts` 的派生视图）

```ts
export interface CardView {
  event: TimelineEvent;
  latestRecord: PersonalRecord | null;
  visible: boolean;
  relations: RelationView[];
  relationCount: number;
  recordCount: number;
  // 删除：expandable: boolean
}
```

`isExpandable()` 函数整体删除。调用面经 `grep` 核实：`select.ts:126`（定义）与 `select.ts:331`（唯一调用）两处；`card.ts` 内另有同名**局部变量**（`card.ts:15` = `view.expandable`，在 23/75/97 使用），随该文件重写一并消失。

---

## 5. 接口契约

### 5.1 `Store`（MOD-008）方法级变化

```ts
// 删除
public addCategory(name: string): MutationResult<{ categories: string[] }>;
public toggleExpanded(eventId: string): void;

// 签名变化（仅类型收窄，运行时逻辑不变）
public createEvent(input: EventInput): MutationResult<{ event: TimelineEvent }>;
public updateEvent(input: { eventId: string } & EventPatch): MutationResult<{ event: TimelineEvent }>;
public setFilters(patch: Partial<FilterState>): void;
public clearFilters(): void;

// 其余不变
public init(seedRaw: string | null): InitResult;
public getState(): AppState;
public subscribe(listener: (s: AppState) => void): () => void;
public deleteEvent(eventId: string): MutationResult<{ removedRelations: number }>;
public addRecord(input: { eventId: string } & RecordInput): MutationResult<{ record: PersonalRecord }>;
public updateRecord(input: { eventId: string; recordId: string } & RecordPatch): MutationResult<{ record: PersonalRecord }>;
public deleteRecord(input: { eventId: string; recordId: string }): MutationResult<null>;
public setRelations(eventId: string, relatedIds: string[]): MutationResult<{ event: TimelineEvent }>;
public setSortOrder(order: SortOrder): void;
public flash(eventId: string | null): void;
public setLastIssue(issue: Issue | null): void;
public exportJson(): string;
public previewImport(input: { raw: string; mode: ImportMode }): MutationResult<ImportPreview>;
public applyImport(input: { raw: string; mode: ImportMode }): MutationResult<ImportReport>;
public restoreBackup(): MutationResult<{ restored: boolean }>;
public reloadFromSeed(seedRaw: string | null): MutationResult<{ seeded: boolean }>;
```

`deleteEvent` 内部删除「展开态清理」代码块（`store.ts:683-687`），其余逻辑不动。

### 5.2 `render` 族（MOD-010）

```ts
// render.ts —— 导出面变化
export type FilterBarRenderer = (state: Readonly<AppState>) => void;
export type YearNavRenderer = (state: Readonly<AppState>, groups: YearGroup[]) => void;
export function registerFilterBarRenderer(fn: FilterBarRenderer | null): void;
export function registerYearNavRenderer(fn: YearNavRenderer | null): void;
export function render(state: AppState): void;

// 删除导出
export { renderCard } from './parts/card';   // → 改为 export { renderEntry } from './parts/entry';

// yearGroup.ts —— 签名新增全局序号表
export function renderYearGroup(group: YearGroup, seqOf: ReadonlyMap<string, number>): HTMLElement;
// 返回值内每个行元素带 data-event-id 与 data-seq，供 axis.ts 与手工断言定位

// entry.ts（原 card.ts，整文件重写）
export function renderEntry(view: CardView, seq: number, side: 'left' | 'right'): HTMLElement;
```

**序号为什么用 Map 而不是起始下标**：`renderYearGroup` 若只收到 `seqStart`，它得自己知道上一个年组消耗了多少行，一旦某年某月的卡片被过滤或出现未知月份，累加就会错位，跨月出现两个连续右列。传 `ReadonlyMap<eventId, seq>` 后，序号由 `render.ts` 一次算完，年组只做查表，不可能错位。

**左右侧判定归属**：`seq` 由 `render.ts` 统一算——所有可见条目按当前排序拍平成一维数组，下标即 `seq`（0 基），`side = seq % 2 === 0 ? 'right' : 'left'`（第 1 个在右）。`yearGroup.ts` 不得自行决定左右，也不得按月组重置计数。

### 5.3 `axis.ts`（MOD-018）重写后的导出面

```ts
export function drawAxis(root: HTMLElement): void;
// 内部：buildAxisPath(root): string 改为竖向；保留 scheduleAxis / startFloat，但浮动轴改为 x
```

**几何契约：**

- 读取 `root.querySelectorAll('.htl-node')`，每个节点取 `getBoundingClientRect()` 中心。
- 内容坐标换算：`x = rect.left - rootRect.left + root.scrollLeft`，`y = rect.top - rootRect.top + root.scrollTop`。
  **严禁**加 `window.scrollY`：`#timeline-root` 不是纵向滚动容器，页面滚动时节点与 root 的矩形同步位移，差值天然稳定；加上 `window.scrollY` 会让折线随页面滚动整体漂移（v0.0.1 的 R14 就是这一类缺陷，横向时补 `scrollLeft` 是因为 root 本身是滚动容器，性质不同）。
- 路径：`M x₀ 0 L x₀ y₀ L x₁ y₁ … L xₙ yₙ L xₙ innerHeight`，其中 `x₀/xₙ` 为首/末节点 x。节点交替在 `中轴 ± wave`，斜线自然产生 zigzag；硬折角，不做平滑曲线，不做正交绕行。**zigzag 的幅度只来自节点位置**：`.htl-node` 的 `translateX(±wave)` 写在 CSS 里，任何内联 `transform`（包括灵动层）都会把它覆盖成直线。
- SVG 尺寸：`width = root.clientWidth`（内容区宽，已扣掉左右 padding），`height = max(root.scrollHeight, rootRect.height)`，`viewBox="0 0 {width} {height}"`，`preserveAspectRatio="none"`，`vector-effect="non-scaling-stroke"`。**只许这一个公式**——混入 `innerWidth` 或 `max(root.scrollWidth, …)` 会让整条线与坐标基准（root 左边缘）错位，而错位不会被任何断言抓到。
- 描边渐变：改为**纵向**渐变（`x1=0 y1=0 x2=0 y2=1`），两端 `stop-opacity` 0.15、中段 1。

### 5.4 `scrollLock.ts`（MOD-016 新增）

```ts
export function lockScroll(): void;    // count++；首次从 0→1 时给 body 加 'is-locked'
export function unlockScroll(): void;  // count = max(0, count-1)；减到 0 时移除 'is-locked'
export function resetScrollLock(): void; // 仅供测试/整页重置，count 归零并移除 class
```

**契约：** 计数只能是 `0..N`，任何 `unlockScroll` 在 0 时调用都是 no-op，不得出现负计数。`is-locked` 的 CSS（`overflow: hidden`）不变。

改造四处既有调用点：
- `lightbox.ts`：`document.body.classList.add('is-locked')`（81）→ `lockScroll()`；`remove`（30）→ `unlockScroll()`。
- `formModal.ts`：`remove`（103）→ `unlockScroll()`；`add`（1211，事件表单）→ `lockScroll()`；**`add`（1790，记录表单）→ `lockScroll()`**。

> 1790 是最容易漏的一个：v0.0.2 新增的「详情 → 添加记录」走的正是它，漏掉则那条链路上关闭记录表单会把锁整个摘掉。改完 `grep -n is-locked src/ui/parts/*.ts` 只应命中 `scrollLock.ts`。

### 5.5 `detailModal.ts`（MOD-019 新增）

```ts
import type { AppState } from '../../core/types';

export function openDetail(eventId: string, store: Store): void;
export function closeDetail(): void;
export function refreshDetail(state: Readonly<AppState>): void;
export function isDetailOpen(): boolean;   // 供 main.ts 的 ESC 分支与测试使用
```

**行为契约：**

- `openDetail` 已打开时直接切换内容（先清空 panel 再重建），不叠加两个浮层。
- `closeDetail` 幂等：未打开时 no-op。
- `refreshDetail`：若当前无打开事件 → no-op；若事件已不存在（被删 / 导入覆盖）→ 自动 `closeDetail()` 并 `toast('事件不存在或已被删除', 'error')`；否则按最新 state 重建内容。重建**不得**重置浮层内部滚动位置以外的东西（保留 panel 的 `scrollTop`，若重建后内容变短则夹取到合法范围）。
- 浮层根元素：`#overlay-root > .htl-detail[role="dialog"][aria-modal="true"][data-detail]`。
- 打开时 `lockScroll()`，关闭时 `unlockScroll()`。
- 关闭路径：ESC（`main.ts` 的 keydown 调 `closeDetail`）、点击遮罩（`ev.target === 浮层根`）、`[data-action="close-detail"]` 按钮。

**DOM 契约（手工断言直接抄）：**

```html
<div class="htl-detail" data-detail role="dialog" aria-modal="true" aria-label="事件详情">
  <div class="htl-detail__panel">
    <header class="htl-detail__head">
      <span class="htl-detail__date">2026-11-18</span>
      <h2 class="htl-detail__title">标题</h2>
      <button type="button" data-action="close-detail">✕</button>
    </header>
    <div class="htl-detail__body">
      <div class="htl-detail__records">
        <div class="htl-detail__record" data-record-id="rec_...">
          <div class="htl-detail__record-head">
            <span class="htl-detail__record-date">2026-11-18</span>
            <span class="htl-star" aria-label="4 星">★★★★☆</span>
            <button data-action="edit-record" data-id="rec_...">编辑</button>
            <button data-action="delete-record" data-id="rec_...">删除</button>
          </div>
          <p class="htl-detail__record-summary">简评</p>
          <p class="htl-detail__record-detail">碎碎念（有才渲染）</p>
        </div>
      </div>
      <div class="htl-detail__cover"><img data-action="open-lightbox" data-id="{src}" alt="标题"></div>
      <div class="htl-detail__links"><a class="htl-chip" href="…" target="_blank" rel="noopener noreferrer">名称</a></div>
      <div class="htl-detail__relations"><button class="htl-chip" data-action="jump-relation" data-id="evt_…">→ 2026-01-01 标题 · 1 个月 2 天</button></div>
      <div class="htl-detail__actions">
        <button data-action="add-record" data-id="evt_…">+ 添加记录</button>
        <button data-action="edit-event" data-id="evt_…">编辑事件</button>
        <button data-action="delete-event" data-id="evt_…">删除事件</button>
      </div>
    </div>
  </div>
</div>
```

**记录为空时**：`.htl-detail__records` 内渲染一行文案「还没有记录」，**不渲染**空的记录容器占位、不渲染星级、不渲染「暂无记录」以外任何数字。

### 5.6 `main.ts` 装配契约

```ts
// 订阅（改）
store.subscribe((s) => { render(s); refreshDetail(s); });

// action 分支（改）
case 'open-detail': if (id) openDetail(id, store); break;   // 取代 toggle-card
case 'close-detail': closeDetail(); break;
case 'delete-event': { /* …确认后：store.deleteEvent(id).ok 时 closeDetail(); toast('已删除'); */ }
case 'jump-relation': {
  closeDetail();                                            // 先关详情
  /* 其余逻辑不变：找不到目标 → clearFilters → 重新查询 → scrollIntoView + flash */
}

// keydown（改）
if (e.key === 'Escape') { closeLightbox(); closeFormModal(); closeDetail(); }
```

**删除**：`case 'toggle-card'`。

---

## 6. 核心控制流

### 6.1 首屏

1. `store.init(seedRaw)` → 归一化：剥离根 `categories` 与每个事件的 `category`，其余补默认值逻辑不变。
2. `render(state)` → `buildCards` → 拍平获取全局序号 `seqOf` → `renderYearGroup(group, seqOf)` → `renderEntry(view, seq, side)`。
3. `drawAxis(root)` → 读 `.htl-node` 中心 → 生成竖向 path → 插入 SVG → `scheduleAxis` 校准一次 → `startFloat`（作用对象是 `.htl-cell--axis`，节点数 ≤ 120 才启动）。

### 6.2 打开详情

```
点击 .htl-entry__title（data-action="open-detail", data-id）
  → main.handler → openDetail(id, store)
     → 事件不存在？ toast + 返回
     → 已打开？ 复用浮层，重建 panel
     → lockScroll()；挂到 #overlay-root
```

**打开期间数据变化**（新增记录、编辑、删除记录等）：`store.notify()` → `render` + `refreshDetail` → 详情内容就地重建，浮层不闪、不关闭。

### 6.3 关闭详情

三条路径全部汇到 `closeDetail()`：摘除 DOM → `unlockScroll()` → 清空模块级 `currentEventId`。页面滚动位置不做处理（浮层期间 `body` 锁滚动，关闭后自然回到原位）。

### 6.4 关联跳转（REQ-021）

```
点击详情内关联项 jump-relation
  → closeDetail()（先解锁滚动，否则 scrollIntoView 无效）
  → 在 #timeline-root 找 `[data-id="<目标 id>"]`（v0.0.2 里它落在条目标题按钮上；行元素同时带 `data-event-id`，但查询沿用 `[data-id]` 保持不变）
  → 找不到：clearFilters() → 重新查询 → 仍找不到则 toast('事件不存在或已被删除')
  → 找到：scrollIntoView({behavior:'smooth', block:'center'}) + store.flash(id)
```

`block` 由 `start` 改为 `center`：竖向下条目在原部位居中更易辨认，且避开吸顶的年份分隔条遮挡。

### 6.5 左右交替序号

```
render():
  const flat = groups.flatMap(g => g.months.flatMap(m => m.cards));
  const seqOf = new Map<string, number>();
  flat.forEach((v, i) => seqOf.set(v.event.id, i));
  root.replaceChildren(...groups.map(g => renderYearGroup(g, seqOf)));
```
`renderYearGroup` 内部对每张卡 `seq = seqOf.get(card.event.id) ?? 0`，`side = seq % 2 === 0 ? 'right' : 'left'`。筛选变化后从头重排——满足需求 Assumptions「筛选后重新从右侧开始计数」。

### 6.6 导入（兼容旧文件）

```
previewImport(raw, mode) → parseJson → validateTopShape（不再校验 categories）
  → 逐条 coerceEvent（不再读 category；旧文件里的 category 键被忽略）
    → 缺失校验只剩 date / title
  → planMerge（不再取分类并集）
  → 计数与预览明细照旧
```
旧文件里 `category` 字段**不产生** `Issue`、**不产生** warning、**不出现**在预览明细的「被跳过/被修正」中（REQ-029「静默忽略」）。

---

## 7. 边界条件与错误策略

### 7.1 主轴的边界

| 场景 | 行为 |
|------|------|
| 0 个事件 | `drawAxis` 直接返回，不创建 SVG；渲染既有全站空态 |
| 1 个事件 | 一条竖直直线，从 `y=0` 到容器底部，穿过该节点；不得退化为空 path |
| 筛选后 0 个事件 | 同上（不画线），显示既有筛选空态 |
| 节点数 > 120 | 不启动灵动层（`startFloat` 直接 return），折线只在重绘与 ResizeObserver 时计算 |
| 窗口从窄屏拉到宽屏 | `ResizeObserver` 触发重算；`--htl-axis-wave` 由媒体查询切换，节点位置变化后折线跟随 |
| `prefers-reduced-motion: reduce` | 灵动层不启动（沿用现有判断） |

### 7.2 详情浮层的边界

| 场景 | 行为 |
|------|------|
| 详情打开时该事件被删除（本页操作） | `main.ts` 的 `delete-event` 分支主动 `closeDetail()` |
| 详情打开时该事件被导入覆盖删除 | `refreshDetail` 检测不到事件 → 自动关闭 + error toast |
| 详情内新增第 21 条记录 | 沿用 `addRecord` 返回的 `TOO_MANY_RECORDS`，`toast` 提示，不关闭详情 |
| 浮层内容超长 | `.htl-detail__panel` 设 `max-height: 90vh; overflow-y: auto`，背景不动 |
| 浮层内点配图 | `openLightbox` 打开灯箱；灯箱叠在详情之上（z-index 200 > 100）；关灯箱不动详情，滚动锁计数 1→2→1，详情仍锁 |
| 详情内点「编辑事件」 | formModal 叠开，计数 1→2；保存/关闭后 2→1，详情仍锁滚动；**这是既有缺陷的修复点** |
| 打开不存在的事件 id（脏 DOM） | `openDetail` 内查不到 → error toast，不创建浮层 |

### 7.3 数据边界

- 旧数据 `categories: []` 或 `categories` 为非法类型 → 一律 `delete`，不报 `TOP_LEVEL_SHAPE`。
- 旧数据事件 `category` 缺失/超长/为数字 → 一律忽略，不报 `MISSING_REQUIRED` / `FIELD_TOO_LONG`。
- 新写入的事件不得出现 `category` 键（含 `category: undefined`）；归一化后 `Object.hasOwn(event, 'category') === false`。

### 7.4 滚动锁缺陷的复现与验收

**修复前复现：** 打开详情（is-locked）→ 点「编辑事件」（formModal 再加一次）→ 关闭表单（remove is-locked）→ 详情仍在，但背景页面可以滚动。

**修复后验收：** 同上操作序列，关闭表单后 `document.body.classList.contains('is-locked') === true`；再关详情后为 `false`。

---

## 8. 测试策略与验证锚点

### 8.1 core 单测：删除清单（随需求废弃）

| 文件 | 删除的用例 | 原因 |
|------|-----------|------|
| `validate.spec.ts` | V2（category 为空报 MISSING_REQUIRED）、V17（新分类 UNKNOWN_CATEGORY_ADDED）；"额外：validateTopShape 保留 ui 与自定义分类" 改为「保留 ui、忽略 categories」 | 分类校验删除 |
| `select.spec.ts` | S7（按分类筛选）、S17 / S18 / S19 及 "isExpandable 支持 links 与 relationCount 触发" | `isExpandable` 与分类筛选删除 |
| `store.spec.ts` | 所有 `addCategory` 用例；fixture 中每处 `category: '…'` 字段（共 32 处命中）；`toggleExpanded` / `expandedIds` 在测试里**没有**断言（`grep` 实测 0 命中），需要随删的是 `store.ts` 里的实现，不用去测试文件里找 | 方法与字段删除 |
| `merge.spec.ts` | 分类并集相关断言（`mergeCategories` 相关，7 处命中里属分类的部分） | 函数删除 |
| `capacity.spec.ts` | fixture 里 2 处 `category` 字段 | 类型收窄 |

> 删除用例时必须同步删掉「用例编号」在文件头的索引，避免留下空号。

### 8.2 core 单测：新增用例（可直接抄进任务文件）

| 编号 | 文件 | Given | When | Then |
|------|------|-------|------|------|
| V-A1 | `validate.spec.ts` | 事件对象带 `category: ''` 且 date/title 合法 | `validateEventInput({date, title})` | 返回**空数组**（`issues.length === 0`），且无任何一项 `field === 'category'`。注意该函数返回类型就是 `Issue[]`，没有 `ok` / `issues` 字段 |
| V-A2 | `validate.spec.ts` | 根对象含 `categories: ['A','B']` | `validateTopShape(obj)` | 返回结果的 data 上 `Object.hasOwn(data,'categories') === false`，且不产生 error 级 issue |
| T-A1 | `store.spec.ts` | 预置 localStorage 为「含 `categories` + 每个事件带 `category`」的 V0.0.1 数据（2 条事件） | `store.init(null)` | `getState().data.events.length === 2`；`Object.hasOwn(data,'categories') === false`；每个事件 `Object.hasOwn(e,'category') === false`；`data.appVersion === '0.0.2'` |
| T-A2 | `store.spec.ts` | 空站 | `store.createEvent({date:'2026-11-19', title:'测试'})` | `ok === true`；`Object.hasOwn(result.value.event,'category') === false`；导出字符串 `exportJson()` 不含子串 `"category"` |
| T-A3 | `store.spec.ts` | 任意状态 | `store.setFilters({ ratings: [5] })` | 不抛错；`getState().view.filters` 无 `categories` 键 |
| M-A1 | `merge.spec.ts` | 导入文件为 V0.0.1 格式：根带 `categories`、2 条事件各带 `category`，date/title 合法 | `previewImport({raw, mode:'merge'})` | `counts.errors === 0`；`counts.added === 2`；`items` 中任一 `message` 不含「分类」；`applyImport` 后事件无 `category` 键 |
| M-A2 | `merge.spec.ts` | 本地 1 条事件、导入同 id 的旧格式事件（带 category） | `applyImport(mode:'merge')` | 合并结果为 updated 1；结果事件 `Object.hasOwn(e,'category') === false` |
| S-A1 | `select.spec.ts` | 2 条事件（无 category 字段，星级 3 与 5） | `buildCards(events, {ratings:[5], minFour:false, keyword:''}, 'desc')` | 只剩 5 星事件；返回的 `CardView` 上 `Object.hasOwn(view,'expandable') === false` |

### 8.3 UI 手工验收（DOM 断言清单，按 AC 逐条）

先 `npm run dev`，用控制台断言与肉眼两条腿走。每条给出选择器与期望。

**AC-26（REQ-026 竖向主轴）**
- **先验容器**：`[...document.querySelectorAll('.htl-row')].map(r => r.getBoundingClientRect().top)` 互不相等且递增（横排时全部相等，这是「R5 横向段没拆掉」的直接表征）；`getComputedStyle(#timeline-root).display === 'block'`、`overflowY === 'visible'`、`height` 不是 `940px`。
- `document.querySelectorAll('.htl-node').length` 等于页面上 `.htl-row` 的数量。
- `document.querySelector('.htl-axis-path')` 存在；`getAttribute('d')` 以 `M` 开头，第二个坐标对的 y 恒为 0，末点为 `y = <svg height>`。
- 取任一两节点：`d` 中相邻折点的 y 递增（自上而下）。
- **zigzag 必须被验到**：把 `d` 拆成点序列，相邻折点的 x 在两值之间交替，两值中点约等于轴列中心、各自距中线约等于 `--htl-axis-wave`（±2px）。只验 y 递增的话，一条笔直竖线也会全绿。
- `document.querySelector('.htl-node').getAttribute('style')` 不含 `transform`（zigzag 归 CSS，任何内联 transform 都会把它压平）。
- `document.documentElement.scrollWidth <= window.innerWidth`——只能当兜底，`body` 上有 `overflow-x: hidden`，这条几乎恒真。

**AC-27（REQ-027 左右交替）**
- 取前 4 行：`[...document.querySelectorAll('.htl-row')].slice(0,4).map(r=>r.className)` 依次含 `is-right, is-left, is-right, is-left`。
- 删掉第 2 个事件后重新查询，仍为 `is-right, is-left, is-right`，且每行 `data-event-id` 与 `.htl-node` 所在行一致。
- **引线真的连上了**：右行 `.htl-link` 的 `right` 与同行 `.htl-entry` 的 `left` 之差 ≤ 1px，且 `.htl-link` 的 `left` 等于该行节点中心 x（左行对称）；桌面宽度应约为 `34px`（`88/2 − 26 + 16`），手机约 `24px`（`56/2 − 14 + 10`）。写成 `right:0` 只会得到 18px、悬在轴列里够不到条目。
- 目测：任何一行内，折线与引线不压到 `.htl-entry__title` 的文字上。

**AC-28（REQ-028 年/月分组）**
- 跨 3 年的数据：`.htl-year-group` 长度 3，`.htl-year-heading` 各 1。
- 同一年跨 3 个月：该年内 `.htl-month-group` 长度 3，各月 `.htl-row` 数量之和等于该年行数。
- 向下滚动：`getComputedStyle(heading).position === 'sticky'`，滚到第二年后第一个 year-heading 的 `getBoundingClientRect().top` 接近 0。

**AC-29（REQ-030 正序切换）**
- 默认：第一行 `data-event-id` 对应日期为最大日期。
- 点击正序：第一行对应最小日期；左右 class 序列仍从 `is-right` 开始。

**AC-30（REQ-002 + REQ-015 无分类）**
- 新建事件表单：`document.querySelector('[data-field="category"]') === null`；`document.querySelector('select')` 中无分类下拉。
- 筛选栏：`document.querySelector('.htl-filter-categories') === null`；`document.querySelector('[data-action="toggle-filter-category"]') === null`。
- 只填标题不填日期 → 保存被拒并定位到日期字段。

**AC-31（REQ-029 兼容）**
- 造一份 V0.0.1 导出文件（含 `categories` 与 `category`），导入：预览四项计数中 `错误 = 0`，明细无「分类」字样，确认后事件数正确。
- 导入完成后再导出：`JSON.parse` 后 `'categories' in data === false`，且 `data.events.every(e => !('category' in e))`。

**AC-32（REQ-013 + REQ-014 条目与入口）**
- 任一 `.htl-row` 内：`.htl-entry` 只有 `.htl-entry__date` 与 `.htl-entry__title` 两个子元素；无 `.htl-star`、无 `.htl-chip`、无 `.htl-card__summary`、无 `.htl-card__meta`。
- 超长标题：`.htl-entry__title` 计算样式 `text-overflow === 'ellipsis'`，行高不变（`.htl-row` 高度与短标题行相同）。
- 3 条记录的事件与 0 条记录的事件：两行高度相同、均无展开箭头元素（`[data-action="toggle-card"]` 数量为 0）。
- 点日期（`.htl-entry__date`）：无浮层（`document.querySelector('.htl-detail') === null`）；点标题：浮层出现。

**AC-33（REQ-031 详情内容与关闭）**
- 打开含 3 记录 + 1 图 + 1 外链 + 2 关联的事件：`.htl-detail__record` 数量 3，日期自上而下递增；`.htl-detail__cover img` 存在；`.htl-detail__links a` 存在；`.htl-detail__relations button` 数量 2。
- `document.body.classList.contains('is-locked') === true`；滚轮滚动时 `window.scrollY` 不变、`.htl-detail__panel.scrollTop` 变化（内容足够长时）。
- ESC / 点遮罩 / 点 `[data-action="close-detail"]` 三种方式都关闭，关闭后 `is-locked === false`。

**AC-34（REQ-005 + REQ-021 星级与关联跳转）**
- 筛选 5 星：只剩最新记录为 5 星的事件；轴上不出现任何 `★` 字符（`document.querySelectorAll('.htl-star').length === 0` 在 `#timeline-root` 内）。
- 在详情里点关联项：`.htl-detail` 从 DOM 消失，页面滚动到目标行，目标行在 2 秒内带 `is-flash`。
- 目标被筛掉时点击：`清空筛选` 生效（筛选栏回到全不选），目标出现并高亮，且出现「已清除筛选以显示目标事件」提示。

**额外（§7.4 滚动锁）**
- 详情内开编辑表单再关：`is-locked === true`；再关详情：`false`。

### 8.4 编译期验收

`npm run typecheck` 必须零错误。以下任一残留都会在这里炸掉，这是本版最强的回归护栏：

- 任何模块仍引用 `event.category` / `data.categories` / `PRESET_CATEGORIES` / `CATEGORY_MAX` / `FilterState.categories` / `EventInput.category` / `CardView.expandable` / `store.toggleExpanded` / `ViewState.expandedIds`。
- `ISSUE_MESSAGES` 仍含已删的两个 code（`Record<IssueCode,string>` 完备性）。
- `tests/` 里仍用 `category` 构造 fixture（`npm run build` 会一起检查）。

---

## 9. 需求映射

| 需求 | 落点模块 | 关键契约 |
|------|---------|---------|
| REQ-026 竖向折线 | MOD-018 axis.ts + MOD-014 CSS | §5.3 几何契约、§7.1 边界 |
| REQ-027 左右交替 | MOD-010 render/yearGroup/entry | §5.2 全局序号、§6.5 |
| REQ-028 年/月分组竖排 | MOD-010 yearGroup + MOD-014 | 年份 heading 吸顶遮轴、月份 pill 居中 |
| REQ-030 正序切换 | MOD-010 + MOD-006 buildCards | 复用现有排序，仅左右重排 |
| REQ-002 必填项 | MOD-001 + MOD-004 + MOD-011 | 表单删分类字段块 |
| REQ-006 废弃 | MOD-001/008/011/014 | `addCategory` 删除、`--htl-cat-*` 删除 |
| REQ-005 星级口径 | MOD-006 select | 只服务筛选与详情展示 |
| REQ-013 条目瘦身 | MOD-010 entry.ts | 仅两个子元素 |
| REQ-014 点标题开详情 | MOD-010 + MOD-019 | `open-detail` 取代 `toggle-card` |
| REQ-015 筛选 | MOD-013 filterBar | 删分类 chips |
| REQ-017 年份导航 | MOD-013 yearNav | 不改逻辑，锚点仍是 `#year-*` |
| REQ-021 关联跳转 | MOD-015 main | §6.4，先关详情再定位 |
| REQ-029 数据兼容 | MOD-004 + MOD-005 + MOD-008 | 静默剥离，不报 issue |
| REQ-031 详情浮层 | MOD-019 detailModal | §5.5 DOM 契约 |

---

## 10. 假设与遗留

### 10.1 显式假设（不阻塞开工）

- 需求文档三条 Open Question 未拍板，本设计按正文口径实现：覆盖式浮层、严格交替、保留星级与关键词筛选。若要改，只影响 MOD-019 的存在形式（原位展开）或 MOD-010 的侧别算法，不影响 core 层。
- 行高由 CSS `min-height` 控制（桌面 64px、手机 56px），不依赖内容撑开，保证折线 zigzag 均匀。
- 详情浮层面板宽桌面 720px、手机 92vw；记录区与关联区之间用一个 1px 分隔线，不加卡片嵌套。
- 年份分隔条宽横跨全行、背景取 `--htl-color-bg`，允许遮住折线（视觉上轴在年份处断开，是刻意的）。
- `package.json` 的 `version` 与 `main.ts` 里传入的 `appVersion` 同步改 `'0.0.2'`。

### 10.2 尚待实测

- 300 条事件时竖向全量重绘 + SVG 路径重算的耗时；阈值 120 是按「每帧 2 次 getBoundingClientRect × 120」估的，实测后若仍卡顿，把灵动层改为「仅首屏 40 行内启动」。
- 手机端两列宽度是否够放下 60 字标题的省略显示；若过窄，`--htl-axis-col` 由 56px 降到 40px、条目字号降到 14px。

### 10.3 自检记录（Seven Gates）

1. **零上下文盲测**：§5.2~§5.5 已给出全部函数签名、DOM 类名、错误行为；`renderEntry` 的 `side` 计算归属明确写在 §5.2 与 §6.5，执行者不需要猜。
2. **字段级边界**：§4 每个被删字段都写了「旧值如何处理、是否报错、`Object.hasOwn` 期望」。
3. **1:1 任务映射**：§3 模块表含 touchlist 与依赖；MOD-010 的三个文件标注了必须同波次提交。
4. **代码现实核对**：§0 全部结论带行号与 `grep` 依据；无 `[Pending Verification]` 项。
5. **Non-Goals 反越界**：§1.2 明确禁止留横向分支、禁止 schemaVersion 迁移、禁止新增依赖。
6. **测试基线精度**：§8.2 每条用例 Given/When/Then 可直接抄；§8.3 每条给选择器与期望值。
7. **全局一致性**：`card.ts → entry.ts` 改名后，已用 `grep -rln "renderCard\|htl-card"` 复核命中面为 `axis.ts`、`card.ts`、`yearGroup.ts`、`render.ts`、`components.css`、`theme.css` 六个文件，全部列入 §2.2 改动清单；`theme.css` 的唯一命中是变量 `--htl-card-max-width`，已指定改名为 `--htl-timeline-max-width`。`isExpandable` 的定义与调用各 1 处（`select.ts:126/331`），`card.ts` 的三处 `data-action="toggle-card"` 随重写消失；`toggle-card` 的 handler 分支在 `main.ts:42`，已列入 §5.6 删除项。
