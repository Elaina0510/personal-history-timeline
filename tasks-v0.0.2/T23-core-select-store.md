---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T23 core 派生与状态 —— 删分类筛选、删展开态

- **对应模块**: MOD-006 `select.ts` + MOD-008 `store.ts`
- **依赖**: T21
- **可并行**: 与 T22 并行。两者必须都完成，W1 窗口才关闭

## 目标

`CardView` 不再有 `expandable`（条目恒定是「日期 + 标题」，没有展开这个概念）；筛选不再有分类维度；store 不再持有展开态、不再有分类写路径；旧数据的分类字段在归一化时被剥掉。

## 允许改动的文件

```
src/core/select.ts
src/core/store.ts
tests/select.spec.ts
tests/store.spec.ts
tests/capacity.spec.ts
```

## 要改的地方

### `select.ts`

| 位置（当前代码） | 动作 |
|------|------|
| `CardView.expandable`（约 31 行） | 删字段 |
| `isExpandable()`（约 126 行） | 整函数删除 |
| `buildCards` 里 `const expandable = isExpandable(...)` 与结果对象里的 `expandable`（约 331、340 行） | 删 |
| `matchFilters` 的「1. 分类筛选」段（约 203-208 行）与函数头注释里的「1. 分类…」 | 删 |
| 文件头注释里提分类/展开的句子 | 删 |

**不要动**：`sortedRecords`、`latestRecord`、`compareEvents`、`buildRelationIndex`、`allYears`、`spanText` 的调用方式、`YearGroup` / `MonthGroup` 结构。

### `store.ts`

| 位置（当前代码，以实际为准） | 动作 |
|------|------|
| `DEFAULT_FILTERS`（约 89 行） | 删 `categories: []` |
| `emptyRoot()`（约 173-190 行） | 删 `categories: [...PRESET_CATEGORIES]`，注释里的「预设分类」删掉 |
| `normalizeData()`（约 198-218 行） | 删 `categories` 的去重与默认填充；改为 `delete raw.categories` |
| `normalizeData()` 事件归一（约 262 行 `category: e.category \|\| ''`） | 删该键，并对事件对象 `delete (e as Record<string, unknown>).category`，保证 `Object.hasOwn(e,'category') === false` |
| `createEvent`（约 547-557 行） | 删 `const category = input.category.trim()`、分类入字典那段、事件对象上的 `category` |
| `updateEvent`（约 599-604、647-653 行） | 删 `input.category` 的两段校验与赋值 |
| `addCategory()`（约 1004-1035 行） | 整方法删除 |
| `toggleExpanded()`（约 1073-1086 行） | 整方法删除 |
| `view` 初始化（约 325 行 `expandedIds: new Set<string>()`） | 删 |
| `deleteEvent` 的展开态清理（约 683-687 行） | 删这两段 |
| 文件里 `categories: []` 的其它残留（约 89 行附近） | 删 |

**不要动**：`mutate` 事务容器（先落盘后提交）、容量水位、导入导出、种子加载、`flash`、`setFilters` / `clearFilters` / `setSortOrder` 的其余逻辑。

### 测试

**删除**：
- `select.spec.ts`：`S7`（分类筛选）、`S17` / `S18` / `S19`（isExpandable）、以及 `isExpandable 支持 links 与 relationCount 触发` 那一组
- `store.spec.ts`：所有 `addCategory` 用例；fixture 里每一处 `category: '…'`（实测 32 处命中）。**注意**：`store.spec.ts` 里没有 `toggleExpanded` / `expandedIds` 的断言（`grep` 实测 0 命中），不用去找；真正需要跟着删的是 `src/core/store.ts` 里的实现。
- `capacity.spec.ts`：fixture 里 2 处 `category` 字段

**新增（detailed-design-v0.0.2 §8.2，逐字照抄）**：
- `T-A1`：预置 localStorage 为 V0.0.1 数据（根带 `categories` + 2 条事件各带 `category`）→ `init(null)` → 事件数 2、`Object.hasOwn(data,'categories') === false`、每个事件 `Object.hasOwn(e,'category') === false`
- `T-A2`：`createEvent({date,title})` 成功且结果事件无 `category` 键；`exportJson()` 的字符串不含子串 `"category"`
- `T-A3`：`setFilters({ ratings: [5] })` 不抛错，`view.filters` 无 `categories` 键
- `S-A1`：2 条事件（星级 3 / 5）→ `buildCards(events, {ratings:[5],minFour:false,keyword:''}, 'desc')` 只剩 5 星那条；返回的 `CardView` 上 `Object.hasOwn(view,'expandable') === false`

## 严禁

- **不许把 `category` 设成 `''` 或 `undefined`**。必须 `delete`，`Object.hasOwn` 必须为 false。
- 不许保留 `isExpandable` 给别处调用（全项目只有 `select.ts` 内部用）。
- 不许把「展开态」改名为「详情态」塞回 `ViewState`——详情状态归 detailModal 的模块级变量。
- 不许改 `mutate` 的落盘顺序、不许动容量与导入逻辑。
- 不许动 `ui/` 下任何文件。

## 验收清单

1. `npm run typecheck` 零错误（此时 T22 也应已完成；若 T22 未完成，允许 validate/merge 的报错仍在，但 `select.ts`、`store.ts` 自身不得有报错）。
2. `npm run test -- tests/select.spec.ts tests/store.spec.ts tests/capacity.spec.ts` 全绿，贴真实输出。
3. `grep -n "categor\|expandable\|expandedIds\|toggleExpanded\|addCategory" src/core/select.ts src/core/store.ts` 返回 0 行。
4. 新增 4 条用例单独跑也绿。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T23 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

前置：T21 已完成（types.ts 里 category / categories / expandedIds / CATEGORY_MAX / PRESET_CATEGORIES 都已删除）。当前 typecheck 是红的，你的任务是把 select.ts 与 store.ts 修好。另一个执行者正在并行改 validate.ts 与 merge.ts，不要碰那两个文件。

先读（只读）：
- detailed-design-v0.0.2.md 的 §4.3/§4.4/§4.7（FilterState、ViewState、CardView）、§5.1（Store 方法变化）、§8.2（新增用例）
- proposal-v0.0.2.md 的 REQ-005、REQ-015、REQ-029

任务：改 src/core/select.ts、src/core/store.ts 及其对应测试。

硬性要求：
1. CardView 删掉 expandable；isExpandable 整个函数删掉；buildCards 里不再算它。
2. matchFilters 不再有分类维度，只剩星级与关键词，两者仍是 AND。
3. store 删掉 addCategory、toggleExpanded、ViewState 里的 expandedIds、deleteEvent 里的展开态清理。
4. 归一化（normalizeData）时，旧数据根上的 categories 与每个事件上的 category 必须用 delete 剥掉，剥完 Object.hasOwn 必须是 false。绝对不许写成 '' 或 undefined。
5. 新写入的事件不得带 category 键，exportJson() 的结果里不能出现 "category" 这个子串。
6. 测试：删 S7/S17/S18/S19、isExpandable 组、所有 addCategory 用例与 fixture 里的 category（store.spec 里没有 toggleExpanded/expandedIds 断言，别找不到就卡住）；新增 T-A1、T-A2、T-A3、S-A1（给定内容见设计 §8.2；S-A1 里 buildCards 的三个入参照本任务正文写）。

严禁：
- 用 ''/undefined 代替 delete
- 保留 isExpandable 给别处用
- 把「展开态」改名塞回 ViewState（详情状态属于 detailModal，不进 store）
- 改 mutate 的落盘顺序、容量水位、导入导出逻辑
- 改 ui/ 下任何文件，也不要碰 validate.ts / merge.ts

完成标准：
- npm run test -- tests/select.spec.ts tests/store.spec.ts tests/capacity.spec.ts 全绿，贴真实输出
- npm run typecheck 输出里 select.ts / store.ts 自身零报错，贴输出
- grep -n "categor\|expandable\|expandedIds\|toggleExpanded\|addCategory" src/core/select.ts src/core/store.ts 返回 0 行，贴输出
- 不要自述「已完成」
```
