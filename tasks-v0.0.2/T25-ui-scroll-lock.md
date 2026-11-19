---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T25 滚动锁引用计数 —— 修既有缺陷

- **对应模块**: MOD-016（新增 `scrollLock.ts`）+ MOD-017（`lightbox.ts` 调用改造）
- **依赖**: 无
- **可并行**: 是

## 背景：这不是新需求，是现成缺陷

`lightbox.ts` 与 `formModal.ts` 各自在打开时 `document.body.classList.add('is-locked')`，关闭时**无条件** `remove`。两个浮层叠开时（v0.0.2 之后必然出现：详情浮层里点「编辑事件」），关闭上层会把锁摘掉，下层浮层还在但背景可以滚动。

**锁点实测共四处**（`grep -n is-locked src/ui/parts/*.ts`）：`lightbox.ts` 的 30（remove）/ 81（add）；`formModal.ts` 的 103（remove）、1211（add，事件表单）、**1790（add，记录表单）**。四处必须全换，一个漏掉就漏一条路径——尤其 1790：详情浮层里点「添加记录」走的就是它，留着它，这条新链路会原封不动地把缺陷带回来。

`detailed-design-v0.0.2 §7.4` 有复现步骤与验收口径。

## 允许改动的文件

```
src/ui/parts/scrollLock.ts        （新建）
src/ui/parts/lightbox.ts          （改两行：30 / 81）
src/ui/parts/formModal.ts         （改三行：103 / 1211 / 1790）
```

**注意**：`formModal.ts` 在 T28 里还要改分类字段块。两个任务改同一个文件，必须**串行**：T25 先做并提交，T28 再做。不许并行改同一文件。

## 实现契约

```ts
// src/ui/parts/scrollLock.ts
export function lockScroll(): void;
export function unlockScroll(): void;
export function resetScrollLock(): void;
```

- 模块级 `let count = 0`。
- `lockScroll()`：`count += 1`；若新的 count 为 1，给 `document.body` 加 `is-locked`。
- `unlockScroll()`：`count = Math.max(0, count - 1)`；若结果为 0，移除 `is-locked`。
- `resetScrollLock()`：`count = 0` 并移除 `is-locked`（供测试与整页重置）。
- 任何情况下 count 不得为负；`unlockScroll` 在 0 时调用是 no-op，不抛错。
- 不新增 CSS：`is-locked` 的 `overflow: hidden` 规则已存在（`components.css`，`.is-locked` / `body.is-locked`）。

## 改造调用点

`lightbox.ts`：
```
document.body.classList.add('is-locked')   →  lockScroll()
document.body.classList.remove('is-locked') →  unlockScroll()
```
`formModal.ts`：103（关闭时的 `remove`）→ `unlockScroll()`；1211（事件表单打开的 `add`）→ `lockScroll()`；**1790（记录表单打开的 `add`）→ `lockScroll()`**。

**除这四处外不许动 formModal.ts 的任何内容**（分类字段块属于 T28）。若你在文件里发现第五处 `is-locked`，停下来报告，不要自作主张。

## 严禁

- 不许在 `scrollLock.ts` 里自己操作 `document.body.style.overflow`（会与现有 CSS 打架）。
- 不许给浮层加「自动关闭其它浮层」的逻辑——两者本来就该叠开。
- 不许改 `.is-locked` 的 CSS。
- 不许顺手重构 `lightbox.ts` / `formModal.ts` 的其它部分。

## 验收清单

1. `grep -n "is-locked" src/ui/parts/*.ts` 的结果里，只允许出现 `scrollLock.ts`；`lightbox.ts` 与 `formModal.ts` 必须为 0 命中（含 1790 那条）。
2. `npm run typecheck` 零错误。
3. 断言（派发方复跑）：
   - 打开灯箱 → `document.body.classList.contains('is-locked') === true`
   - 灯箱开着时打开表单 → 关闭表单 → `is-locked` 仍为 `true`
   - 再关灯箱 → `false`
   - 连续 `lockScroll(); lockScroll(); unlockScroll(); unlockScroll(); unlockScroll()` 之后 `is-locked === false`（不因多解锁而残留）
   - 记录表单那条也要测：先在控制台 `lockScroll()` 模拟外层浮层，再打开记录表单并关闭，`is-locked` 仍为 `true`（这条专测 1790 有没有把锁吞掉）

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T25 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

先读（只读）：detailed-design-v0.0.2.md 的 §5.4（scrollLock 契约）与 §7.4（缺陷复现与验收）。

任务：新建 src/ui/parts/scrollLock.ts，用引用计数管理 body 的 is-locked 类；把 lightbox.ts 与 formModal.ts 里的 add/remove 改成调用它。

硬性要求：
1. 模块级 count，lockScroll 加一、unlockScroll 减一并夹到 0，计数 0↔1 的边界上才动 class。
2. unlockScroll 在 0 时调用是 no-op，不许抛错、不许出现负计数。
3. 额外导出 resetScrollLock()（count 归零 + 移除 class），供测试用。
4. 不新增 CSS，is-locked 的 overflow 规则已经存在。
5. lightbox.ts 与 formModal.ts 只改锁的行：lightbox 的 30/81，formModal 的 103/1211/1790（共三处 is-locked，1790 是记录表单的 add，最容易被漏）。别的一律不动。formModal.ts 的分类字段块属于另一个任务，你绝对不能碰。

严禁：
- 自己设置 body.style.overflow
- 写「打开浮层时自动关闭其它浮层」的逻辑
- 改动 .is-locked 的样式
- 顺手重构两个老文件

完成标准：
- 贴 grep -n "is-locked" src/ui/parts/*.ts 的真实输出；只允许 scrollLock.ts 出现
- npm run typecheck 零错误，贴输出
- 交付可复现断言清单（灯箱开着再开表单、关表单后 is-locked 仍为 true、关灯箱后为 false；连续多解锁后仍为 false），DOM 断言由派发方复跑，不要自述「已验证」
```
