---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T16 事件表单与记录表单

- **对应模块**: MOD-011
- **依赖**: T06、T09、T10、T13
- **可并行**: 是（与 T17 并行）

## 目标
事件与记录的录入/编辑弹窗：字段级错误、动态链接行、关联多选、封面选择与预览、未保存关闭确认。REQ-001~REQ-006 的交互落点。

## 允许改动的文件
```
src/ui/parts/formModal.ts
```

## 接口
```ts
export function openEventForm(opts: { mode: 'create' } | { mode: 'edit'; eventId: string }): void;
export function openRecordForm(opts: { eventId: string } | { eventId: string; recordId: string }): void;
export function closeFormModal(force?: boolean): void;
```

## 实现要点
1. 校验一律调 `core/validate`；错误按 `Issue.field` 定位到字段下方红字，提交时聚焦首个错误字段。
2. 动态链接行：`form.event.links.<i>.name` 的 focus-key 必须带序号；最多 10 行，达到上限后「+ 添加链接」置灰。
3. 关联多选：可搜索下拉（显示 `日期 + 标题`），排除自身与被禁用项；最多 10 条，达上限阻止并提示。
4. 封面：两个来源页签（图片链接 / 本地上传）。上传走 `platform.compressImage`，成功后显示缩略图 + 「移除」；`COVER_TOO_LARGE` 等错误按 §7.2 文案提示。
5. 记录表单：星级 5 颗星单选（默认 3，支持 ←/→），碎碎念实时字数（上限 2000）。
6. 未保存关闭：任何字段被改过时，遮罩/ESC/取消 均先 `confirmDialog('有未保存的修改，确定关闭？')`。
7. 保存成功：`toast('已保存')`，关闭弹窗，`store.flash(id)` 让新卡片高亮。
8. 编辑态的「删除此事件」走 `confirmDialog`，文案含标题与关联数（用 `store` 计算出的关联数传入）。

## 严禁
- 不自己写校验规则（必须走 `validate.*`）。
- 不直接改 store 内部数据（只调方法并处理 `MutationResult`）。
- 不在此文件里操作 `#timeline-root`。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 标题留空提交 → 阻止保存，标题字段标红并聚焦。
- 日期填 `2026-02-30` → 提示「请输入有效日期」。
- 已有 20 条记录的事件再点新增记录 → 阻止并提示上限。
- 有改动时点遮罩 → 出现未保存二次确认。
- 上传 5MB 图 → 自动压缩到 ≤300KB 后显示预览。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T16 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-011、§4.6 DOM 契约里的 focus-key 与 data-action、§4.5 上限常量、§7.2 错误文案表；proposal.md 的 REQ-001~REQ-006。

任务：实现 src/ui/parts/formModal.ts，三个导出函数接口照文档。

硬性要求：
1. 校验全部走 core/validate，不要自己写规则；错误按 Issue.field 显示在对应字段下方。
2. 动态链接行的 focus-key 必须带序号（form.event.links.<i>.name），否则重绘会撞键。
3. 关联多选排除自身，最多 10 条；记录最多 20 条，超限阻止并提示。
4. 封面上传走 platform.compressImage，超 300KB 的错误文案照 §7.2。
5. 有未保存改动时关闭必须二次确认。
6. 保存成功后 toast('已保存') 并 store.flash(id)。

严禁：自己写校验规则、直接改 store 内部数据、操作 #timeline-root。

完成标准：验收五条（标题留空提交被阻止并聚焦；2026-02-30 被拒；20 条记录后再加被阻止；有改动点遮罩弹二次确认；5MB 图被压到 300KB 内并预览）。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run typecheck 无错误，并贴真实输出。
```
