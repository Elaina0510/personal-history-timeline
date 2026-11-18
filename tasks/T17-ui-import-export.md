---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T17 导入导出弹窗

- **对应模块**: MOD-012
- **依赖**: T08、T09、T10、T13
- **可并行**: 是（与 T16 并行）

## 目标
导入（文件/粘贴、两种模式、预览计数与明细、确认执行）、导出（下载/复制）、从备份恢复入口。REQ-009、REQ-010、REQ-011 的交互落点。

## 允许改动的文件
```
src/ui/parts/importExport.ts
```

## 接口
```ts
export function openImportModal(): void;
export function openExportModal(): void;
export function openRestoreBackupConfirm(): void;
```

## 实现要点
1. 来源页签：上传文件（`accept=".json,application/json"`，`FileReader` 读文本）/ 粘贴 textarea。二选一，切换时清空另一侧。
2. 拿到文本后调 `store.previewImport({raw, mode})`，展示四项计数 + 可展开明细（`items`，最多 200 条，超出显示「仅显示前 200 条」）。
3. 模式单选：合并去重（默认）/ 全量覆盖（红色说明「将删除本地不在导入文件中的事件」）。
4. `blockedByCapacity` 为 true 或有效条目为 0 时，「确认导入」禁用并显示原因。
5. 确认后调 `store.applyImport`；成功 toast 显示 `新增/更新/跳过/错误`，失败按 §7.2 文案提示。
6. 导出弹窗：显示将导出条数；「下载 events.json」（`platform.downloadJson`，文件名 `events_YYYYMMDD-HHmm.json`）；「复制 JSON」走 `platform.copyText`，返回 false 时 `showTextareaFallback`。
7. 弹窗底部：「从上次覆盖前备份恢复」→ `openRestoreBackupConfirm()` 内部用 `confirmDialog` 二次确认后调 `store.restoreBackup()`。

## 严禁
- 不解析 JSON、不做合并比较（全部经 store）。
- 不在此文件里直接读写 localStorage。
- 不用 `innerHTML` 渲染导入明细。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 含 2 条缺标题的文件 → 预览显示「错误 2」，其余条目可导入。
- 非 JSON 文件 → 阻断并提示格式错误。
- 同文件导入两次 → 第二次显示 `新增 0 / 更新 0 / 跳过 N`。
- 覆盖模式执行后，`timeline_backup_v1` 存在，点恢复能回到覆盖前状态。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T17 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-012、§5.1 ImportPreview/ImportReport、§6.3 导入流程、§7.2 错误文案；proposal.md 的 REQ-009/010/011。

任务：实现 src/ui/parts/importExport.ts，三个导出函数接口照文档。

硬性要求：
1. 一切解析与比较都交给 store.previewImport / applyImport，本文件不得自己解析 JSON。
2. 预览必须展示四项计数并可展开明细（最多 200 条，超出提示只显示前 200）。
3. blockedByCapacity 为真或有效条目为 0 时，确认导入按钮禁用并写明原因。
4. 导出文件名格式 events_YYYYMMDD-HHmm.json；复制失败必须降级到 showTextareaFallback。
5. 弹窗底部要有「从上次覆盖前备份恢复」入口，二次确认后调 store.restoreBackup()。

严禁：自己解析 JSON 或做合并比较、直接访问 localStorage、用 innerHTML 渲染明细。

完成标准：验收四条（2 条缺标题显示错误 2 其余可导入；非 JSON 被阻断；同文件二次导入全为跳过；覆盖后备份存在且能恢复）。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run typecheck 无错误，并贴真实输出。
```
