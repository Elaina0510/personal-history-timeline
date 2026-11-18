---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T05 Core 容量估算

- **对应模块**: MOD-007
- **依赖**: T02
- **可并行**: 是

## 目标
估算序列化后的占用字节、判定水位、估算还能存几张配图。REQ-024 的「总水位」逻辑靠它。

## 允许改动的文件
```
src/core/capacity.ts
tests/capacity.spec.ts
```

## 接口
```ts
export function estimateBytes(json: string): number;                 // json.length * 2
export function capacityState(bytes: number): 'ok' | 'warn' | 'block';
export function estimateRemainingImages(data: TimelineData, usedBytes: number): number;
```

## 口径（与 §4.5 常量对齐）
- `estimateBytes = json.length * 2`（localStorage 按 UTF-16 计，注释里写明这是估算口径，以 `write()` 抛错为最终准绳）。
- `capacityState`：`< CAPACITY_WARN_BYTES(4194304)` → `'ok'`；`>= 4MiB 且 < CAPACITY_BLOCK_BYTES(4718592)` → `'warn'`；`>= 4718592` → `'block'`。**边界值计入更严重的一档**。
- `estimateRemainingImages`：取 `data` 中所有 `cover` 以 `data:` 开头者的平均字节数作为均值；无此类配图时用 `MAX_COVER_BYTES`(307200)；返回 `Math.max(0, Math.floor((CAPACITY_BLOCK_BYTES - usedBytes) / avg))`。

## 严禁
- 不读 `navigator.storage.estimate()`、不做真实配额探测、不做异步。
- 不自行定义阈值字面量（必须 import 常量）。

## 验收
detailed-design.md §8.5 的 C1~C7 全部通过。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T05 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-007、§4.5 常量、§8.5 的 C1~C7。

任务：实现 src/core/capacity.ts 与 tests/capacity.spec.ts，三个导出函数签名严格照文档。

硬性要求：estimateBytes 用 json.length * 2；capacityState 的边界值（4194304 与 4718592）计入更严重的一档；estimateRemainingImages 的均值取值：data 中存在以 data: 开头的内嵌配图时，取这些图的平均字节数（C7 考的就是这条）；一张都没有时才用 307200。结果不小于 0。所有阈值必须从 types.ts 导入，不得写字面量。

严禁：使用 navigator.storage.estimate()；任何异步 API；自行定义阈值。

完成标准：C1~C7 七条用例全部通过；npm run typecheck 无错误。贴出真实测试输出。
```
