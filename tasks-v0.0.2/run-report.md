# v0.0.2 执行报告（T21~T30）

执行契约：`promptv0.0.2.md`｜任务编排：`tasks-v0.0.2/README.md`
执行体：`agy`（Antigravity CLI，实测 1.5.12），单进程串行
日期：2026-11-19

---

## W1 原子窗口（T21 → T22 → T23）

## T21 通过（commit 3e416bb）
- 验收：`grep -n "categor\|CATEGORY\|expandedIds" src/core/types.ts` 0 行；typecheck 报错中 `src/core/types.ts` 自身 0 次（其余为下游 core/ui/tests，T21 阶段为预期红）
- agy 轮次：1
- 偏离：无

## T22 通过（commit e836104）
- 验收：`vitest run tests/validate.spec.ts tests/merge.spec.ts` → 2 文件 44 用例绿；`grep categor src/core/validate.ts src/core/merge.ts` 0 行；新增 V-A1/V-A2/M-A1/M-A2 均在文件内
- agy 轮次：1
- 偏离：有——旧用例 V14~V20 的 `coerceEvent` fixture 仍带 `category` 键（`raw` 为记录型，不影响编译）。最终 DoD 只要求 `src/` 无 `categor`，tests 允许保留旧格式 fixture，故不追改

## T23 通过（commit 41f4a33）
- 验收：3 个 spec 70 用例绿（select 28 / store 30 / capacity 12）；`grep categor|expandable|expandedIds|toggleExpanded|addCategory` 在 select.ts、store.ts 0 行；typecheck 中 select/store 0 错
- agy 轮次：2（首发 20 分钟 print-timeout，盘上已落 select/store 与两个 spec，`--conversation` 续跑只补 store.spec.ts 与 T-A1~T-A3）
- 偏离：无

窗口末态：`npm run test` 7 文件 142 用例全绿。`npm run typecheck` 仍有 19 处错误，全部落在 ui 层（formModal 8 / filterBar 7 / card 2 / render 1 / main 1）——这些文件要等 T26/T28/T30 才能收口，README §二 的「W1 末 typecheck 零错误」判据与类型传导顺序冲突，按 promptv0.0.2 §6「发现文档有错 → 报告」处理，未擅自加兼容字段。

---

## W2（T24 → T25 → T28）

## T24 通过（commit 1e6f43b）
- 验收：`grep -c "htl-card\|htl-slot\|htl-cat-\|htl-axis-node\|htl-filter-categories"` 两文件均 0；`.htl-star`/`.htl-chip` 命中 5；`--htl-card-max-width` 已全部改名；无 940px / `flex-direction: row` / R5 注释残留
- 浏览器：三行手写 DOM 的 `top` = 205/269/333（互不相等、递增），`display:block`、`overflowY:visible`、`height:320px`（内容撑），年份 `position:sticky / top:0px`；引线宽 34px 且与条目间隙 0；节点中心 657/605 对轴列中心 631 = ±26（`--htl-axis-wave`）；`--htl-axis-wave:0` 时节点回中心且引线变 60px；700px 视口轴列 56 / 摆幅 14 / 引线 24 / 行高 56 / 标题 14px
- agy 轮次：1
- 偏离：无

## T25 通过（commit 394040e）
- 验收：`grep is-locked` 在 lightbox.ts、formModal.ts 均 0；调用点 31/82、104/1212/1791 已换 `lockScroll()/unlockScroll()`；浏览器计数 2 锁 3 解锁后 false（负计数无残留）、灯箱开关锁正确
- agy 轮次：1
- 偏离：**有（未修）**——`src/ui/parts/importExport.ts` 另有 3 处裸 `is-locked`（75 remove / 803 add / 965 add），不在 T25 的 touchlist 内。执行者按 README §四.1 停下报告，未擅自越界。T25 验收第 1 条「只允许 scrollLock.ts 出现 is-locked」因此未字面满足。影响：导入预览 / 确认框与其它浮层叠开时仍会提前解锁，与 T25 修的缺陷同型。

## T28 通过（commit 537860d）
- 验收：formModal/filterBar 内 `categor|CATEGORY|addCategory|toggle-filter-category` 0 命中；typecheck 中两文件 0 错；浏览器：表单 `[data-field="category"]` 不存在、无「分类」「新分类」字样、`select` 数 0、开表单 `is-locked=true` / 关后 false；筛选栏 `.htl-filter-categories` 与 `toggle-filter-category` 均不存在，`data-focus-key="filter.keyword"` 保留
- 补验 T25 叠开：灯箱开 → 表单开 → 关表单后 `is-locked` 仍 true、灯箱仍在 → 关灯箱后 false
- agy 轮次：1
- 偏离：无

---

## W3（T26 → T27）

## T26 通过（commit 0a22ce2）
- 验收：`src/ui/parts/card.ts` 已删除；浏览器：10 行、`.htl-card/.htl-slot` 0、无 `toggle-card`；行序 `RLRLRLRLRL`（跨年月连续）；每个 `.htl-entry` 子元素恰为 `htl-entry__date`+`htl-entry__title`；日期无 action，标题 `open-detail` 且有 `data-focus-key`；4 个年组（2026:3月/3行、2025:4月/4行、2024:2月/2行、2023:1月/1行，月行数之和 = 年行数）；前六行高度均 64px；搜索框重绘后焦点、选区、值全部保持
- agy 轮次：1
- 偏离：无

## T27 通过（commit 5f73f5f）
- 验收：`grep window.scrollY|window.scrollX|htl-card|htl-slot|is-up|is-down` 于 axis.ts 0 命中；节点选择器 `.htl-node`、灵动层作用于 `.htl-cell--axis`
- 浏览器：SVG 1 个、节点 10 = 行 10；`d` 首点 (426,0)、末点 (374,1308) = SVG 高度、中间 y 严格递增；折点 x 只有 374 / 426 两值，中点 400 = 轴列中心、偏移 ±26 = `--htl-axis-wave`（zigzag 真实存在）；`.htl-node` 无内联 transform；重绘 3 次后仍 1 个 SVG 且路径不变；页面滚动 500px 后节点相对 root 的 y = 154 不变（零漂移）；节点实测坐标与路径点 dx/dy 全 0；宽度改到 700/640 后 SVG 同步重算、对齐仍 0
- agy 轮次：2（首发输出 0 字节、盘上零改动，直接重发同一 prompt 成功）
- 偏离：无。注：CDP `Emulation.setDeviceMetricsOverride` 在后台标签页不触发 ResizeObserver（rAF 被节流），必须在 `Page.bringToFront` 下测，否则会误判为缩放不重算

---

## W4（T29）

## T29 通过（commit f53a434）
- 验收：静态——无 innerHTML、无 document 级 keydown、无 `classList.add('is-locked')`、打开态为模块级变量
- 浏览器：`openDetail` 后 `.htl-detail[data-detail][role=dialog][aria-modal=true][aria-label=事件详情]` 存在且 `is-locked=true`；`closeDetail()` 后 DOM 与锁同时清空；记录 2 条日期递增（2025-06-01 → 2025-08-15）、星级 ★★★★☆/★★★★★ 与 rating 对应；封面 img 点开灯箱后关灯箱，详情仍在且锁仍 true；关联 1 条文本含方向箭头与跨度（「→ … · 此后 9 个月 18 天（共 294 天）」）；操作区 add-record/edit-event/delete-event 齐全；点遮罩关闭、点关闭按钮关闭、点 panel 内部不关闭；`store.addRecord` + `refreshDetail` 后记录 2→3 且浮层不消失、日期递增；`store.deleteEvent` + `refreshDetail` 后浮层消失、锁解除、toast「事件不存在或已被删除」；panel 可行内滚动且 `window.scrollY` 不变
- agy 轮次：1
- 偏离：无

---

## W5（T30）

## T30 通过（commit 09c427a）
- 验收：`npm run typecheck` 0 错；`npm run test` 7 文件 142 用例绿；`npm run build` 成功（dist 110.03 kB js / 15.18 kB css）；种子 JSON 合法、10 条事件、`appVersion=0.0.2`、根无 categories、事件无 category；`grep -c category public/data/events.json` = 0；`grep toggle-card src/` = 0
- 浏览器全流程：清 localStorage 后首屏 10 行、0 卡片、RLRL… 交替、轴竖向（SVG 高 1308）；点标题开详情、锁 true；详情内「编辑事件」→ 表单叠开、锁 true；ESC 先关表单（详情仍在、锁 true）再关详情（锁 false）；详情内「添加记录」表单开合后锁仍 true（1790 锁点）；关联跳转后详情关闭、锁解除、目标行 `is-flash` 且 flashId 正确；删除事件走确认框（文案含解除关联数）→ 详情关闭、行数 11→10、锁解除、事件从 store 移除、toast「已删除」；`exportJson()` 无 `"categories"`/`"category"`、`appVersion=0.0.2`；导入 V0.0.1 旧文件（根 categories + 2 条带 category 的事件）预览 errors=0 / added=2、无分类文案，导入后事件无 category 键
- agy 轮次：1
- 偏离：**有（未修）**——删除事件时会出现两条 toast：`refreshDetail` 在 store notify 时先于 `closeDetail()` 执行，先弹「事件不存在或已被删除」，随后 main.ts 弹「已删除」。这是 T29 §验收第 9 条要求的行为与 T30「删除后先 closeDetail 再 toast」叠加的结果，属文档内部张力，未擅自改文档或改顺序。

---

## §1 硬指标复核（最终）

| 指标 | 结果 |
|---|---|
| `npm run typecheck` | 0 错 |
| `npm run test` | 7 文件 / 142 用例全绿 |
| `npm run build` | 成功 |
| `grep -rc "htl-card\|htl-slot\|htl-cat-\|htl-axis-node\|htl-filter-categories" src/ui/styles/*.css` | components.css 0 / theme.css 0 |
| `grep -rn "categor" src/` | 0 行 |
| `grep -rn "toggle-card\|expandedIds\|toggleExpanded\|isExpandable" src/ tests/` | 0 行 |
| AC-26~AC-34 浏览器断言 | 已在各任务小节逐条贴真实输出 |
| 每任务一个 commit、工作树干净 | 是（b7be046 基线 + T21~T30 十个 commit） |

## 遗留（2 项，均未擅自扩大范围）

1. **`importExport.ts` 三处裸 `is-locked`**（75 / 803 / 965）：与 T25 修的缺陷同型，叠开时会提前解锁。需新增一个任务把它也改成 `lockScroll()/unlockScroll()`。
2. **删除事件双 toast**：`refreshDetail` 的 error toast 与 main 的「已删除」同时出现。最小改法是在 `delete-event` 分支里先 `closeDetail()` 再 `store.deleteEvent(id)`（删除失败则不关详情需另行判断），但这与 T30 文档写的「删除成功后先 closeDetail 再 toast」字面不同，等用户裁定。
