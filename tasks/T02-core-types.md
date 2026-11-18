---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T02 Core 类型与常量（SSOT）

- **对应模块**: MOD-001
- **依赖**: T01
- **可并行**: 是（与 T01 之后的所有任务并行，但**其他人都在等它**，优先完成）

## 目标
把全部类型、常量、IssueCode 枚举一次性定义完。这是全项目唯一的类型真相源，别的模块只许 import，不许另起一套。

## 允许改动的文件
```
src/core/types.ts
```

## 必须包含（逐项照抄 detailed-design.md）
- §4.1 `TimelineData`、`UiPrefs`、`SortOrder`
- §4.2 `TimelineEvent`、`EventLink`
- §4.3 `PersonalRecord`、`Rating`
- §4.5 全部常量（`LS_KEY`、上限、阈值、`PRESET_CATEGORIES`、`SCHEMA_VERSION` 等）
- §5.1 `ViewState`、`AppState`、`FilterState`、`MutationResult<T>`、`EventInput`、`EventPatch`、`RecordInput`、`RecordPatch`、`ImportMode`、`ImportPreview`、`ImportPreviewItem`、`ImportReport`、`InitResult`
- §5.2 `StoragePort`、`ClockPort`
- §5.3 `Issue`、`IssueSeverity`、`IssueCode`（**含 R1 新增的 `FIELD_TOO_LONG`**）、`ISSUE_MESSAGES: Record<IssueCode, string>`

## 严禁
- 不写任何函数、不写运行时逻辑、不写默认值工厂。
- 不写 `any`、不写索引签名 `[k: string]: unknown`。

## 关键细节
- `Rating` 必须是联合字面量 `1|2|3|4|5`，不是 `number`。
- `ISSUE_MESSAGES` 的 29 条文案逐字照抄 detailed-design.md §7.2.1 映射表，不得自创措辞（R2 已补齐全部 code，不再有需要自拟的条目）。
- 所有常量用 `export const X = ... as const` 或在联合类型上标注，保持字面量类型不丢失。

## 完成标准
- `npm run typecheck` 无错误。
- 其他模块 `import type { TimelineEvent } from './types'` 能直接编译通过。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T02 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §4.1~§4.5、§5.1~§5.3、§7.2.1（文案映射表），以及 proposal.md 全文（了解字段的业务含义）。

任务：只写 src/core/types.ts 一个文件，把设计文档里定义的全部类型、常量、IssueCode、ISSUE_MESSAGES 一次性定义完整。

硬性要求：
1. Rating 必须是 1|2|3|4|5 的联合字面量，不能是 number。
2. 常量值必须与 §4.5 逐字一致（4MB=4194304、4.5MB=4718592、单图 300KB=307200 等）。
3. IssueCode 必须包含 FIELD_TOO_LONG（表单超长 error）与 FIELD_TRUNCATED（导入超长 warning）两个不同 code。
4. ISSUE_MESSAGES 的 29 条文案逐字照抄 §7.2.1 的映射表，一条都不许自创；严重度按该表的 error / warning 标注。

严禁：写任何函数或运行时逻辑、使用 any、另建与其他模块重复的类型。

完成标准：npm run typecheck 通过。ISSUE_MESSAGES 必须声明为 Record<IssueCode, string>——少任何一个 code 的键 typecheck 就会报错，覆盖率由类型系统保证，不必手工数数。
```
