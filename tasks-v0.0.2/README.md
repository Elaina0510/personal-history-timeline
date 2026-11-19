# 任务划分与执行指引（v0.0.2）

上游：`proposal-v0.0.2.md` **V0.0.2**（REQ-026~031 + 8 条改写）｜ `detailed-design-v0.0.2.md` **V0.0.2-R1**（19 个模块，其中 2 个新增）

共 **10 个任务**（T21~T30）。v0.0.1 的 `tasks/` 目录是历史冻结快照，**不要修改、不要复用其编号**。

派发执行体：`agy`（Google Antigravity CLI，本机 v1.5.11）。命令、串行纪律与超时恢复流程见 §九。

本版与 v0.0.1 最大的执行差异：这不是从零建站，而是在一棵已通过全量测试的代码树上删字段。删 `category` 会让整棵树在编译期同时红掉——所以第一个波次是一个**原子窗口**，中途的红是预期行为，不许为了让它变绿而私自加兼容字段。

---

## 一、任务清单与依赖

| 任务 | 对应模块 | 产出文件 | 依赖 | 说明 |
|------|---------|---------|------|------|
| T21 | MOD-001 | `core/types.ts` | — | 删分类与展开态字段/常量/2 个 IssueCode。**原子的第一步** |
| T22 | MOD-004 + MOD-005 | `core/validate.ts`、`core/merge.ts`、`tests/validate.spec.ts`、`tests/merge.spec.ts` | T21 | 删分类校验与合并并集 |
| T23 | MOD-006 + MOD-008 | `core/select.ts`、`core/store.ts`、`tests/select.spec.ts`、`tests/store.spec.ts`、`tests/capacity.spec.ts` | T21 | 删分类筛选、`expandable`、`toggleExpanded`、`addCategory` |
| T24 | MOD-014 | `ui/styles/theme.css`、`ui/styles/components.css` | — | 冻结类名与变量、竖向布局、详情浮层样式 |
| T25 | MOD-016 + MOD-017 | `ui/parts/scrollLock.ts`（新）、`ui/parts/lightbox.ts`、`ui/parts/formModal.ts`（三处锁点：103 / 1211 / 1790） | — | 滚动锁引用计数，修既有缺陷 |
| T26 | MOD-010 | `ui/parts/entry.ts`（新）、`ui/parts/yearGroup.ts`、`ui/render.ts`，删除 `ui/parts/card.ts` | T23、T24 | 行布局 + 条目只留日期标题 |
| T27 | MOD-018 | `ui/parts/axis.ts` | T26 | 竖向折线 |
| T28 | MOD-011 + MOD-013 | `ui/parts/formModal.ts`、`ui/parts/filterBar.ts` | T23 | 删分类表单块与筛选 chips |
| T29 | MOD-019 | `ui/parts/detailModal.ts`（新） | T24、T25、T26 | 覆盖式详情浮层 |
| T30 | MOD-015 | `src/main.ts`、`package.json`、`public/data/events.json` | T26~T29 | 装配、版本号、种子清理 |

## 二、执行波次

```
W1（原子窗口，不可中断）
  T21 ─┬─ T22 ─┐
       └─ T23 ─┴─▶ 窗口末态：npm run typecheck + npm run test 全绿

W2（并行）
  T24（先出类名契约）        ——不碰 formModal.ts
  T25（改 formModal.ts 的锁） ──▶ T28（改 formModal.ts 的分类块）

W3（可并行，验收要求 T26 先落地）
  T26 ──▶ T27

W4
  T29（依赖 T24/T25/T26）

W5
  T30（依赖 T26~T29）
```

**关键路径**：T21 → T23 → T26 → T29 → T30。

**W2 的纪律**：T25 与 T28 都改 `formModal.ts`，**必须串行**（T25 提交后 T28 才开工），不许并行；两者与 T24 之间没有文件交集，可以同时进行。

**W1 的纪律**：
- T21 交付后 `tsc` 必红、`vitest` 必红，这是预期的。T21 的验收不是「编译通过」，而是「`types.ts` 与 §4 逐字段一致」。
- T22 与 T23 必须在 T21 之后、且必须都完成，窗口才算关闭。只完成一个就停下，等于把树留在一个全红状态。
- 窗口关闭的唯一判据：`npm run typecheck` 零错误 **且** `npm run test` 全绿。贴真实输出。

**T24 是 UI 层的瓶颈**：T26 的 DOM 结构与 T29 的浮层结构都引用它的类名。T24 交付时必须在文件里附上最终类名清单，T26/T29 照抄，不许自行改类名。

## 三、类名与变量契约（T24 冻结，T26/T27/T29 照抄）

### 3.1 新增 CSS 变量（`theme.css`）

```
--htl-axis-col: 88px        轴列宽（手机 <768px: 56px）
--htl-axis-wave: 26px       节点在轴列内的左右摆动（手机: 14px）
--htl-entry-gap: 16px       条目与轴列的间距（手机: 10px）
--htl-row-min-h: 64px       事件行最小高度（手机: 56px）
--htl-timeline-max-width: 800px   （由 --htl-card-max-width 改名而来）
```

### 3.2 类名清单

| 元素 | 类名 / 属性 | 归属文件 |
|------|------------|---------|
| 时间轴根 | `#timeline-root.htl-timeline` | render |
| 年组 | `.htl-year-group[data-year]` | yearGroup |
| 年份标题 | `.htl-year-heading[data-year][data-focus-key="year.<Y>"]` | yearGroup |
| 月组 | `.htl-month-group[data-month][data-year]` | yearGroup |
| 月份标题 | `.htl-month-heading[data-month][data-year][data-focus-key="month.<Y>.<MM>"]` | yearGroup |
| 事件行 | `.htl-row.is-left` / `.htl-row.is-right[data-event-id][data-seq]` | yearGroup |
| 条目格 | `.htl-cell--entry` | yearGroup |
| 轴格 | `.htl-cell--axis` | yearGroup |
| 条目 | `.htl-entry` | entry |
| 日期 | `.htl-entry__date` | entry |
| 标题按钮 | `.htl-entry__title[data-action="open-detail"][data-id]` | entry |
| 节点 | `.htl-node` | yearGroup |
| 引线 | `.htl-link` | yearGroup |
| 折线 | `.htl-axis-svg > path.htl-axis-path` | axis |
| 详情浮层 | `.htl-detail` 及 §5.5 全套 | detailModal |

### 3.3 必须删除的旧类（一个不留）

`.htl-card`、`.htl-card--expanded`、`.htl-card__date`、`.htl-card__title`、`.htl-card__summary`、`.htl-card__meta`、`.htl-card__records`、`.htl-card__record`、`.htl-card__record-detail`、`.htl-card__cover`、`.htl-card__links`、`.htl-card__relations`、`.htl-card__actions`、`.htl-card__node`、`.htl-slot`、`.is-up`、`.is-down`、`.htl-axis-node`、`.htl-axis-node--year`、`.htl-axis-node--month`、`.htl-chip--cat-1` ~ `.htl-chip--cat-6`、`.htl-filter-categories`。

保留：`.htl-star`、`.htl-chip`（详情内仍在用）、`.htl-lightbox`、`.htl-modal`、`.htl-toast`、`.htl-filter-bar`、`.htl-year-nav`、`.htl-capacity-bar`、`.is-flash`、`.is-locked`。

## 四、每个任务共同遵守的纪律

1. **只改 touchlist 内的文件**。需要动清单外的文件，停下来报告，不许扩大范围。
2. **不许修改 `proposal-v0.0.2.md` 与 `detailed-design-v0.0.2.md`**。发现文档有错，报告而非擅自改。
3. **不许新增依赖**。仍是 `vite` / `typescript` / `vitest`。
4. **不许用 `innerHTML` 系列 API 渲染用户数据**。
5. **不许在 `core/**` 里 import `ui/**`**，不许在 `core/**` 里碰 `window`/`document`/`localStorage`。
6. **不许留兼容分支**：不写 `category?: string`、不写 `layout: 'horizontal' | 'vertical'`、不做 `schemaVersion` 迁移判断。
7. **交付必须贴真实输出**：typecheck / test / build 的真实结果。不接受「已完成」「应该可以」。
8. **遇到阻塞要报告**，不许猜一个实现糊过去。
9. 收尾跑：`npm run typecheck` + （涉及 core 或 tests 时）`npm run test`。

## 五、验收归属（AC → 任务）

| AC | 需求 | 主任务 | 复核方式 |
|----|------|--------|---------|
| AC-26 | REQ-026 竖向折线 | T27 | 断言清单 + 派发方浏览器复跑 |
| AC-27 | REQ-027 左右交替 | T26 / T27 | 断言清单 |
| AC-28 | REQ-028 年/月分组竖排 | T26 | 断言清单 |
| AC-29 | REQ-030 正序切换 | T26 | 断言清单 |
| AC-30 | REQ-002 必填项 + REQ-015 无分类筛选 | T23 / T28 | 单测 V-A1 + 断言清单 |
| AC-31 | REQ-029 数据兼容 | T22 / T23 / T30 | 单测 V-A2 / M-A1 / T-A1 |
| AC-32 | REQ-013 条目瘦身 + REQ-014 点标题开详情 | T26 / T29 | 断言清单 |
| AC-33 | REQ-031 详情浮层 | T29 | 断言清单 |
| AC-34 | REQ-005 星级 + REQ-021 关联跳转 | T23 / T29 / T30 | 单测 S-A1 + 断言清单 |

## 六、UI 任务的交付方式（沿用 v0.0.1 的裁定）

UI 任务不可能靠执行者「手工点一遍」交付——它只会产出两种结果：编造一句「已验证」，或卡住等人工。所以：

1. 执行者交付**可复现断言清单**：操作步骤、定位选择器或 `data-*` 键、期望的 DOM / 状态结果，随代码一起交出。
2. DOM 断言由**派发方用浏览器自动化复跑**，断言输出与截图作为验收证据。
3. 执行者不得自述「已验证」，只贴 `npm run typecheck` / `npm run build` 的真实输出。
4. **入口还没接通的断言单独标**：T29 交付时 `main.ts` 还没有 `open-detail` 分支，「点标题开详情」「ESC 关闭」在浏览器里点不出来。这类条目在任务文件里标 `⏳T30`，W4 阶段用控制台 `openDetail(id, window.__htl_store)` 直调，装配后再补跑；不许为了能点而私自改 `main.ts`。

## 七、已知风险点（执行时重点盯）

| 风险 | 表现 | 归属 |
|------|------|------|
| 为让 W1 变绿私加兼容字段 | `category?: string` 留在类型里，等于没删 | T21 |
| 归一化写成 `category: undefined` | 导出的 JSON 里出现 `"category": null` 或对象上仍有该键 | T23 |
| 左右交替按月组重置 | 跨月/跨年出现连续两个右列 | T26 |
| 折线坐标加了 `window.scrollY` | 页面一滚，折线整体漂移（v0.0.1 R14 同类缺陷） | T27 |
| 详情打开状态塞进 `ViewState` | 每次 notify 全量重绘，浮层内容还是旧的 | T29 |
| 滚动锁仍无条件 add/remove | 详情里开表单再关闭，背景可滚动 | T25 / T29 |
| 删 CSS 时连带删掉 `.htl-star` / `.htl-chip` | 详情里的星级与关联 chip 失去样式 | T24 |
| 种子文件只删根 `categories` 不删事件 `category` | 首屏每次归一化都要剥一遍，且导出带脏字段 | T30 |
| 只删卡片/槽位样式，没拆 `.htl-timeline` 的 R5 横向段 | `display:flex; flex-direction:row` + 940px 定高 + `overflow-y:hidden` 留着，行会横躺、内容被裁 | T24 |
| 引线写 `right:0 / left:0` | 只剩一条 18px 的短棍，够不到条目，REQ-027 的「连回节点」没实现 | T24 |
| 灵动层照抄 `.htl-card` 或直接给 `.htl-node` 写 transform | 前者静默 no-op；后者覆盖 CSS 的 ±wave，折线被压成直线 | T27 |
| 只换 formModal 的两处锁，漏掉 1790（记录表单） | 详情里开「添加记录」再关，背景又能滚了 | T25 |

## 八、派发前置

每个任务派发前确认项目根已有 `node_modules`（`npm install` 已跑过）与当前分支干净（`git status` 无未提交改动）。

T21 开工前必须先 `git commit` 一个基线点，用于 W1 出问题时整体回退到可运行状态。

## 九、派发执行体：agy（Antigravity CLI）

执行体定为 `agy`（`C:\Users\luo\AppData\Local\agy\bin\agy.exe`，2026-11-19 实测 v1.5.11）。每个任务文件里的「## Prompt（可直接粘贴）」代码块就是发给它的完整 prompt，原样使用，不需要改写——里面的工作目录、读哪些文档、硬性要求、严禁项、完成标准都已写全，agy 对本次对话一无所知也够用。

1. **一次只跑一个进程。** agy 的 workspace 就是 cwd，十个任务全落在同一个仓库、共享 `git status` 与 `node_modules`。并发会让 `tsc` 的报错面搅在一起，无法判断是谁引入的。除 T25 → T28 本就串行外，其余也一律串行：宁可慢，不要无法归因。
2. **命令**：
```bash
bash tasks-v0.0.2/dispatch-agy.sh T21              # 真派发，默认 --print-timeout 900s
bash tasks-v0.0.2/dispatch-agy.sh T21 --dry-run    # 只打印要发出去的 prompt，先自查
bash tasks-v0.0.2/dispatch-agy.sh T21 --resume <conversation_id>
```
脚本从任务文件抽出 Prompt 块、`cd` 到项目根、调 `agy --output-format json --dangerously-skip-permissions`，原始 JSON 落 `tasks-v0.0.2/dispatch-logs/`。
3. **超时是常态，不是失败。** 首轮要读 4 万字的设计文档，容易撞 `--print-timeout`：表现是 `response` 为空（甚至 `status: SUCCESS` 也未必有内容）、盘上零改动。处理顺序：先 `git status` 确认真没落地 → 用输出里的 `conversation_id` 走 `--resume` 续跑（续跑的 prompt 末尾追加「不要重读大文件，直接落盘」）→ **不要重开新会话**，那会把缓存的上下文丢掉、重复超时。
4. **`status: SUCCESS` 不算交付。** 它只代表这一轮结束了。派发方必须亲自复跑该任务的验收清单：`npm run typecheck`、`npm run test`、对应 `grep`、以及 §6 要求的 DOM 断言。agy 的「已改完」只当线索，不当结论。
5. **不许给它开范围外的门。** prompt 里已锁死「只改 touchlist」「不新增依赖」「不改 proposal/design」「不 push」。它若报告需要动清单外文件，停下来问人，不要让它在仓里自行扩大范围。

主 Agent 侧的完整执行契约（角色、波次、验收循环、失败预算、停线）见项目根 `promptv0.0.2.md`。
