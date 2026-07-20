# Trae Prompt｜PERSIST-001 项目版本与可恢复生成闭环

> 前置条件：FLOW-001 已通过；STORAGE-001 已由 GPT 于 2026-07-18 冻结为候选 A。
> 当前状态：`changes_requested / nextActor=trae`。按首轮 GPT FIX_PACKET 只修 4 个 P0 及直接回归。

## 目标

在同一任务 ID、分支和 PR 中合并原 VERSION-001 与 JOB-001，一次交付：

- Project、Asset、不可变 Version、GenerationJob；
- 上传创建 original Asset 与 V0；
- Job 创建、真实状态、查询、best-effort 取消、重试和刷新恢复；
- 成功顺序 Asset → Version → Job succeeded；
- 失败/取消不创建成功 Version；
- 真实版本条、查看、对比、激活和采用；
- 项目级联删除与对象清理；
- 旧 history 备份、只读查看和显式导入；
- 旧 `/api/edit` 受控兼容与弃用路径。

## 权威输入

- 设计：`docs/lumen-v2/specs/09-PERSISTENT-GENERATION-CLOSURE-DESIGN.md`
- 实施计划：`docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md`
- 存储决策：`docs/lumen-v2/storage-options.md`（必须为 frozen）

## 执行规则

- Trae 严格按实施计划的 Task 1—12 执行并勾选；
- TDD：先失败测试，再最小实现，再通过测试；
- 每个任务形成独立可回滚 commit，最终统一 push；
- 不实施 ROUTING、多工作区 IAM、Preview、图层或 Production 全量 HARDEN；
- 按 D-034 合并内部安全底线：运行时 secret fail-fast、登录限流、CORS allowlist、服务端图片解码/大小/像素校验、Provider 响应与 health/log 脱敏；完整公开发布 HARDEN 仍不在本任务；
- 不使用真实客户数据，不伪造进度或成功版本；
- 未满足前置条件时只能标记 blocked。
- 除付费/真实凭据、不可逆迁移、数据/安全 P0、候选 A 无法实现 D-040 语义或完整门禁失败外，不做普通阶段交接。

## 验收

以设计第 9 节、实施计划 Task 11—12 和 `07-ACCEPTANCE-PLAN.md` 的 Gate PERSIST-001 验收。任何失败/取消创建成功 Version、刷新不可恢复、删除残留资产或伪进度均为 P0。

内部稳定版还必须通过 `INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 5—8 的安全矩阵。默认密码/JWT fallback、凭据/图片泄漏、未授权访问或上传校验绕过均为 P0，不得登记为延期。

## Review History

### 2026-07-18｜GPT 首轮验收

- 结论：`MVP_FAIL`
- 审查目标：`6eaec946..4e3a125`
- P0：缺少 CloudBase 生产 adapter/真实 executor；最终 lease 失败污染 Version；执行中取消可被覆盖为 succeeded；执行忽略冻结的 `inputVersionId`。
- FIX_PACKET：`docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`
- 状态：`changes_requested / nextActor=trae`；不得激活后续任务。

### 2026-07-20｜P0 修复轮 / P0 修复轮 2 / FINAL-CLOSURE / FINAL-CLOSURE-FIX-01

- **P0 修复轮**（HEAD `cf0a080`）：修复 P0-01~04；GPT 二轮仍 `MVP_FAIL`。
- **P0 修复轮 2**（HEAD `af960e3`）：修复 P0-01A~C / P0-02A / STATE-01；GPT 给出 FINAL-CLOSURE 修复包。
- **FINAL-CLOSURE**（HEAD `13ea500`）：一次性修复 AC-01~12（JobPatch 三态语义、lease 生命周期契约、事务回滚回归、worker GET+POST 路由、Hobby 配置注释修正、状态/证据同步）；GPT 给出 FIX-01 修复包。
- **FINAL-CLOSURE-FIX-01**（HEAD `1aeec8e` + `08818c6` backfill + `f0bdbed` Vercel 验证归档）：修复 AC-FIX-01~10（vercel.json cron daily、maxDuration Fluid Compute 注释、状态文件不一致修正、事务测试证据描述修正、统一 8 门禁真实输出、Vercel 部署验证）。
- 8 门禁：全绿（client 194 + server 224 = root 418 tests；dist/ 已清理）。
- 审查文件：`docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`（追加 EVIDENCE_REVIEW_PASS 节）。
- 状态：`gpt_evidence_review_pass / nextActor=user_or_trae_for_merge` → 合并完成后 `nextActor=gpt`。
- 详见 `docs/lumen-v2/state/SESSION-HANDOFF.md` 和 `docs/lumen-v2/state/CHANGELOG.md`。

### 2026-07-20｜合并到 main（fast-forward push）

- 合并方式：fast-forward push `76d18f7..f0e28dd`（非 force-push；main 是 lumen/persist-001-trae 的祖先）。
- 远端 main HEAD：`f0e28dd`；本地 main HEAD：`f0e28dd`（已同步）。
- 包含 commit：`6eaec94..f0e28dd`（20 个 commit，覆盖 PERSIST-001 全部实施 + 修复轮 + Verdict 归档）。
- PROD-CRON-VERIFY 任务创建：`docs/lumen-v2/tasks/backlog/PROD-CRON-VERIFY.md`（pending，待 GPT 激活；Trae 不得自行激活）。
- 状态字段：`production_cron_registration` / `production_cron_execution` 保持 `PENDING_POST_MERGE` / `NOT_TESTED`，不得提前改 VERIFIED。
- 状态：`gpt_evidence_review_pass / nextActor=gpt`，等 GPT 确认合并 + 决定下一步推进（用户明确要求"快速推进项目"）。
- PERSIST-001 在 PROD-CRON-VERIFY 通过前**不归档**到 `tasks/completed/`。

### 2026-07-21｜POST-MERGE-PARALLEL-ACTIVATION-01（保持未归档，主线切换到 HARDEN-001）

- 触发：GPT 任务卡 `POST-MERGE-PARALLEL-ACTIVATION-01`，用户授权 R2 路径，并行激活 HARDEN-001 + PROD-CRON-VERIFY。
- 本任务（PERSIST-001）状态：保持 `gpt_evidence_review_pass / nextActor=gpt`，**未归档**，仍在 `tasks/active/`。
- 项目主任务（currentTask）切换：`PERSIST-001` → `HARDEN-001`（HARDEN-001 从 `tasks/backlog/` 移至 `tasks/active/`）。
- 并行任务（PROD-CRON-VERIFY）：从 `tasks/backlog/` 移至 `tasks/active/`；状态推进为 `active / awaiting_user_evidence / nextActor=user`。
- 归档门禁（仍开启）：PERSIST-001 在 PROD-CRON-VERIFY 通过前**不得**归档；`production_cron_*` 字段保持 `PENDING_POST_MERGE` / `NOT_TESTED`。
- 与 HARDEN-001 的关系：HARDEN-001 启动**不依赖** PERSIST-001 归档；HARDEN-001 实施过程中**禁止**触及 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置。
- 与 ROUTING-001 的关系：ROUTING-001 仍处于 `blockedTasks`，待 PROD-CRON-VERIFY + HARDEN-001 共同通过后解除阻塞。
- 范围声明：本轮激活 commit 仅包含任务及状态文件（docs/state-only），不含业务代码。
- 详见：`docs/lumen-v2/state/SESSION-HANDOFF.md` 的"A+B 并行激活门禁区分"节。
