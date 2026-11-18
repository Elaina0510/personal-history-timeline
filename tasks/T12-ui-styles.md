---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T12 主题与组件样式

- **对应模块**: MOD-014
- **依赖**: T01
- **可并行**: 是

## 目标
一份可整体替换的主题变量 + 一套只用变量的组件样式。REQ-022 的验收标准是「只改 theme.css 的强调色，全站跟着变，业务代码零改动」。

## 允许改动的文件
```
src/ui/styles/theme.css
src/ui/styles/components.css
```

## theme.css 必须定义的变量（`§3 MOD-014` 与设计文档示例一致）
- 颜色：`--htl-color-bg/surface/border/text/text-muted/accent/star/danger/success`
- 分类色板 6 槽：`--htl-cat-1` ~ `--htl-cat-6`
- 字体：`--htl-font-sans`、`--htl-font-mono`
- 字号：`--htl-fs-xs/sm/md/lg/xl`
- 间距：`--htl-space-1` ~ `--htl-space-6`
- 形状：`--htl-radius-sm/md/lg`、`--htl-timeline-width`、`--htl-card-max-width`
- 动效：`--htl-transition-fast/base`、`--htl-shadow-card`

## components.css 必须覆盖的类（§3 MOD-014 类名表的副本，以该处为准）
`.htl-app`、`.htl-card`、`.htl-card--expanded`、`.htl-card__date/__title/__summary/__meta`、`.htl-chip`、`.htl-chip--active`、`.htl-star`、`.htl-year-group`、`.htl-year-heading`（sticky）、`.htl-timeline`（竖线）、`.htl-filter-bar`、`.htl-year-nav`、`.htl-modal`、`.htl-toast`、`.htl-lightbox`、`.is-flash`、`.is-hidden`、`.is-locked`（灯箱打开时给 body 锁滚动）、`.is-open`（`<768px` 筛选抽屉展开）

## 硬要求
1. `components.css` 中**不得出现任何硬编码颜色或像素圆角**（`#`、`rgb(`、`hsl(`、`border-radius: 8px` 这类一律禁止），必须 `var(--htl-*, fallback)`。
2. 每个变量取值都要带 fallback，形如 `var(--htl-color-accent, #4c9aff)`。
3. 年份标题 sticky 需处理与其他吸顶元素的层级（`z-index` 用变量或合理常量并注释）。
4. `@media (prefers-reduced-motion: reduce)` 下关闭过渡与平滑滚动。
5. 最小支持宽度 360px；`<768px` 时筛选条折叠为抽屉（用 `.is-open` 布尔类）。

## 严禁
- 不写 JS、不写组件业务态判断（只允许 `.is-*` 布尔状态类）。
- 不引入 CSS 框架或 reset 库。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 把 `--htl-color-accent` 改成 `#e5484d`，全站强调色变化，未改任何 TS 文件。
- 360px 宽度下无横向滚动条。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T12 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-014、§4.6 DOM 契约，以及 proposal.md 的 REQ-022。类名与主题变量清单见 §3 MOD-014（本文件有一份副本）。

任务：写 src/ui/styles/theme.css（只放 :root 变量）与 src/ui/styles/components.css（布局与组件类）。

硬性要求：
1. components.css 里绝对不许出现硬编码色值和像素圆角，一律 var(--htl-*, fallback)。
2. 每个变量使用处都要带 fallback 值。
3. 覆盖 detailed-design.md §3 MOD-014 的类名表（本文件同名一节是它的副本，两者必须一致，出入以 §3 为准）；T14/T15/T16 按同一张表引用，类名不得改动。四个状态类 .is-flash / .is-hidden / .is-locked / .is-open 必须有。
4. prefers-reduced-motion 下关闭过渡与平滑滚动；360px 宽度不得出现横向滚动条；小于 768px 筛选条折叠为抽屉。

严禁：写 JS、引入 CSS 框架或 reset 库、在 CSS 里做业务状态判断（只允许 .is-* 布尔类）。

完成标准：验收两条——把 --htl-color-accent 改成 #e5484d 后全站强调色变化且未动任何 TS 文件；360px 下无横向滚动条。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run build 必须成功，并贴真实输出。
```
