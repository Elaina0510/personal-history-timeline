---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T11 视图构造工具与事件委托

- **对应模块**: MOD-016
- **依赖**: T01、T02
- **可并行**: 是

## 目标
`dom.ts` 提供安全的 DOM 构造三件套；`bind.ts` 提供**一次性**事件委托。两者都是全项目「用户文本不得进 innerHTML」的守门人。

## 允许改动的文件
```
src/ui/dom.ts
src/ui/bind.ts
```

## 接口
```ts
// dom.ts
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs?: Record<string, string | number | boolean | undefined>, children?: (Node | string)[]
): HTMLElementTagNameMap[K];
export function text(s: string): Text;
export function cloneTemplate(id: string): DocumentFragment;

// bind.ts
export interface ActionHandler { (action: string, id: string | undefined, ev: Event): void; }
export function bindActions(handler: ActionHandler): void;   // 启动时调用一次
```

## 实现要点
1. `el()` 中 `class` / `data-*` / `aria-*` 走 `setAttribute`；`value`、`checked` 这类属性写到 DOM property；`undefined` 的属性跳过。
2. **字符串子节点一律 `createTextNode`**，调用方传字符串时不得解析成 HTML（REQ-025）。
3. `bindActions` 在 `document` 上注册 `click` 与 `input` 两个监听（`input` 仅用于委托 `[data-action]` 的表单输入，具体处理交给 handler），通过 `closest('[data-action]')` 派发，`data-id` 作为第二参数。
4. 重复调用 `bindActions` 必须幂等（内部加一个 `bound` 标志），否则重绘后会触发多次。

## 严禁
- 不用 `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write`。
- 不在此处写任何业务分支（action 的具体行为由 handler 决定）。
- 不在重绘流程里重新调用 `bindActions`。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 传入 `'<img src=x onerror=alert(1)>'` 作为文本子节点，页面显示字面文字且不弹窗。
- 连续调用 `bindActions` 三次后点一次卡片，handler 只被调用一次。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T11 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §2.3 重绘边界规则、§4.6 DOM 契约（data-action / data-focus-key 表）、§3 MOD-016。

任务：实现 src/ui/dom.ts（el / text / cloneTemplate）与 src/ui/bind.ts（bindActions），接口照文档。

硬性要求：
1. 所有字符串子节点必须走 createTextNode，绝不能解析成 HTML——这是 REQ-025 的防线。
2. bindActions 用 closest('[data-action]') 在 document 上做委托，data-id 作为第二个参数传给 handler。
3. bindActions 必须幂等：重复调用只绑定一次（内部 bound 标志）。
4. 不在这里写任何业务分支。

严禁：innerHTML / outerHTML / insertAdjacentHTML / document.write；在重绘流程里重复调用 bindActions。

完成标准：验收两条——(1) 传入 '<img src=x onerror=alert(1)>' 作为文本只显示字面文字且不弹窗；(2) 连续 bindActions 三次后点一次卡片，handler 只被调用一次。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run typecheck 无错误，并贴真实输出。
```
