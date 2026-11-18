# 个人历史时间轴 — 详细设计（detailed design）

文档版本：**V0.0.1-R2**（对应产品版本 v0.0.1）｜ 最近更新：2026-11-18 ｜ 上游基线：`proposal.md` **V0.0.1-R2**（注意两者修订号各自计数，非同源）｜ 状态：待实现

### 修订记录

| 文档版本 | 日期 | 修订内容 | 依据 |
|---------|------|---------|------|
| V0.0.1 | 2026-11-18 | 初版：17 个模块、25 条 REQ 全覆盖、6 组单测锚点（60+ 条 GWT）、22 条 store 事务用例 | 四项技术决策：Vite+TS / Core-UI 双层 / 单 key 存储 / Vitest 范围 |
| V0.0.1-R1 | 2026-11-18 | Seven Gates 自检修正 9 处：新增 `FIELD_TOO_LONG` 区分表单与导入的超长处理、`validateTopShape` 补 `ok` 字段、`mutate` 签名补 draft 返回、删除 `InitResult.ok:false` 死分支、补 MOD-016/MOD-017、补 `openRestoreBackupConfirm` 入口、`data-focus-key` 补动态行格式、重排模块顺序为 001→017 连续、删除只读验收项 | 自检 |
| V0.0.1-R2 | 2026-11-18 | 任务 prompt 审查回写 4 处：新增 §7.2.1 `IssueCode → 用户可见文案` 映射表（原表只有场景、不列 code 名，29 个 code 中 27 个无处取文案）；§3 MOD-014 补完整 CSS 类名与主题变量清单（原只有"类名约定"一句话，T12 与 T14/T15/T16 无共同契约）；§6.3 补覆盖模式 `categories` 取并集；§8 补 `id.spec.ts` 的 I1~I4 用例表（原文只有 tasks/T04 里有，§8 缺组） | prompt 审查 |
| V0.0.1-R3 | 2026-11-18 | 二级时间轴：REQ-012 升级为「年 → 月」两级分组（用户要求月份也作为一层时间轴）。MOD-006 `YearGroup` 增加 `months: MonthGroup[]`、`MonthGroup { month, cards }`；MOD-010 渲染月份小节且不吸顶；MOD-014 类名表补 `.htl-month-group` `.htl-month-heading`；§4.6 `data-focus-key` 补 `month.<YYYY>.<MM>`。空月份不占位 | 用户变更请求 |
| V0.0.1-R4 | 2026-11-18 | 主视觉改为「一条跳动的时间轴」：主轴 `--htl-timeline-width` 2px→3px，`::before` 呼吸发光、`::after` 沿轴循环流动高光；新增轴上节点 `.htl-axis-node--year`（脉动+扩散光环）与 `--month`（按 `--i` 依次跳动）；卡片入场 `htlCardRise`。MOD-014 类名表补三个节点类，MOD-010 负责渲染节点（视觉全部在 CSS，`prefers-reduced-motion` 下自动关闭） | 用户变更请求 |
| V0.0.1-R5 | 2026-11-18 | 主视觉再改：**横向**跳动线，从左到右贯穿；事件去掉卡片方框，上下交替挂在轴上（`.htl-card__node` 节点 + 11px 连接短线）；年份/月份标签脱离文档流浮在轴下方；年份导航移到右上避开轨道；无记录时简评占位由「暂无记录」改为「—」避免与星级位重复。MOD-010 渲染 `.htl-slot.is-up/.is-down` 交替槽位 | 用户变更请求 |
本文件是下游任务拆分与代码生成的**权威冻结快照**。凡本文件与需求文档冲突，以实现本文件与需求文档中更严格的一条为准，并回填修订记录。

---

## 0. 前置事实与已定技术决策

| 项目 | 结论 | 来源 |
|------|------|------|
| 代码库现状 | 目录内仅有 `proposal.md`、`decision-log.md`，**无任何代码**。本设计涉及的全部文件均为新建 | 已 `ls` 核验 |
| Node 环境 | `node v26.7.0`，`npm 11.19.0` | 已 `node --version` 核验 |
| 技术栈 | Vite + 原生 TypeScript，无框架 | 用户决策 |
| 代码骨架 | Core（纯逻辑内核）+ UI（薄视图层）双层分离 | 用户决策 |
| 存储 | 单 localStorage key `timeline_data_v1`，配图以 Base64 内嵌其中，图文同池 | 用户决策 |
| 测试 | Vitest，**仅覆盖 `src/core/**`**，DOM 交互按 AC 手工验收 | 用户决策 |
| 渲染策略 | 单向数据流 + 全量重绘（焦点与滚动显式恢复） | 架构方案一，随双层决策确立 |

**需求侧修订**：因「图文同池」推翻了 R1 中「两池分账」的写法，`proposal.md` 的 REQ-024 已回退为「同池 + 总水位」口径（见该文件与 `decision-log.md`）。

---

## 1. 范围与 Non-Goals

### 1.1 In Scope
REQ-001 ~ REQ-025 全部条目（P0 / P1 / P2）。实现粒度为「单页静态应用 + 本地存储 + JSON 导入导出」。

### 1.2 Non-Goals（对执行者的硬约束，越界即视为缺陷）

**全局禁止**
- 不引入任何 UI 框架、状态管理库、模板引擎（Vue / React / lit / zustand / redux 全部禁止）。
- 不引入路由（无 history API 使用），不做 SSR / SSG。
- 不做虚拟滚动、不做分页、不做懒加载模块拆分（300 条量级不需要）。
- 不做 Service Worker / PWA / 离线缓存。
- 不做 i18n，文案直接写简体中文常量。
- 不做主题切换 UI，只提供可替换的主题文件。

**Core 侧禁止**
- 不 import 任何 `src/ui/**`、不访问 `window` / `document` / `localStorage` / `fetch` / `navigator` / `canvas`。
- 不使用 `setTimeout` / `setInterval` / `requestAnimationFrame`。
- 不抛异常向上传递业务错误——一律返回 `MutationResult`；仅允许 `JSON.parse` 之类由调用方包装的底层异常在模块内部捕获。
- 不写 console 日志。

**UI 侧禁止**
- 不做业务计算：不得自行判断「哪条记录是最新的」、不得自行算跨度、不得自行做合并去重、不得自行判断星级是否越界。全部向 Core 要结果。
- 不持有业务数据的副本（只持有 `Store.getState()` 的只读引用与纯 UI 局部状态：弹窗开合、Toast 文本、灯箱当前图片）。
- 不用 `innerHTML` 拼接任何用户数据（REQ-025）。模板用 `<template>` 元素 clone 或 `createElement` + `textContent`。

---

## 2. 架构与边界

### 2.1 分层与依赖方向

```
┌───────────────────────────────────────────────┐
│ index.html  +  main.ts（装配，无业务）          │
│                                               │
│  ┌─────────────────────────────────────────┐  │
│  │ UI（薄视图层） src/ui/**                 │  │
│  │  render / parts / platform / styles     │  │
│  └──────────────┬──────────────────────────┘  │
│                 │ 依赖（唯一方向）              │
│  ┌──────────────▼──────────────────────────┐  │
│  │ Core（纯逻辑内核） src/core/**           │  │
│  │  types / date / id / validate /         │  │
│  │  merge / select / capacity / store      │  │
│  └─────────────────────────────────────────┘  │
│                 ▲                              │
│                 │ Port 接口（Core 定义，UI 实现）│
│  ┌──────────────┴──────────────────────────┐  │
│  │ platform.ts：StoragePort / ClockPort 实现 │  │
│  └─────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

- **Core 不知道 UI 存在**：Core 内不得出现任何 `ui` 字样 import。
- **Port 反向注入**：`StoragePort`、`ClockPort` 由 Core 在 `types.ts` 定义接口，由 `ui/platform.ts` 提供实现，在 `main.ts` 里注入 `new Store({ storage, clock, appVersion })`。这是 Core 可被 Vitest 纯函数测试的前提。
- **种子数据不由 Core 获取**：不定义 `SeedPort`。UI 侧 fetch 到原始文本后作为参数传给 `store.init(seedRaw)`，Core 只负责解析与校验。

### 2.2 目录结构（最终形态）

```
personal-history-timeline/
├─ index.html
├─ package.json
├─ vite.config.ts                 # base: './'
├─ tsconfig.json
├─ vitest.config.ts
├─ public/
│  └─ data/events.json            # 种子：构建后位于 dist/data/events.json
├─ src/
│  ├─ main.ts                     # 装配：platform → Store → 首次 render → 绑定事件
│  ├─ core/
│  │  ├─ types.ts                 # SSOT：所有类型、常量、IssueCode
│  │  ├─ id.ts
│  │  ├─ date.ts
│  │  ├─ validate.ts
│  │  ├─ merge.ts
│  │  ├─ select.ts
│  │  ├─ capacity.ts
│  │  └─ store.ts
│  └─ ui/
│     ├─ platform.ts              # StoragePort / ClockPort 实现 + fetch + canvas 压缩 + 下载 + 剪贴板
│     ├─ render.ts                # 全量重绘时间轴（含焦点/滚动恢复）
│     ├─ bind.ts                  # 事件委托绑定（一次性，不随重绘重绑）
│     ├─ dom.ts                   # 小工具：el()/text()/cloneTemplate()
│     ├─ parts/
│     │  ├─ card.ts
│     │  ├─ yearGroup.ts
│     │  ├─ filterBar.ts
│     │  ├─ yearNav.ts
│     │  ├─ formModal.ts
│     │  ├─ importExport.ts
│     │  ├─ confirm.ts
│     │  ├─ lightbox.ts
│     │  └─ toast.ts
│     └─ styles/
│        ├─ theme.css             # 仅 CSS 变量（REQ-022）
│        └─ components.css        # 布局与组件类
└─ tests/
   ├─ date.spec.ts
   ├─ validate.spec.ts
   ├─ merge.spec.ts
   ├─ select.spec.ts
   ├─ capacity.spec.ts
   └─ store.spec.ts
```

### 2.3 重绘边界规则（全量重绘能成立的三个前提）

1. **重绘范围只有 `#timeline-root` 一个子树**。弹窗、确认框、灯箱、Toast 全部挂在 `#overlay-root`，由各自模块自己开合，**不参与时间轴重绘**。
2. **重绘前记录、重绘后恢复**：`document.activeElement` 的 `data-focus-key`、`<input>` 的 `selectionStart/selectionEnd`、`window.scrollY`。任何可聚焦控件必须带唯一的 `data-focus-key`（格式见 §4.6）。
3. **展开态、筛选态、排序态全部存在 store 的 viewState 里**，不依赖 DOM 保留状态；重绘后从 viewState 重建。

违反任一条即导致「输入框打字丢焦点 / 滚动位置乱跳 / 展开的卡片自己折叠」，这是本架构唯一的系统级风险，测试锚点见 §8.6。

---

## 3. 模块表（1:1 对应下游任务文件）

> 每个 MOD 应能独立派发为一个任务文件。跨模块共享的类型/常量一律从 `core/types.ts` 取，禁止并行实现近似版本。

### MOD-001 `src/core/types.ts`
- **Traces to**: 全部 REQ（类型与常量基线）
- **Responsible File(s)**: `src/core/types.ts`
- **Role & Boundaries**: 只放类型、接口、常量、枚举。**零运行时代码**（无函数、无副作用；`PRESET_CATEGORIES` 与 `ISSUE_MESSAGES` 为 readonly 常量，允许）。`ISSUE_MESSAGES: Record<IssueCode, string>` 的文案实现时直接照抄 §7.2.1 的映射表，不得自创措辞。
- **Non-Goals**: 不放校验逻辑、不放工具函数、不放默认值工厂（构造函数式默认值放各属主模块）。
- **SSOT**: 拥有并定义 `TimelineData`、`TimelineEvent`、`PersonalRecord`、`EventLink`、`ViewState`、`FilterState`、`SortOrder`、`Rating`、`Issue`、`IssueCode`、`MutationResult`、`ImportPreview`、`StoragePort`、`ClockPort`，以及 §4.5 全部常量。
- **Dependencies**: 无（叶子模块）。

### MOD-002 `src/core/date.ts`
- **Traces to**: REQ-020 [P0]
- **Responsible File(s)**: `src/core/date.ts`
- **Role & Boundaries**: 日期字符串解析/格式化、日序数、相隔天数、日历自然年月差、跨度文案。
- **Non-Goals**: 不做时区转换、不处理时分秒、不支持 `YYYY/MM/DD` 等其它格式、不解析农历。
- **SSOT**: 拥有全部日期口径（`DAY_MS`、日历差算法、跨度文案格式）。
- **Public Interface**:
  ```ts
  export interface CalendarSpan { years: number; months: number; days: number; totalDays: number; }
  /** 解析 'YYYY-MM-DD'；非法返回 null（含 2026-02-30 这类溢出日期） */
  export function parseDate(s: string): { y: number; m: number; d: number } | null;
  export function isValidDateString(s: string): boolean;
  export function formatDate(p: { y: number; m: number; d: number }): string;
  /** 以 UTC 零点差计算，绝不做本地时区换算 */
  export function dayNumber(s: string): number | null;
  export function daysBetween(a: string, b: string): number | null;
  export function calendarSpan(a: string, b: string): CalendarSpan | null;
  /** direction 由调用方按日期比较后传入 */
  export function spanText(a: string, b: string, dir: 'before' | 'after' | 'same'): string;
  export function yearOf(s: string): string; // 'YYYY'
  export function todayString(nowIso: string): string; // 从 ClockPort 的 ISO 取本地日期
  ```
- **Error Codes**: 非法日期由调用方转 `IssueCode.INVALID_DATE`；本模块只返回 `null`，不产 Issue。

### MOD-003 `src/core/id.ts`
- **Traces to**: REQ-001/002/003（实体标识）、REQ-010（重复 id 重建）
- **Responsible File(s)**: `src/core/id.ts`
- **Role & Boundaries**: 生成 `evt_<ms>_<6位36进制>` 与 `rec_<ms>_<6位36进制>`。
- **Non-Goals**: 不用 `crypto.randomUUID`（需要可注入随机源以便测试且保持格式稳定）。
- **SSOT**: 拥有 id 格式正则 `ID_PATTERN`（供 validate 复用于格式判定）。
- **Public Interface**:
  ```ts
  export function createId(prefix: 'evt' | 'rec', nowMs: number, rand: () => number): string;
  export const ID_PATTERN: RegExp; // /^(evt|rec)_\d{13}_[0-9a-z]{6}$/
  ```
- **`rand` 值域**：调用方保证返回 `[0, 1)`；实现仍必须把 `floor(rand() * 36^6)` 夹取到 `36^6 - 1`，保证末段恒为 6 位（越界输入不得产出 7 位）。

### MOD-004 `src/core/validate.ts`
- **Traces to**: REQ-002 [P0]、REQ-003 [P0]、REQ-005 [P0]、REQ-006 [P2]、REQ-011 [P0]、REQ-025 [P1]
- **Responsible File(s)**: `src/core/validate.ts`
- **Role & Boundaries**: 表单字段校验（严格，超长即错）与导入条目校验（宽容，超长截断并降级为 warning）两套入口。
- **Non-Goals**: 不修改数据（截断由 merge 侧执行，本模块只报告 `Issues` 与建议值）。不做 HTML 转义（渲染层负责纯文本输出）。
- **SSOT**: 拥有全部字段长度上限的**判定规则**（常量值本身在 types.ts）。
- **Public Interface**:
  ```ts
  export function validateEventInput(i: EventInput): Issue[];
  export function validateRecordInput(i: RecordInput): Issue[];
  export function validateUrlScheme(url: string): boolean; // 仅 http:/https:
  export function validateCover(value: string): Issue[];   // http(s) 或 data:image/*;base64
  /** 导入用：宽松校验 + 修正，返回修正后的对象与 issues */
  export function coerceEvent(raw: unknown, index: number): { event: TimelineEvent | null; issues: Issue[] };
  export function coerceRecord(raw: unknown, index: number): { record: PersonalRecord | null; issues: Issue[] };
  export function validateTopShape(json: unknown): { ok: boolean; data: TimelineData | null; issues: Issue[] };
  ```
- **Error Codes**: `MISSING_REQUIRED`、`INVALID_DATE`、`RATING_OUT_OF_RANGE`、`FIELD_TOO_LONG`、`TOO_MANY_RECORDS`、`TOO_MANY_LINKS`、`TOO_MANY_RELATIONS`、`SELF_RELATION`、`INVALID_URL_SCHEME`、`JSON_SYNTAX`、`TOP_LEVEL_SHAPE`（以上为 error）；`FIELD_TRUNCATED`、`RATING_CLAMPED`、`UNKNOWN_CATEGORY_ADDED`、`ID_REGENERATED`（以上为 warning，仅导入入口产生）。
- **两套入口的差别**：表单入口超长 → `FIELD_TOO_LONG`（error，拒绝保存）；导入入口超长 → 截断 + `FIELD_TRUNCATED`（warning，保留条目）。

### MOD-005 `src/core/merge.ts`
- **Traces to**: REQ-010 [P0]、REQ-011 [P0]、REQ-019 [P0]
- **Responsible File(s)**: `src/core/merge.ts`
- **Role & Boundaries**: 合并去重 / 全量覆盖、不变量裁剪（记录数 ≤20、关联数 ≤10）、差异预览统计。
- **Non-Goals**: **不做记录级独立合并**（REQ-010：以事件为最小合并单位，胜出方记录集合整体替换）。不写存储（由 store 负责）。不做备份（由 store 负责）。
- **SSOT**: 拥有合并胜负判定与裁剪顺序。
- **Public Interface**:
  ```ts
  export type ImportMode = 'merge' | 'overwrite';
  export function planMerge(local: TimelineData, incoming: TimelineData, mode: ImportMode): {
    next: TimelineData; preview: ImportPreview;
  };
  /** 裁剪不变量，返回被丢弃的数量 */
  export function enforceInvariants(data: TimelineData): { droppedRecords: number; droppedRelations: number; affectedEventIds: string[] };
  ```
- **Rule**: 合并胜负 = `incoming.updatedAt > local.updatedAt`（ISO 字符串字典序比较即可，格式固定含时区偏移；无 `updatedAt` 视为最旧）。裁剪顺序 = 保留 `(date, createdAt, id)` 升序靠前者，丢弃靠后者。
- **Error Codes**: 由返回的 `preview.counts.errors` 与 `Issue` 承载，本模块不抛错。

### MOD-006 `src/core/select.ts`
- **Traces to**: REQ-012 [P0]、REQ-013 [P0]、REQ-014 [P0]、REQ-015 [P0]、REQ-016 [P1]、REQ-019 [P0]
- **Responsible File(s)**: `src/core/select.ts`
- **Role & Boundaries**: 排序、筛选、关键词搜索、年份分组（年内再按月分组）、反向关联索引、卡片展示所需的派生数据（最新记录、关联列表、跨度）。
- **Non-Goals**: 不产生 DOM、不做高亮、不做分页。
- **SSOT**: 拥有「最新记录」判定、事件排序比较器、筛选谓词、关联合并去重规则、年月两级分组规则。
- **Public Interface**:
  ```ts
  export interface RelationView { eventId: string; date: string; title: string; dir: 'before'|'after'|'same'; spanText: string; }
  export interface CardView {
    event: TimelineEvent;
    latestRecord: PersonalRecord | null;   // null = 「暂无记录」
    visible: boolean;
    relations: RelationView[];
    relationCount: number;
    recordCount: number;
    expandable: boolean;
  }
  export interface MonthGroup { month: string; cards: CardView[]; }   // month 为 '01'..'12'
  export interface YearGroup { year: string; months: MonthGroup[]; cards: CardView[]; } // months 为年内月份小节；cards 为该年扁平视图

  export function buildRelationIndex(events: TimelineEvent[]): Map<string, string[]>;
  export function latestRecord(e: TimelineEvent): PersonalRecord | null;
  export function sortedRecords(e: TimelineEvent): PersonalRecord[];
  export function compareEvents(a: TimelineEvent, b: TimelineEvent): number; // 与方向无关的升序比较
  export function matchFilters(e: TimelineEvent, f: FilterState): boolean;
  export function buildCards(events: TimelineEvent[], f: FilterState, order: SortOrder): YearGroup[];
  export function allYears(cards: CardView[]): string[]; // 当前结果中存在的年份
  export function isExpandable(e: TimelineEvent, relationCount: number): boolean;
  ```

### MOD-007 `src/core/capacity.ts`
- **Traces to**: REQ-024 [P1]
- **Responsible File(s)**: `src/core/capacity.ts`
- **Role & Boundaries**: 估算 JSON 序列化后的占用字节、判定水位、估算剩余可存张数。
- **Non-Goals**: 不读取 `navigator.storage.estimate()`（跨浏览器不一致且是异步的）、不做真实配额探测。
- **SSOT**: 拥有字节估算公式与水位判定。
- **Public Interface**:
  ```ts
  export function estimateBytes(json: string): number;      // json.length * 2（localStorage 按 UTF-16 计）
  export function capacityState(bytes: number): 'ok' | 'warn' | 'block'; // <4MB / >=4MB / >=4.5MB
  export function estimateRemainingImages(data: TimelineData, usedBytes: number): number;
  ```

### MOD-008 `src/core/store.ts`
- **Traces to**: REQ-001~REQ-025（全部写路径）、REQ-007 [P0]、REQ-008 [P0]、REQ-009 [P0]
- **Responsible File(s)**: `src/core/store.ts`
- **Role & Boundaries**: 唯一可变状态容器；事务式变更（先落盘后提交）；订阅广播；init 与数据损坏处理；导入导出编排；备份。
- **Non-Goals**: 不做 DOM 通知以外的副作用；不 fetch、不弹窗、不格式化 JSON 供下载（只返回字符串）。
- **SSOT**: 拥有 `AppState` 结构与全部变更入口。
- **Public Interface**: 见 §5.1。
- **Error Codes**: `STORAGE_UNAVAILABLE`、`STORAGE_WRITE_FAILED`、`CAPACITY_EXCEEDED`、`EVENT_NOT_FOUND`、`RECORD_NOT_FOUND`、`BACKUP_FAILED`、`SEED_INVALID`、`DATA_CORRUPT`。

### MOD-009 `src/ui/platform.ts`
- **Traces to**: REQ-009 [P0]、REQ-018 [P0]、REQ-024 [P1]、REQ-016 [P1]
- **Responsible File(s)**: `src/ui/platform.ts`
- **Role & Boundaries**: `StoragePort` / `ClockPort` 实现；fetch 种子文本；图片压缩（File → Base64）；文件下载；剪贴板写入与降级。
- **Non-Goals**: 不做业务判断（是否超容量、是否允许保存由 Core 决定）。
- **Public Interface**:
  ```ts
  export function createStorage(): StoragePort;
  export function createClock(): ClockPort;
  export async function loadSeedRaw(): Promise<string | null>;   // fetch('./data/events.json?v=BUILD_ID')
  export async function compressImage(file: File): Promise<{ ok: true; dataUrl: string } | { ok: false; code: 'COVER_TOO_LARGE' | 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' }>;
  export function downloadJson(filename: string, text: string): void;
  export async function copyText(text: string): Promise<boolean>; // false = 需降级
  export function showTextareaFallback(text: string): void;
  ```

### MOD-010 `src/ui/render.ts` + `src/ui/parts/card.ts` + `yearGroup.ts`
- **Traces to**: REQ-012 [P0]、REQ-013 [P0]、REQ-014 [P0]、REQ-018 [P1]
- **Responsible File(s)**: `src/ui/render.ts`、`src/ui/parts/card.ts`、`src/ui/parts/yearGroup.ts`
- **Role & Boundaries**: 读 `AppState` 重建 `#timeline-root`；渲染折叠/展开两态、空态、年份分组与吸顶标题，以及年内月份小节（年 → 月 → 卡片两级时间轴）。
- **Non-Goals**: 不计算最新记录/跨度/筛选（全部来自 `CardView`）；不绑定事件（由 `bind.ts` 一次性委托）；月份小节不做吸顶。
- **Public Interface**:
  ```ts
  export function render(state: Readonly<AppState>): void; // 内部完成焦点与滚动恢复
  export function renderCard(view: CardView, expanded: boolean): HTMLElement;
  ```

### MOD-011 `src/ui/parts/formModal.ts`
- **Traces to**: REQ-001~REQ-006
- **Responsible File(s)**: `src/ui/parts/formModal.ts`
- **Role & Boundaries**: 事件表单与记录表单的 DOM、字段级错误展示、动态链接行、关联多选、封面预览、未保存关闭确认。
- **Non-Goals**: 不自己做校验（调 `validate.*`）、不直接写 store（调 store 方法并处理 `MutationResult`）。
- **Public Interface**:
  ```ts
  export function openEventForm(opts: { mode: 'create' } | { mode: 'edit'; eventId: string }): void;
  export function openRecordForm(opts: { eventId: string } | { eventId: string; recordId: string }): void;
  export function closeFormModal(force?: boolean): void;
  ```

### MOD-012 `src/ui/parts/importExport.ts`
- **Traces to**: REQ-009 [P0]、REQ-010 [P0]、REQ-011 [P0]
- **Responsible File(s)**: `src/ui/parts/importExport.ts`
- **Role & Boundaries**: 导入弹窗（文件/粘贴、模式选择、预览计数与明细、确认执行）、导出弹窗（下载/复制）。
- **Non-Goals**: 不解析 JSON、不比较版本（全部经 `store.previewImport` / `applyImport`）。
- **Public Interface**:
  ```ts
  export function openImportModal(): void;
  export function openExportModal(): void;
  /** 导入弹窗底部「从上次覆盖前备份恢复」：调用 store.restoreBackup()，需二次确认 */
  export function openRestoreBackupConfirm(): void;
  ```

### MOD-013 `src/ui/parts/filterBar.ts` + `yearNav.ts`
- **Traces to**: REQ-015 [P0]、REQ-016 [P1]、REQ-017 [P1]
- **Responsible File(s)**: `src/ui/parts/filterBar.ts`、`src/ui/parts/yearNav.ts`
- **Role & Boundaries**: 分类 chips、星级按钮、搜索框（300ms 防抖后调 `setFilters`）、清空筛选、排序切换、年份锚点、回到顶部、IntersectionObserver 高亮跟随。
- **Non-Goals**: 不做匹配计算；不在防抖回调里直接改 DOM（只改 state，由 render 负责）。
- **Public Interface**:
  ```ts
  export function renderFilterBar(state: Readonly<AppState>): void;
  export function renderYearNav(state: Readonly<AppState>, groups: YearGroup[]): void;
  export function scrollToYear(year: string): void;
  export function scrollToTop(): void;
  ```

### MOD-014 `src/ui/styles/theme.css` + `components.css`
- **Traces to**: REQ-022 [P0]
- **Responsible File(s)**: `src/ui/styles/theme.css`、`src/ui/styles/components.css`
- **Role & Boundaries**: `theme.css` 只含 `:root` 变量定义；`components.css` 只含布局与组件类，所有颜色/尺寸/圆角/动效值必须 `var(--htl-*)`。
- **Non-Goals**: 不出现硬编码色值（`#` / `rgb(` / `hsl(`）于 `components.css`；不写组件业务态（`.is-loading` 等布尔类允许）。
- **SSOT**: 拥有全部视觉变量命名与全部 CSS 类名。以下两张清单是 **T12 与 T14/T15/T16 之间的契约**，任何一方不得单方改名。

  **主题变量（只在 `theme.css` 的 `:root` 定义）**

  | 组 | 变量 |
  |----|------|
  | 颜色 | `--htl-color-bg` `--htl-color-surface` `--htl-color-border` `--htl-color-text` `--htl-color-text-muted` `--htl-color-accent` `--htl-color-star` `--htl-color-danger` `--htl-color-success` |
  | 分类色板 | `--htl-cat-1` ~ `--htl-cat-6` |
  | 字体 | `--htl-font-sans` `--htl-font-mono` |
  | 字号 | `--htl-fs-xs` `--htl-fs-sm` `--htl-fs-md` `--htl-fs-lg` `--htl-fs-xl` |
  | 间距 | `--htl-space-1` ~ `--htl-space-6` |
  | 形状 | `--htl-radius-sm` `--htl-radius-md` `--htl-radius-lg` `--htl-timeline-width` `--htl-card-max-width` |
  | 动效 | `--htl-transition-fast` `--htl-transition-base` `--htl-shadow-card` |

  **类名（只在 `components.css` 定义，`--htl-*` 变量一律带 fallback）**

  | 归属 | 类名 |
  |------|------|
  | 容器 | `.htl-app` `.htl-timeline`（竖线） |
  | 年份 | `.htl-year-group` `.htl-year-heading`（sticky） |
  | 月份 | `.htl-month-group` `.htl-month-heading`（小节标题，不 sticky） |
  | 主轴节点 | `.htl-axis-node` `.htl-axis-node--year` `.htl-axis-node--month`（横向主轴上的年/月刻度，月份按 `--i` 依次跳动） |
  | 横向槽位 | `.htl-slot`（`.is-up` 上半槽贴轴底部 / `.is-down` 下半槽贴轴顶部） `.htl-card__node`（卡片贴轴的小圆点） |
  | 卡片 | `.htl-card` `.htl-card--expanded` `.htl-card__date` `.htl-card__title` `.htl-card__summary` `.htl-card__meta` `.htl-star` |
  | 筛选与导航 | `.htl-filter-bar` `.htl-chip` `.htl-chip--active` `.htl-year-nav` |
  | 浮层 | `.htl-modal` `.htl-toast` `.htl-lightbox` |
  | 状态布尔类 | `.is-flash` `.is-hidden` `.is-locked`（灯箱打开时加在 `body`） `.is-open`（`<768px` 筛选抽屉展开） |

  状态类只表达布尔状态，不得承载业务判断。

### MOD-015 `index.html` + `src/main.ts` + `vite.config.ts`
- **Traces to**: REQ-008 [P0]、REQ-023 [P0]
- **Responsible File(s)**: `index.html`、`src/main.ts`、`vite.config.ts`、`tsconfig.json`、`vitest.config.ts`、`public/data/events.json`
- **Role & Boundaries**: 装配与启动：创建 Port → `new Store` → `loadSeedRaw` → `store.init` → 首屏 render → 绑定 `bind.ts`；配置 `base: './'`。
- **Non-Goals**: 不写业务逻辑；`main.ts` 行数预期 < 80。

### MOD-016 `src/ui/bind.ts` + `src/ui/dom.ts`
- **Traces to**: REQ-001~REQ-025（全部交互入口）、REQ-021 [P1]
- **Responsible File(s)**: `src/ui/bind.ts`、`src/ui/dom.ts`
- **Role & Boundaries**: `bind.ts` 在启动时**一次性**在 `document` 上注册委托监听（click / input / keydown），通过 `closest('[data-action]')` 派发到各 part；`dom.ts` 只提供 `el(tag, attrs, children)`、`text(s)`、`cloneTemplate(id)` 三个构造工具，保证用户文本一律走 `textContent`。
- **Non-Goals**: 不写业务判断；不注册任何 `[data-action]` 之外的监听；不随重绘重新绑定（重绑会导致事件触发多次）。
- **SSOT**: 拥有 `data-action` 动作名清单（即 §4.6 那张表就是它的事件路由表）。
- **Test Strategy**: 手工 —— 连续触发筛选重绘 5 次后点击卡片，`toggleExpanded` 只被调用一次（验证没有重复监听）。

### MOD-017 `src/ui/parts/toast.ts` + `confirm.ts` + `lightbox.ts`
- **Traces to**: REQ-004 [P0]、REQ-018 [P1]
- **Responsible File(s)**: `src/ui/parts/toast.ts`、`src/ui/parts/confirm.ts`、`src/ui/parts/lightbox.ts`
- **Role & Boundaries**: 三个挂在 `#overlay-root` 的独立浮层。`confirm.ts` 提供 `confirm({title, message, confirmText, danger}): Promise<boolean>`；`lightbox.ts` 提供 `openLightbox(src, alt?)`，`Esc`/遮罩关闭、打开时给 `document.body` 加 `.is-locked` 禁止背景滚动；`toast.ts` 提供 `toast(message, level)`，2s 自动消失，同时最多 3 条，超出替换最旧一条。
- **Non-Goals**: 不参与 `#timeline-root` 重绘；不读 store（文案与行为由调用方给）。
- **Test Strategy**: 手工 —— 打开灯箱后滚轮不移动页面；连续弹 5 条 Toast 只留 3 条。
---

## 4. 数据模型与存储 Schema

### 4.1 持久化根对象（`timeline_data_v1` 的值，即导出文件内容）

```ts
export interface TimelineData {
  schemaVersion: 1;
  appVersion: string;        // '0.0.1'
  savedAt: string;           // ISO8601 带本地时区偏移，如 '2026-11-18T21:30:00+08:00'
  categories: string[];      // 去重；预设在前、自定义按加入顺序追加
  ui: UiPrefs;
  events: TimelineEvent[];   // 不保证有序；展示前由 select.buildCards 排序分组
}

export interface UiPrefs { sortOrder: SortOrder; }
export type SortOrder = 'desc' | 'asc';
```

**这就是导出文件本身**：`store.exportJson()` 直接返回 `JSON.stringify(data, null, 2)`，不额外包 envelope（`schemaVersion` 承担版本职责）。导入侧同时接受三种顶层形态：本对象、仅 `{ events: [...] }`、裸数组 `[...]`，后两者按默认值补全 `categories` / `ui` / `savedAt`。

### 4.2 事件

```ts
export interface TimelineEvent {
  id: string;                // ^(evt)_\d{13}_[0-9a-z]{6}$ ，创建后不可变
  date: string;              // 'YYYY-MM-DD'，事件发生日期
  title: string;             // 1..60
  category: string;          // 1..20，须存在于 data.categories
  cover?: string;            // 缺省 = 无图
  links: EventLink[];        // 0..10，缺省写 []
  relatedIds: string[];      // 0..10，缺省写 []，不得含自身
  records: PersonalRecord[]; // 0..20
  createdAt: string;         // ISO8601
  updatedAt: string;         // ISO8601，每次保存刷新
}

export interface EventLink {
  name: string;              // 1..20
  url: string;               // 仅 http: / https:
}
```

### 4.3 记录

```ts
export interface PersonalRecord {
  id: string;                // ^(rec)_\d{13}_[0-9a-z]{6}$
  date: string;              // 'YYYY-MM-DD'，记录日期，与事件日期先后不设限制（REQ Assumptions）
  rating: 1 | 2 | 3 | 4 | 5; // 必填，默认 3
  summary: string;           // 1..80，卡片折叠态展示
  detail?: string;           // 0..2000，缺省 = 无碎碎念
  createdAt: string;
  updatedAt: string;
}
```

> 记录拥有独立 id（用于记录级增删改），但**导入合并仍以事件为单位**（REQ-010），不得据此改成分级合并。

### 4.4 字段级空值语义

| 字段 | 缺省/空值行为 | 是否报错 |
|------|--------------|---------|
| `cover` | 缺省或空串 → 视为无图：展开态不渲染图片区；不计入容量 | 否 |
| `detail` | 缺省或空串 → 不显示碎碎念区块；不参与「可展开」条件 | 否 |
| `links` | 缺省 → 读取时补 `[]` | 否 |
| `relatedIds` | 缺省 → 补 `[]`；含不存在的 id → **保留原值**，渲染时忽略（REQ-011） | 否（导入时记 warn） |
| `records` | 缺省 → 补 `[]`；超过 20 → 裁剪并记 warn | 表单保存时报错 |
| `category` | 空 → `MISSING_REQUIRED`；不在字典 → 导入时自动加入字典并记 warn；表单中不可选到字典外的值 | 视入口 |
| `rating` | 缺省 → 默认 3；越界 → 表单报错 / 导入夹取到边界并记 warn | 视入口 |
| `ui.sortOrder` | 缺省 → `'desc'` | 否 |
| `categories` | 缺省 → `PRESET_CATEGORIES` | 否 |
| `savedAt` | 缺省 → 读取时用当前时间补 | 否 |

**序列化纪律**：`cover` 与 `detail` 为空时**省略该键**（不写 `null`、不写 `""`）；其余字段一律写全。写入前由 `store` 统一 `normalizeData()` 处理，UI 不得自己拼对象。

### 4.5 常量（`core/types.ts` 内，`as const`）

```ts
export const LS_KEY = 'timeline_data_v1';
export const LS_BACKUP_KEY = 'timeline_backup_v1';        // 全量覆盖前快照
export const LS_CORRUPT_PREFIX = 'timeline_data_corrupt_'; // + <epochMs>

export const MAX_RECORDS_PER_EVENT = 20;
export const MAX_LINKS_PER_EVENT = 10;
export const MAX_RELATIONS_PER_EVENT = 10;

export const MAX_COVER_BYTES = 300 * 1024;      // 压缩后单图上限
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 原始文件上限
export const COVER_MAX_EDGE = 1280;
export const JPEG_QUALITIES = [0.8, 0.6] as const;

export const CAPACITY_WARN_BYTES = 4 * 1024 * 1024;   // 4 MiB
export const CAPACITY_BLOCK_BYTES = Math.floor(4.5 * 1024 * 1024); // 4718592

export const TITLE_MAX = 60;
export const SUMMARY_MAX = 80;
export const DETAIL_MAX = 2000;
export const CATEGORY_MAX = 20;
export const LINK_NAME_MAX = 20;

export const SEARCH_DEBOUNCE_MS = 300;
export const FLASH_DURATION_MS = 2000;
export const TOAST_DURATION_MS = 2000;
export const DEFAULT_RATING = 3;

export const PRESET_CATEGORIES = ['游戏发售','AI模型','硬件发布','软件工具','学术论文','影音作品','生活事件','其他'] as const;
export const SCHEMA_VERSION = 1;
```

### 4.6 DOM 契约（UI 层对外暴露的固定钩子）

| 选择器 | 用途 |
|--------|------|
| `#timeline-root` | 时间轴重绘容器（唯一被整体重建的子树） |
| `#overlay-root` | 弹窗/灯箱/Toast 容器（永不随重绘重建） |
| `#filter-bar` / `#year-nav` | 筛选条与年份锚点（render 时局部重建，不属 `#timeline-root`） |
| `[data-focus-key]` | 可聚焦控件唯一键。固定键：`filter.keyword`、`card.<eventId>.toggle`、`year.<YYYY>`、`month.<YYYY>.<MM>`。表单内键必须带序号或 id 以免动态行冲突：`form.event.title`、`form.event.links.<i>.name`、`form.record.<recordId>.summary`、`form.record.new.summary` |
| `[data-action]` | 事件委托的动作名：`toggle-card`、`open-event-form`、`delete-event`、`open-record-form`、`delete-record`、`open-lightbox`、`jump-relation`、`toggle-filter-category`…… |
| `[data-id]` | 动作目标 id（eventId / recordId / year / category 名） |

**事件委托**：所有点击/输入监听绑在 `document` 上（`bind.ts` 一次性注册），通过 `closest('[data-action]')` 派发。重绘不重绑，避免重复监听。

---

## 5. 接口契约

### 5.1 `Store`（MOD-008）完整签名

```ts
export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: Issue[] };

export interface StoreDeps {
  storage: StoragePort;
  clock: ClockPort;
  appVersion: string;
  rand?: () => number;   // 默认 Math.random，测试注入
}

export interface AppState {
  readonly data: TimelineData;
  readonly view: ViewState;
}

export interface ViewState {
  readonly sortOrder: SortOrder;
  readonly filters: FilterState;          // { categories: string[]; ratings: Rating[]; minFour: boolean; keyword: string }
  readonly expandedIds: ReadonlySet<string>;
  readonly flashId: string | null;
  readonly storageMode: 'persistent' | 'memory';
  readonly capacity: { bytes: number; level: 'ok' | 'warn' | 'block'; remainingImages: number };
  readonly lastIssue: Issue | null;       // 最近一次 UI 需要提示的错误
}

export interface InitResult {
  source: 'storage' | 'seed' | 'empty';
  storageMode: 'persistent' | 'memory';
  issues: Issue[];        // 可能含 STORAGE_UNAVAILABLE / DATA_CORRUPT / SEED_INVALID
}

export class Store {
  constructor(deps: StoreDeps);

  init(seedRaw: string | null): InitResult;
  getState(): AppState;
  subscribe(listener: (s: AppState) => void): () => void;

  // ---- 事件 ----
  createEvent(input: EventInput): MutationResult<{ event: TimelineEvent }>;
  updateEvent(input: { eventId: string } & EventPatch): MutationResult<{ event: TimelineEvent }>;
  deleteEvent(eventId: string): MutationResult<{ removedRelations: number }>;

  // ---- 记录 ----
  addRecord(input: { eventId: string } & RecordInput): MutationResult<{ record: PersonalRecord }>;
  updateRecord(input: { eventId: string; recordId: string } & RecordPatch): MutationResult<{ record: PersonalRecord }>;
  deleteRecord(input: { eventId: string; recordId: string }): MutationResult<null>;

  // ---- 关联 / 分类 ----
  setRelations(eventId: string, relatedIds: string[]): MutationResult<{ event: TimelineEvent }>;
  addCategory(name: string): MutationResult<{ categories: string[] }>;

  // ---- 视图（不进持久化，除 sortOrder）----
  setSortOrder(order: SortOrder): void;
  setFilters(patch: Partial<FilterState>): void;
  clearFilters(): void;
  toggleExpanded(eventId: string): void;
  flash(eventId: string | null): void;
  setLastIssue(issue: Issue | null): void;

  // ---- 导入导出 ----
  exportJson(): string;
  previewImport(input: { raw: string; mode: ImportMode }): MutationResult<ImportPreview>;
  applyImport(input: { raw: string; mode: ImportMode }): MutationResult<ImportReport>;
  restoreBackup(): MutationResult<{ restored: boolean }>;
  reloadFromSeed(seedRaw: string | null): MutationResult<{ seeded: boolean }>;
}
```

```ts
export interface EventInput { date: string; title: string; category: string; }
export interface EventPatch {
  date?: string; title?: string; category?: string;
  cover?: string | null;      // null = 清除封面
  links?: EventLink[];        // 整体替换
}
export interface RecordInput { date: string; rating: number; summary: string; detail?: string; }
export interface RecordPatch { date?: string; rating?: number; summary?: string; detail?: string | null; }

export interface ImportPreview {
  mode: ImportMode;
  counts: { added: number; updated: number; skipped: number; errors: number };
  items: ImportPreviewItem[];   // 最多 200 条
  truncated: boolean;
  droppedRecords: number;
  droppedRelations: number;
  affectedEventIds: string[];
  postBytes: number;
  blockedByCapacity: boolean;
  warnings: Issue[];
}
export interface ImportPreviewItem {
  index: number; eventId: string | null; date: string; title: string;
  action: 'added' | 'updated' | 'skipped' | 'error';
  code?: IssueCode; message?: string;
}
export interface ImportReport {
  mode: ImportMode;
  applied: { added: number; updated: number; skipped: number; errors: number };
  backupKey: string | null;   // 'timeline_backup_v1' 或 null（合并模式不备份）
  bytes: number;
}
```

### 5.2 Port 接口（`types.ts` 定义，`ui/platform.ts` 实现）

```ts
export interface StoragePort {
  read(key: string): string | null;
  write(key: string, value: string): void;   // 失败必须 throw（QuotaExceededError 等）
  remove(key: string): void;
  isAvailable(): boolean;
}
export interface ClockPort {
  nowMs(): number;
  nowIso(): string;   // 带本地时区偏移的 ISO8601
}
```

### 5.3 `Issue` 与 `IssueCode`

```ts
export type IssueSeverity = 'error' | 'warning';
export interface Issue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;           // 面向用户的中文文案，来自 ISSUE_MESSAGES
  field?: string;
  eventId?: string;
  recordId?: string;
  index?: number;            // 导入条目序号
}
export type IssueCode =
  | 'MISSING_REQUIRED' | 'INVALID_DATE' | 'RATING_OUT_OF_RANGE'
  | 'TOO_MANY_RECORDS' | 'TOO_MANY_LINKS' | 'TOO_MANY_RELATIONS' | 'SELF_RELATION'
  | 'INVALID_URL_SCHEME' | 'FIELD_TOO_LONG' | 'FIELD_TRUNCATED' | 'RATING_CLAMPED'
  | 'UNKNOWN_CATEGORY_ADDED' | 'ID_REGENERATED' | 'DUPLICATE_ID_REGENERATED'
  | 'JSON_SYNTAX' | 'TOP_LEVEL_SHAPE' | 'EMPTY_FILE' | 'SEED_INVALID' | 'DATA_CORRUPT'
  | 'CAPACITY_EXCEEDED' | 'STORAGE_UNAVAILABLE' | 'STORAGE_WRITE_FAILED' | 'BACKUP_FAILED'
  | 'EVENT_NOT_FOUND' | 'RECORD_NOT_FOUND' | 'CATEGORY_EXISTS'
  | 'FILE_TOO_LARGE' | 'INVALID_FILE_TYPE' | 'COVER_TOO_LARGE';
```

---

## 6. 核心控制流与状态转换

### 6.1 启动 `store.init(seedRaw)`

```
storageMode = storage.isAvailable() ? 'persistent' : 'memory'
issues = []

if storageMode === 'memory':
    data = emptyData(clock)
    issues += STORAGE_UNAVAILABLE
    return { source: 'empty', storageMode, issues }

raw = storage.read(LS_KEY)
if raw !== null:
    parsed = tryParse(raw)                    // 失败返回 null，不抛
    if parsed === null:
        storage.write(LS_CORRUPT_PREFIX + clock.nowMs(), raw)   // 另存损坏原文
        issues += DATA_CORRUPT
        return { source: 'empty', storageMode, issues }
    r = validateTopShape(parsed)
    if r.ok:
        data = normalizeData(r.data)
        return { source: 'storage', storageMode, issues }
    storage.write(LS_CORRUPT_PREFIX + clock.nowMs(), raw)
    issues += DATA_CORRUPT
    return { source: 'empty', storageMode, issues }

if seedRaw !== null:
    parsed = tryParse(seedRaw)
    r = parsed === null ? null : validateTopShape(parsed)
    if r !== null && r.ok:
        data = normalizeData(r.data)
        try storage.write(LS_KEY, serialize(data))
        catch e: storageMode = 'memory'; issues += STORAGE_WRITE_FAILED   // 不阻断启动
        return { source: 'seed', storageMode, issues }
    issues += SEED_INVALID
    return { source: 'empty', storageMode, issues }

data = emptyData(clock)
return { source: 'empty', storageMode, issues }
```

`tryParse` 是 MOD-008 的内部函数：`JSON.parse` 包 try/catch，失败返回 `null`。**Core 内不允许让 `JSON.parse` 的异常冒出去**（Non-Goals 第 3 条）。

**状态转换（存储模式）**

| 当前 | 事件 | 目标 | 守卫 | 非法转换处理 |
|------|------|------|------|-------------|
| persistent | `write()` 抛错 | memory | — | 记 `STORAGE_WRITE_FAILED`，本次变更**回滚**，UI 顶部常驻警示条 |
| memory | 用户手动重试成功 | persistent | `write()` 不抛错 | — |
| persistent | `read()` 返回损坏 | persistent（空数据） | 损坏原文已另存 | 记 `DATA_CORRUPT` |

### 6.2 变更事务（所有写操作的唯一路径）

```
mutate<T>(fn: (draft: TimelineData) => MutationResult<{ data: TimelineData; value: T }>): MutationResult<T>
  snapshot = committed            // 深拷贝（structuredClone）
  r = fn(structuredClone(snapshot))        // draft 是深拷贝，绝不直接改 committed
  if !r.ok: return r                       // 内存未变，无需回滚

  next = normalizeData(r.value.data)        // 序列化纪律（省略空 cover/detail）
  issues = enforceInvariants 产生的 warnings
  json = JSON.stringify(next, null, 2)
  bytes = estimateBytes(json)
  if bytes >= CAPACITY_BLOCK_BYTES && bytes > committedBytes:
        return { ok:false, issues:[CAPACITY_EXCEEDED] }   // 内存未变

  if storageMode === 'persistent':
      try storage.write(LS_KEY, json)
      catch e:
          if isQuotaError(e): return { ok:false, issues:[CAPACITY_EXCEEDED] }
          return { ok:false, issues:[STORAGE_WRITE_FAILED] }

  committed = next
  view.capacity = { bytes, level: capacityState(bytes), remainingImages: ... }
  notify()
  return { ok: true, value: r.value.value, issues: warnings }
```

`serialize(d)` 也是 MOD-008 内部函数：`JSON.stringify(normalizeData(d), null, 2)`，导出与落盘共用同一份实现（保证「导出内容 == 落盘内容」）。`emptyData(clock)` 与 `normalizeData(data)` 同属 MOD-008：前者产出「空事件 + 预设分类 + 默认 ui」的合法根对象；后者负责补默认值、去重 categories、剔除空 `cover`/空 `detail` 键、按 `(date,createdAt,id)` 归一化 records 顺序。所有写路径都必须经过 `normalizeData`。

**硬约束**：**先落盘成功，才更新内存并广播**。禁止先改内存再写（否则写失败会留下未持久化的假状态，违反 REQ-024「不得留下半完成状态」）。

### 6.3 导入

```
previewImport(raw, mode)
  → parseRaw(raw)                     // 空文件 EMPTY_FILE / 语法错 JSON_SYNTAX
  → coerceDocument(doc)               // 顶层形态补全 + 逐条 coerceEvent（宽松）
  → planMerge(committed, incoming, mode)
        merge    : 同 id 比 updatedAt，incoming 更新则整条替换（含 records/link/cover），否则 skipped；本地独有保留
        overwrite: committed.events = incoming.events
                   committed.categories = 去重合并(committed.categories, incoming.categories)
                   // events 整体替换，但分类字典取并集：否则被替换掉的本地事件
                   // 一旦在导出/回滚后再导入，分类名就无处可查
  → enforceInvariants(next)           // 记录 >20 / 关联 >10 裁剪，记录 affected
  → bytes = estimateBytes(serialize(next))
  → preview { counts, items(≤200), truncated, dropped*, affectedEventIds, postBytes, blockedByCapacity: bytes>=BLOCK }

applyImport(raw, mode)
  → 重新 previewImport（不信任上一次预览结果，防数据在预览后被改）
  → 若 blockedByCapacity → CAPACITY_EXCEEDED，中止
  → mode==='overwrite': 先 storage.write(LS_BACKUP_KEY, 当前 json)；写失败 → BACKUP_FAILED，中止
  → 走 §6.2 事务写入
```

### 6.4 渲染与恢复

```
render(state):
  focusKey  = activeElement?.dataset.focusKey ?? null
  selStart/End = (activeElement instanceof HTMLInputElement|HTMLTextAreaElement) ? [selectionStart, selectionEnd] : null
  scrollY   = window.scrollY
  groups    = buildCards(state.data.events, state.view.filters, state.view.sortOrder)
  root.replaceChildren(...groups.map(renderYearGroup))
  renderFilterBar(state)        // 局部重建，保留搜索框焦点
  renderYearNav(state, groups)
  恢复 focusKey → document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus()
  恢复 selStart/End
  window.scrollTo({ top: scrollY, behavior: 'instant' })
  应用 flashId → 目标卡片加 .is-flash，FLASH_DURATION_MS 后由 timer 移除（timer 在 UI 层）
```

### 6.5 关联跳转（REQ-021）

```
点击 relation chip (data-action="jump-relation" data-id="<targetEventId>")
  if 目标在可见结果中:
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        store.flash(targetId)        // 排版后加 .is-flash 2s
  else:
        store.clearFilters()         // 触发重绘
        render 完成后（同一次同步流程内）scrollIntoView + flash
        toast('已清除筛选以显示目标事件')
```

### 6.6 「最新记录」与展开条件（REQ-005 / REQ-014）

```
latestRecord(e) = sortedRecords(e).at(-1) ?? null
sortedRecords(e) 升序三元组: (date, createdAt, id)

isExpandable(e, relationCount) =
     e.records.length > 1
  || e.records.some(r => (r.detail ?? '').trim() !== '')
  || Boolean(e.cover)
  || e.links.length > 0
  || relationCount > 0
```

### 6.7 跨度文案（REQ-020）

```
calendarSpan(a,b):
  lo = min(a,b); hi = max(a,b)
  years = 最大 n 使 addMonthsClamped(lo, 12n) <= hi
  months = 最大 m 使 addMonthsClamped(addMonthsClamped(lo, 12y), m) <= hi
  days = hi - addMonthsClamped(lo, 12y + m)
addMonthsClamped(d, n): 目标月不存在该日 → 收敛到该月最后一天

spanText: 
  dir==='same' → '同一天'
  否则 → `${方向前缀} ${y?y+' 年 ':''}${m?m+' 个月 ':''}${余天文案}（共 ${totalDays} 天）`
    其中 余天文案 = (y||m) ? (d>0 ? `${d} 天` : '') : `${totalDays} 天`
```
验收样例（已核算，见 §8.1）：

| 起 | 止 | 输出 |
|----|----|------|
| 2024-03-02 | 2026-11-18 | `此前 2 年 8 个月 16 天（共 991 天）` |
| 2025-02-15 | 2025-03-15 | `此后 1 个月（共 28 天）` |
| 2026-01-31 | 2026-03-01 | `此后 1 个月 1 天（共 29 天）` |
| 2026-05-10 | 2026-05-10 | `同一天` |

---

## 7. 边界条件与错误策略

### 7.1 错误处理总线

- Core 只返回 `MutationResult`；UI 统一处理：`issues` 中 `severity==='error'` → 字段红字（有 `field`）或 Toast（无 `field`）；`warning` → 汇总进导入明细或一次性 Toast。
- 渲染层永不因为数据异常白屏：`buildCards` 内部对每条事件 try/catch（仅日志到 `lastIssue`），坏数据跳过并计数，页面照常渲染其余部分。

### 7.2 场景 × 处理

| 场景 | 触发 | 处理 | 用户可见文案 |
|------|------|------|-------------|
| localStorage 不可用 | `isAvailable()===false` 或读写抛错 | 进 memory 模式，顶部常驻警示条 | 「当前浏览器禁用了本地存储，刷新后数据会丢失，请立即导出备份」 |
| 写入超配额 | `QuotaExceededError` | 本次变更回滚，弹 `CAPACITY_EXCEEDED` | 「本地存储空间已满，请改用图片链接或删除旧配图」 |
| 水位到 4MiB | 每次写入后判定 | 顶部黄色警示条，不阻断 | 「本地存储已用 X MB，约还能存 N 张配图」 |
| 种子 404 / 网络失败 | `fetch` 失败或非 2xx | 按空数据启动，不阻断新建 | 「未找到初始数据，可从新建或导入开始」 |
| 种子结构非法 | 校验失败 | 忽略种子，记 `SEED_INVALID` | 「初始数据结构有误，已跳过加载」 |
| 本地数据损坏 | 解析失败 | 原文另存 `timeline_data_corrupt_<ms>`，空数据启动 | 「本地数据无法解析，已备份为损坏快照」 |
| 导入非 JSON | 语法错 | 阻断，不进入预览 | 「JSON 格式错误：第 N 行附近」 |
| 导入全部条目错误 | `counts.errors>0 && added+updated===0` | 确认按钮禁用 | 「没有可导入的有效事件（共 E 条错误）」 |
| 导入后超容量 | `postBytes >= 4.5MiB` | 阻断，确认按钮禁用 | 「导入后将超出存储上限，请改用图片链接」 |
| 覆盖前备份失败 | `write(BACKUP)` 抛错 | 中止覆盖 | 「备份失败，已取消覆盖操作」 |
| 覆盖后存在悬空关联 | `relatedIds` 指向不存在 | 允许，渲染忽略，预览记 warn | 「N 条关联指向不存在的事件」 |
| 单图压缩后仍超 300KB | 两次质量重试后 | 拒绝，表单保留 | 「图片过大，请压缩后上传或改用图片链接」 |
| 上传非图片 | `file.type` 不以 `image/` 开头 | 拒绝 | 「请选择图片文件」 |
| 上传超 10MB | `file.size > MAX_UPLOAD_BYTES` | 拒绝，不进入压缩 | 「图片过大（>10MB），请压缩后再试」 |
| 图片加载失败 | `img.onerror` | 显示占位块，卡片其余内容正常 | 块内「图片加载失败」 |
| 关联目标不存在 | 悬空 id | 不渲染该 chip；展开态底部灰字 | 「N 条关联已失效」 |
| 关联满 10 条 | 表单再选 | 阻止并提示 | 「最多关联 10 条事件」 |
| 记录满 20 条 | 表单保存 | 阻止并提示 | 「单条事件最多 20 条记录」 |
| 未保存关闭表单 | 有改动时关闭 | 二次确认 | 「有未保存的修改，确定关闭？」 |
| 删除事件 | 点击删除 | 二次确认（含标题与关联数） | 「确定删除「{title}」？将同时解除 N 处关联」 |
| 筛选结果为空 | 无命中 | 空态 + 清空筛选；年份锚点隐藏 | 「没有符合条件的事件」 |
| 跨标签页并发 | `storage` 事件触发 | **不自动合并**，提示手动重新载入 | 「检测到其他标签页修改了数据」 |
| 剪贴板不可用 | `navigator.clipboard` 抛错或非安全上下文 | 降级为只读 textarea + 全选 | 「已选中全部 JSON，请按 Ctrl+C 复制」 |

### 7.2.1 `IssueCode` → 用户可见文案（`ISSUE_MESSAGES` 的唯一来源）

MOD-001 的 `ISSUE_MESSAGES: Record<IssueCode, string>` **必须逐字取自本表**，不得自创措辞。文案为陈述句、不带感叹号；需要具体数值或行号时由 UI 在 message 后追加，不写进常量。

| `IssueCode` | 严重度 | 用户可见文案 |
|-------------|--------|-------------|
| `MISSING_REQUIRED` | error | 此项为必填 |
| `INVALID_DATE` | error | 请输入有效日期 |
| `RATING_OUT_OF_RANGE` | error | 星级必须在 1 到 5 之间 |
| `TOO_MANY_RECORDS` | error / warning | 单条事件最多 20 条记录 |
| `TOO_MANY_LINKS` | error / warning | 单条事件最多 10 个外部链接 |
| `TOO_MANY_RELATIONS` | error | 最多关联 10 条事件 |
| `SELF_RELATION` | error / warning | 不能关联事件自身 |
| `INVALID_URL_SCHEME` | error / warning | 链接仅支持 http:// 或 https:// |
| `FIELD_TOO_LONG` | error | 内容超出长度上限 |
| `FIELD_TRUNCATED` | warning | 内容超长，已截断保存 |
| `RATING_CLAMPED` | warning | 星级超出范围，已按边界值保存 |
| `UNKNOWN_CATEGORY_ADDED` | warning | 已把新分类加入分类字典 |
| `ID_REGENERATED` | warning | 标识缺失，已重新生成 |
| `DUPLICATE_ID_REGENERATED` | warning | 标识重复，已重新生成 |
| `JSON_SYNTAX` | error | JSON 格式错误，无法解析 |
| `TOP_LEVEL_SHAPE` | error | 数据结构不符合要求 |
| `EMPTY_FILE` | error | 文件内容为空 |
| `SEED_INVALID` | warning | 初始数据结构有误，已跳过加载 |
| `DATA_CORRUPT` | error | 本地数据无法解析，已备份为损坏快照 |
| `CAPACITY_EXCEEDED` | error | 本地存储空间已满，请改用图片链接或删除旧配图 |
| `STORAGE_UNAVAILABLE` | warning | 当前浏览器禁用了本地存储，刷新后数据会丢失，请立即导出备份 |
| `STORAGE_WRITE_FAILED` | error | 保存失败，本次修改已回滚 |
| `BACKUP_FAILED` | error | 备份失败，已取消覆盖操作 |
| `EVENT_NOT_FOUND` | error | 事件不存在或已被删除 |
| `RECORD_NOT_FOUND` | error | 记录不存在或已被删除 |
| `CATEGORY_EXISTS` | error | 该分类已存在 |
| `FILE_TOO_LARGE` | error | 图片过大（超过 10MB），请压缩后再试 |
| `INVALID_FILE_TYPE` | error | 请选择图片文件 |
| `COVER_TOO_LARGE` | error | 图片过大，请压缩后上传或改用图片链接 |

> 「严重度」一列有两个值的，左为表单入口、右为导入入口（见 MOD-004「两套入口的差别」）。
> §7.2 场景表中出现、但不对应任何 `IssueCode` 的文案（水位黄色警示条、种子 404、悬空关联提示、未保存关闭确认、删除确认、空筛选态、跨标签页提示、剪贴板降级）属于 **UI 层自持文案**，不进 `ISSUE_MESSAGES`。

### 7.3 幂等与并发

- 所有写操作走单一 `mutate` 通道，天然串行（JS 单线程 + 同步 localStorage），无并发写冲突。
- `applyImport` 每次重新生成 preview，不复用旧预览，避免「预览后被修改」的错配。
- 重复点击保存：UI 层在按钮上置 `disabled` 直到 `MutationResult` 返回（同步返回，实际只防双击造成的两次事务）。

---

## 8. 测试策略与验证锚点

> Vitest 仅覆盖 `src/core/**`。命名：`tests/<module>.spec.ts`。所有断言必须能直接复制进任务文件作为 pass/fail 依据。

### 8.0 `id.spec.ts`（MOD-003）

> 编号沿用 R1：§8.1~§8.6 已被 18 个任务文件引用，重排会连带失效，故新用例组编 8.0。

| # | Given | When | Then |
|---|-------|------|------|
| I1 | `nowMs=1770000000000`，`rand` 恒返回 `0` | `createId('evt', ...)` | 匹配 `ID_PATTERN`，且以 `evt_1770000000000_000000` 结尾 |
| I2 | `rand` 恒返回 `0.9999999999` | 同上 | 末 6 位为 `zzzzzz`（实现须把随机值夹取到 36^6−1，不得因四舍五入溢出到 7 位） |
| I2b | `rand` 恒返回 `1`（越界注入） | 同上 | 仍为 6 位 `zzzzzz`；产出 7 位即失败 |
| I3 | 任意 | `createId('rec', ...)` | 以 `rec_` 开头 |
| I4 | 固定 `nowMs`，`rand` 为种子化 LCG 生成的确定性序列，连续生成 1000 个 | 去重 | 1000 个全不相同（禁用 `Math.random`，否则是概率断言、会偶发红） |

### 8.1 `date.spec.ts`（MOD-002）

| # | Given | When | Then |
|---|-------|------|------|
| D1 | `'2026-11-18'` | `parseDate` | `{y:2026,m:11,d:18}` |
| D2 | `'2026-02-30'` | `isValidDateString` | `false` |
| D3 | `'2026-2-8'` | `isValidDateString` | `false`（必须零填充） |
| D4 | `'2024-03-02'`,`'2026-11-18'` | `daysBetween` | `991` |
| D5 | 同上 | `calendarSpan` | `{years:2,months:8,days:16,totalDays:991}` |
| D6 | `'2025-02-15'`,`'2025-03-15'` | `calendarSpan` | `{years:0,months:1,days:0,totalDays:28}` |
| D7 | `'2026-01-31'`,`'2026-03-01'` | `calendarSpan` | `{years:0,months:1,days:1,totalDays:29}` |
| D8 | 参数顺序反转（b 早于 a） | `calendarSpan` | 结果与 D5 完全一致（对称） |
| D9 | `'2026-05-10'` 与自身 | `spanText(...,'same')` | `'同一天'` |
| D10 | D5 数据 + `'before'` | `spanText` | 含 `'2 年'`、`'8 个月'`、`'991 天'` |
| D11 | `'2026-03-01'` 与 `'2026-03-20'` | `spanText` | 不含 `'0 个月'`，含 `'19 天'` |
| D12 | 进程时区设为 `America/Los_Angeles` 与 `Asia/Shanghai` 各跑一次 | `daysBetween(D5)` | 两次结果均为 `991` |
| D13 | `'2024-02-29'` 与 `'2025-02-28'` | `calendarSpan` | `{years:1,months:0,days:0}`（闰日收敛） |

### 8.2 `validate.spec.ts`（MOD-004）

| # | Given | When | Then |
|---|-------|------|------|
| V1 | `{date:'2026-11-18',title:'',category:'AI模型'}` | `validateEventInput` | 含 `MISSING_REQUIRED`，`field==='title'` |
| V2 | 同上但 `category:''` | 同上 | 含 `MISSING_REQUIRED`，`field==='category'` |
| V3 | `title` 长度 61 | `validateEventInput` | `issues` 恰含 1 条 `FIELD_TOO_LONG`，`severity==='error'`，`field==='title'` |
| V3b | `summary` 长度 81 | `validateRecordInput` | 含 `FIELD_TOO_LONG`，`field==='summary'` |
| V3c | `detail` 长度 2001 | `validateRecordInput` | 含 `FIELD_TOO_LONG`，`field==='detail'` |
| V4 | `{date:'2026-11-18',rating:0,summary:'x'}` | `validateRecordInput` | 含 `RATING_OUT_OF_RANGE` |
| V5 | `rating:6` | 同上 | 含 `RATING_OUT_OF_RANGE` |
| V6 | `summary` 空 | 同上 | 含 `MISSING_REQUIRED`，`field==='summary'` |
| V7 | `'javascript:alert(1)'` | `validateUrlScheme` | `false` |
| V8 | `'http://a.com'` / `'https://a.com'` | `validateUrlScheme` | `true` |
| V9 | `'data:image/jpeg;base64,AAA'` | `validateCover` | 无 error |
| V10 | `'data:text/html;base64,AAA'` | `validateCover` | 含 `INVALID_URL_SCHEME` |
| V11 | 裸数组 `[{...}, {...}]` | `validateTopShape` | `ok`，`categories` 补预设、`ui.sortOrder==='desc'` |
| V12 | `{'events':[...]}` | `validateTopShape` | `ok` |
| V13 | `'not json'` 交由 store 包装；`{}` | `validateTopShape` | 含 `TOP_LEVEL_SHAPE` |
| V14 | 事件缺 `id` | `coerceEvent` | 生成新 id，issues 含 `ID_REGENERATED` |
| V15 | `rating: 9` | `coerceEvent` 内的 record | 夹取为 5，issues 含 `RATING_CLAMPED` |
| V16 | `title` 100 字 | `coerceEvent` | 截断为 60，issues 含 `FIELD_TRUNCATED` |
| V17 | `category:'新分类'` 不在字典 | `coerceEvent` | 保留分类，issues 含 `UNKNOWN_CATEGORY_ADDED` |
| V18 | `relatedIds:[自身id]` | `coerceEvent` | 剔除自身，issues 含 `SELF_RELATION` |
| V19 | `links:[{name:'a',url:'javascript:x'}]` | `coerceEvent` | 该 link 被丢弃，issues 含 `INVALID_URL_SCHEME` |
| V20 | 21 条 records | `coerceEvent` | 保留 20 条，issues 含 `TOO_MANY_RECORDS` |

### 8.3 `merge.spec.ts`（MOD-005）

| # | Given | When | Then |
|---|-------|------|------|
| M1 | 本地 A(updated 10:00)，导入 A(updated 09:00) | `planMerge('merge')` | `updated:0, skipped:1`，本地 A 未变 |
| M2 | 本地 A(09:00)，导入 A(10:00) 且记录集合不同 | 同上 | `updated:1`，A 的 records **整体**替换为导入方 |
| M3 | 本地 A、B；导入仅 A | 同上 | B 仍在（合并不删除） |
| M4 | 同上，`mode='overwrite'` | 同上 | B 消失 |
| M5 | 导入文件内两条同 id | 同上 | 第二条 `ID` 重建，`counts.added` 只加 1，`warnings` 含 `DUPLICATE_ID_REGENERATED` |
| M6 | 导入后某事件 records 25 条 | `enforceInvariants` | 保留 20 条（按 `(date,createdAt,id)` 升序取前 20），`droppedRecords===5` |
| M7 | 合并后 A 的主动关联 8 + 被动 4 | `enforceInvariants` | 关联总数裁到 10，`droppedRelations===2`，`affectedEventIds` 含 A |
| M8 | 导入条目缺 title | `planMerge` | `counts.errors===1`，该条目 `items[i].action==='error'`，其余正常 |
| M9 | 连续两次同文件导入 | 第二次 `previewImport` | `added:0, updated:0, skipped:N` |
| M10 | 上次导入后本地数据被改，再用旧 preview 提交 | `applyImport` | 重新计算，结果以当次为准（不出现错配） |

### 8.4 `select.spec.ts`（MOD-006）

| # | Given | When | Then |
|---|-------|------|------|
| S1 | 事件 3 条记录 rating 3/4/5，date 递增 | `latestRecord` | rating 5 |
| S2 | 两条记录同 date，先建 rating 2、后建 rating 4 | `latestRecord` | rating 4（比 createdAt） |
| S3 | 事件无记录 | `latestRecord` | `null` |
| S4 | 事件跨 2024/2025/2026 | `buildCards(order:'desc')` | 3 组，年份降序，组内降序 |
| S5 | 同上 `order:'asc'` | 同上 | 组与组内全部反转 |
| S6 | 同日两条事件，createdAt 先后不同 | `buildCards` 任一方向 | 同日内部始终按 createdAt 升序（不随方向翻转） |
| S7 | `filters={categories:['AI模型']}` | `buildCards` | 只剩该分类 |
| S8 | 上述 + `ratings:[5]` | `buildCards` | 两者交集 |
| S9 | 事件无记录 + `minFour:true` | `matchFilters` | `false` |
| S10 | keyword 只出现在某记录 `detail` | `matchFilters` | `true` |
| S11 | `keyword='a b'`，标题只含 a，简评只含 b | `matchFilters` | `true`（各词在合并后的文本中命中） |
| S12 | `keyword='AB'`，标题 `'ab'` | `matchFilters` | `true`（不区分大小写） |
| S13 | `keyword='('` | `matchFilters` | 不抛错，按字面匹配 |
| S14 | A.relatedIds=[B]，B.relatedIds=[] | `buildRelationIndex` + A/B 的 relations | A 与 B 双向都能看到对方 |
| S15 | A 关联 B 且 B 也关联 A | 同上 | 不重复出现，只一条 |
| S16 | A.relatedIds 含不存在 id | 同上 | 该条被忽略，`relationCount` 不计入 |
| S17 | 记录 3 条，全部 detail 为空、无 cover/links/relations | `isExpandable` | `true`（records>1） |
| S18 | 记录 1 条、detail 空、无 cover/links/relations | `isExpandable` | `false` |
| S19 | 记录 1 条 + 有 cover | `isExpandable` | `true` |
| S20 | 关联 A-B，A 日期晚于 B | `relations` 中 A 侧的 dir | `'before'`（对方更早） |

### 8.5 `capacity.spec.ts`（MOD-007）

| # | Given | When | Then |
|---|-------|------|------|
| C1 | `'a'.repeat(100)` | `estimateBytes` | `200` |
| C2 | `4194303` | `capacityState` | `'ok'` |
| C3 | `4194304` | `capacityState` | `'warn'`（闭区间下界计入 warn） |
| C4 | `4718591` | `capacityState` | `'warn'` |
| C5 | `4718592` | `capacityState` | `'block'` |
| C6 | 已用 4MiB、无配图 | `estimateRemainingImages` | `floor((4718592-4194304)/307200) = 1` |
| C7 | 已用 0、含 2 张各 200KB 的图 | `estimateRemainingImages` | 以 200KB 为均值算，`floor(4718592/204800)=23` |

### 8.6 `store.spec.ts`（MOD-008）—— 用内存版 `StoragePort` fake

| # | Given | When | Then |
|---|-------|------|------|
| T1 | 空存储 + `init(null)` | — | `source==='empty'`，事件 0 条 |
| T2 | 存储有合法数据 | `init(seedRaw)` | `source==='storage'`，seed 被忽略 |
| T3 | 空存储 + 合法 seed | `init(seedRaw)` | `source==='seed'`，且 `storage.read(LS_KEY)` 非空 |
| T4 | 空存储 + 非法 seed | `init(seedRaw)` | `source==='empty'`，issues 含 `SEED_INVALID` |
| T5 | 存储中放 `'{bad'` | `init(null)` | `source==='empty'`，issues 含 `DATA_CORRUPT`，且存在以 `timeline_data_corrupt_` 开头的键 |
| T6 | `storage.isAvailable()` 返回 false | `init(null)` | `view.storageMode==='memory'`，issues 含 `STORAGE_UNAVAILABLE` |
| T7 | 正常状态 | `createEvent(合法输入)` | `ok`，事件数 +1，`storage.read` 内容已包含该事件 |
| T8 | 同上 | `createEvent(title 为空)` | `ok===false`，`getState().data.events` 长度不变，存储未变 |
| T9 | fake storage `write` 抛 `QuotaExceededError` | `createEvent(合法)` | `ok===false`，issues 含 `CAPACITY_EXCEEDED`，**内存与存储均未变** |
| T10 | 已存在 2 条其他事件关联 A | `deleteEvent(A)` | `value.removedRelations===2`，其他事件的 `relatedIds` 不再含 A |
| T11 | 事件已有 20 条记录 | `addRecord` | `ok===false`，issues 含 `TOO_MANY_RECORDS` |
| T12 | `setRelations(A,[A])` | — | `ok===false`，issues 含 `SELF_RELATION` |
| T13 | A 的关联合计（主动+被动，均不含 B）已为 10 条 | `setRelations(B, [...B的原有关联, A])` | `ok===false`，issues 含 `TOO_MANY_RELATIONS`；A 的结果关联数仍为 10 |
| T14 | 正常数据 | `exportJson()` | 可被 `JSON.parse`，`events` 长度一致，缩进为 2 |
| T15 | 存储有数据 | `previewImport(mode:'overwrite')` | `backupKey` 未创建（只在 apply 时备份）；`applyImport` 后 `storage.read(LS_BACKUP_KEY)` 非空 |
| T16 | 导入后字节数 ≥ 4718592 | `applyImport` | `ok===false`，issues 含 `CAPACITY_EXCEEDED`，数据未变 |
| T17 | 备份 `write` 抛错 | `applyImport(overwrite)` | `ok===false`，issues 含 `BACKUP_FAILED`，数据未变 |
| T18 | 订阅后执行任意写操作 | `subscribe` 计数 | 监听器被调用 1 次（不重复广播） |
| T19 | `setSortOrder('asc')` | 再 `init`（模拟重开） | 新 state 的 `sortOrder==='asc'`（持久化到 `ui.sortOrder`） |
| T20 | `setFilters(...)` | 再 `init` | 新 state 的 filters 为默认空（视图筛选不持久化） |
| T21 | 事件 cover 为空串 | 任意写操作后读 `storage.read` | 序列化结果中**不含** `"cover"` 键 |
| T22 | 记录的 detail 为 `''` | 同上 | 不含 `"detail"` 键 |

### 8.7 手工验收（UI 层，按 AC 逐条走）
覆盖：AC-01~AC-25 中依赖 DOM 的部分——表单校验展示、二次确认、展开/折叠、灯箱、年份锚点平滑滚动与高亮、关联跳转与 flash、焦点与滚动恢复（§2.3）、Toast 与灯箱的滚动锁定、子路径部署（AC-23）。

**焦点恢复专项**：在搜索框输入「模型」→ 等 300ms 触发筛选重绘 → 断言光标仍在输入框内且 `selectionStart` 未跳位。这是全量重绘方案唯一的系统性风险点，必须手工验。

---

## 9. 需求映射矩阵

| REQ | 优先级 | 覆盖模块 |
|-----|--------|---------|
| REQ-001 两层结构与 20 条上限 | P0 | 001, 008, 011 |
| REQ-002 事件必填 | P0 | 004, 008, 011 |
| REQ-003 记录必填 | P0 | 004, 008, 011 |
| REQ-004 增改删 + 二次确认 + 关联解除 | P0 | 008, 011, 010 |
| REQ-005 星级口径 + 同日判定 + 未评分 | P0 | 006, 010 |
| REQ-006 分类字典 | P2 | 004, 008, 011 |
| REQ-007 即时持久化 | P0 | 008, 009 |
| REQ-008 初始数据一次性种子 | P0 | 008, 009, 015 |
| REQ-009 导出 | P0 | 008, 012, 009 |
| REQ-010 导入两种模式 | P0 | 005, 008, 012 |
| REQ-011 导入预览与不变量 | P0 | 004, 005, 008, 012 |
| REQ-012 年份分组与排序 | P0 | 006, 010 |
| REQ-013 折叠态六项 | P0 | 006, 010 |
| REQ-014 展开态与展开条件 | P0 | 006, 010 |
| REQ-015 三类筛选 | P0 | 006, 013 |
| REQ-016 搜索口径 | P1 | 006, 013 |
| REQ-017 年份锚点 + 回到顶部 | P1 | 006, 013 |
| REQ-018 灯箱 | P1 | 010, 017 |
| REQ-019 关联双向与上限 | P0 | 005, 006, 008, 011 |
| REQ-020 跨度与日历口径 | P0 | 002, 006 |
| REQ-021 关联跳转与高亮 | P1 | 010, 013, 016 |
| REQ-022 主题可替换 | P0 | 014 |
| REQ-023 静态部署与子路径 | P0 | 015 |
| REQ-024 单图上限与总水位 | P1 | 007, 008, 009 |
| REQ-025 协议白名单与纯文本 | P1 | 004, 010 |

---

## 10. Open Technical Questions / Assumptions

### 10.1 尚待实测确定（不阻塞开工）

1. `estimateBytes = json.length * 2` 在 Chrome/Firefox/Safari 下与真实配额计数是否一致。[取值为估算口径，用于水位预警；最终以 `write()` 是否抛错为准]
2. Safari 隐私模式下 `localStorage` 的抛错形态（可能在 `read` 而非 `write` 抛）。实现上两处都包 try/catch。
3. 300 条事件 + 20 张远程图时的重绘耗时实测值。若 >100ms，优先做「只重建受影响的年份组」而非引入虚拟滚动。
4. `public/data/events.json` 的种子示例内容（建议 2 条：1 条含外链封面、1 条与前者关联）由实现时补齐，用于演示 REQ-014/019/020。

### 10.2 本设计内的显式假设

- 所有文件路径均为**新建**，无需与既有代码对齐（已核验目录为空）。
- `savedAt` 与 `updatedAt` 使用本地时区偏移的 ISO 字符串；字典序比较与时间序一致（同偏移下成立）。跨时区的手工编辑可能导致 `updatedAt` 比较偏差，接受该代价。
- 弹窗与 Toast 不进 store 的 viewState，由 UI 模块自持；因此刷新后不会恢复未完成的表单（符合 REQ Assumptions「展开/折叠状态不跨会话保留」的同类取舍）。
- 不做 `readonly` 只读模式：需求文档已因「私人工具」定位移除该能力，设计不预留入口。