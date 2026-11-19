---
doc_version: V0.0.2
upstream: proposal-v0.0.2.md V0.0.2 / detailed-design-v0.0.2.md V0.0.2-R1
---

# T22 core 校验与合并 —— 删分类校验

- **对应模块**: MOD-004 `validate.ts` + MOD-005 `merge.ts`
- **依赖**: T21
- **可并行**: 与 T23 并行。两者必须都完成，W1 窗口才关闭

## 目标

事件校验不再要求分类；旧数据里的 `categories` 与 `category` 在归一化阶段被**剥掉**（`delete`，不是置空）；导入 V0.0.1 旧文件时分类字段静默忽略、不产生任何 Issue。

## 允许改动的文件

```
src/core/validate.ts
src/core/merge.ts
tests/validate.spec.ts
tests/merge.spec.ts
```

## 要改的地方

### `validate.ts`

| 行区间（当前代码，以实际为准） | 动作 |
|------|------|
| `101-106`（`validateEventInput` 的 `// 3. category`） | 整段删除 |
| `351-370`（`coerceEvent` 的 `// 4. category`） | 整段删除，包括超长截断与 `UNKNOWN_CATEGORY_ADDED` 的 warning |
| `488` 附近（`coerceEvent` 返回对象里的 `category,`） | 删掉这个键（上表那三段删完它仍在，`tsc` 会报） |
| `520-530` 附近（`validateTopShape` 裸数组分支里的 `categories: [...PRESET_CATEGORIES]`） | 整行删除，不能留 `categories: []` |
| `547-574`（根对象归一里的 `rawCategories` / `categories`） | 改为剥离：对根对象 `delete raw.categories`，不再构造分类数组 |
| 文件内注释里提到「分类」的 | 一并删干净 |

> 清单是按 `grep -n categor src/core/validate.ts` 抄的，但**以 `tsc` 报错为准**：清单外若还有残留（上面 488 与 520-530 就是典型的两处），按报错逐个清掉，不要因为「清单改完了」就收工。

### `merge.ts`

| 行区间 | 动作 |
|------|------|
| `73` 起的 `mergeCategories()` | 整个函数删除 |
| `240-280`（覆盖模式的 `categories: [...PRESET_CATEGORIES]`） | 删除；覆盖模式只替换 `events` 与 `ui` |
| `327-419`（导入条目校验里的 `category` 必填/超长/未知分类） | 删除 |
| `460` 附近（组装 coerce 结果时的 `category`） | 删除该键 |
| `544-558`（合并后 `mergedCategories` 与事件补分类） | 整段删除 |

### 测试

**删除**：
- `validate.spec.ts`：`V2`（category 为空报 MISSING_REQUIRED）、`V17`（新分类 UNKNOWN_CATEGORY_ADDED）
- `validate.spec.ts` 的「额外：validateTopShape - 完整根对象保留 ui 与 自定义分类」→ 改写为「保留 ui、忽略 categories」
- `merge.spec.ts` 中所有断言分类并集的用例/断言

**新增（按 detailed-design-v0.0.2 §8.2 写；V-A1 的断言以本文件为准）**：
- `V-A1`：事件对象带 `category: ''`、date/title 合法 → `validateEventInput({ date, title })` 返回**空数组**（`issues.length === 0`），且没有任何一项 `field === 'category'`。
  ⚠️ `validateEventInput` 的返回类型是 `Issue[]`，没有 `ok`、没有 `issues` 字段——设计文档 §8.2 那句「`ok === true`」是笔误，别照着写，照写会编译不过。
- `V-A2`：根对象含 `categories: ['A','B']` → `validateTopShape(obj)` 后 `Object.hasOwn(data,'categories') === false`，且无 error 级 issue
- `M-A1`：导入 V0.0.1 格式文件（根带 `categories`、2 条事件各带 `category`，date/title 合法）→ `previewImport({mode:'merge'})` 的 `counts.errors === 0`、`counts.added === 2`、items 里任何 `message` 都不含「分类」
- `M-A2`：本地 1 条事件 + 导入同 id 的旧格式事件 → `applyImport` 后 updated 1，且结果事件 `Object.hasOwn(e,'category') === false`

删除用例时同步删掉文件头用例索引里对应的行，不留空号。

## 严禁

- **不许写成 `category: ''` 或 `category: undefined`**。必须是 `delete`，让 `Object.hasOwn(obj,'category') === false`。
- 不许为旧格式文件加「分类升级为标签」之类的兼容逻辑。
- 不许改导入预览的结构（`ImportPreview` 的字段一个不动）。
- 不许动 `store.ts`（T23 负责）与任何 `ui/` 文件。
- 不许为了让测试变绿而放宽其它校验（日期、星级、链接协议）。

## 验收清单

1. `npm run test -- tests/validate.spec.ts tests/merge.spec.ts` 全绿，贴真实输出。
2. `grep -n "categor" src/core/validate.ts src/core/merge.ts` 返回 0 行。
3. `grep -n "categor" tests/validate.spec.ts tests/merge.spec.ts` 只出现在新增的 V-A1/V-A2/M-A1/M-A2 里。
4. 新增 4 条用例单独跑也绿（贴 `-t` 过滤后的输出）。

## Prompt（可直接粘贴）

```
你是「个人历史时间轴」项目 T22 任务的执行者。工作目录是 D:/hermeswork/personal-history-timeline（就在这个目录里开工，不要另建工作区）。

前置：T21 已完成（src/core/types.ts 里已经没有 category / categories / CATEGORY_MAX / PRESET_CATEGORIES）。当前 npm run typecheck 是红的，你的任务是把 validate.ts 与 merge.ts 修好，不要碰其它文件。

先读（只读）：
- detailed-design-v0.0.2.md 的 §4.1/§4.2（字段级）与 §4.6（IssueCode 删除清单）、§6.6（导入兼容）、§8.2（新增用例）
- proposal-v0.0.2.md 的 REQ-002、REQ-029

任务：改 src/core/validate.ts、src/core/merge.ts 及其对应测试。

硬性要求：
1. 事件校验只剩 date、title 两个必填项。validateEventInput 与 coerceEvent 里的 category 校验段整段删除；coerceEvent 返回对象里的 category 键、validateTopShape 裸数组分支里的 categories 也要删（这两处不在主清单里，但 tsc 会报）。
2. 根对象归一化时，旧数据的 categories 必须用 delete 剥掉，不是设成空数组、不是设成 undefined。剥完之后 Object.hasOwn(data,'categories') 必须是 false。
3. merge.ts 的 mergeCategories 函数整个删除；覆盖模式不再拼 categories；导入条目不再读 category。
4. 旧文件里带 category 的事件：不报错、不产生 warning、不出现在预览明细里。这是静默忽略。
5. 测试：删掉 V2、V17 与分类并集相关断言；新增 V-A1、V-A2、M-A1、M-A2（V-A2/M-A1/M-A2 的 Given/When/Then 见设计 §8.2，可逐字照抄；V-A1 的断言见本任务正文——validateEventInput 返回 Issue[]，没有 ok/issues 字段，别照抄设计里那句 ok === true）。

严禁：
- 写成 category: '' 或 category: undefined（必须 delete）
- 为旧文件加分类迁移/标签兼容逻辑
- 改 ImportPreview / ImportReport 的结构
- 改 store.ts 或任何 ui/ 文件
- 放宽日期、星级、链接协议的校验

完成标准：
- npm run test -- tests/validate.spec.ts tests/merge.spec.ts 全绿，贴真实输出
- grep -n "categor" src/core/validate.ts src/core/merge.ts 返回 0 行，贴输出
- 不要自述「已完成」
```
