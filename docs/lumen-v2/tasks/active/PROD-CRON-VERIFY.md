# PROD-CRON-VERIFY｜Production Cron 注册与运行验证（合并后强制门禁）

> **前置条件**：PERSIST-001 已合并到 `main`（`f0e28dd`，2026-07-20）。
> **状态**：`active / awaiting_user_evidence / nextActor=user`（2026-07-21 由 POST-MERGE-PARALLEL-ACTIVATION-01 激活）。
> **当前位置**：`docs/lumen-v2/tasks/active/PROD-CRON-VERIFY.md`（从 `tasks/backlog/` 激活）。
> **并行任务**：HARDEN-001（ready_for_trae / nextActor=trae，为主线任务）；PROD-CRON-VERIFY 为独立用户证据门禁，不阻塞 HARDEN-001 启动。
> **来源**：GPT PERSIST-001 FINAL-CLOSURE-FIX-01 证据验收 Verdict 明确要求"合并到 main 后必须创建独立的 Production Cron 验证任务，不应直接把当前任务中的待验证状态静默改为完成"。
> **执行者**：用户在 Vercel Dashboard 验证并提供证据；Trae 负责归档证据和更新状态字段。

## 背景

PERSIST-001 的 GPT 证据验收结论为 `EVIDENCE_REVIEW_PASS` / `MVP_PASS_WITH_POST_MERGE_GATE`。其中：

- `AC-FIX-01`（cron 配置 + Vercel 部署接受性）：`PASS`（基于 Preview Deployment Ready）
- `AC-FIX-09`（Vercel 部署验证归档）：`PASS`
- `production_cron_registration`：`PENDING_POST_MERGE`（Vercel Cron 只在 Production Deployment 上注册，Preview 分支不注册）
- `production_cron_execution`：`NOT_TESTED`（合并前不可测）

合并到 `main` 后，Vercel 会触发 Production Deployment，Cron Jobs 才会注册。本任务验证 Production Cron 的注册与运行。

## 目标

验证以下内容并归档证据：

1. **Production Deployment 成功**
   - `main` 分支最新部署状态为 `Ready`
   - 记录 Production Deployment URL（`https://lumen-ink.vercel.app`）
   - 记录 Production Deployment ID
   - 记录部署时间和 Build Logs 末尾几行

2. **Vercel Cron Jobs 注册成功**
   - 进入 `Settings > Cron Jobs`（或侧边栏独立 `Cron Jobs` 菜单）
   - 应看到一条记录：
     - Path: `/api/worker/recover`
     - Schedule: `0 0 * * *`
   - 截图保存为证据

3. **Cron 首次调度或受控手动调用成功**
   - 等待下一个 00:00 UTC（08:00 北京时间）观察 cron 自动执行
   - 或通过 Vercel Dashboard 的 "Run" 按钮（如有）手动触发
   - 或通过 `curl -H "Authorization: Bearer $CRON_SECRET" https://lumen-ink.vercel.app/api/worker/recover` 手动调用
   - 记录执行时间、HTTP 状态码、响应 body

4. **Function Logs 无错误**
   - 检查 `/api/worker/recover` 的运行日志
   - 确认无鉴权错误、环境变量错误、超时错误

## 验收标准

- [ ] Production Deployment Ready 截图/日志
- [ ] Cron Jobs 页面截图（含 Path + Schedule）
- [ ] `/api/worker/recover` HTTP 200 响应（或可解释的非 5xx 响应）
- [ ] Function Logs 无鉴权/环境变量/超时错误
- [ ] 状态字段更新：
  - `production_cron_registration`: `PENDING_POST_MERGE` -> `VERIFIED`
  - `production_cron_execution`: `NOT_TESTED` -> `VERIFIED`（或 `FAILED` + 错误日志）
  - `finalClosureFix01DeploymentStatus`: `preview-verified-production-pending-merge` -> `production-verified`

## 证据归档位置

- `docs/lumen-v2/evidence/PERSIST-001/vercel-production-verification.md`
- 截图放入 `docs/lumen-v2/evidence/PERSIST-001/`（脱敏，无密钥）

## 执行约束

- Trae 无 Vercel 凭据（`.vercel/` 未链接），Production 验证由用户在 Vercel Dashboard 执行
- Trae 负责归档用户提供的证据 + 更新状态文件
- 不得在证据完整前将 `production_cron_*` 改为 `VERIFIED`
- 不得伪造或假设 Production 运行结果

## 升级 Codex 的条件

根据 GPT Verdict，以下情形出现时升级 Codex：
- 合并 main 后 Cron 已注册但实际调用失败，且涉及鉴权/Token/Secret
- 恢复接口存在并发/幂等/重试/状态机疑点
- Trae 连续两轮无法定位生产运行失败原因
- 测试和部署均显示成功，但恢复业务不变量仍有重大疑点

## 与 PERSIST-001 的关系

- PERSIST-001 在本任务完成前**不得**归档到 `tasks/completed/`
- PERSIST-001 的 `production_cron_*` 字段保持 `PENDING_POST_MERGE` / `NOT_TESTED`，直到本任务验证通过
- 本任务通过后，PERSIST-001 可正式归档，并激活 ROUTING-001（HARDEN-001 已于 2026-07-21 由 POST-MERGE-PARALLEL-ACTIVATION-01 单独激活，不再依赖本任务）

## 与 HARDEN-001 的并行关系

- 本任务与 HARDEN-001 并行推进，互不阻塞
- HARDEN-001 启动**不依赖**本任务通过；本任务的用户证据收集**不依赖** HARDEN-001 完成
- 两条线仅在 PERSIST-001 正式归档门禁处汇合：本任务通过 + HARDEN-001 通过 → PERSIST-001 归档 → 解除 ROUTING-001 阻塞
- HARDEN-001 实施过程中不得触及 `/api/worker/recover` 或 Cron 配置

## Review History

### 2026-07-21｜激活（POST-MERGE-PARALLEL-ACTIVATION-01）

- 触发：POST-MERGE-PARALLEL-ACTIVATION-01 任务卡激活
- 操作：从 `tasks/backlog/PROD-CRON-VERIFY.md` 移至 `tasks/active/PROD-CRON-VERIFY.md`；状态从 `pending` 推进为 `active / awaiting_user_evidence / nextActor=user`
- 并行声明：HARDEN-001 同时激活为主线任务；PERSIST-001 保持 `gpt_evidence_review_pass` 不归档
- 用户下一步：在 Vercel Dashboard 验证最新 main Production Deployment（注意：Trae 落盘本激活决策后会产生新的 main commit，应验证激活 commit 之后最新 main HEAD 对应的 Production Deployment，不要只固定检查 `f0e28dd` 或 `f8e5f48`）
- Trae 不得在用户证据完整前将 `production_cron_*` 改为 `VERIFIED`
