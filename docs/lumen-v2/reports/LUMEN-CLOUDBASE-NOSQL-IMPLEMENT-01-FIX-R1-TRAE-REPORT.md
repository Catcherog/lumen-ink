# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 - FIX-R1 Trae Report

| 字段 | 值 |
|---|---|
| Task ID | `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` |
| Round | `FIX-R1` (FIX-01 ~ FIX-08) |
| Risk Level | HIGH |
| Owner | Trae |
| Codex | REQUIRED_AFTER_IMPLEMENTATION (待 GPT 决定) |
| 报告日期 | 2026-07-21 |
| 基线 Commit | `f73c937` |
| 分支 | `lumen/cloudbase-nosql-implement-01-fix-r1` |
| 8 门禁 | 8/8 PASS |

---

## 0. 执行摘要

本报告归档 FIX-R1 对 CloudBase NoSQL adapter 的修复与验证结果。FIX-01 ~ FIX-07 代码改动已落盘到 `src/server/infrastructure/persistence/cloudbase.nosql.ts`、`select.ts` 及对应 contract tests；FIX-08 证据包即本报告及配套 gate results / 状态更新 / 完成包。

---

## 1. FIX-01 ~ FIX-07 修复清单

### FIX-01: 事务传播（Transaction Propagation）

**问题**：嵌套 repository 调用必须在同一 CloudBase 多文档事务内执行，否则 Project + Asset + V0 / Generation 结果 + Version + pointer + Job 的原子性无法保证。

**修复**：
- 引入 `AsyncLocalStorage<{ tx: CloudBaseTransaction }>`（`cloudbase.nosql.ts:222`）。
- `collection()` 优先读取当前事务上下文中的 `tx.collection(name)`（`cloudbase.nosql.ts:256-262`）。
- `unitOfWork.run()` 在未嵌套事务时调用 `db.runTransaction()`，并通过 `transactionStorage.run({ tx }, fn)` 把事务注入异步上下文（`cloudbase.nosql.ts:643-654`）。

### FIX-02: Job 幂等（Job Idempotency）

**问题**：并发相同 `Idempotency-Key` 可能产生重复 Job。

**修复**：
- `jobs.createIdempotent()` 先查 `job_idempotency` 集合；若已存在则返回已有 Job 与 `created: false`（`cloudbase.nosql.ts:419-435`）。
- 创建时先写 `generation_jobs` 再写 `job_idempotency`；若触发 `E11000` duplicate key 错误则回查并返回已有 Job（`cloudbase.nosql.ts:436-461`）。
- CloudBase 集合已建唯一索引 `idx_key_unique`（key）。

### FIX-03: CloudBase 命令实现

**问题**：需要正确表达 MongoDB/CloudBase 查询/更新命令以替代 PostgreSQL 语义。

**修复**：
- `updateIfClaimed` / `updateIfActive` 使用 `$nin: TERMINAL_JOB_STATUSES` 防止终态回退（`cloudbase.nosql.ts:496, 516`）。
- `claim` 使用 `$or` + `leaseToken: null` / `leaseExpiresAt: { $lte: now }` 实现 lease 抢占（`cloudbase.nosql.ts:529-537`）。
- `listLeaseExpired` 使用 `$or` + `$lte`（`cloudbase.nosql.ts:584-595`）。
- `listActiveByProject` 使用 `$in: ACTIVE_JOB_STATUSES`（`cloudbase.nosql.ts:573-582`）。
- `buildUpdateFromPatch` 使用 `$set` / `$unset` 表达 JobPatch 三态语义（`cloudbase.nosql.ts:152-169`）。

### FIX-04: 对象存储（Object Store）

**问题**：NoSQL 环境仍需对象存储；不能复用 PostgreSQL 的 HTTP Storage API。

**修复**：ObjectStore 直接使用 CloudBase Storage SDK：
- `put` → `app.uploadFile`（`cloudbase.nosql.ts:602-608`）
- `get` → `app.downloadFile`（`cloudbase.nosql.ts:610-614`）
- `getSignedUrl` → `app.getTempFileURL`（`cloudbase.nosql.ts:616-623`）
- `delete` → `app.deleteFile`（`cloudbase.nosql.ts:625-628`）
- `exists` → `getTempFileURL` 成功即存在（`cloudbase.nosql.ts:630-638`）

### FIX-05: 删除责任（Delete Responsibility）

**问题**：删除 Project 必须级联删除其 Asset、Version、Job 及幂等记录，并尽量清理对象存储。

**修复**：`projects.deleteCascade()`（`cloudbase.nosql.ts:308-325`）：
1. 查询并删除该项目全部 Asset、Version、Job、version_idempotency、job_idempotency。
2. 对 Asset.storageKey 执行 best-effort `deleteFile`，失败时吞掉异常避免影响元数据删除。
3. 最后删除 Project 文档。

### FIX-06: Preview / Production 隔离

**问题**：必须避免 Preview 环境误连 Production 数据库，且部署模式选择器需稳定。

**修复**：`select.ts` 在 `isDeployed=true` 时：
- 若 `CLOUDBASE_API_KEY` 存在 → 创建 NoSQL adapter。
- 否则若 `CLOUDBASE_POSTGRES_URL` 存在 → 创建 PostgreSQL adapter。
- 否则抛出 `CLOUDBASE_CONFIG_REQUIRED`。
- 通过 Vercel Dashboard 分别为 Preview / Production 配置环境变量实现隔离。

### FIX-07: 显式持久化后端选择器

**问题**：不能隐式 fallback 到本地 JSON 或 /tmp。

**修复**：`selectPersistenceByEnv()` 显式按环境变量选择后端；NoSQL 优先于 PostgreSQL；本地开发使用 `local.ts`；无配置时 fail-fast。

---

## 2. 测试覆盖

新增/保持的测试：

- `src/server/infrastructure/persistence/cloudbase.nosql.contract.test.ts`（22 tests）
  - JobPatch 三态语义
  - Config validation
  - Factory shape
  - Selector integration
- 现有服务端测试 269 + 新增 22 = 291 tests PASS
- 客户端测试 194 tests PASS
- 合计 485 root tests PASS

---

## 3. 8 门禁结果

| # | 门禁 | 结果 | 计数 |
|---|------|------|------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc --noEmit | PASS | — |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc --noEmit | PASS | — |
| 5 | Server tests | PASS | 291 tests / 28 files |
| 6 | Root tests | PASS | 485 combined |
| 7 | Build | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets detected |

---

## 4. 待完成项

- AC-15 ~ AC-17：Vercel Preview 端到端验证（需用户在 Vercel Dashboard 配置 `CLOUDBASE_ENV_ID` 和 `CLOUDBASE_API_KEY`）。
- AC-19：Production 部署后重新执行 AC-15 ~ AC-17。
- Codex 只读安全审计（事务原子性、幂等竞争、lease claim、状态机单调性、Secret 边界）。

---

## 5. 范围遵守

- ✅ FIX-R1 仅修改 persistence adapter 与选择器
- ✅ 不修改领域接口、services、routes、客户端
- ✅ 不恢复本地 JSON / /tmp fallback
- ✅ 不提交真实 Secret
- ✅ 8 门禁全绿

---

**报告作者**：Trae  
**报告状态**：READY_FOR_GPT_REVIEW
