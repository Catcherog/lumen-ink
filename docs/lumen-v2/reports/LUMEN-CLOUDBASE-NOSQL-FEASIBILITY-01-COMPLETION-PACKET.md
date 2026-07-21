# picture-edit 完成包 — LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01

> **任务类型**：只读调查（无代码改动）
> **Task ID**：LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01
> **Risk Level**：MEDIUM
> **Owner**：Trae
> **Codex**：NOT_REQUIRED
> **完成日期**：2026-07-21
> **状态**：READY_FOR_GPT_REVIEW（仅作调查结论，不进入正式验收流程）
> **目标输出位置**：`C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`（用户偏好稳定文件名，需用户自行复制本文件内容）

---

## 1. 任务目标

用户作为 GPT 角色下达只读调查任务，要求评估将 lumen-v2 项目从当前 CloudBase PostgreSQL + PG Storage 方案切换到 **CloudBase 文档数据库 + Storage** 的可行性，并设计最小改造方案，不创建 PostgreSQL、不购买新 CloudBase 环境。

用户裁决原文：

> 推荐「Vercel + 现有 CloudBase 文档数据库 + Storage」。让 Trae 先做只读仓库分析，确认现有 persistence interface 能否无损实现 NoSQL adapter。若适配器可以控制在单个基础设施模块和相应测试内，直接实施方式 1。若外部 SDK 凭据权限很难安全收敛，再改用 CloudBase HTTP 云函数作为后端。不购买 PostgreSQL，不恢复 Vercel 文件 fallback。

求职叙事：

> 根据生产环境资源约束，将关系型持久化方案调整为文档数据库与对象存储组合，并通过适配器隔离领域层，实现低成本 Serverless 部署。

---

## 2. 核心结论

**可行**：当前 `PersistenceDependencies` 接口可在 CloudBase 文档数据库上等价实现，**未触发任何 Stop Condition**，但有一个关键前提：

⚠️ **CloudBase 文档数据库的多文档事务能力必须可用**（实施前必须 PoC 验证）。

### 推荐方案

**方案 A：Vercel 直连 + CloudBase Node SDK + 现有 PG Storage HTTP API（保持 ObjectStore 不变）**

理由：
1. 改动范围最小（1 adapter 文件 + 1 测试文件 + 1 依赖），符合用户裁决「若适配器可以控制在单个基础设施模块和相应测试内」。
2. Vercel Hobby maxDuration=300s 已覆盖 Provider 调用（80-100s）。
3. Cron 兼容性已验证（HARDEN-001B 已合并）。
4. 不触发任何 Stop Condition。
5. ObjectStore 保持现状，PG Storage HTTP API 无需替换。
6. 求职叙事可通过 `docs/lumen-v2/storage-options.md` 修订体现。

### 方案 B 不推荐（fatal blocker）

CloudBase HTTP 云函数作为后端被否决，因为：
- CloudBase Workflow 60s 单节点限制无法承载 80-100s Provider 调用。
- 云函数默认 20s 超时（可调到 60s 但仍不足）。
- 长任务需要拆分成多个短任务 + 状态机，违反「不破坏现有 API 合同」Stop Condition #3。

---

## 3. AC 覆盖矩阵（9 项全部完成）

| AC | 描述 | 结论 |
|----|------|------|
| AC-01 | PersistenceDependencies 接口方法清单 | 完成（7 接口 / 29 方法 + JobExecutor 2 方法） |
| AC-02 | 每个方法在文档数据库中的实现方式 | 完成（含 ObjectStore 保持原 HTTP fetch） |
| AC-03 | 5 个业务不变量如何保证 | 完成（多文档事务 + 唯一索引 + 条件 update + 补偿删除） |
| AC-04 | 集合/主键/唯一索引/普通索引 | 完成（7 集合 + 2 唯一索引 + 多个普通索引） |
| AC-05 | CloudBase Node SDK 依赖状态 | 完成（**未安装**，需新增 `@cloudbase/node-sdk`） |
| AC-06 | Vercel 直连 vs CloudBase HTTP 云函数对比 | 完成（方案 A 推荐；方案 B 受 60s 限制 fatal blocker） |
| AC-07 | 推荐方案 + 实施任务卡 | 完成（方案 A + `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` 任务卡） |
| AC-08 | 不使用 Vercel 本地文件系统 | 合规（ObjectStore 保持 PG Storage HTTP API） |
| AC-09 | 不创建 PostgreSQL / 不升级套餐 | 合规（仅设计文档数据库集合，未创建云资源） |

---

## 4. Stop Conditions 评估

| Stop Condition | 触发 | 评估 |
|----|------|------|
| #1：SQL join 或 SQL-specific transaction | 不触发 | 接口本身无 SQL 类型；adapter 内部 SQL 特性均有 NoSQL 等价物 |
| #2：腾讯云主账号永久密钥 | 不触发 | 子账号 + 环境变量；CAM 收敛到 cloudbase:db + cloudbase:storage |
| #3：破坏现有 API 合同 | 不触发 | `PersistenceDependencies` 接口签名完全不变 |
| #4：改动跨多个核心领域模块 | 不触发 | 改动仅在 `src/server/infrastructure/persistence/` 内 |
| #5：幂等和恢复租约原子性 | 前提条件 | 需 CloudBase 多文档事务支持；**实施前必须 PoC 验证** |

---

## 5. 关键技术发现

### 5.1 当前接口

`PersistenceDependencies` 聚合 7 个子接口 + 1 个 `JobExecutor`：
- `ProjectRepository`：4 方法（create / get / updatePointers / deleteCascade）
- `AssetRepository`：3 方法（create / get / listByProject）
- `VersionRepository`：4 方法（create / createIdempotent / get / listByProject）
- `JobRepository`：9 方法（create / createIdempotent / get / update / updateIfClaimed / updateIfActive / claim / heartbeat / listActiveByProject / listLeaseExpired）
- `ObjectStore`：5 方法（put / get / getSignedUrl / delete / exists）
- `UnitOfWork`：1 方法（run<T>）
- `AuthThrottleRepository`：3 方法（get / put / delete）
- `JobExecutor`：2 方法（enqueue / cancel）

**总计 29 + 2 = 31 个方法。**

### 5.2 当前 SQL-specific 特性均有 NoSQL 等价物

| SQL 特性 | NoSQL 等价物 |
|---|---|
| `RETURNING *` | 单文档 update 返回新对象 |
| `ON CONFLICT DO NOTHING` / `DO UPDATE` | 唯一索引 + duplicate key catch / `doc(key).set(..., { merge: true })` |
| `ON DELETE CASCADE` | 应用层级联删除 |
| 条件 `WHERE` 乐观锁 | MongoDB `where + update` 单文档原子 |
| `COALESCE($2, active_version_id)` | 先 doc.get 拿当前值再 update / `set with merge` |
| `NOW()` | 应用层 `new Date().toISOString()` |

**关键发现**：当前 PostgreSQL 实现没有使用 `SELECT FOR UPDATE`、没有 `SAVEPOINT`，全靠条件 UPDATE 实现乐观并发。NoSQL 等价物完全可用。

### 5.3 核心事务边界

- `ProjectService.createProject`：3 步 UoW（projects.create + assets.create + versions.createIdempotent）
- `GenerationService.executeJob`：4 步 UoW（assets.create + versions.createIdempotent + projects.updatePointers + jobs.updateIfClaimed）
- `deleteProject`：1 步（deleteCascade，对象清理在事务外）

CloudBase 文档数据库事务支持最多 10 个文档跨集合原子写入，3 步（4 个文档）在限制内。

### 5.4 CloudBase Node SDK 未安装

仓库内 `@cloudbase/node-sdk` / `wx-server-sdk` / `tcb-router` / `database().collection` / `cloudbase_database` 全部 **0 匹配**。需新增 `@cloudbase/node-sdk` 依赖。

### 5.5 ObjectStore 保持不变

ObjectStore 与数据库适配器解耦，PG Storage 与 CloudBase 文档数据库是两套独立服务，两者可以并存。**避免引入 CloudBase Storage SDK，减少凭据面。**

---

## 6. 集合与索引设计

### 集合清单（7 个）

| 集合名 | 主键 | 唯一索引 | 普通索引 |
|---|---|---|---|
| `projects` | `_id` (业务 id) | — | `workspaceId`, `createdAt` |
| `assets` | `_id` (业务 id) | — | `projectId`, `projectId+kind`, `createdAt` |
| `versions` | `_id` (业务 id) | — | `projectId`, `createdAt` |
| `version_idempotency` | `_id` (auto) | `{ projectId, key }` unique | — |
| `generation_jobs` | `_id` (业务 id) | — | `projectId`, `status`, `leaseExpiresAt`, `status+leaseExpiresAt`, `idempotencyKey`, `createdAt` |
| `job_idempotency` | `_id` (auto 或 `_id=key`) | `{ key }` unique | — |
| `auth_throttle` | `_id` (业务 key) | — | — |

---

## 7. 实施任务卡（推荐启动）

```
Task ID: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01
Risk Level: MEDIUM
Recommended Owner: Trae
Codex: REQUIRED (实施完成后审查)
Status: READY_FOR_TRAE_EXECUTION

Objective:
将 src/server/infrastructure/persistence/cloudbase.ts 的 PostgreSQL adapter
替换为 CloudBase 文档数据库 adapter，保持 PersistenceDependencies 接口不变，
恢复 lumen-ink.vercel.app 在线体验。

In Scope:
1. 新增依赖 @cloudbase/node-sdk
2. 新建 src/server/infrastructure/persistence/cloudbase.nosql.ts
3. 修改 select.ts 和 index.ts
4. 新建 cloudbase.nosql.contract.test.ts
5. 配置 Vercel env: CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID,
   CLOUDBASE_SECRET_KEY, CLOUDBASE_STORAGE_BUCKET, CLOUDBASE_STORAGE_TOKEN
6. 部署后 e2e 验证

Out of Scope:
- 不修改 src/server/domain/persistence.ts（接口冻结）
- 不修改 src/server/services/* 的任何文件（领域层无感知）
- 不修改 src/client/* 的任何文件
- 不删除现有 cloudbase.ts（作为 fallback 或归档参考）

Acceptance Criteria (12 项):
AC-01: PersistenceDependencies 接口签名不变
AC-02: cloudbase.nosql.ts 实现 9 阶段 Job 状态机
AC-03: ProjectService.createProject 3 步原子写入通过多文档事务保证
AC-04: GenerationService.executeJob 4 步原子写入通过多文档事务保证
AC-05: version_idempotency 唯一索引保证幂等
AC-06: job_idempotency 唯一索引保证幂等
AC-07: jobs.claim 并发只有一个 worker 成功
AC-08: deleteCascade 清理对象 + 所有子记录
AC-09: ObjectStore 接口完全保持原 HTTP fetch 实现
AC-10: 现有所有 *.test.ts 不修改
AC-11: 新增 contract test 通过
AC-12: Vercel 部署后线上可创建/查询/删除 Project

Stop Conditions:
1. CloudBase 文档数据库多文档事务能力不可用
2. 子账号权限无法收敛到文档数据库 + Storage 双服务
3. 现有 contract test 出现 SQL-specific 断言无法在 NoSQL 重现
4. 改动超过 src/server/infrastructure/persistence/ 目录
```

---

## 8. 关键风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| CloudBase 文档数据库多文档事务不可用 | UoW 跨集合原子性无法保证 | 实施前先在云控制台执行 `db.transaction(...)` 测试用例验证；若不可用，回退到方案 B 或购买 PostgreSQL |
| `@cloudbase/node-sdk` 在 Vercel Function 体积过大 | 部署超限 | 实施时用 `@cloudbase/node-sdk` 的轻量子集或 `tcb` HTTP API 直连 |
| 子账号权限收敛困难 | Secret 风险扩大 | 实施前先在 CAM 控制台配置最小权限策略，验证后再注入 Vercel env |
| 现有 `cloudbase.transaction.contract.test.ts` 是 SQL-specific 断言 | 测试无法直接复用 | 新建 `cloudbase.nosql.contract.test.ts`，复用测试矩阵但替换 SQL 断言为 NoSQL 等价断言 |
| `JobPatch` 三态语义在 MongoDB update 表达式中实现复杂 | 三态语义丢失 | 实现一个 `buildMongoUpdate(patch)` 工具函数 |

---

## 9. 修改文件清单

### 不修改（接口冻结）

- `src/server/domain/persistence.ts`
- `src/server/services/ProjectService.ts`、`GenerationService.ts`
- `src/server/routes/*`
- `src/client/*`
- `src/server/infrastructure/persistence/local.ts`（dev/test fallback）

### 修改

- `src/server/package.json`：新增 `@cloudbase/node-sdk` 依赖
- `src/server/infrastructure/persistence/select.ts`：新增 NoSQL 模式或替换路径
- `src/server/infrastructure/persistence/index.ts`：导出新 adapter

### 新建

- `src/server/infrastructure/persistence/cloudbase.nosql.ts`：新 adapter（~700-900 行）
- `src/server/infrastructure/persistence/cloudbase.nosql.contract.test.ts`：契约测试

### 保留

- `src/server/infrastructure/persistence/cloudbase.ts`：作为 fallback 或归档参考
- `src/server/infrastructure/persistence/cloudbase.transaction.contract.test.ts`：作为 SQL 实现的对照测试归档

---

## 10. GPT 下一步建议

1. **审查本完成包 + 详细调查报告**（`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01-TRAE-REPORT.md`），确认推荐方案 A 是否符合用户裁决。

2. **若 GPT 同意**，建议用户启动 `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` 实施任务，进入 ready_for_trae 状态。

3. **实施前必须执行 5 分钟 PoC**：在 CloudBase 控制台执行 `db.transaction(async tx => { tx.collection('test').add({...}); tx.collection('test2').add({...}); })` 验证多文档事务能力。若失败：
   - 选项 1：回退到方案 B（云函数后端），但受 60s 限制需拆分长任务（违反 Stop Condition #3）
   - 选项 2：继续推进 Track B 收口，放弃在线体验恢复
   - 选项 3：购买 PostgreSQL（违反用户裁决）

4. **`storage-options.md` 需更新决策记录**，新增 D-050「持久化方案从 PostgreSQL 切换到 CloudBase 文档数据库」。

5. **本任务为只读调查，无代码改动**，不进入正式 GPT 验收流程，仅需 GPT 审议调查结论。

---

## 11. 相关文件位置

- 详细调查报告：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01-TRAE-REPORT.md`
- 状态交接：`docs/lumen-v2/state/SESSION-HANDOFF.md`（顶部已追加本次调查状态）
- 冻结接口：`src/server/domain/persistence.ts`
- 当前 PostgreSQL adapter：`src/server/infrastructure/persistence/cloudbase.ts`
- 部署模式选择器：`src/server/infrastructure/persistence/select.ts`
- adapter 注册表：`src/server/infrastructure/persistence/index.ts`
- UoW 契约测试：`src/server/infrastructure/persistence/cloudbase.transaction.contract.test.ts`

---

**完成包作者**：Trae
**完成日期**：2026-07-21
**任务状态**：READY_FOR_GPT_REVIEW（仅作调查结论，无代码改动）

> **注**：本完成包原本应输出到 `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`（用户偏好稳定文件名）。由于工具权限限制无法直接写入桌面路径，已备份到项目内 `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01-COMPLETION-PACKET.md`，请用户自行复制内容到桌面目标路径（覆盖原文件）。
