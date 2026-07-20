# HARDEN-001｜安全、可靠性与发布加固

> **状态**：`awaiting_gpt_acceptance / nextActor=gpt`（2026-07-21 HARDEN-001B 实施完成，等待 GPT 证据审查）
> **当前位置**：`docs/lumen-v2/tasks/active/HARDEN-001.md`（从 `tasks/backlog/` 激活）
> **前置依赖**：PERSIST-001 证据验收通过并合并到 main（已满足）；PERSIST-001 在 PROD-CRON-VERIFY 通过前不归档，但不阻塞 HARDEN-001 启动
> **并行任务**：PROD-CRON-VERIFY（awaiting_user_evidence / nextActor=user）
> **保留阻塞**：ROUTING-001 仍处于 blockedTasks，本轮不启动

## 目标

完成 P0 上线前安全门禁，覆盖 `07-ACCEPTANCE-PLAN.md` Gate D 与 `09-PERSISTENT-GENERATION-CLOSURE-DESIGN.md` 内部安全底线之外尚未关闭的公开发布风险：

- Production secret fail-fast；
- 删除默认密码、JWT 和加密 Key fallback；
- CORS allowlist；
- 登录限流；
- 上传 MIME、大小、像素和解码校验；
- Provider Key 不返回前端；
- health 脱敏；
- edit/detect 日志脱敏；
- Provider 配置迁离 `/tmp`；
- 项目删除和资产清理；
- 安全回归测试；
- Production flag 切换和回滚文档。

> 注：D-034 内部安全底线（runtime secret fail-fast / durable auth throttle / CORS allowlist / 7-step image validation / allowlist redaction）已在 PERSIST-001 落地并通过 GPT 验收。HARDEN-001 在此基础上完成公开发布级别的剩余门禁。

## 批次拆分计划（POST-MERGE-PARALLEL-ACTIVATION-01 建议）

按 GPT 任务卡 Implementation Guidance，HARDEN-001 拆成三个可验收批次，**不得合并为一个无法审查的大型 Diff**。每个批次独立分支、独立 PR、独立 GPT 验收。

### HARDEN-001A｜认证边界

- 范围：D-012 P0 authentication
- 覆盖测试：未认证、无效凭据、过期凭据、权限不足
- 验收门禁：`07-ACCEPTANCE-PLAN.md` Gate D 认证子项 + 安全回归测试
- 分支：`lumen/harden-001a-trae`
- 提交格式：`feat(lumen-v2): HARDEN-001A authentication boundary`
- **当前状态**：已合并到 main（mergeCommit `4e720b6`，fast-forward `e08eb3e..4e720b6`）；GPT 证据审查 `EVIDENCE_REVIEW_PASS_WITH_DEBT`；4 项 P2 debt 已登记

### HARDEN-001B｜Provider Key 安全迁移

- 范围：D-011 Provider Key 迁离 `/tmp`
- 覆盖测试：生命周期、日志脱敏、错误路径和清理行为
- 验收门禁：`07-ACCEPTANCE-PLAN.md` Gate D Provider Key 子项 + D-011 落地
- 分支：`lumen/harden-001b-trae`
- 提交格式：`feat(lumen-v2): HARDEN-001B provider key migration`
- **当前状态**：实施完成，等待 GPT 证据审查（`awaiting_gpt_acceptance / nextActor=gpt`）；8 门禁全绿（client 194 + server 269 = 463 root tests，dist/ 已通过 vitest.config.ts 排除）；DEBT-HARDEN-001A-04 RESOLVED

### HARDEN-001C｜公开发布加固

- 范围：D-034 public-release hardening（剩余项）
- 覆盖测试：安全配置、依赖、错误暴露、公开仓库检查
- 验收门禁：`07-ACCEPTANCE-PLAN.md` Gate D 剩余子项 + Production flag 切换和回滚文档
- 分支：`lumen/harden-001c-trae`

## 权威输入

- 验收规格：`docs/lumen-v2/specs/07-ACCEPTANCE-PLAN.md` Gate D
- 内部安全设计：`docs/lumen-v2/specs/09-PERSISTENT-GENERATION-CLOSURE-DESIGN.md` 第 D-034 节
- 内部快轨设计：`docs/lumen-v2/specs/10-INTERNAL-FAST-TRACK-DESIGN.md`
- 已落地证据：`docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`（D-034 内部安全底线节）

## 执行规则

- Trae 严格按批次拆分执行，每个批次独立 PR、独立 GPT 验收
- TDD：先失败测试，再最小实现，再通过测试
- 任何 S0/S1 不得作为已知限制放行
- 不修改 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置
- 不在 HARDEN-001 修复 PERSIST-001 的代码或测试
- Codex 升级条件：认证或权限边界存在不确定性；Provider Key 存储/轮换/清理/日志脱敏存在疑点；Cron 返回 401/403；Secret 配置异常；鉴权模型不明确；涉及并发/幂等/重试/状态机修改；Trae 连续两轮修复失败；合并前需要针对安全不变量进行独立仓库验证。Codex 使用限制为一次有边界的安全审计，不承担常规实施。

## 验收

对照 `07-ACCEPTANCE-PLAN.md` Gate D。
任何 S0/S1 不得作为已知限制放行。

## 与 PERSIST-001 的关系

- PERSIST-001 已合并到 main 并通过 GPT 证据验收，但在 PROD-CRON-VERIFY 通过前**不归档**
- HARDEN-001 启动**不依赖** PERSIST-001 归档；PERSIST-001 的归档门禁由 PROD-CRON-VERIFY 单独负责
- HARDEN-001 实施过程中不得触及 PERSIST-001 或 Cron 相关代码路径

## Review History

### 2026-07-21｜激活（POST-MERGE-PARALLEL-ACTIVATION-01）

- 触发：POST-MERGE-PARALLEL-ACTIVATION-01 任务卡激活
- 操作：从 `tasks/backlog/HARDEN-001.md` 移至 `tasks/active/HARDEN-001.md`；STATE.json `blockedTasks` 移除 HARDEN-001；设置 `currentTask=HARDEN-001 / status=ready_for_trae / nextActor=trae`
- 范围声明：本轮激活 commit 仅包含任务及状态文件，不包含 HARDEN 实施代码
- 下一步：进入 HARDEN-001A 仓库上下文核对与实施，不等待 Cron 门禁

### 2026-07-21｜HARDEN-001B 实施完成（待 GPT 证据审查）

- 触发：用户指令「帮我合并，然后直接进入001B」
- 操作：
  1. 合并 PR #2 到 main（fast-forward `e08eb3e..4e720b6`，mergeCommit `4e720b6`）
  2. 创建分支 `lumen/harden-001b-trae`（基于合并后 main HEAD `4e720b6`）
  3. TDD red→green 实施 D-011 Provider Key 迁离 `/tmp`
- 基线 commit：`4e720b6`
- 分支：`lumen/harden-001b-trae`
- 实施方式：TDD red→green 模式（先 red，再 green，最小生产代码改动）
- 生产代码修改：`src/server/services/providers/ProviderStore.ts`
  - 移除 `DEFAULT_DATA_DIR` 中 `process.env.VERCEL ? '/tmp/lumen-ink-data' : ...` 分支（D-011 违规）
  - 修复 `console.error('...', redacted.log)` 序列化 bug → `JSON.stringify(redacted.log)`（AC-B05）
- 新增测试：`src/server/services/providers/providerKey.lifecycle.test.ts`（12 测试，覆盖 AC-B01~AC-B08）
- 新增配置：`src/server/vitest.config.ts`（根本解决 DEBT-HARDEN-001A-04，排除 dist/ 重复计数）
- TDD red → green 证据：
  - Red: 3 failed | 9 passed（AC-B01 ×2 + AC-B05 ×1）
  - Green: 12 passed（移除 /tmp 分支 + 修复 redacted log 序列化）
- 8 门禁全绿：client 194 + server 269 = 463 root tests passed（dist/ 已通过 vitest.config.ts 排除）
- AC 覆盖：AC-B01~AC-B08 全部 PASS
- 范围遵守：
  - 不修改 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置、ROUTING 代码
  - 不修改认证代码（`middleware/auth.ts`、`routes/auth.ts`、`security/authThrottle.ts`、`config/runtime.ts` 全部未变）
  - 仅 1 个生产文件修改 + 1 个新测试文件 + 1 个新配置文件 + 报告/证据/状态文件
  - check-lumen-collab PASS
- DEBT-HARDEN-001A-04：RESOLVED（vitest.config.ts 根本解决，不再需要手动清理 dist/）
- 状态推进：`gpt_evidence_review_pass / nextActor=user_or_trae_for_merge` → `ready_for_trae / nextActor=trae` → `awaiting_gpt_acceptance / nextActor=gpt`
- 不调用 Codex（NOT_REQUIRED）
- Trae 报告：`docs/lumen-v2/reports/HARDEN-001B-TRAE-REPORT.md`
- 证据：`docs/lumen-v2/evidence/HARDEN-001B/gate-results.md`
- 下一步：GPT 证据审查 HARDEN-001B。通过后合并 PR，立即创建 `lumen/harden-001c-trae` 分支开始 HARDEN-001C 实施
- PROD-CRON-VERIFY 保持并行，不阻塞 HARDEN-001C
- ROUTING-001 继续保持阻塞，直到 HARDEN-001 与 PROD-CRON-VERIFY 汇合通过
- HARDEN-001 任务整体不归档，需 C 也通过后才归档

### 2026-07-21｜HARDEN-001A GPT 证据审查通过（HARDEN-001A-FAST-CLOSURE-01）

- 触发：用户最新快速推进裁决任务卡 `HARDEN-001A-FAST-CLOSURE-01`
- 审查 HEAD：`5f484d9`（基于 `e08eb3e`）
- 结论：`EVIDENCE_REVIEW_PASS_WITH_DEBT`
- 状态推进：`awaiting_gpt_acceptance / nextActor=gpt` → `gpt_evidence_review_pass / nextActor=user_or_trae_for_merge`
- GPT 验收文件：`docs/lumen-v2/reviews/HARDEN-001A-GPT-REVIEW.md`
- 4 项非阻塞 P2 debt 已登记到 `docs/ai/TECH_DEBT.md`：
  - DEBT-HARDEN-001A-01：AC-A04 在 P0 单工作区中为 NOT_APPLICABLE
  - DEBT-HARDEN-001A-02：增补真实生产路由 wiring 回归测试
  - DEBT-HARDEN-001A-03：明确 Vercel trust proxy / req.ip 假设
  - DEBT-HARDEN-001A-04：后续清理 dist 测试重复计数
- 不修改生产认证代码（D-034 已满足全部 AC）
- 不调用 Codex（NOT_REQUIRED）
- 下一步：合并 PR #2 后立即创建 `lumen/harden-001b-trae` 分支开始 HARDEN-001B 实施
- PROD-CRON-VERIFY 保持并行，不阻塞 HARDEN-001B/C
- ROUTING-001 继续保持阻塞，直到 HARDEN-001 与 PROD-CRON-VERIFY 汇合通过
- HARDEN-001 任务整体不归档，需 B/C 也通过后才归档
- 文件恢复说明：本文件在 `e08eb3e` 激活 commit 中因编码损坏仅保留标题行（24 字节），本轮 GPT 证据审查时基于内容重建并追加 Review History 条目
