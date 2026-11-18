---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T03 Core 日期与跨度

- **对应模块**: MOD-002
- **依赖**: T02
- **可并行**: 是

## 目标
实现日期解析、日序数、相隔天数、日历自然年月差、跨度文案。**REQ-020 的全部口径都在这个文件里，算错就是验收失败**。

## 允许改动的文件
```
src/core/date.ts
tests/date.spec.ts
```

## 接口（签名不得改动）
见 detailed-design.md §3 MOD-002 的 Public Interface 代码块，逐字实现。

## 算法硬要求
1. **天数必须走 UTC 零点**：`Date.UTC(y, m-1, d)` 相减除以 `86400000`，禁止用本地时区构造 Date（否则换时区结果会变，违反 REQ-020）。
2. **日历差**：先取不超过终点的最大整年数，再在余下区间取不超过终点的最大整月数，余数为天。
3. **月末收敛**：`addMonthsClamped(d, n)` 在目标月不存在该日时收敛到该月最后一天（如 1-31 加一月 → 2-28 或 2-29）。
4. **文案**：`y||m` 为真时只追加非零分量；`y` 与 `m` 都为 0 时只显示天数；dir 为 `'same'` 时返回 `'同一天'`，不显示 `0 天`、不显示 `0 个月`。

## 严禁
- 不引入 date-fns / dayjs / luxon 等任何日期库。
- 不使用本地时区 API（`new Date(y,m,d)`、`getFullYear()` 等）。
- 不返回 `undefined`，非法输入一律返回 `null`。

## 验收（必须逐条写成测试）
detailed-design.md §8.1 的 D1~D13 十三条，一条不漏。其中：
- D12 要在两种 `process.env.TZ` 下跑同一断言（`vitest` 里可用 `describe` 分组或两个 npm script 覆盖；若环境不支持切换，改为断言 `dayNumber` 只依赖 `Date.UTC` 的中间量——但必须在测试文件顶部注释说明）。
- D13 是闰日收敛用例，必须通过。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T03 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-002、§6.7 跨度文案、§8.1 的 D1~D13 全部用例。

任务：实现 src/core/date.ts 与 tests/date.spec.ts。函数签名严格照 §3 MOD-002 的 Public Interface，不得增删参数。

硬性要求：
1. 相隔天数必须用 Date.UTC(y, m-1, d) 相减再除 86400000，绝对不能用本地时区构造 Date——换时区结果必须不变。
2. 日历差算法：最大整年 → 最大整月 → 余数为天；整月推进遇到目标月没有的日期就收敛到该月最后一天。
3. 文案规则：形如「此前 2 年 8 个月 16 天（共 991 天）」——方向前缀（dir 为 before/after 分别写「此前」「此后」）+ 非零的年/月/天 + 结尾括号「（共 N 天）」；y 与 m 都为 0 时只显示「totalDays 天」；'same' 返回 '同一天'；绝不出现 '0 个月'；§6.7 的四条样例文案必须逐字对上。

严禁：引入任何日期库；使用本地时区 API；用 undefined 表示非法输入（一律返回 null）。

完成标准：tests/date.spec.ts 覆盖 D1~D13 全部用例并通过；npm run typecheck 无错误。把 vitest 的真实输出贴给我。
```
