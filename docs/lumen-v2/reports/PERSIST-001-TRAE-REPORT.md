# PERSIST-001 Trae Implementation Report

> 任务：PERSIST-001 持久化生成闭环
> 报告日期：2026-07-18
> 报告作者：Trae
> 分支：`lumen/persist-001-trae`
> 状态推进：`ready_for_trae / nextActor=trae` → `awaiting_gpt_acceptance / nextActor=gpt`
> 基线提交：`6eaec9464dccbe5c14a5cd1d40419595cb496f37`（STORAGE-001 验收通过后激活 PERSIST-001）

## 1. 执行摘要

PERSIST-001 在 `lumen/persist-001-trae` 单分支内连续执行 12 个子任务，覆盖 D-040 契约收敛、CloudBase/local/mock 适配器、Project/Asset/Version/GenerationJob 领域模型与原子成功边界、认证 Project/Job API、/api/edit 受控兼容层、客户端 typed API + useProject hook + VersionStrip/JobStatusPanel UI、三个内部安全单元（runtime secrets / auth throttle / CORS / image validation / redaction）、legacy history 显式导入、端到端失败/恢复矩阵，全部 8 条门禁通过。

**关键产出**：
- 9 阶段 Job 状态机（queued → uploading → analyzing → generating → postprocessing → saving → succeeded，加 failed/cancelled）
- 原子成功边界：Object upload → DB 事务 → 条件完成；失败时补偿删除孤儿对象
- Lease/heartbeat/幂等：worker token 原子 claim、条件完成、双 worker 接管、stale worker 拒绝
- D-034 内部安全底线：runtime secret fail-fast、durable login throttle (HMAC-derived key)、CORS allowlist、服务端 7-step 图片验证、allowlist 脱敏
- Legacy history 显式导入：inspect-only / JSON 导出 / 逐条确认导入 + 失败恢复
- E2E 失败矩阵：13 server tests + 18 client tests 覆盖成功/超时/配额/网络/存储失败/事务失败/取消/重试/幂等/级联删除/恢复路径

## 2. 提交记录

| 顺序 | Commit | 说明 |
|------|--------|------|
| 1 | `51ac5f9` | `feat(lumen-v2): PERSIST-001 Task 2+3 — Job state machine + D-040 contract convergence` |
| 2 | `859247f` | `feat(lumen-v2): PERSIST-001 Task 4+5 — ProjectService + recoverable GenerationService` |
| 3 | `1741567` | `feat(lumen-v2): PERSIST-001 Task 6 — authenticated Project/Job APIs` |
| 4 | `d030901` | `feat(lumen-v2): PERSIST-001 Task 7 — controlled /api/edit compatibility layer` |
| 5 | `889496e` | `feat(lumen-v2): PERSIST-001 recoverable project client` |
| 6 | `29be3a6` | `feat(lumen-v2): PERSIST-001 version and job UI` |
| 7 | `0248d09` | `feat(lumen-v2): PERSIST-001 internal auth safety floor` |
| 8 | `a2809e6` | `feat(lumen-v2): PERSIST-001 validate image ingress` |
| 9 | `2e1508d` | `feat(lumen-v2): PERSIST-001 redact internal service boundaries` |
| 10 | `075e453` | `feat(lumen-v2): PERSIST-001 explicit history import` |
| 11 | `ceaa9db` | `test(lumen-v2): PERSIST-001 failure recovery matrix` |
| 12 | (本提交) | `feat(lumen-v2): PERSIST-001 implementation`（证据 + state handoff） |

分支：`lumen/persist-001-trae`
累计：54 文件变更，+10945/-550。

## 3. 范围遵守

按 SESSION-HANDOFF 与 INTERNAL-FAST-TRACK-TRAE.md 指示执行：

- ✅ 单任务、单分支、单最终验收周期：所有 12 个子任务在 `lumen/persist-001-trae` 上连续执行，未拆分中间验收包。
- ✅ D-040 契约收敛：Tasks 1-3 完成一次性红→绿收敛，接口再次冻结。
- ✅ 未启动 ROUTING / STORAGE-002 / PERSIST-002 或非关键 UI 优化。
- ✅ 未改变已冻结的 Provider/API/存储供应商决策。
- ✅ 保留工作区既有无关修改：使用精确 `git add <path>`，未触碰未提交的无关文件。
- ✅ 未提交密钥、真实客户数据或未脱敏证据。
- ✅ 普通阶段未暂停或请求 GPT 中间验收。
- ✅ 未遇到硬停止条件（无需真实 CloudBase 凭据、无数据丢失、无密钥泄漏、无门禁失败超两次恢复）。

## 4. D-040 契约收敛结果

STORAGE-001 PoC 的简化签名已收敛到完整形态：

1. ✅ 完整 Project/Asset/Version/GenerationJob 字段和九阶段真实 Job 状态
2. ✅ `(projectId, idempotencyKey)` Job 唯一性 + 每个 `jobId` 最多一个成功 Version
3. ✅ worker/lease token 原子 claim、heartbeat、条件完成、过期接管
4. ✅ stale worker 在 lease 失效后不可发布 Version 或 Job succeeded
5. ✅ 同一数据库事务上下文保证 Asset → Version → Job succeeded
6. ✅ CloudBase (mock)、local、contract 测试通过同一最终合约

冻结接口：`src/server/domain/persistence.ts` 的 `PersistenceDependencies`（7 repositories + ObjectStore + UnitOfWork）+ `JobExecutor`。

## 5. 核心实现

### 5.1 领域模型

- `Project`：id, name, createdAt, updatedAt, activeVersionId, approvedVersionId
- `Asset`：id, projectId, storageKey, mimeType, sizeBytes, createdAt
- `Version`：id, projectId, assetId, label (v0, v1, ...), createdAt
- `GenerationJob`：id, projectId, prompt, status (9-stage), providerId, model, inputVersionId, resultVersionId, error, errorCode, idempotencyKey, attempt, parentJobId, leaseToken, leaseExpiresAt, workerId, createdAt, updatedAt

### 5.2 原子成功边界

```
createJob → enqueue (queued)
  ↓
executeJob:
  1. claim (atomic: lease token + worker id)
  2. upload input asset (if needed)
  3. analyze
  4. call Provider (80-100s)
  5. postprocess
  6. upload result object → DB transaction (Asset.create + Version.create + Job.succeeded) → conditional complete
     ↑ failure → compensation (delete orphaned object)
  7. succeeded
```

### 5.3 错误分类（DomainError → HTTP）

| DomainError code | HTTP | 场景 |
|-----------------|------|------|
| PROVIDER_TIMEOUT | 504 | Provider 调用超时 |
| PROVIDER_QUOTA | 429 | Provider 配额耗尽 |
| PROVIDER_NETWORK | 502 | Provider 网络错误 |
| SAVE_FAILED | 500 | 对象上传或 DB 事务失败 |
| UPLOAD_TOO_LARGE | 422 | 图片 > 20 MiB |
| UPLOAD_PIXEL_LIMIT | 422 | 像素 > 40,000,000 |
| UPLOAD_DECODE_FAILED | 422 | sharp 解码失败 |
| UPLOAD_INVALID | 409 | 不支持的 MIME / 空数据 |
| ILLEGAL_JOB_TRANSITION | 409 | 状态机非法转换 |
| JOB_NOT_RETRYABLE | 409 | 非 failed Job 重试 |
| IDEMPOTENCY_CONFLICT | 409 | 幂等键冲突 |

### 5.4 内部安全底线（D-034）

| 单元 | 实现 | 测试 |
|------|------|------|
| Runtime secrets | `loadRuntimeConfig(env)` 部署模式 fail-fast | 14 tests |
| Auth throttle | HMAC-SHA256 derived key, 5次/15min 固定窗口 | 6 tests |
| CORS | Allowlist, 拒绝未列出来源 | integration |
| Image validation | 7-step: size → MIME → sharp metadata → format match → dimensions → pixel count → full decode + re-encode | 10 tests |
| Redaction | Allowlist metadata + 5 sensitive patterns (data-uri, bearer, jwt, sk-, connection string, base64) | 19 tests + 9 integration |

### 5.5 Legacy history 显式导入

- `inspectLegacyHistory()`：只读检查 localStorage 中的旧 history
- `exportLegacyBackup()`：导出为 JSON 下载
- `importRecoverableEntries()`：逐条确认 + 上传 + 失败恢复 + 备份保留

### 5.6 /api/edit 受控兼容层

V2 路径返回 `Deprecation: true` + `Link` header，202 Accepted with `{ success, jobId, status, deprecatedSyncRoute: true }`。同步 V1 路径保留但不推荐。

## 6. 客户端实现

### 6.1 useProject hook

- 轮询契约：非终态 Job 以 1.5s 轮询；succeeded → refresh 获取新 Version；failed/cancelled → 停止轮询不 refresh；unmount → abort
- 操作：upload, refresh, generate, cancel, retry, activate, approve, delete
- 从不合成进度百分比

### 6.2 UI 组件

- `VersionStrip`：Version 芯片 + active/viewed/approved 标记 + 设为当前/锁定按钮
- `JobStatusPanel`：9 种状态标签映射 + 取消/重试按钮
- `LegacyHistoryImport`：模态框 + 三步导入流程
- `AppV2`：wire useProject + wire LegacyHistoryImport

## 7. E2E 失败/恢复矩阵

### 7.1 Server（`src/server/persist.e2e.test.ts` — 13 tests）

| # | 场景 | 验证 |
|---|------|------|
| 1 | Upload V0 | redacted storageKey + signed URL |
| 2 | Create queued Job | 201 |
| 3 | ExecuteJob success | V1 created, activeVersion moved, Job succeeded |
| 4 | Provider timeout | PROVIDER_TIMEOUT, no V2 |
| 5 | Provider quota | PROVIDER_QUOTA |
| 6 | Provider network | PROVIDER_NETWORK |
| 7 | Object upload failure | SAVE_FAILED + compensation |
| 8 | DB transaction failure | SAVE_FAILED + UoW rollback + compensation |
| 9 | Cancellation | cancelled, no Version |
| 10 | Retry | attempt=2, parentJobId |
| 11 | Idempotent duplicate | same Job returned |
| 12 | Cascade deletion | metadata + objects gone |
| 13 | Recovery path | timeout → retry → success |

### 7.2 Client（`src/client/src/AppV2.persist.test.tsx` — 18 tests）

| # | 场景 | 验证 |
|---|------|------|
| 1 | Refresh recovery | snapshot + active Job |
| 2 | No active Jobs | no JobStatusPanel |
| 3-11 | Status label mapping | 9 statuses via it.each |
| 12 | Activate | POST activate |
| 13 | Approve | POST approve |
| 14 | Failed Job | no Version appended |
| 15 | Cancel | POST cancel |
| 16 | Retry | POST retry + replace activeJob |
| 17 | No percentage | never renders "X%" |
| 18 | V0+V1 chips | both render with active marker |

## 8. 8 门禁结果

详见 `docs/lumen-v2/evidence/PERSIST-001/gate-results.md`。

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc --noEmit | PASS | — |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc --noEmit | PASS | — |
| 5 | Server tests | PASS | 198 tests / 20 files |
| 6 | Root tests | PASS | 392 combined |
| 7 | Build | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets detected |

Whitespace: `git diff --check` — PASS (no errors)
Scope: 54 files, +10945/-550, all PERSIST-001 related.

## 9. 安全声明

- ✅ 未提交 `.env`、API Key、JWT Secret、密码、私钥
- ✅ 未提交真实客户照片、联系方式、订单、聊天记录
- ✅ 未提交未脱敏 Prompt 或 Provider 完整配置
- ✅ 证据使用合成数据和脱敏日志
- ✅ `check-lumen-collab.mjs` 通过（人工复核：测试 fixture 中的 `sk-` 和 `Bearer` 均为短长度合成值，不构成真实密钥泄漏）

## 10. 状态推进

- `status`: `ready_for_trae` → `awaiting_gpt_acceptance`
- `nextActor`: `trae` → `gpt`
- `latestTraeReport`: `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`
- 未归档任务，未激活下一任务

## 11. GPT 验收建议

GPT 应按 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板启动新窗口验收：

1. 读取本报告 + gate-results.md + scope diff
2. 审查当前 diff（base `6eaec94` → HEAD）
3. 核查关键行为：原子成功边界、幂等、lease/heartbeat、补偿、脱敏、图片验证
4. 运行 8 门禁独立验证
5. 写入 `docs/lumen-v2/reviews/PERSIST-001-GPT-REVIEW.md`
6. 通过则归档 PERSIST-001 + 激活下一任务；驳回则生成明确缺陷
