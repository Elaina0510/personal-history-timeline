---
doc_version: V0.0.1-R2
upstream: proposal.md V0.0.1-R2 / detailed-design.md V0.0.1-R2
---
# T06 Core 校验与强制转换

- **对应模块**: MOD-004
- **依赖**: T02、T03、T04
- **可并行**: 与 T07 并行

## 目标
两套入口：**表单校验（严格，超长即 error）** 与 **导入校验（宽容，超长截断降级为 warning）**。这是 REQ-011 与 REQ-025 的落点。

## 允许改动的文件
```
src/core/validate.ts
tests/validate.spec.ts
```

## 接口
见 §3 MOD-004，逐字实现：
```ts
export function validateEventInput(i: EventInput): Issue[];
export function validateRecordInput(i: RecordInput): Issue[];
export function validateUrlScheme(url: string): boolean;
export function validateCover(value: string): Issue[];
export function coerceEvent(raw: unknown, index: number): { event: TimelineEvent | null; issues: Issue[] };
export function coerceRecord(raw: unknown, index: number): { record: PersonalRecord | null; issues: Issue[] };
export function validateTopShape(json: unknown): { ok: boolean; data: TimelineData | null; issues: Issue[] };
```

## 两套入口的行为差异（必须严格区分）
| 情形 | 表单入口 | 导入入口 |
|------|---------|---------|
| 标题超 60 字 | `FIELD_TOO_LONG`（error，拒绝） | 截断到 60 + `FIELD_TRUNCATED`（warning） |
| 星级越界 | `RATING_OUT_OF_RANGE`（error，拒绝） | 夹取到 1 或 5 + `RATING_CLAMPED`（warning） |
| 分类不在字典 | 表单不可能出现（下拉限制） | 保留该分类 + `UNKNOWN_CATEGORY_ADDED`（warning） |
| 缺 id | — | 生成新 id + `ID_REGENERATED`（warning） |
| 关联含自身 | `SELF_RELATION`（error） | 剔除自身 + `SELF_RELATION`（warning） |
| 链接非 http(s) | `INVALID_URL_SCHEME`（error） | 丢弃该条链接 + `INVALID_URL_SCHEME`（warning） |
| 记录超 20 条 | `TOO_MANY_RECORDS`（error） | 保留前 20 条 + `TOO_MANY_RECORDS`（warning） |
| 缺必填（title/summary/category/date） | `MISSING_REQUIRED`（error） | 该条整体判为错误（`event: null`） |

## 硬要求
- `validateTopShape` 必须接受三种顶层形态：完整根对象、`{events:[...]}`、裸数组；后两者补 `categories=PRESET_CATEGORIES`、`ui.sortOrder='desc'`、`savedAt` 用当前时间字符串。
- `validateCover`：允许 `http:`、`https:`、`data:image/` 三种前缀，其余（含 `javascript:`、`data:text/html`、`file:`）报 `INVALID_URL_SCHEME`。
- 日期合法性一律委托 `date.isValidDateString`，不要自己写正则判 2 月 30 日。
- 本模块**只报告与建议值，不修改入参对象**。

## 严禁
- 不做 HTML 转义（渲染层负责）；不 pop 弹窗；不写 storage。

## 验收
§8.2 的 V1~V20 加 R1 新增的 V3b、V3c，全部通过。

## Prompt（可直接粘贴）
```
你是「个人历史时间轴」T06 任务的执行者。工作目录为项目根目录。

先读 detailed-design.md 的 §3 MOD-004（特别是"两套入口的差别"那段）、§4.4 字段级空值语义、§5.3 Issue 定义、§8.2 的 V1~V20 与 V3b/V3c。

任务：实现 src/core/validate.ts 与 tests/validate.spec.ts。七个导出函数签名严格照文档。

硬性要求：
1. 表单入口超长一律 FIELD_TOO_LONG（error）；导入入口超长一律截断 + FIELD_TRUNCATED（warning）。这两个 code 不能混用。
2. 星级越界在表单是 RATING_OUT_OF_RANGE（error），在导入是夹取 + RATING_CLAMPED（warning）。
3. validateTopShape 必须同时接受完整根对象、{events:[...]}、裸数组三种形态，后两者补默认值。
4. validateCover 只允许 http:/https:/data:image/ 三种前缀，data:text/html 必须报错。
5. 日期校验委托 date.isValidDateString，不要自己判断闰年。
6. 本模块不修改入参，不抛异常，一律返回 Issue[]。

严禁：做 HTML 转义、读写 storage、弹 UI、自己实现日期算法。

完成标准：§8.2 的 V1~V20 加两条插编用例 V3b、V3c（共 22 条）全部通过；npm run typecheck 无错误。贴出真实测试输出。
```
