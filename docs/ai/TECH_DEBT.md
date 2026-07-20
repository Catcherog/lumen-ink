### DEBT-STORAGE-01: STORAGE PoC 契约低于 PERSIST 恢复模型

- Status: OPEN
- Severity: P1
- Introduced By: STORAGE-001
- Context: STORAGE PoC 的实体、Job 状态和 `UnitOfWork`/lease/idempotency 表面足以证明候选 A 可适配，但低于 PERSIST-001 的细粒度状态、原子 claim 与陈旧 worker 拒写要求。
- Risk: 若原样接入业务层，多 worker 重试可能重复生成 Version，或 lease 失效的旧 worker 覆盖新结果；事务实现也可能只在内存 mock 成立。
- Reason Deferred: 不再启动一轮供应商选型返工；用户要求减少非必要审计并让 Trae 在一个扩大包内连续交付。
- Resolve Before: PERSIST-001 Task 3 结束前；业务服务和真实 CloudBase 接线开始前。
- Related Files:
  - src/server/domain/persistence.ts
  - docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md
  - docs/lumen-v2/reviews/STORAGE-001-GPT-REVIEW.md
- Resolution Requirements: 通过 D-040 契约收敛矩阵、两 worker 接管、stale worker 拒写、幂等唯一约束和同事务上下文合约测试；随后改为 RESOLVED。

<!--
  模板用途：技术债登记表，统一维护项目内已确认的技术债。
  来源改造方案章节：第 13 节。
  注意事项：
  - 避免同一个技术债重复记录。
  - 每条必须有明确的风险说明和处理阶段，不写没有处理阶段的永久待办。
  - 不要将纯代码风格偏好升级为重要债务。
  - 不在当前任务中无边界地顺手清债。
-->

# Tech Debt Registry — 光砚 Lumen Ink V2 (picture-edit)

## 格式说明

每条技术债使用以下结构登记：

```markdown
## DEBT-xxx: 简短标题

- Status: OPEN / IN_PROGRESS / RESOLVED
- Severity: P1 / P2  <!-- P0 不应进入技术债，应在当前任务解决 -->
- Introduced By: TASK-xxx  <!-- 或具体来源 -->
- Context: 简要背景。
- Risk: 不处理的潜在影响。
- Reason Deferred: 为何延后处理。
- Resolve Before: MVP / Public Beta / 其他里程碑。
- Related Files:
  - 路径/到/相关文件
```

## 当前条目

### DEBT-REPORT-01: BASE-001 Trae 报告前部测试数不一致（已修复）

- Status: RESOLVED
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 复核发现 `BASE-001-TRAE-REPORT.md` 第 1 节执行摘要、第 3.3 节测试文件、第 5 节验收命令结果表仍保留首次实施的 13 tests / server 8 passed (1 file)，与第 8.3 节更正说明和 evidence 的 21 tests / server 16 passed (2 files) 不一致。
- Risk: 报告内部矛盾影响验收可追溯性；远端审查者需交叉核对多节才能确定真实测试数。
- Reason Deferred: 首次落库时只更正了第 8.3 节，未回溯前部摘要。
- Resolve Before: BASE-001 验收落库时（2026-07-17 Trae 已修复）。
- Related Files:
  - docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md
  - docs/lumen-v2/evidence/BASE-001/test-results.txt
- Resolution: 2026-07-17 Trae 在验收落库时已将第 1 节执行摘要改为「21 个测试通过（client 5 + server 16）」，第 3.3 节说明更正为「16 个测试，2 个文件」并加注指向第 8.3 节，第 5 节表格同步更新为 16 passed (2 files) / 21 passed (3 files)。

### DEBT-REPORT-02: BASE-001 Trae 报告返工 docs commit 字段缺 SHA（已修复）

- Status: RESOLVED
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 复核发现 `BASE-001-TRAE-REPORT.md` 任务元数据中「返工 docs commit」字段只写提交标题 `docs(lumen-v2): review BASE-001`，未内嵌精确 SHA，需通过 GitHub commit 页面才能确认 `b015531727714102a68d3dd359ed51c82e9cbec6`。
- Risk: 报告与 commit 的绑定关系不自包含，远端审查者无法在文件内直接核对 SHA。
- Reason Deferred: 首次返工落库时只填了提交标题。
- Resolve Before: BASE-001 验收落库时（2026-07-17 Trae 已修复）。
- Related Files:
  - docs/lumen-v2/reports/BASE-001-TRAE-REPORT.md
- Resolution: 2026-07-17 Trae 在验收落库时已将返工 docs commit 字段改为 `` `b015531727714102a68d3dd359ed51c82e9cbec6` (`docs(lumen-v2): BASE-001 rework evidence and GPT review landing`，…) ``。

### DEBT-STATE-01: GPT 报告描述与 STATE.json 现状差异

- Status: OPEN
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 验收报告「债务」表称 `STATE.latestGptReview` 仍指向 `REPO-SEC-001-GPT-REVIEW.md`，并附 STATE patch 要求修正。但 Trae 落库前核查 `STATE.json` 发现 `latestGptReview` 已指向 `docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md`（在 2026-07-17 返工落库时已更新）。推测 GPT 复核时基于更早的 STATE 快照。
- Risk: 报告描述与仓库现状不一致，可能让后续审查者误以为 STATE 未推进。
- Reason Deferred: 差异已在 `SESSION-HANDOFF.md` 记录便于追溯；STATE 现状正确，无需改动。
- Resolve Before: 无需修复（STATE 现状正确）；差异记录保留至下次 GPT 复核确认。
- Related Files:
  - docs/lumen-v2/reviews/BASE-001-GPT-REVIEW.md
  - docs/lumen-v2/state/STATE.json
  - docs/lumen-v2/state/SESSION-HANDOFF.md

### DEBT-EVIDENCE-01: evidence 在非 clean 工作区执行、UTF-16/BOM 编码

- Status: OPEN
- Severity: P2
- Introduced By: BASE-001
- Context: GPT 2026-07-17 复核发现 BASE-001 evidence 在 HEAD 为 `a167343` 但工作区非 clean 的状态下执行；部分结果文件使用 UTF-16/BOM 编码，GitHub diff 以 binary 展示，影响可复现性和 diff 可读性。声明的脏文件不涉及 npm 验收链，不影响结果有效性。
- Risk: 后续任务若同样在脏工作区执行验收命令，可能引入不易察觉的污染；UTF-16/BOM 文件在 PR diff 中不可读，削弱证据可审查性。
- Reason Deferred: BASE-001 evidence 已落库且结果有效，重跑成本高于收益；规则约束后续任务即可。
- Resolve Before: UI-001 及后续所有任务的验收命令执行。
- Related Files:
  - docs/lumen-v2/evidence/BASE-001/
- Resolution Requirements: 后续任务在 clean checkout / git worktree 执行验收命令；结果文件统一 UTF-8 无 BOM；evidence README 声明工作区状态。

### DF-RULES-01: docs/ai/ 三个权威文件未提交到远端分支

- Status: OPEN
- Severity: Process
- Introduced By: 仓库整理（非 Lumen V2 任务）
- Context: GPT 2026-07-17 复核确认远端 `docs/lumen-v2-repo-collaboration` 分支仍无 `docs/ai/` 目录，`COLLABORATION-RULES.md`、`REVIEW_POLICY.md`、`CONFLICT-RESOLUTION.md` 三个权威文件均返回 404。本地工作区存在但 untracked，不能构成仓库权威事实。
- Risk: 远端审查者无法读取协作规则权威入口；新窗口 GPT 启动时引用的路径在远端不可达，影响协作一致性。
- Reason Deferred: `docs/ai/` 由之前会话创建，属仓库整理任务范围，不在 BASE-001 返工 commit 中提交（遵循「隔离当前任务」原则）。
- Resolve Before: 独立 docs-only 整理任务（不阻塞当前 MVP 推进）。
- Related Files:
  - docs/ai/COLLABORATION-RULES.md
  - docs/ai/REVIEW_POLICY.md
  - docs/ai/CONFLICT-RESOLUTION.md
  - docs/ai/（整个目录，含 10+ 文件）
- Resolution Requirements: 另建 docs-only 任务提交 `docs/ai/` 目录到远端分支；提交前执行 `node scripts/check-lumen-collab.mjs` 和人工脱敏检查；不混入任何生产代码或密钥。

<!--
  说明：
  - AGENTS.md 第 7 节"禁止行为"列出的是协作规则，不是技术债。
  - Lumen V2 的已知限制（同步请求接近平台上限、持久化缺失、Vercel /tmp 配置丢失、
    默认密码/JWT、UI 暴露模型等）已作为任务 ID 在 docs/lumen-v2/tasks/backlog/ 中
    跟踪（JOB-001 / STORAGE-001 / HARDEN-001 / UI-001 等），不在此重复登记。
  - 当某个 Lumen V2 任务验收为 MVP_PASS_WITH_DEBT 时，GPT 指出的 P1 技术债应
    追加到本文件，并标注 Introduced By 为对应任务 ID。
  - BASE-001 验收为 MVP_PASS_WITH_DEBT 时，GPT 指出的 5 项 P2/Process 债务
    已于 2026-07-17 追加到本文件（DEBT-REPORT-01 / DEBT-REPORT-02 / DEBT-STATE-01
    / DEBT-EVIDENCE-01 / DF-RULES-01）。其中 DEBT-REPORT-01 和 DEBT-REPORT-02
    在 Trae 验收落库时已修复（Status=RESOLVED）。
-->
