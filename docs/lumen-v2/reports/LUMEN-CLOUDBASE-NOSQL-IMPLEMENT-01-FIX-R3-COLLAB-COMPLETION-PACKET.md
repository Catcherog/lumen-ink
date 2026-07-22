# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 GPT 裁决落盘完成包

> **本完成包用途**：交付给 Web GPT（无本地仓库读取能力）做增量审查。本轮为 docs-only 落盘，不修改任何生产代码，不实施 FIX-R4。
> **生成时间**：2026-07-22
> **执行者**：Trae
> **任务 ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-SDK-CONTRACT`
> **子任务 ID（新增）**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-CODEX-TX-AUDIT-R3`

---

## 1. 本轮交付摘要

### 1.1 触发原因

GPT 对 FIX-R3（commit `627bd7e` + state `a858d7f`）作出 R3 裁决 `CODEX_REQUIRED`：R3 不予验收通过，不授权 Preview，不进入 PR 合并阶段，`readyForPreview=false` 必须继续保持。

### 1.2 本轮 Trae 执行内容（docs-only 落盘）

1. 创建 GPT R3 评审文件（reviews/）
2. 更新 STATE.json：状态 `awaiting_gpt_acceptance` → `changes_requested`；`nextActor` `gpt` → `codex`；新增 `fixR3GptReviewVerdict`、`fixR3GptReviewFindings`、`fixR4MinimumScope` 等字段
3. 更新 SESSION-HANDOFF.md：当前状态切换为 "等待 Codex 只读审查"，附 Codex 只读审查指令、FIX-R4 最低修复范围、Stop Conditions
4. 更新 PROJECT-MEMORY.md：section 5 追加 R3 裁决摘要
5. 更新 DECISION-LOG.md：新增 D-051 决策条目
6. 创建任务文件 tasks/active/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01.md

### 1.3 范围遵守（本轮 docs-only）

- ✅ 仅落盘 GPT 评审文件 + 状态文件 + 任务文件 + 完成包
- ✅ 不修改任何生产代码
- ✅ 不创建 PR
- ✅ 不授权 Preview 或 Production
- ✅ 不推进任务到 `completed`
- ✅ 不激活下一任务
- ✅ 不在 Codex 审查结论返回前启动 FIX-R4 实施

---

## 2. GPT R3 裁决摘要

### 2.1 Verdict: CODEX_REQUIRED

- AC-01、AC-02、AC-03、AC-05～AC-12 局部实现和测试证据基本成立
- **AC-04 仅"语法通过"，集成语义失败**（阻断项）

### 2.2 P0 阻断缺陷

#### P0-01：条件 Job 更新逃逸外层事务

- `updateIfClaimed()` / `updateIfActive()` 通过 `getDb().collection().where().update()` 绕过 AsyncLocalStorage 事务
- 在 `UnitOfWork.run()` 内调用时写入立即落到事务外
- 可能导致 Job `succeeded` + 外层事务 commit 失败 → Asset/Project 指针回滚 → Job 指向不存在结果

#### P0-02：`versions.createIdempotent()` 创建独立嵌套事务

- 仓储方法无条件调用 `getDb().runTransaction()` 而非复用当前事务
- Version/idempotency 可能在内层事务先行提交
- 外层事务失败后留下 Version/idempotency/Job/Asset/Project 不一致的部分提交
- 否定"ONE UnitOfWork"核心业务不变量

### 2.3 P1 缺陷

#### P1-01：项目删除双重预取竞态

- `ProjectService` 预取 + `deleteCascade` 事务外重新预取，两个快照之间可能产生新 Asset/Version
- "new doc orphan is harmless" 注释不成立

### 2.4 P2 缺陷（非阻断）

#### P2-01：SDK contract 测试证明范围被高估

- 测试验证 SDK 方法存在但未真正调用事务或验证 `tx.doc().get()` 返回结构
- 应降级描述为 "API surface smoke test"

### 2.5 缺失的关键测试覆盖

1. 外层 UoW 最终提交失败时，Job 不得已是 `succeeded`
2. `versions.createIdempotent()` 在已有外层事务时不得独立提交
3. Job 条件更新、Version idempotency、Asset 和 Project 指针必须全成或全败
4. 删除与 Generation 结果提交并发时，不得产生 DB 或 Storage orphan
5. 删除预取后新增 Asset 的确定性交错测试

---

## 3. Codex 只读审查指令（READ_ONLY）

### 3.1 任务标识

- **Task ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-CODEX-TX-AUDIT-R3`
- **Mode**：`READ_ONLY`
- **Risk Level**：`HIGH`
- **Objective**：审查 FIX-R3 是否真正满足 CloudBase NoSQL 下的跨仓储原子成功边界，并为 Trae 输出最小 FIX-R4 修复方案。**不得修改、提交或推送代码。**

### 3.2 Authoritative Range

- **Base SHA**：`87d0ba5`（FIX-R2 state update commit）
- **Code Result SHA**：`627bd7e`（feat: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 SDK contract）
- **State Commit SHA**：`a858d7f`（FIX-R3 state update with result SHA 627bd7e）
- **Branch**：`lumen/cloudbase-nosql-implement-01-fix-r3`

### 3.3 Files In Scope（8 个）

1. `src/server/infrastructure/persistence/cloudbase.nosql.ts`
2. `src/server/infrastructure/persistence/cloudbase.nosql.mock.ts`
3. `src/server/infrastructure/persistence/cloudbase.nosql.r2.behavior.test.ts`
4. `src/server/infrastructure/persistence/cloudbase.nosql.sdk-contract.test.ts`
5. `src/server/infrastructure/persistence/select.ts`
6. `src/server/services/ProjectService.ts`
7. `src/server/services/GenerationService.ts`
8. `src/server/domain/persistence.ts`

### 3.4 Mandatory Questions（7 项）

1. 当 GenerationService 在 UnitOfWork.run 内调用 updateIfClaimed 时，getDb().collection().where().update 是否逃逸外层事务？
2. 当 GenerationService 在外层 UoW 内调用 versions.createIdempotent 时，内部 getDb().runTransaction 是否造成独立提交？
3. 外层事务最终 commit 失败时，是否可能留下 succeeded Job、Version/idempotency 已提交但 Asset/Project pointer 回滚的状态？
4. 如何在不修改冻结 PersistenceDependencies 接口的前提下，实现事务感知的 updateIfClaimed/updateIfActive？
5. 如何避免 createIdempotent 在已有事务中启动嵌套独立事务？
6. ProjectService 的 Storage key 预取与 deleteCascade 子 ID 预取之间是否存在并发 orphan 风险？
7. 最小 FIX-R4 应新增哪些确定性交错和 commit-failure 测试？

### 3.5 Required Output

- Verdict: PASS / FIX_REQUIRED
- Confirmed P0/P1 findings
- Exact affected functions and lines
- Minimum safe design
- Required tests
- Whether frozen PersistenceDependencies can remain unchanged
- Explicit statement that no files were modified

### 3.6 Stop Conditions

- Do not modify code.
- Do not create commits or PRs.
- Do not use production credentials.
- Do not authorize Preview.

---

## 4. FIX-R4 最低修复范围（Trae 实施，必须在 Codex 审查结论返回后启动）

> **重要**：Trae 不得在 Codex 审查结论返回前自行启动 FIX-R4 实施。

1. **事务感知的 Job 条件更新路径**：
   - 无事务上下文时，可继续使用 `where().update()`
   - 有事务上下文时，必须使用当前 `tx.collection(...).doc(id).get()`，校验 lease/status 后再用同一事务的 `doc(id).update()`
   - 不得通过 `getDb()` 逃逸

2. **禁止 `versions.createIdempotent()` 在已有 UoW 中打开独立事务**：
   - 复用当前事务，或设计明确的 current-or-new transaction helper
   - 保证 Version、idempotency、Asset、Project pointer、Job success 同一提交边界

3. **增加外层 commit failure 回归测试**：
   - 强制最终 commit 抛错
   - 断言 Job 未成功
   - Version、Asset、idempotency、Project pointer 均无部分提交

4. **解决删除竞态**：
   - 至少引入 deletion lock/tombstone，使 Generation/Create child 在同一项目记录上参与事务冲突
   - Storage key 快照必须在项目进入稳定 deleting 状态之后获取
   - 不接受"孤儿无害"的处理

5. **修正文档**：
   - R3 commit 实际不仅含 4 个代码文件，也包含报告和状态文件
   - SDK contract test 的证明范围改为 API surface，不声称验证未执行的事务返回行为
   - `a858d7f` 确实只是结果 SHA 回填提交

---

## 5. 状态机当前状态

### 5.1 任务状态

- **任务 ID**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01`
- **状态**：`changes_requested`
- **nextActor**：`codex`
- **Codex 状态**：`REQUIRED_NOW_FOR_TX_AUDIT_R3`
- **`readyForPreview`**：`false`（必须继续保持）
- **`fixR3Status`**：`REJECTED_CODEX_REQUIRED`
- **`fixR4Status`**：`ready_for_codex_audit`
- **`fixR4CodexMustPrecedeTrae`**：`true`
- **`fixR4PersistenceDependenciesFrozen`**：`true`

### 5.2 Next Owner

- **Codex**：限定只读事务审查（READ_ONLY，不修改代码）
- **之后**：交回 Trae 实施 FIX-R4

### 5.3 Stop Conditions（持续生效）

- ❌ `readyForPreview` 保持 `false`（不得授权 Preview）
- ❌ 禁止合并到 main
- ❌ 禁止配置 Vercel Preview / Production
- ❌ 禁止使用 Production API Key
- ❌ 禁止运行 Production 数据迁移或写入
- ❌ Trae 不得在 Codex 审查结论返回前自行启动 FIX-R4 实施
- ❌ Codex 不得修改代码、创建 commit/PR、使用生产凭据

---

## 6. 本轮文件变更清单（docs-only）

### 6.1 新增文件

- `docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md`（GPT R3 评审文件，含全部 P0/P1/P2 findings 与 Codex 审查指令）
- `docs/lumen-v2/tasks/active/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01.md`（任务文件，含 FIX-R1/R2/R3 历史、R3 Review History、FIX-R4 最低修复范围、Codex 审查指令）
- `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-COLLAB-COMPLETION-PACKET.md`（本完成包副本）

### 6.2 修改文件

- `docs/lumen-v2/state/STATE.json`（`cloudbaseNoSqlImplement` 块：状态转为 `changes_requested / nextActor=codex`；新增 `fixR3GptReviewVerdict`、`fixR3GptReviewDate`、`fixR3GptReviewAcceptedAc`、`fixR3GptReviewBlockingAc`、`fixR3GptReviewFindings`、`fixR3MissingTestCoverage`、`fixR4Status`、`fixR4NextActor`、`fixR4TaskId`、`fixR4CodexAuditTaskId`、`fixR4CodexMode`、`fixR4CodexMustPrecedeTrae`、`fixR4MinimumScope`、`fixR4PersistenceDependenciesFrozen`、`previewBlockedReason`、`fixR3StateCommitSha`、`fixR3GptReviewPath` 等字段）
- `docs/lumen-v2/state/SESSION-HANDOFF.md`（当前状态切换为 "等待 Codex 只读审查"，附 GPT R3 裁决摘要、缺失测试、Codex 审查指令、FIX-R4 最低修复范围、Stop Conditions、最短收尾顺序、范围遵守；原 R3 实施完成状态移至 "历史状态"）
- `docs/lumen-v2/state/PROJECT-MEMORY.md`（section 5 "当前状态" 追加 R3 裁决摘要）
- `docs/lumen-v2/state/DECISION-LOG.md`（新增 D-051 决策条目）

### 6.3 未修改文件（重要）

- ❌ `src/server/infrastructure/persistence/cloudbase.nosql.ts`（不修改）
- ❌ `src/server/infrastructure/persistence/cloudbase.nosql.mock.ts`（不修改）
- ❌ `src/server/services/ProjectService.ts`（不修改）
- ❌ `src/server/services/GenerationService.ts`（不修改）
- ❌ `src/server/domain/persistence.ts`（不修改）
- ❌ 任何其他生产代码（不修改）

---

## 7. Git 信息

- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r3`
- **worktree**：`.worktrees/cloudbase-nosql-implement-01-fix-r3`
- **本轮 commit 计划**：docs-only commit，格式 `docs(lumen-v2): review LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3`（按 AGENTS.md §5）
- **前序 commits**：
  - `a858d7f` docs(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 state update with result SHA 627bd7e
  - `627bd7e` feat(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 SDK contract
  - `87d0ba5` docs(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2 state update
  - `63bd445` feat(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2 implementation

---

## 8. 最短收尾顺序（更新）

1. Trae 执行 FIX-R3 ✅
2. GPT 增量审查 R3 ✅ → 裁决 `CODEX_REQUIRED`
3. Trae 落盘 GPT 裁决、状态转为 `changes_requested / nextActor=codex` ✅（本轮）
4. **Codex 限定只读事务审查** ⏳（下一步）
5. Trae 实施 FIX-R4（基于 Codex 输出的最小事务设计） ⏳
6. GPT 验收 FIX-R4 ⏳
7. 配置独立 Preview namespace/prefix，执行真实 CloudBase 冒烟测试 ⏳
8. Preview 通过后解除 `readyForPreview=false` ⏳
9. 合并 main，恢复 Production Cron 与持久化验证 ⏳
10. 关闭 PERSIST-001、PROD-CRON-VERIFY、ROUTING-001，完成项目归档 ⏳

---

## 9. GPT 下一步建议

### 9.1 立即行动（GPT）

1. 审查本完成包，确认 Trae 落盘的 GPT R3 评审文件、STATE.json 状态变更、SESSION-HANDOFF.md、PROJECT-MEMORY.md、DECISION-LOG.md D-051 条目与原 GPT 裁决一致
2. 授权 Codex 启动 `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-CODEX-TX-AUDIT-R3` 只读审查（READ_ONLY，不修改代码）
3. 收到 Codex 审查结论后，转交 Trae 实施 FIX-R4

### 9.2 不应执行（禁止）

- ❌ 不授权 Preview
- ❌ 不授权合并到 main
- ❌ 不在 Codex 审查结论返回前授权 Trae 启动 FIX-R4
- ❌ 不修改冻结的 `PersistenceDependencies` 接口

---

## 10. 引用文件路径（仓库内）

- GPT 评审：`docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-GPT-REVIEW.md`
- 任务文件：`docs/lumen-v2/tasks/active/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01.md`
- STATE：`docs/lumen-v2/state/STATE.json`
- SESSION-HANDOFF：`docs/lumen-v2/state/SESSION-HANDOFF.md`
- PROJECT-MEMORY：`docs/lumen-v2/state/PROJECT-MEMORY.md`
- DECISION-LOG：`docs/lumen-v2/state/DECISION-LOG.md`（D-051）
- Trae FIX-R3 报告：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md`
- 门禁证据：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md`
- 本完成包仓库内副本：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-COLLAB-COMPLETION-PACKET.md`

---

**Status**：`CODEX_REQUIRED` / `READY_FOR_CODEX_READ_ONLY_AUDIT` / `readyForPreview=false`
**Next Owner**：Codex（限定只读事务审查） → Trae（FIX-R4 实施）
