---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T08 Core 合并与不变量裁剪

- **对应模块**: MOD-005
- **依赖**: T02、T03、T04、T06
- **可并行**: 否（等 T06）

## 目标
导入的两种模式（合并去重 / 全量覆盖）+ 不变量裁剪（记录 ≤20、关联 ≤10）+ 差异预览。REQ-010、REQ-011 的核心。

## 允许改动的文件
```
src/core/merge.ts
tests/merge.spec.ts
```

## 接口
```ts
export type ImportMode = 'merge' | 'overwrite';
export function planMerge(local: TimelineData, incoming: TimelineData, mode: ImportMode):
  { next: TimelineData; preview: ImportPreview };
export function enforceInvariants(data: TimelineData):
  { droppedRecords: number; droppedRelations: number; affectedEventIds: string[] };
```

## 规则
1. **合并单位是事件**：同 id 比 `updatedAt`（ISO 字符串字典序），incoming 更新则**整条替换（含 records / links / cover / category）**，否则 skipped。**绝不做记录级独立合并**。
2. 缺失 `updatedAt` 视为最旧。
3. 合并模式不删除本地独有条目；覆盖模式完全替换 `events`，但 `categories` 取并集（保留本地自定义分类）。
4. **裁剪顺序**：保留 `(date, createdAt, id)` 升序靠前者，丢弃靠后者。记录与关联分别裁到 20 / 10。
5. 关联数按「主动 + 被动合计」计算，裁剪可能改动**其他事件**的 `relatedIds`，`affectedEventIds` 必须如实列出受影响者。
6. `preview.counts` 四项计数必须与 `items` 一一对应；`items` 最多 200 条，超出置 `truncated=true`。

## 严禁
- 不写 storage、不做备份（属 store）。
- 不修改入参 `local` / `incoming`（用深拷贝）。
- 不抛异常。

## 验收
§8.3 的 M1~M10 全部通过。其中 M7 必须验证：裁剪确实改了**另一条**事件的关联数组。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T08 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-005、§5.1 ImportPreview 定义、§6.3 导入流程、§8.3 的 M1~M10。

任务：实现 src/core/merge.ts 与 tests/merge.spec.ts，导出 planMerge 与 enforceInvariants。

硬性要求：
1. 合并的最小单位是事件：同 id 比 updatedAt，胜出方整条替换落败方，records 集合整体替换，绝不做记录级合并。
2. 合并模式保留本地独有条目；覆盖模式 events 整体替换，但 categories 取并集而不是直接替换（§6.3 已写明）。
3. 裁剪保留 (date, createdAt, id) 升序靠前的，记录裁到 20、关联裁到 10（主动+被动合计）。
4. 裁剪可能改动其他事件的 relatedIds，affectedEventIds 必须如实列出。
5. preview.items 最多 200 条，超过置 truncated=true；四项计数与 items 必须对得上。
6. 深拷贝后再改，不得修改入参，不得抛异常。

严禁：写 storage、做备份、修改入参、抛异常。

完成标准：M1~M10 全部通过，其中 M7 要明确断言另一条事件的关联数组被改；npm run typecheck 无错误。贴出真实测试输出。
```
