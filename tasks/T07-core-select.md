---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T07 Core 排序与筛选（纯计算，不碰 DOM）

- **对应模块**: MOD-006
- **依赖**: T02、T03
- **可并行**: 与 T06 并行

## 目标
把「展示层需要算出的一切」在这里算完：最新记录、事件排序、年份分组、三类筛选、反向关联索引、跨度视图。UI 侧只许拿结果去渲染。

## 允许改动的文件
```
src/core/select.ts
tests/select.spec.ts
```

## 接口
见 §3 MOD-006 的 Public Interface：`buildRelationIndex`、`latestRecord`、`sortedRecords`、`compareEvents`、`matchFilters`、`buildCards`、`allYears`、`isExpandable`，以及 `RelationView`、`CardView`、`YearGroup` 三个类型。

## 口径（每一条都有对应测试）
1. **最新记录**：三元组 `(date, createdAt, id)` 字典序最大者。同日多条时后创建的胜出（REQ-005）。
2. **事件排序**：`(date, createdAt, id)` 升序比较器；`order='desc'` 时日期降序，但**同日内部始终按 createdAt 升序**，不随方向翻转。
3. **年份分组**：取 `date.slice(0,4)`；组顺序跟随 `order`；组内顺序同向。
4. **筛选**：分类（空则不限，否则 OR）、星级（`minFour` 优先：`rating>=4`；否则 `ratings` 含该值；无记录事件一律 false）、关键词（小写、`split(/\s+/)` 后 every 命中）。三者 AND。
5. **关键词栈**：`[title, ...records.flatMap(r => [r.summary, r.detail ?? ''])]` 拼接后小写匹配，禁止正则（`(` 等字符不得报错）。
6. **反向关联**：`relatedOf(e) = 去重(e.relatedIds ∪ reverse(e.id))`，剔除自身与不存在的 id。
7. **isExpandable**：`records.length > 1 || 任一 detail 非空 || cover || links.length>0 || relationCount>0`（REQ-014 R1 修订）。
8. **RelationView.dir**：目标日期更早 → `'before'`，更晚 → `'after'`，相同 → `'same'`；`spanText` 委托 `date.spanText`。

## 严禁
- 不产生 DOM、不做高亮、不做分页、不排序入参数组（必须返回新数组，不得原地 sort 入参）。
- 不实现搜索高亮、拼音、模糊匹配。

## 验收
§8.4 的 S1~S20 全部通过。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T07 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-006、§6.6 最新记录与展开条件、§6.7 跨度文案、§8.4 的 S1~S20。

任务：实现 src/core/select.ts 与 tests/select.spec.ts。导出函数签名严格照 §3 MOD-006。

硬性要求：
1. 最新记录按 (date, createdAt, id) 三元组取最大；同日多条时后创建者胜出。
2. 事件排序 desc 时日期降序，但同日内部必须始终 createdAt 升序，不随排序方向翻转。
3. 无记录的事件在任何星级筛选下都返回 false（REQ-005）。
4. 展开条件：记录数 > 1 或任一 detail 非空或 cover 或 links 或关联数 > 0（REQ-014）。
5. 关键词搜索用小写 includes + 空格分词 every，禁止正则。
6. 反向关联要合并主动与被动的 id 并去重、剔除自身与不存在的 id。

严禁：产生 DOM、原地排序入参数组、实现拼音或模糊匹配、做关键词高亮。

完成标准：S1~S20 全部通过；npm run typecheck 无错误。贴出真实测试输出。
```
