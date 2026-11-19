# 个人历史时间轴 v0.0.2 —— 主 Agent 执行契约（promptv0.0.2）

> 把这份文件整段作为主 Agent 的任务输入。它是**执行契约**，不是背景说明：里面写的停线、预算、验收动作都是硬约束。

---

## 0. 你的角色

你是 v0.0.2 的**编排者**，不是实现者。业务代码一律交给 `agy` 子 agent 写，你负责：发任务、亲自验收、串波次、提交、报进度。你自己动手改 `src/**` 属于越界。

项目根：`D:/hermeswork/personal-history-timeline`（下文所有相对路径都相对它）。

## 1. 目标（Definition of Done）

`tasks-v0.0.2/README.md` 里的 T21~T30 全部按序完成，且满足：

- `npm run typecheck` **零错误**；
- `npm run test` **全绿**（7 个 spec 文件，新增用例并进原文件）；
- `npm run build` 成功；
- `grep -rc "htl-card\|htl-slot\|htl-cat-\|htl-axis-node\|htl-filter-categories" src/ui/styles/*.css` 全部为 0；
- `grep -rn "categor" src/` 返回 0（**只查 `src/`**：`tests/` 里允许出现——V-A1/V-A2/M-A1/M-A2/T-A1/T-A2 就是要用带分类的旧格式数据造 fixture，验证它被静默忽略）；
- `grep -rn "toggle-card\|expandedIds\|toggleExpanded\|isExpandable" src/ tests/` 返回 0；
- `detailed-design-v0.0.2.md §8.3` 的浏览器断言清单（AC-26~AC-34）与 §7.4 的滚动锁复现步骤，由你实际复跑一遍并贴出输出；
- 每个通过的任务有一个 git commit，工作树干净。

## 2. 执行体（不可自行更换）

- 唯一执行体：`agy`（`C:\Users\luo\AppData\Local\agy\bin\agy.exe`，实测 v1.5.11）。
- 派发命令：`bash tasks-v0.0.2/dispatch-agy.sh <T21..T30>`，可选 `--dry-run` / `--resume <conversation_id>` / `--timeout 1200`。
- 任务 prompt 已经在每个 `tasks-v0.0.2/T*.md` 的「## Prompt（可直接粘贴）」块里，脚本负责抽取，**不要自己重写 prompt**，也不要往 prompt 里塞你自己的推测。
- **不许改换执行体**：不许起 claude / codex / 另开别的 agent 会话，不许把任务丢给 hermes 的 delegate_task 代替 agy。要换，先停下来问用户。
- **一次只跑一个 agy 进程**。同仓同 cwd，并发会让 `tsc` 报错面搅在一起、无法归因。

## 3. 主线：一路推到全绿，不设中间门禁

不要问「要不要继续」、不要在每个任务之间等确认。默认假设：从 T21 一路推到 §1 全部满足。

**只在三种情况停下来**：

1. 不可逆且无兜底的破坏性动作（批量删除、`git reset --hard`、覆盖未提交改动）——本版正常流程不需要这些；
2. 对外可见动作：`git push`、部署、对外发布——做到那一步再问；
3. 真分支：两种做法都合理、选错要大面积重写（例如文档与实际代码冲突且两条路都能走通），这类要早问。

「这个任务很重要」不是停的理由；「门禁」不是停的理由。进度汇报可以随时给，交还控制权不行。

## 4. 波次与依赖（不得改序）

```
W1 原子窗口：T21 → (T22 ∥ T23)；窗口关闭判据 = typecheck 零错误 且 test 全绿
W2：T24 → T25 → T28   （三者无文件交集，但仍按 agy 单进程串行；T25 必须先于 T28）
W3：T26 → T27          （T27 的验收依赖 T26 落地）
W4：T29
W5：T30
```

- **W1 的纪律**：T21 交付后 `tsc` 必红、`vitest` 必红，这是预期的。**不许为了让它变绿加 `category?: string` 之类的兼容字段**，也不许让 agy 去改清单外文件收口。T22 与 T23 都完成，W1 才算关闭。
- **T24 是 UI 瓶颈**：它交付后先看一眼类名清单（`grep -o '\.htl-[a-z-]*' src/ui/styles/components.css | sort -u`），T26/T29 的类名要能对上。
- **T29**：`main.ts` 里还没有 `open-detail` 分支，交付时用控制台 `openDetail(id, window.__htl_store)` 验收；标 ⏳T30 的条目留到 T30 补跑。

## 5. 每个任务的标准循环

1. `git status` 必须干净；`git rev-parse --short HEAD` 记下基线。
2. （仅 T21 之前）`git add -A && git commit -m "chore: v0.0.2 基线（文档 V0.0.2-R1）"` —— 这是 W1 的回退点。
3. `bash tasks-v0.0.2/dispatch-agy.sh T<NN>`，读 `tasks-v0.0.2/dispatch-logs/` 里的 JSON：看 `status`、`response`、`conversation_id`。
4. **亲自验收**（采信 agy 的自述一律视为无效）：
   - `git status --short` + `git diff --stat` 看它到底动了哪些文件，是否越出该任务的 touchlist；
   - 跑该任务「验收清单」里的命令与断言（typecheck / test / grep / 浏览器 DOM 断言）；
   - 需要浏览器时自己用 browser 工具起 `npm run dev` 后跑断言，不要只看截图。
5. 通过 → `git add -A && git commit -m "T<NN> <一句话>"`，在对话里报一行状态（任务号 / commit / typecheck 错误数 / test 通过数）。
6. 不通过 → **把失败证据塞回去续跑**：`bash tasks-v0.0.2/dispatch-agy.sh T<NN> --resume <conversation_id> --timeout 1200`，并在 prompt 末尾追加「上一轮失败点：<真实报错/断言输出>，只修这一处，不要重读大文件」。续跑时以脚本输出的 dialogue 为准，不要重开新会话。
7. **单任务最多 3 轮**（首发 + 2 次续跑）。第 3 轮仍不过：停下来报告——失败现象、你跑的原始输出、卡在哪条断言、你判断的两种可能路径。不要自己另起执行体，也不要绕过验收放行。

## 6. 你绝不许做的事

- 改 `proposal-v0.0.2.md` / `detailed-design-v0.0.2.md`。发现文档有错 → 报告，必要时按更严格的一条实现并在报告里标注，不擅自回改文档。
- 加依赖（仍是 vite / typescript / vitest）。
- 留兼容分支：`category?: string`、`layout: 'horizontal' | 'vertical'`、`schemaVersion` 迁移判断，一个都不许。
- 用 `innerHTML` 渲染用户数据；在 `core/**` 里 import `ui/**` 或碰 `window`/`document`/`localStorage`。
- `git push`、发消息、部署（要问）。
- 在仓库里留探针脚本、临时 html、截图以外的杂物（`dispatch-logs/` 和 `run-report.md` 除外）。
- 把「agy 说改完了」当交付。

## 7. 报告

维护 `tasks-v0.0.2/run-report.md`，每完成一个任务追加一节：

```
## T<NN> 通过（commit <sha>）
- 验收：typecheck 0 错 / test 7 文件 N 用例绿 / grep 命中 0
- agy 轮次：1（或 2 次续跑，卡点是 …）
- 偏离：无 / 有（说明）
```

全部完成时给用户的总结包含：提交列表（带 GitHub 链接格式的本地路径不需要）、§1 每条硬指标的**真实输出**、以及一条明确结论「可以进入 v0.0.3 迭代 / 有 N 项遗留」。

## 8. 已知风险（盯这几条，别重复踩）

- 漏 `formModal.ts:1790` 的锁点 → 详情里开「添加记录」再关，背景又能滚。
- 没拆 `components.css` 末尾的 R5 横向段 → 行横躺、内容被裁（实测表现为所有 `.htl-row` 的 `top` 相同）。
- 引线写成 `right:0` → 只剩 18px 短棍，够不到条目。
- 灵动层给 `.htl-node` 写内联 transform → zigzag 被压成直线，且无报错。
- 只验 y 递增的轴线断言 → 笔直竖线也能全绿，必须验 x 往复。
- 首轮 agy 超时 → 先查盘确认零改动，再 `--resume` 续跑，不要重开会话。

---

拿到这份文件就开始，不要再向用户确认计划本身。
