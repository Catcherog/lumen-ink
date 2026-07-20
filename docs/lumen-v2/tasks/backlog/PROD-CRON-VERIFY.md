# PROD-CRON-VERIFY｜Production Cron 注册与运行验证（合并后强制门禁）

> **前置条件**：PERSIST-001 已合并到 `main`（`f0e28dd`，2026-07-20）。
> **状态**：`pending`（待 GPT 激活；Trae 不得自行激活）。
> **来源**：GPT PERSIST-001 FINAL-CLOSURE-FIX-01 证据验收 Verdict 明确要求"合并到 main 后必须创建独立的 Production Cron 验证任务，不应直接把当前任务中的待验证状态静默改为完成"。

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
- 本任务通过后，PERSIST-001 可正式归档，并激活 HARDEN-001 或 ROUTING-001
