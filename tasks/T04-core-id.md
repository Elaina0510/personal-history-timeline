---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T04 Core ID 生成

- **对应模块**: MOD-003
- **依赖**: T02
- **可并行**: 是

## 目标
生成 `evt_<13位毫秒>_<6位36进制>` 与 `rec_...` 形式的主键，并提供供校验复用的正则。

## 允许改动的文件
```
src/core/id.ts
tests/id.spec.ts
```

## 接口
```ts
export function createId(prefix: 'evt' | 'rec', nowMs: number, rand: () => number): string;
export const ID_PATTERN: RegExp;   // /^(evt|rec)_\d{13}_[0-9a-z]{6}$/
```

## 硬要求
- 随机源必须由参数注入（`rand`），模块内不得直接调用 `Math.random`——否则无法确定性测试。
- 36 进制字符集固定为 `0-9a-z`，长度恒为 6，不足补零。
- 不使用 `crypto.randomUUID`（格式与设计不符）。
- 随机值必须夹取到 `36^6 - 1` 再转 36 进制，保证末段恒为 6 位（见 §8.0 的 I2b）。

## 验收（写成测试）
| # | Given | When | Then |
|---|-------|------|------|
| I1 | `nowMs=1770000000000`, `rand` 恒返回 0 | `createId('evt',...)` | 匹配 `ID_PATTERN` 且以 `evt_1770000000000_000000` 结尾 |
| I2 | `rand` 恒返回 0.9999999999 | 同上 | 末 6 位为 `zzzzzz`（实现须把随机值夹取到 36^6−1，不能四舍五入溢出到 7 位） |
| I2b | `rand` 恒返回 `1`（越界注入） | 同上 | 仍为 6 位 `zzzzzz`；产出 7 位即失败 |
| I3 | 任意 | `createId('rec',...)` | 以 `rec_` 开头 |
| I4 | 固定 `nowMs`，`rand` 用确定性伪随机序列（种子化 LCG）连续生成 1000 个 | 去重 | 1000 个全不相同（禁用 Math.random，避免概率性失败） |

## 严禁
- 不依赖时间之外的全局状态（不得模块级缓存计数器）。
- 不生成 UUID 格式。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T04 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-003、§4.2、§4.3 的 id 字段说明，以及 §8.0 的 I1~I4（含 I2b）。

任务：实现 src/core/id.ts 与 tests/id.spec.ts。导出 createId(prefix, nowMs, rand) 与 ID_PATTERN。

硬性要求：随机源必须由 rand 参数注入，模块内部不得直接调用 Math.random；36 进制字符集为 0-9a-z，固定 6 位不足补零；ID_PATTERN 供 validate 模块复用，正则必须与生成格式严格对应。

严禁：使用 crypto.randomUUID；模块级缓存计数器；任何全局可变状态。

完成标准：测试覆盖 §8.0 的 I1、I2、I2b、I3、I4 五条并全部通过；I4 的 1000 次无重复必须固定 nowMs 并注入确定性伪随机序列（如种子化 LCG），不许用 Math.random——否则是概率断言，会偶发红；npm run typecheck 无错误。贴出真实测试输出。
```
