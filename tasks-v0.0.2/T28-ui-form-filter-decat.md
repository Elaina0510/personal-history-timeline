---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T28 表单与筛选 —— 删掉分类

- **对应模块**: MOD-011 `formModal.ts` + MOD-013 `filterBar.ts`
- **依赖**: T23（`EventInput` / `FilterState` 已无分类）
- **可并行**: 与 T26/T27 可并行，但与 T25 **必须串行**（T25 先改过 `formModal.ts` 的三处锁点：103 / 1211 / 1790）

## 目标

新建/编辑事件表单里不再有分类下拉与「+ 新分类」按钮；筛选栏里不再有分类 chips。星级与关键词筛选、清空筛选、排序切换全部保留不动。

## 允许改动的文件

```
src/ui/parts/formModal.ts
src/ui/parts/filterBar.ts
```

## 一、`formModal.ts`

### 删除清单

| 位置（当前代码，以实际为准） | 内容 |
|------|------|
| 约 156-157 | `currentCategory` 初始化（`targetEvent.category` / `state.data.categories[0] ?? '生活事件'`） |
| 约 319-380 | 整个分类字段块：`categoryFieldBox`、`select[data-field="category"]`、`button[data-action="add-category"]`、「+ 新分类」、`refreshCategoryOptions()`、`categorySelect` 的 change 监听 |
| 约 382-400 | `window.prompt('请输入新分类名称…')` 与 `store.addCategory(...)` 的整个回调 |
| 约 1005-1011 | 提交时读取 `categoryVal` 并塞进 `EventInput` |
| 约 1089、1130 | 更新/新建分支里传 `category` 的两处 |
| 约 1201 | `formEl.appendChild(categoryFieldBox)` |

### 必须保留

- 日期、标题、封面（上传/链接/预览/删除）、外链列表、关联选择、底部操作区（保存/取消/删除事件）。
- 表单校验：日期与标题缺失时的字段级错误定位（`data-error-field` / `clearFieldError` 机制）。
- `is-locked` 的 `lockScroll()/unlockScroll()` 调用（T25 已改，不要回退成 `classList`）。
- 记录表单（`openRecordForm`）完全不动。

### 校验顺序

提交时只校验日期与标题：任一为空即阻止保存并把错误挂到对应字段。**不许**残留「分类不能为空」的校验分支（`validate.ts` 已删，前端也别自己补）。

## 二、`filterBar.ts`

### 删除清单

| 位置 | 内容 |
|------|------|
| 约 52-62 | `toggleCategory()` |
| 约 123 | `case 'toggle-filter-category'` |
| 约 208-240 | 分类 chips 渲染（`catChips`、`.htl-filter-categories` 容器、`data-category` 属性） |

### 必须保留

- 星级按钮组（含「4 星及以上」快捷项）、关键词输入框（300ms 防抖）、清空筛选、正序/倒序切换。
- `handleFilterAction()` 的其它 case、`setStore`、`latestState` 的维护方式。
- 筛选栏根元素 `.htl-filter-bar` 与其中星级/关键词的既有类名与 `data-focus-key="filter.keyword"`（`main.ts` 的 `/` 快捷键依赖它）。

## 严禁

- 不许给分类找替代物（标签、多选、颜色）。
- 不许改星级与关键词的筛选语义、不许改 `setFilters` 的调用方式。
- 不许动 `formModal.ts` 的记录表单部分、不许动封面上传与关联选择逻辑。
- 不许改 `main.ts`（装配在 T30）、不许改 core。
- 不许把 `prompt()` 换成自建的输入弹窗——那个功能整个没了。

## 验收清单（可复现断言，派发方复跑）

1. 新建事件表单：`document.querySelector('[data-field="category"]') === null`；表单内 `document.querySelectorAll('select').length` 比改动前少 1（记录表单外无分类下拉）。
2. 表单内不出现「分类」「+ 新分类」字样（`form.textContent` 不含这两个子串）。
3. 只填标题不填日期 → 点保存被拒，错误定位到日期字段；只填日期不填标题 → 同样被拒。
4. 筛选栏：`document.querySelector('.htl-filter-categories') === null`，`document.querySelector('[data-action="toggle-filter-category"]') === null`。
5. 星级筛选与关键词筛选仍生效：选「5 星」后只剩 5 星事件；输入关键词后命中数量变化；「清空筛选」把两者都复原。
6. `npm run typecheck` 零错误。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T28 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

前置：T23 已完成（EventInput 与 FilterState 里已无 category / categories），T25 已完成（formModal.ts 的 is-locked 已改成 lockScroll()/unlockScroll()，103/1211/1790 三处都是，不要动它们）。

先读（只读）：
- detailed-design-v0.0.2.md 的 §2.2 改动分布、§7.2 边界
- proposal-v0.0.2.md 的 REQ-002、REQ-006（废弃）、REQ-015

任务：只改 src/ui/parts/formModal.ts 与 src/ui/parts/filterBar.ts。

硬性要求：
1. 事件表单里删掉整个分类字段块：下拉、data-field="category"、add-category 按钮、window.prompt 添加分类的回调、currentCategory 变量、提交时传 category 的所有位置、appendChild(categoryFieldBox)。
2. 表单只校验日期与标题，缺哪个就把错误挂到哪个字段，不许残留分类校验。
3. filterBar 删掉 toggleCategory、case 'toggle-filter-category'、分类 chips 与 .htl-filter-categories 容器。
4. 星级筛选（含 4 星及以上）、关键词搜索（300ms 防抖）、清空筛选、正序/倒序切换必须原样保留；data-focus-key="filter.keyword" 不许改（main.ts 的 / 快捷键依赖它）。
5. 记录表单、封面上传、外链、关联选择一律不动。

严禁：
- 给分类换皮（标签/多选/颜色都不行）
- 改星级与关键词的筛选语义
- 改 main.ts、core、任何 CSS
- 把 window.prompt 换成自建输入框（这个功能整个不存在了）

完成标准：
- npm run typecheck 零错误，贴真实输出
- 交付可复现断言清单：表单里没有 data-field="category"、没有「分类」字样、select 数量减少；筛选栏没有分类 chips；星级与关键词筛选仍生效；清空筛选有效。DOM 断言由派发方用浏览器复跑，不要自述「已验证」。
```
