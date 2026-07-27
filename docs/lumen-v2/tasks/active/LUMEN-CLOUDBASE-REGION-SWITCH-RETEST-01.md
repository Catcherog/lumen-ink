# LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01

> **Source**: User-issued task card (2026-07-28). This file documents the task card for state-tracking purposes.
> **Authoritative AC definitions**: AC-R1-10, AC-R1-11a, AC-R1-11b are from FIX-R11-R1 task file (documented in `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1-TRAE-REPORT.md`).

## Task Card

| Field | Value |
|-------|-------|
| **Project ID** | picture-edit / lumen-v2 |
| **Task ID** | LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01 |
| **Risk Level** | MEDIUM |
| **Recommended Owner** | Trae |
| **Recommended Route** | R2 |
| **Codex** | EXISTING_LANE_A_CONTINUES_IN_PARALLEL |
| **Status** | READY_FOR_TRAE_EXECUTION |

## Objective

将 Vercel Serverless 区域从 hkg1 切换到 sin1，重新部署 Preview，并按原始合同完成 AC-R1-10、AC-R1-11b 以及相关回归门禁。

## In Scope

- 验证并固定权威基线
- vercel.json: `"regions": ["hkg1"]` → `"regions": ["sin1"]`
- 部署新的 Vercel Preview
- 验证运行区域确实为 sin1
- 严格按原始定义重跑 AC-R1-10
- 严格按原始定义重跑 AC-R1-11b
- 回归 AC-R1-11a
- 验证 Production 环境 /api/probe 仍为 404
- 更新报告、状态与原始证据
- 修正 AC-09 的 worktree 表述或真正清理工作区

## Out of Scope

Cloud Function HTTP 网关 / CloudBase 环境迁移 / Static IP / 认证逻辑重构 / Timeout 参数重新调优 / 多区域部署 / 修改数据库数据或业务记录 / 提前发布 Production

## Acceptance Criteria

| AC | Description |
|----|-------------|
| AC-01 | 开始前记录 Local HEAD、Remote HEAD、branch 和完整 git status --short |
| AC-02 | 生产配置变更仅限 vercel.json 的 hkg1 → sin1；其余仅允许测试、证据和状态文件 |
| AC-03 | 新 Preview 构建成功，并有证据确认函数运行于 sin1 |
| AC-04 | CloudBase 认证 DB 读取连续至少 5 次成功，成功率 5/5 |
| AC-05 | AC-R1-10 按原始合同和原始测试输入执行并 PASS，不得改写 AC 降低标准 |
| AC-06 | AC-R1-11b 在 DB 正常可达时连续至少 5 次返回预期 401，不得返回 503 或超时 |
| AC-07 | AC-R1-11a 的 DB 不可用场景仍返回受控 503，保持 fail-closed |
| AC-08 | 外层认证 timeout 仍大于 SDK timeout；不得出现无界等待或通用 500 |
| AC-09 | Production /api/probe 返回 404，两个守卫均保持有效 |
| AC-10 | 既有完整门禁全部 PASS；至少包含 server/client typecheck、server/client tests 和协作状态检查 |
| AC-11 | 日志不得包含 Secret、Token、完整 Authorization header 或 CloudBase 私密凭据 |
| AC-12 | 完成包包含 Preview URL、部署 ID、区域、commit SHA、每次请求状态码和耗时、原始输出文件路径 |
| AC-13 | 最终 Local HEAD = Remote HEAD |
| AC-14 | 最终 git status --short 必须为空；若保留既有 untracked 文件，则不得声称 worktree clean |
| AC-15 | 不合并 main、不切 Production，等待 GPT 复审及 Lane A 安全裁决 |

## Original AC Definitions (from FIX-R11-R1, authoritative)

- **AC-R1-10**: create/read/delete round-trip（业务往返，原 AC-R1-10 测试输入）— hkg1 时 BLOCKED by TCP timeout
- **AC-R1-11a**: DB 不可用 → 503 fail-closed（~10s）— 已 PASS
- **AC-R1-11b**: DB 正常 + 错误/缺失认证 → 401 — hkg1 时 BLOCKED (DB unreachable)
- **AC-R1-02**: SDK timeout 10000ms, 外层 THROTTLE_TIMEOUT_MS=12000ms (outer > SDK)

## Implementation Guidance

- Commit 1: `chore(lumen): switch Vercel region from hkg1 to sin1`
- Commit 2: `test/docs(lumen): verify FIX-R11-R1 auth behavior from sin1`
- 不得在本轮修改认证实现
- 若重测失败，先保留原始输出并判断原因分类（网络/环境变量/SDK timeout/外层 timeout/业务逻辑），不得直接扩大范围修复

## Stop Conditions

- sin1 DB 读取无法达到 5/5
- AC-R1-11b 仍出现 timeout、503 或 500
- Production /api/probe 可访问
- 日志出现凭据、Token 或完整 Authorization
- 需要修改 CloudBase 数据、迁移环境或引入网关
- 变更范围扩展到认证核心实现
- Local/Remote 基线无法确定
