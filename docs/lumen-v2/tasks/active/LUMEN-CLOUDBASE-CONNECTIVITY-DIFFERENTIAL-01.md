# LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01｜Vercel 三区域网络对照与证据校正

> **前置条件**：FIX-R11-R1 已实施完成，GPT 裁决 `CODEX_REQUIRED`，并行执行 Lane A (Codex 只读审查) + Lane B (本任务)。
> **状态**：`ready_for_trae / nextActor=trae`（2026-07-28 由 GPT FIX-R11-R1 Verdict 激活）。
> **并行任务**：Lane A — Codex 限域只读安全审查（FIX-R11-R1 代码，独立进行，不互相阻塞）。
> **来源**：GPT FIX-R11-R1 Verdict `CODEX_REQUIRED` — 接受 AC-R1-10 与 AC-R1-11b 为外部阻塞，先并行执行 Codex 安全审查和 Trae 区域对照。
> **执行者**：Trae（网络对照与证据校正）；Codex（限域只读安全审查，Lane A）。
> **Risk Level**：MEDIUM
> **Route**：R2

## 背景

FIX-R11-R1 确认 Vercel hkg1 到 CloudBase 上海 `tcb-api.tencentcloudapi.com:443` TCP 连接超时。GPT 裁决：

1. 根因结论需收窄 — 当前证据仅支持"本次测试时段 hkg1 不可达"，不足以支持"所有 Vercel 区域永久不可达"
2. SDK init 不验证凭据 — `tcb.init()` 只创建应用实例，凭据有效性需鉴权调用才能证明
3. Probe 生产暴露风险 — `/api/probe` 在 Production 必须返回 404
4. AC-R1-11 需拆分为 11a (DB 不可用→503) 和 11b (DB 正常→401)

## 目标

1. 修正 FIX-R11-R1 证据语义（SDK init ≠ 凭据有效）
2. 确保 Probe 在 Production 返回 404
3. 执行 hkg1/hnd1/sin1 三区域对照，分别测试两个 DNS A 记录
4. 判定连接问题是 hkg1 单一区域路由异常，还是 Vercel 到 CloudBase 普遍不可达
5. 全部失败时输出 GATEWAY_REQUIRED，不再继续调大 timeout

## 范围

### In Scope

- 修正 SDK init 和凭据有效性的表述
- 拆分 AC-R1-11a/11b
- 确保 Probe 在 Production 返回 404
- 执行 hkg1/hnd1/sin1 对照
- 分别测试两个 DNS A 记录
- 生成只读网络诊断矩阵
- 网络恢复时重测 AC-R1-10 和 AC-R1-11b

### Out of Scope

- CloudBase 区域迁移
- IP 白名单购买或配置
- Production 部署
- SDK 大版本迁移
- 网关正式实现
- 数据结构变更

## 验收标准

| AC | 描述 | 判定方式 |
|----|------|---------|
| AC-01 | Probe 不再将 init 成功描述为凭据有效 | 代码审查：probe.ts 输出 `credentials: NOT_VALIDATED`，`sdkConstruction` 而非 `sdk_init` |
| AC-02 | Production 环境 `/api/probe` 返回 404 | 代码审查：index.ts 不挂载 probe router when `VERCEL_ENV=production`；probe.ts 二级守卫 |
| AC-03 | 三个 Vercel 区域均有独立结果 | 诊断矩阵包含 hkg1、hnd1、sin1 各自的 probe 结果 |
| AC-04 | 两个 A 记录均分别测试 | 每个 rep 的 `ipTcpResults` 包含两个 IP 的独立 TCP 测试结果 |
| AC-05 | 每个组合至少重复 5 次 | `?reps=5` 参数，`repsCompleted: 5` |
| AC-06 | 诊断不产生业务数据写入 | probe 仅执行 `doc().get()` 只读查询，无 `add/update/delete` |
| AC-07 | 至少一个区域稳定成功时完成真实 round-trip | DB read 成功且 5/5 reps 通过 |
| AC-08 | 全部失败时输出 GATEWAY_REQUIRED，不得继续扩大 timeout | `summary.gatewayRequired: true`，不修改 sdkTimeout 或 THROTTLE_TIMEOUT_MS |
| AC-09 | Local=Remote、worktree clean、无 Production 变更 | git 验证 |

## 停止条件

出现以下任一情况时立即停止：

- Secret 或完整 Authorization 日志出现
- 命中 Production namespace
- 需要购买 Static IP
- 需要迁移 CloudBase 环境
- 诊断产生不可清理数据

## 网络方案裁决

### 第一阶段：区域和路由对照

三个 Vercel 区域分别执行：
- 两个 DNS A 记录分别 TCP 连接
- HTTPS/TLS 请求
- DB 最小只读查询
- 连续 5 次
- 不修改任何业务数据

判定规则：
- 某一区域 5/5 成功 → 使用该 Vercel 区域，重测 AC-R1-10 和 AC-R1-11b
- 所有区域均失败 → 停止调整 timeout，进入 Cloud Function HTTP 数据网关方案

### 第二阶段（仅当第一阶段全部失败）：Cloud Function HTTP 数据网关

在 CloudBase 内部署极窄的 HTTP 云函数，由它访问同环境数据库；Vercel 只调用标准 HTTPS 接口。本任务不实施第二阶段，仅在全部失败时输出 GATEWAY_REQUIRED 信号。

## 证据归档位置

- **Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01-TRAE-REPORT.md`
- **证据目录**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01/`
- **诊断矩阵**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01/diagnostic-matrix.md`
- **门禁结果**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01/gate-results.md`

## 分支

- **分支**：`lumen/cloudbase-connectivity-differential-01-trae`
- **基线**：`9e6f475`（FIX-R11-R1 state transition commit）
- **提交格式**：`feat(lumen-v2): LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01 implementation`
