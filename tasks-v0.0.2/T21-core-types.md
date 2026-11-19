---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T21 core/types.ts —— 字段级删减（SSOT）

- **对应模块**: MOD-001
- **依赖**: 无
- **可并行**: 否。它是 W1 原子窗口的第一步，后面 T22/T23 全部依赖它
- **本任务不产生可运行的绿树**：交付后 `npm run typecheck` 必然报一片错，这是预期

## 目标

把分类字段、分类常量、展开态字段从全项目唯一的类型真相源里删掉。TypeScript 的类型完备性会把这个改动传导到下游所有模块，这是本版最强的回归护栏。

## 允许改动的文件

```
src/core/types.ts
```

其它文件一个都不许碰。下游的红由 T22/T23 收口。

## 要删的东西（逐项核对 detailed-design-v0.0.2 §4）

| 位置 | 删除内容 |
|------|---------|
| `TimelineData` | `categories: string[]` |
| `TimelineEvent` | `category: string` |
| `EventInput` | `category: string` |
| `EventPatch` | `category?: string` |
| `FilterState` | `categories: string[]` |
| `ViewState` | `expandedIds: ReadonlySet<string>` |
| 常量区 | `CATEGORY_MAX`、`PRESET_CATEGORIES` |
| `IssueCode` | `UNKNOWN_CATEGORY_ADDED`、`CATEGORY_EXISTS` |
| `ISSUE_MESSAGES` | 上述两个 code 对应的两行文案 |

## 必须保留

- `schemaVersion: 1`（不升版本，不写迁移分支）
- `LS_KEY = 'timeline_data_v1'`、`LS_BACKUP_KEY`、`LS_CORRUPT_PREFIX`
- `TimelineData.appVersion` 字段本身（值由装配层传入，T30 改成 `'0.0.2'`）
- 其余所有类型、常量、Port 接口、ImportPreview / ImportReport 结构

## 严禁

- **不许留 `category?: string`** 之类的可选兼容字段。删就是删，下游的编译错误正是这个任务的产出之一。
- 不许加 `layout: 'horizontal' | 'vertical'`、`openDetailId` 这类新字段。详情打开状态属于 detailModal 的模块级状态，不进 `ViewState`。
- 不许改注释里仍在描述分类的语句（文件头「包含全部类型…」这类总述保留，但逐字段注释要跟着字段一起删）。
- 不许动 `src/core/` 以外任何文件。

## 验收清单

1. `grep -n "categor\|CATEGORY\|expandedIds" src/core/types.ts` 返回 0 行。
2. `npm run typecheck` 的真实输出里，**`src/core/types.ts` 自身不得出现在报错列表里**（出现说明语法错或缺类型，没做完）。
3. **不要**断言「报错只来自 core 与 ui」——`tsconfig.json` 的 `include` 含 `tests`，删字段后 `tests/*.spec.ts` 同样会报错，这是正常的。报错数只会变多。
4. 不得为了减少报错去改下游或被删字段以外的内容。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T21 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

先读（只读，不要修改）：
- detailed-design-v0.0.2.md 的 §4（数据模型，字段级）与 §1.2（Non-Goals）
- proposal-v0.0.2.md 的 REQ-029

任务：只改 src/core/types.ts，删掉分类与展开态相关的字段、常量、IssueCode。

要删的（逐项）：
1. TimelineData.categories
2. TimelineEvent.category
3. EventInput.category、EventPatch.category
4. FilterState.categories
5. ViewState.expandedIds
6. 常量 CATEGORY_MAX、PRESET_CATEGORIES
7. IssueCode 里的 UNKNOWN_CATEGORY_ADDED、CATEGORY_EXISTS，以及 ISSUE_MESSAGES 里对应的两行

硬性要求：
1. 删就是删，绝对不许留 category?: string 之类的可选兼容字段。
2. schemaVersion 保持 1，不许升版本、不许写迁移分支。
3. LS_KEY 仍是 timeline_data_v1，不许改。
4. 不许新增任何字段（尤其不许把详情打开状态加进 ViewState）。
5. ISSUE_MESSAGES 的类型是 Record<IssueCode, string>，删 code 时必须同步删文案，否则类型不完整。

预期结果：改完之后 npm run typecheck 会报一片错，报错来自 select/validate/merge/store/render/card/filterBar/formModal，以及 tests/ 下的 spec（tsconfig 的 include 含 tests）。这是预期行为，不要为了让它变绿去改下游文件，也不要加兼容字段。这个任务的范围只有 types.ts 一个文件。

完成标准：
- grep -n "categor\|CATEGORY\|expandedIds" src/core/types.ts 返回 0 行，贴真实输出。
- 贴 npm run typecheck 的真实输出，并确认 src/core/types.ts 自己不在报错列表里（其它文件与 tests/ 报错是正常的）。
- 不要自述「已完成」。
```
