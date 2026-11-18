---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T13 浮层三件套（Toast / 确认框 / 灯箱）

- **对应模块**: MOD-017
- **依赖**: T01、T11、T12
- **可并行**: 是

## 目标
三个挂在 `#overlay-root` 的独立浮层。它们**永不参与 `#timeline-root` 的重绘**，这是全量重绘方案能成立的前提之一。

## 允许改动的文件
```
src/ui/parts/toast.ts
src/ui/parts/confirm.ts
src/ui/parts/lightbox.ts
```

## 接口
```ts
// toast.ts
export type ToastLevel = 'info' | 'success' | 'warn' | 'error';
export function toast(message: string, level?: ToastLevel): void;

// confirm.ts
export interface ConfirmOptions {
  title: string; message: string;
  confirmText?: string;     // 默认 '确认'
  cancelText?: string;      // 默认 '取消'
  danger?: boolean;         // 默认 false，true 时确认按钮用 --htl-color-danger
}
export function confirmDialog(opts: ConfirmOptions): Promise<boolean>;

// lightbox.ts
export function openLightbox(src: string, alt?: string): void;
export function closeLightbox(): void;
```

## 实现要点
1. Toast：右下角堆叠，同时最多 3 条，第 4 条替换最旧一条；`TOAST_DURATION_MS=2000` 自动消失；同文本重复触发时重置计时而不新增。
2. confirm：遮罩点击视同取消，`Esc` 视同取消，确认按钮 `danger` 时用危险色；返回 `Promise<boolean>`，**同一个 confirm 重复打开时必须先 resolve 上一个为 false**（避免 Promise 悬挂）。
3. lightbox：`Esc` 与遮罩点击关闭；打开时给 `document.body` 加 `.is-locked`（CSS 里 `overflow:hidden`），关闭时移除；图片 `object-fit: contain`。

## 严禁
- 不读 store、不 import `core/store` 等业务模块（文案与行为全部由调用方给）；`core/types` 里的常量必须 import，不许硬编码。
- 不动 `#timeline-root`。
- 不用 `alert` / `confirm` 浏览器原生弹窗。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 连弹 5 条 Toast 只保留 3 条。
- 灯箱打开后滚轮不移动页面，Esc 关闭后恢复滚动。
- 连续调用两次 `confirmDialog`，第一次的 Promise 会以 false 结算，不悬挂。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T13 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-017、§4.6 DOM 契约（overlay-root）、§4.5 的 TOAST_DURATION_MS。

任务：实现 src/ui/parts/toast.ts、confirm.ts、lightbox.ts 三个文件，接口照文档。

硬性要求：
1. 三者都挂在 #overlay-root，绝不触碰 #timeline-root。
2. toast 最多同时 3 条，2 秒消失，第 4 条替换最旧一条；同文本重复触发只重置计时、不新增。
3. confirmDialog 返回 Promise<boolean>，遮罩点击与 Esc 都算取消；重复打开必须先 resolve 上一个为 false，不能悬挂。
4. lightbox 打开时给 body 加 .is-locked，关闭时移除；Esc 与遮罩都能关。
5. 不用原生 alert / confirm。

严禁：import core 下的 store 或任何业务模块、从 core 读业务数据、改 #timeline-root。常量例外且必须走 import ——TOAST_DURATION_MS 等一律从 core/types 导入，不得在 UI 里硬编码 2000。

完成标准：验收三条（5 条 Toast 只留 3 条；灯箱打开时滚轮不移动页面且 Esc 后可滚动；连续两次 confirmDialog 第一个以 false 结算）。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run typecheck 无错误，并贴真实输出。
```
