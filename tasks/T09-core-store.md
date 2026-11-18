---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T09 Core Store（状态容器与事务）

- **对应模块**: MOD-008
- **依赖**: T02、T03、T04、T05、T06、T07、T08（全部 Core 前置）
- **可并行**: 否（Core 的收口任务，最重）

## 目标
唯一可变状态容器：init、事务式变更（**先落盘成功再提交内存**）、订阅广播、视图状态、导入导出编排、备份恢复。

## 允许改动的文件
```
src/core/store.ts
tests/store.spec.ts
```

## 接口
§5.1 的 `Store` 类完整签名 + `emptyData` / `normalizeData` / `serialize` / `tryParse` 四个内部函数。

## 三条不可违反的规则
1. **先落盘、后提交**：`mutate` 里必须 `storage.write()` 成功之后才更新 `committed` 并 `notify()`。写失败 → 内存与存储都不变 → 返回 error。这是 REQ-024「不得留下半完成状态」的唯一实现方式。
2. **draft 是深拷贝**：`mutate` 传入 `structuredClone(snapshot)`，绝不允许直接改 `committed`。
3. **广播一次**：一次事务只 `notify()` 一次；`setFilters` 等纯视图变更也要广播（UI 靠它重绘），但不写存储（`sortOrder` 除外，它持久化进 `data.ui`）。

## 其它细节
- `init` 严格照 §6.1 的伪代码，含 `tryParse` 包裹、损坏原文另存 `timeline_data_corrupt_<ms>`、seed 写失败降级 memory。
- `deleteEvent` 必须清理其他事件 `relatedIds` 中的该 id，并返回 `removedRelations`。
- `setRelations` 校验：不可含自身、合计（主动+被动）≤10，超限返回 `TOO_MANY_RELATIONS`。
- `addRecord` 校验 ≤20 条，超限 `TOO_MANY_RECORDS`。
- `exportJson()` 与落盘共用 `serialize()`：**导出内容必须与 `storage.read(LS_KEY)` 逐字节相同**。
- `applyImport` 必须重新生成 preview（不复用调用方之前的预览），overwrite 前先写 `LS_BACKUP_KEY`，写失败返回 `BACKUP_FAILED` 且不改数据。
- `restoreBackup()` 从 `LS_BACKUP_KEY` 恢复并走一次事务；无备份返回 `ok:true, value:{restored:false}`。

## 严禁
- 不 import 任何 `ui/**`。
- 不使用 `setTimeout` / `requestAnimationFrame`。
- 不把异常抛出模块（`JSON.parse` 用 `tryParse` 包住）。

## 验收
§8.6 的 T1~T22 全部通过，使用**内存版 StoragePort fake**（可注入抛 `QuotaExceededError` 的变体）。重点：T9（写失败后内存与存储均未变）、T15/T17（备份）、T21/T22（空 cover/detail 不落键）、T18（只广播一次）。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T09 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §5.1 Store 完整签名、§6.1 启动流程、§6.2 变更事务、§6.3 导入、§8.6 的 T1~T22。前置的 core/date|id|validate|merge|select|capacity 已实现，直接 import。proposal.md 只需看 REQ-007/008/009/010/024。

任务：实现 src/core/store.ts 与 tests/store.spec.ts。

三条不可违反的规则：
1. 先落盘、后提交。storage.write 成功之后才更新内存并广播；写失败则内存与存储都不变并返回 error。这是 REQ-024 的唯一实现方式。
2. mutate 的 draft 必须是 structuredClone，绝不允许直接改 committed。
3. 一次事务只 notify 一次。纯视图变更（setFilters / toggleExpanded / flash）也要广播，但不写存储；sortOrder 例外，它要持久化进 data.ui。

其它硬要求：
- init 严格按照 §6.1 伪代码，JSON.parse 必须用 tryParse 包住，损坏原文另存 timeline_data_corrupt_<毫秒>。
- deleteEvent 要清理其他事件 relatedIds 里的该 id 并返回 removedRelations。
- 导出与落盘共用 serialize()，两者输出必须逐字节相同。
- applyImport 必须重新生成 preview，overwrite 前先备份，备份失败返回 BACKUP_FAILED 且不改数据。

严禁：import 任何 ui/ 下的文件；使用定时器；让 JSON.parse 的异常冒到模块外。

完成标准：T1~T22 全部通过（测试里自己写内存版 StoragePort fake，含会抛 QuotaExceededError 的变体）；npm run typecheck 无错误。贴出真实测试输出。
```
