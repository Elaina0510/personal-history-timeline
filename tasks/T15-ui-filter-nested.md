---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T15 筛选条与年份导航

- **对应模块**: MOD-013
- **依赖**: T07、T09、T11、T12
- **可并行**: 与 T14 并行

## 目标
分类 chips、星级按钮、搜索框（300ms 防抖）、清空筛选、排序切换、年份锚点、回到顶部、滚动高亮跟随。

## 允许改动的文件
```
src/ui/parts/filterBar.ts
src/ui/parts/yearNav.ts
```

## 接口
```ts
export function renderFilterBar(state: AppState): void;
export function renderYearNav(state: AppState, groups: YearGroup[]): void;
export function scrollToYear(year: string): void;
export function scrollToTop(): void;
```

## 实现要点
1. 搜索框：`input` 事件 → 防抖 `SEARCH_DEBOUNCE_MS=300` → `store.setFilters({keyword})`。**防抖回调里只改 state，不直接动 DOM**（重绘由 subscribe 触发）。
2. 分类 chips 多选、星级多选 + 「≥4 星」快捷（选中时清空等值选择）、清空筛选一键重置。
3. 排序切换写 `store.setSortOrder()`，会持久化。
4. 年份锚点只列 `allYears()` 给出的年份（当前结果中存在的）。
5. 滚动高亮：`IntersectionObserver`（rootMargin 考虑吸顶头部高度），当前年份 chip 加 `.is-active`。
6. 回到顶部：`window.scrollY > 一屏` 时显示，点击 `scrollToTop()`。
7. 筛选结果为空时隐藏年份导航。

## 严禁
- 不做匹配计算（`matchFilters` 在 core/select）。
- 不在防抖回调里手动重建卡片列表。
- 不用 `scrollIntoView` 的 `block:'center'`（会与吸顶标题冲突，用 `'start'` + 偏移）。

## 验收清单（每条都要写成可复现断言，由派发方自动化复跑）
- 输入后 300ms 内不再触发筛选，超时后只触发一次。
- 筛选后年份列表减少且无空年份。
- 滚动时锚点高亮跟随；点锚点平滑滚动到该年份（`prefers-reduced-motion` 下瞬时）。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T15 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-013、§4.5 的 SEARCH_DEBOUNCE_MS、§4.6 DOM 契约；proposal.md 的 REQ-015/016/017。

任务：实现 src/ui/parts/filterBar.ts 与 yearNav.ts，四个函数接口照文档。

硬性要求：
1. 搜索 300ms 防抖，回调里只调用 store.setFilters，不许直接改 DOM。
2. 星级筛选含「≥4 星」快捷项，选中它时清空等值选择。
3. 年份锚点只列当前筛选结果中存在的年份；结果为空时隐藏导航。
4. 滚动高亮用 IntersectionObserver，考虑吸顶标题高度。
5. 回到顶部按钮在滚动超过一屏后出现。
6. 不做任何匹配计算，一律用 core/select 的结果。

严禁：在防抖回调里手动重建列表、用 scrollIntoView 的 center 对齐、自己实现筛选谓词。

完成标准：验收三条（防抖只触发一次；筛选后年份列表减少且无空年份；滚动高亮跟随且点击锚点定位正确）。交付方式：把你执行过的每一条验收写成可复现断言——操作步骤、定位用的选择器或 data-* 键、期望的 DOM/状态结果，随代码交出；DOM 断言由派发方用浏览器自动化复跑，你不要自述「已验证」。npm run typecheck 无错误，并贴真实输出。
```
