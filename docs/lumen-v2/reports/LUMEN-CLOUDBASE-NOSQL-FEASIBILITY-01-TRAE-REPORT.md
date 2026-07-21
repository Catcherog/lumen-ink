# LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01 — Trae 只读调查报告

| 字段 | 值 |
|---|---|
| Task ID | LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01 |
| Risk Level | MEDIUM |
| Owner | Trae |
| Codex | NOT_REQUIRED |
| 调查范围 | 只读仓库分析（不修改代码 / 不配置 Secret / 不创建云资源） |
| 报告日期 | 2026-07-21 |
| 调查基线 | `main` 分支当前 HEAD |

---

## 0. 执行摘要

**结论：可行，但需要做一次局部化的基础设施模块替换，且必须使用 CloudBase 文档数据库的多文档事务能力才能不破坏既有领域不变量。**

核心判断：

1. 当前 [persistence.ts](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/src/server/domain/persistence.ts) 中冻结的 `PersistenceDependencies` 接口**没有暴露任何 SQL-specific 类型**（无 `JOIN`、无 `RETURNING`、无 `PoolClient`），只暴露领域级方法（create / get / update / claim / heartbeat / listLeaseExpired 等）。接口本身完全可以在文档数据库上等价实现。**未触发 Stop Condition #1、#3。**
2. 当前 [cloudbase.ts](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/src/server/infrastructure/persistence/cloudbase.ts) adapter 依赖的 SQL-specific 特性（`RETURNING` / `ON CONFLICT` / `ON DELETE CASCADE` / 条件 `WHERE` 乐观锁）**均有 NoSQL 等价模式**。**未触发 Stop Condition #5**，前提是 CloudBase 文档数据库的多文档事务能力可用（是否需要付费版需通过 Gate P0 PoC 实测确认）或重新设计 Idempotency 表的写入顺序。
3. 调用方 `ProjectService.createProject`（3 步 UoW）和 `GenerationService.executeJob`（4 步 UoW）依赖跨集合原子写入。这要求 CloudBase 文档数据库必须支持跨集合事务。**CloudBase 文档数据库的事务能力（包括文档上限、性能限制和可用版本）必须通过 Gate P0 PoC 在目标环境中实测验证，不应在调查阶段作为确定性事实陈述。**
4. CloudBase Node SDK 当前**未安装**，需新增 `@cloudbase/node-sdk` 依赖。
5. **推荐方案 A（Vercel 直连 + CloudBase Node SDK）作为首选**，理由是改动范围可控（仅 1 个 adapter 文件 + 1 个测试 + 1 个依赖），且 Vercel Hobby maxDuration=300s 已覆盖 Provider 调用时长。
6. **Stop Condition 评估：未触发任何 Stop Condition**，但有一个关键前提：CloudBase 文档数据库的多文档事务能力必须可用。

---

## AC-01：PersistencePort 或等价接口的所有方法清单

冻结接口位于 [src/server/domain/persistence.ts](file:///d:/360Downloads/Trae%20%E9%A1%B9%E7%9B%AE/picture-edit/src/server/domain/persistence.ts)，由 `PersistenceDependencies` 聚合 7 个子接口 + 1 个 `JobExecutor`：

### ProjectRepository（4 方法）

| 方法签名 | 说明 |
|---|---|
| `create(input: Project): Promise<Project>` | 创建 Project |
| `get(id: string): Promise<Project \| null>` | 按 id 查询 |
| `updatePointers(id, { activeVersionId?, approvedVersionId? }): Promise<Project>` | 更新 active/approved 指针，使用 `COALESCE` 保留旧值 |
| `deleteCascade(id: string): Promise<void>` | 删除 Project 及其级联资产 |

### AssetRepository（3 方法）

| 方法签名 | 说明 |
|---|---|
| `create(input: Asset): Promise<Asset>` | 创建 Asset |
| `get(id: string): Promise<Asset \| null>` | 按 id 查询 |
| `listByProject(projectId: string): Promise<Asset[]>` | 列出某 Project 下所有 Asset |

### VersionRepository（4 方法）

| 方法签名 | 说明 |
|---|---|
| `create(input: Version): Promise<Version>` | 创建 Version |
| `createIdempotent(projectId, idempotencyKey, version): Promise<Version>` | 幂等创建 Version（先查 `version_idempotency` 索引，命中则返回旧 Version） |
| `get(id: string): Promise<Version \| null>` | 按 id 查询 |
| `listByProject(projectId: string): Promise<Version[]>` | 列出某 Project 下所有 Version |

### JobRepository（9 方法）

| 方法签名 | 说明 |
|---|---|
| `create(input: GenerationJob): Promise<GenerationJob>` | 创建 Job（同步写 `job_idempotency` 索引） |
| `createIdempotent(input): Promise<{ job, created }>` | 幂等创建 Job |
| `get(id: string): Promise<GenerationJob \| null>` | 按 id 查询 |
| `update(id, patch: JobPatch): Promise<GenerationJob>` | 无条件更新（throw JOB_NOT_FOUND if 0 row） |
| `updateIfClaimed(id, leaseToken, patch): Promise<GenerationJob \| null>` | 条件更新（WHERE lease_token = $2 AND status NOT IN 终态） |
| `updateIfActive(id, patch): Promise<GenerationJob \| null>` | 条件更新（WHERE status NOT IN 终态） |
| `claim(id, { workerId, leaseToken, leaseExpiresAt, now }): Promise<boolean>` | 抢占 lease（WHERE lease_token IS NULL OR = $3 OR expires_at <= $5） |
| `heartbeat(id, { leaseToken, leaseExpiresAt, now }): Promise<boolean>` | 续 lease（WHERE lease_token = $2） |
| `listActiveByProject(projectId): Promise<GenerationJob[]>` | 列出非终态 Job |
| `listLeaseExpired(now): Promise<GenerationJob[]>` | 列出 lease 过期的非终态 Job |

### ObjectStore（5 方法）

| 方法签名 | 说明 |
|---|---|
| `put(key, bytes, mimeType): Promise<void>` | 上传对象 |
| `get(key): Promise<Uint8Array>` | 下载对象 |
| `getSignedUrl(key): Promise<string>` | 获取签名 URL |
| `delete(key): Promise<void>` | 删除对象 |
| `exists(key): Promise<boolean>` | 检查对象存在 |

### UnitOfWork（1 方法）

| 方法签名 | 说明 |
|---|---|
| `run<T>(fn: () => Promise<T>): Promise<T>` | 在单个事务内运行 fn；失败自动 ROLLBACK；嵌套复用外层 client |

### AuthThrottleRepository（3 方法）

| 方法签名 | 说明 |
|---|---|
| `get(key): Promise<AuthThrottleBucket \| null>` | 查询登录限流桶 |
| `put(key, value): Promise<void>` | upsert 限流桶（`ON CONFLICT DO UPDATE`） |
| `delete(key): Promise<void>` | 删除限流桶 |

### JobExecutor（2 方法，独立于 PersistenceDependencies）

| 方法签名 | 说明 |
|---|---|
| `enqueue(jobId: string): Promise<void>` | 入队 Job |
| `cancel(jobId: string): Promise<'cancelled' \| 'best_effort'>` | 取消 Job |

**总计：`PersistenceDependencies` 聚合 7 接口 / 29 个方法；外加 `JobExecutor` 2 个方法。**

---

## AC-02：每个方法在文档数据库中的实现方式

> **前提约定**：CloudBase 文档数据库（基于 MongoDB 兼容协议）的写入语义为「单文档原子写入」；跨集合事务需要显式 `db.transaction(...)`。下表的「实现方式」按「单文档原子」优先，跨集合事务仅在 UoW 内使用。

### ProjectRepository

| 方法 | NoSQL 实现方式 |
|---|---|
| `create(input)` | `collection('projects').add(input)` 单文档插入 |
| `get(id)` | `collection('projects').doc(id).get()` 单文档读取 |
| `updatePointers(id, patch)` | 单文档 `update({ activeVersionId: patch.activeVersionId ?? <当前值>, approvedVersionId: patch.approvedVersionId ?? <当前值> })`。`COALESCE` 语义通过「先 doc(id).get() 拿当前值，再写入」或「使用 `set` with merge」实现 |
| `deleteCascade(id)` | 应用层级联：先 `list assets where projectId = id` → `Promise.all(delete objects)` → `delete versions where projectId = id` → `delete jobs where projectId = id` → `delete idempotency rows` → `delete projects.doc(id)`。**替代原 SQL `ON DELETE CASCADE`** |

### AssetRepository

| 方法 | NoSQL 实现方式 |
|---|---|
| `create(input)` | `collection('assets').add(input)` |
| `get(id)` | `collection('assets').doc(id).get()` |
| `listByProject(projectId)` | `collection('assets').where({ projectId }).get()`（需要 `projectId` 普通索引） |

### VersionRepository

| 方法 | NoSQL 实现方式 |
|---|---|
| `create(input)` | `collection('versions').add(input)` |
| `createIdempotent(projectId, key, version)` | **读改写模式**：先 `collection('version_idempotency').where({ projectId, key }).get()` → 若命中，返回已存在的 Version → 否则在一个事务内 `add(version)` + `add(version_idempotency record)`。**替换原 SQL 的「SELECT 索引 + INSERT version + INSERT index」3 步**。**事务保证**：在 `unitOfWork.run()` 内时，使用 CloudBase 多文档事务；外部调用则用「先写 Version，再写索引，索引写失败时补偿删除 Version」的乐观模式 |
| `get(id)` | `collection('versions').doc(id).get()` |
| `listByProject(projectId)` | `collection('versions').where({ projectId }).orderBy('createdAt', 'asc').get()` |

### JobRepository

| 方法 | NoSQL 实现方式 |
|---|---|
| `create(input)` | 事务内：`collection('generation_jobs').add(input)` + 若有 `idempotencyKey`，`collection('job_idempotency').add({ key, jobId })` |
| `createIdempotent(input)` | 同 VersionRepository.createIdempotent 模式 |
| `get(id)` | `collection('generation_jobs').doc(id).get()` |
| `update(id, patch)` | `doc(id).update(set patch fields)` — 若 0 affected，throw `JOB_NOT_FOUND`。**JobPatch 三态语义**：absent → 不写；null → 显式 `$unset`；value → `$set`。需要应用层把 patch 转成 MongoDB update 表达式（`$set` + `$unset`） |
| `updateIfClaimed(id, leaseToken, patch)` | 条件 update：`doc(id).where({ leaseToken, status: { $nin: ['succeeded','failed','cancelled'] } }).update(set patch)` → 0 affected = null。**替换原 SQL 条件 WHERE 乐观锁** |
| `updateIfActive(id, patch)` | `doc(id).where({ status: { $nin: [...] } }).update(...)` |
| `claim(id, input)` | `doc(id).where({ status: { $nin: [...] }, $or: [{ leaseToken: null }, { leaseToken: input.leaseToken }, { leaseExpiresAt: { $lte: input.now } }] }).update({ workerId, leaseToken, leaseExpiresAt, updatedAt })` → 0 affected 返回 false（再 doc.get 检查是否存在，不存在则 throw JOB_NOT_FOUND） |
| `heartbeat(id, input)` | `doc(id).where({ leaseToken: input.leaseToken, status: { $nin: [...] } }).update({ leaseExpiresAt, updatedAt })` → affected > 0 |
| `listActiveByProject(projectId)` | `where({ projectId, status: { $in: ['queued','uploading','analyzing','generating','postprocessing','saving'] } }).get()` |
| `listLeaseExpired(now)` | `where({ status: { $in: [...] }, $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }] }).get()` |

### ObjectStore（保持不变）

| 方法 | 实现方式 |
|---|---|
| `put / get / delete / exists / getSignedUrl` | **完全保持现有 HTTP fetch 实现**，继续调用 CloudBase PG Storage 的 HTTP OpenAPI（`https://{envId}.api.tcloudbasegateway.com/v1/storages/object/...`）。**理由**：ObjectStore 与数据库适配器解耦，PG Storage 与 CloudBase 文档数据库是两套独立服务；PG Storage 是「对象存储」，文档数据库是「文档数据库」，两者可以并存。**避免引入 CloudBase Storage SDK，减少凭据面。** |

### UnitOfWork

| 方法 | 实现方式 |
|---|---|
| `run<T>(fn)` | 用 CloudBase Node SDK 的 `db.transaction(async tx => { ... })` 包装 fn。**AsyncLocalStorage 传播 tx**：实现方式与当前 PostgreSQL 版本一致（`AsyncLocalStorage<CloudBaseTransaction>`）。所有 repo 方法在事务内时通过 `als.getStore()` 拿到 tx，调用 `tx.collection('xxx').add(...)` 而非 `db.collection('xxx').add(...)`。嵌套 UoW 复用外层 tx（无嵌套 BEGIN） |

### AuthThrottleRepository

| 方法 | 实现方式 |
|---|---|
| `get(key)` | `collection('auth_throttle').doc(key).get()` |
| `put(key, value)` | **upsert**：`doc(key).set(value, { merge: true })` 或 `collection.add({...})` 失败时 `doc(key).update(...)`。**替换 SQL `ON CONFLICT DO UPDATE`** |
| `delete(key)` | `doc(key).remove()` |

### JobExecutor（独立于 PersistenceDependencies）

| 方法 | 实现方式 |
|---|---|
| `enqueue(jobId)` | 保持现有 HTTP 自调用 `/api/jobs/:id/execute` 的 Vercel Cron 拉起模式。**不变** |
| `cancel(jobId)` | 保持现有模式。**不变** |

---

## AC-03：业务不变量如何在文档数据库中保证

### 不变量 1：Project 与 V0 一致创建

**当前实现**：`ProjectService.createProject` 在 `unitOfWork.run()` 内 3 步原子：`projects.create` + `assets.create` + `versions.createIdempotent`。任何一步失败 ROLLBACK。

**文档数据库保证方式**：
- 使用 CloudBase 多文档事务：`db.transaction(async tx => { tx.collection('projects').add(...); tx.collection('assets').add(...); tx.collection('versions').add(...); tx.collection('version_idempotency').add(...); })`
- **关键前提**：CloudBase 文档数据库的事务能力（包括跨集合原子写入的文档上限、性能特征和可用版本）**必须通过 Gate P0 PoC 在目标环境中实测验证**，不应在调查阶段作为确定性事实陈述。3 步（4 个文档）的写入规模预计在能力范围内，但具体上限和限制需以实测为准。
- **失败回滚**：fn 抛错 -> tx 自动 abort。
- **补偿保护**：ProjectService 外层仍保留对象上传和补偿删除逻辑（不变）。

### 不变量 2：相同 Idempotency-Key 不重复创建 Job

**当前实现**：`jobs.createIdempotent` 先 SELECT `job_idempotency` → 若命中返回旧 Job → 否则 INSERT job + INSERT index。

**文档数据库保证方式**：
- **方案 A（强一致）**：`job_idempotency` 集合上建立 `{ key: 1 }` 唯一索引 → 重复 INSERT 会抛 duplicate key error → catch 后回查返回旧 Job。
- **方案 B（事务内读改写）**：在 UoW 事务内 `tx.collection('job_idempotency').where({ key }).get()` → 命中返回旧 → 否则 add(job) + add(index)。
- **推荐方案 A**：唯一索引由数据库强制，比应用层「读改写」更可靠。

### 不变量 3：Job 状态更新不能倒退

**当前实现**：`jobs.updateIfClaimed` / `updateIfActive` 在 WHERE 条件中排除终态 `status NOT IN ('succeeded','failed','cancelled')`。0 affected = null 返回。

**文档数据库保证方式**：
- `doc(id).where({ status: { $nin: ['succeeded','failed','cancelled'] } }).update(...)` — MongoDB 的条件 update 原子执行，0 affected 即状态已倒退或 lease 已被他人抢占。
- **语义等价**：MongoDB 的 `where + update` 是单文档原子操作，与 PostgreSQL 的 `UPDATE ... WHERE` 在并发语义上完全等价。
- **不依赖 SELECT FOR UPDATE**：当前 PostgreSQL 实现也没有使用 `SELECT FOR UPDATE`，全靠条件 UPDATE 实现乐观锁。NoSQL 等价物完全可用。

### 不变量 4：recovery lease 不被多个 worker 同时占用

**当前实现**：`jobs.claim` 使用 `WHERE lease_token IS NULL OR lease_token = $3 OR lease_expires_at <= $5`。多 worker 并发调用时只有一个能成功。

**文档数据库保证方式**：
- `doc(id).where({ status: { $nin: [...] }, $or: [{ leaseToken: null }, { leaseToken: newToken }, { leaseExpiresAt: { $lte: now } }] }).update({ workerId, leaseToken, leaseExpiresAt, updatedAt })`
- **MongoDB 单文档 update 是原子的**，多 worker 并发只有一个 affected > 0。
- **完全等价**：MongoDB 的单文档条件 update 在并发语义上与 PostgreSQL 的 `UPDATE WHERE` 等价，都是基于文档/行级锁的乐观并发。

### 不变量 5：删除或失败时不留下孤立文件

**当前实现**：
- `ProjectService.deleteProject` → 调 `projects.deleteCascade`（在 adapter 内清理对象）→ 同时外层 catch 中也补偿删除已上传对象。
- `GenerationService.executeJob` 在 Job 失败时，对象已上传但 UoW 失败 → 外层 catch 调 `objects.delete(resultStorageKey)` 补偿删除。

**文档数据库保证方式**：
- **保持现有补偿删除模式不变**。ObjectStore 接口和现有补偿逻辑（best-effort + swallow error）都不需要修改。
- **`deleteCascade` 应用层级联**：替代 SQL `ON DELETE CASCADE` 的方式是 adapter 内部按顺序删除 assets/versions/jobs/idempotency/projects，对象清理保持 best-effort。
- **关键不变量**：对象删除始终在数据库事务之外，失败不阻塞主流程，但会留下「孤立对象」标记（可由后续 GC 任务清理，本轮不实现）。

---

## AC-04：集合、主键、唯一索引和普通索引设计

### 集合清单（7 个）

| 集合名 | 主键 | 唯一索引 | 普通索引 | 备注 |
|---|---|---|---|---|
| `projects` | `_id` (string, 业务 id 写入 `_id`) | — | `workspaceId`, `createdAt` | 单文档级原子即可 |
| `assets` | `_id` (业务 id) | — | `projectId`, `projectId+kind`, `createdAt` | `listByProject` 走 `projectId` 索引 |
| `versions` | `_id` (业务 id) | — | `projectId`, `createdAt` | `listByProject` 走 `projectId` 索引 |
| `version_idempotency` | `_id` (auto) | `{ projectId: 1, key: 1 }` unique | — | 替代 SQL 的复合唯一约束 |
| `generation_jobs` | `_id` (业务 id) | — | `projectId`, `status`, `leaseExpiresAt`, `status+leaseExpiresAt`, `idempotencyKey`, `createdAt` | `listActiveByProject` 走 `projectId+status`；`listLeaseExpired` 走 `status+leaseExpiresAt` |
| `job_idempotency` | `_id` (auto, 或 `_id = key`) | `{ key: 1 }` unique | — | 替代 SQL 的 `key` 唯一约束 |
| `auth_throttle` | `_id` (业务 key) | — | — | upsert via `doc(key).set(..., { merge: true })` |

### 索引创建脚本（仅设计，不执行）

```javascript
// 集合初始化 + 索引（生产部署时执行一次，本任务不创建）
db.collection('version_idempotency').createIndex({ projectId: 1, key: 1 }, { unique: true });
db.collection('job_idempotency').createIndex({ key: 1 }, { unique: true });
db.collection('assets').createIndex({ projectId: 1 });
db.collection('versions').createIndex({ projectId: 1 });
db.collection('generation_jobs').createIndex({ projectId: 1, status: 1 });
db.collection('generation_jobs').createIndex({ status: 1, leaseExpiresAt: 1 });
db.collection('generation_jobs').createIndex({ idempotencyKey: 1 }, { sparse: true });
```

---

## AC-05：CloudBase Node SDK 依赖状态

**结论：未安装。**

`src/server/package.json` 当前依赖：
- `pg@^8.13.1`（PostgreSQL 客户端，**需要保留**作为 dev/test fallback 或删除）
- `@google/generative-ai`、`express`、`sharp`、`jsonwebtoken`、`dotenv`、`cors`

**搜索结果**：仓库内 `@cloudbase/node-sdk` / `wx-server-sdk` / `tcb-router` / `database().collection` / `cloudbase_database` 全部 0 匹配。仓库中所有 "CloudBase" 字符串都指 PostgreSQL + PG Storage，**没有任何 NoSQL 使用痕迹**。

**需要新增的依赖**：
- `@cloudbase/node-sdk`（Vercel 直连方案 A）
- 或在方案 B 中不需要 Vercel 端依赖（HTTP 云函数内部用 `wx-server-sdk`，Vercel 通过 HTTP 调用）

---

## AC-06：Vercel 直连 vs CloudBase HTTP 云函数对比

| 维度 | 方案 A：Vercel 直连 + CloudBase Node SDK | 方案 B：CloudBase HTTP 云函数作为后端 |
|---|---|---|
| **改动范围** | 1 adapter 文件（`cloudbase.ts` 替换为 `cloudbase.nosql.ts`）+ 1 测试文件 + 1 依赖 + 1 个 `select.ts` 选项切换 | 新建 N 个云函数（projects/assets/versions/jobs/auth/objects）+ Vercel 端 HTTP client 适配层 + 凭据管理 |
| **Secret 风险** | 中：`CLOUDBASE_SECRET_ID` + `CLOUDBASE_SECRET_KEY` 注入 Vercel env；子账号权限需精确收敛到文档数据库 + Storage。**风险点**：Vercel 凭据一旦泄露可读全集。 | 低：Vercel 仅持有 1 个云函数 HTTP 触发 token；CloudBase 凭据锁在云函数环境内，Vercel 永不接触。 |
| **部署复杂度** | 低：Vercel env vars 一次性配置；adapter 编译到 Vercel Function 内；Cron 兼容性已验证（HARDEN-001B 已合并） | 高：需要部署多个云函数；需要维护云函数版本；长任务执行能力需实测验证（前版报告中的 60s 限制为经验记录，非实测结论） |
| **Cron 兼容性** | 完全兼容：保持现有 Vercel Cron + HTTP 自调用模式 | 需实测验证：云函数/Workflow 的超时上限需在目标环境确认；前版报告中的 60s 限制为经验记录，非实测结论 |
| **maxDuration 覆盖** | Vercel Hobby 300s 已覆盖 80-100s Provider 调用 | 需实测验证：云函数超时上限和 Workflow 执行限制需在目标环境确认 |
| **预计长期维护成本** | 中：1 个 adapter 文件 + 1 套测试；SDK 升级风险低 | 高：N 个云函数 + Vercel HTTP client 适配层 + 函数间契约测试；CloudBase 函数调试链路复杂 |
| **代码隔离性** | 高：替换实现完全在 `src/server/infrastructure/persistence/` 内，领域层无感知 | 中：Vercel 端需要新增 HTTP client 适配，破坏「领域层只依赖接口」原则（除非再做一层抽象） |
| **Stop Condition 风险** | #4（改动跨多个核心领域模块）**不触发**：仅在 1 个基础设施模块内 | #4 风险更高：Vercel 端 HTTP client 也是基础设施，但范围扩大 |
| **可观测性** | 中：日志在 Vercel，可直接看 | 低：日志分散在云函数 + Vercel |
| **求职叙事强度** | 弱：「用了 Vercel + CloudBase NoSQL」，技术深度一般 | 强：「自建多组件后端 + 云函数」，但叙事受 CloudBase Workflow 限制影响 |

### 决定因素

**方案 B 的长任务执行能力需要实测验证，不应在调查阶段作为确定性 fatal blocker 陈述**：

- 前版报告将「CloudBase Workflow 60s 单节点限制」列为方案 B 的 fatal blocker，但该结论来源于 project_memory 中的经验记录，未在目标环境中实测验证。
- CloudBase 云函数的实际超时上限（包括是否可调整、调整后的最大值）以及 Workflow 的单节点执行限制，**必须通过 Gate P0 PoC 或独立验证才能确认**。
- Provider 调用时长 80-100s，若 CloudBase 云函数/Workflow 的超时上限确实无法覆盖，则方案 B 不适合承载长任务。但这一结论需以实测为准，不应作为调查阶段的确定性事实。
- 即使方案 B 存在超时限制，长任务也可以通过拆分 + 状态机模式处理，但这会增加复杂度并可能影响 API 合同——这属于权衡而非确定性 fatal blocker。

**推荐：方案 A（Vercel 直连 + CloudBase Node SDK）**，因为其改动范围最小且不依赖 CloudBase 云函数/Workflow 的长任务能力。

---

## AC-07：推荐方案 + 实施任务卡

### 推荐方案

**方案 A：Vercel + CloudBase Node SDK 直连文档数据库 + 现有 PG Storage HTTP API**

理由：
1. 改动范围最小（1 adapter 文件 + 1 测试 + 1 依赖），符合用户裁决「若适配器可以控制在单个基础设施模块和相应测试内，直接实施方式 1」。
2. Vercel Hobby maxDuration=300s 已覆盖 Provider 调用。
3. Cron 兼容性已验证（HARDEN-001B 已合并）。
4. 不触发任何 Stop Condition。
5. ObjectStore 保持现状，PG Storage HTTP API 无需替换。
6. 求职叙事：可通过 `docs/lumen-v2/storage-options.md` 的修订体现「根据生产环境资源约束，将关系型持久化方案调整为文档数据库与对象存储组合，并通过适配器隔离领域层，实现低成本 Serverless 部署」。

### 实施任务卡

```
Task ID: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01
Risk Level: MEDIUM
Recommended Owner: Trae
Codex: REQUIRED (实施完成后审查)

Objective:
将 src/server/infrastructure/persistence/cloudbase.ts 的 PostgreSQL adapter
替换为 CloudBase 文档数据库 adapter，保持 PersistenceDependencies 接口不变，
恢复 lumen-ink.vercel.app 在线体验。

In Scope:
1. 新增依赖 @cloudbase/node-sdk
2. 新建 src/server/infrastructure/persistence/cloudbase.nosql.ts
   - 实现 ProjectRepository / AssetRepository / VersionRepository /
     JobRepository / ObjectStore / UnitOfWork / AuthThrottleRepository
   - UnitOfWork 使用 db.transaction() + AsyncLocalStorage 传播 tx
   - ObjectStore 保持现有 HTTP fetch 调用 PG Storage API
3. 修改 src/server/infrastructure/persistence/select.ts
   - 新增 VERCEL_NO_SQL 模式或直接替换 cloudbase.ts 路径
4. 修改 src/server/infrastructure/persistence/index.ts
   - 导出新的 nosql adapter
5. 新建 src/server/infrastructure/persistence/cloudbase.nosql.contract.test.ts
   - 复用 cloudbase.transaction.contract.test.ts 的测试矩阵
   - 验证 9 阶段状态机、Idempotency、Lease、级联删除
6. 不修改 src/server/domain/persistence.ts（接口冻结）
7. 不修改 src/server/services/* 的任何文件（领域层无感知）
8. 不修改 src/client/* 的任何文件
9. 配置 Vercel env: CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID,
   CLOUDBASE_SECRET_KEY, CLOUDBASE_STORAGE_BUCKET, CLOUDBASE_STORAGE_TOKEN
10. 部署后执行一次 e2e 验证（创建 Project → 上传 → 生成 → 删除）

Acceptance Criteria:
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

Status: READY_FOR_TRAE_EXECUTION
```

---

## AC-08 & AC-09：合规声明

- **AC-08**：本报告**未提出使用 Vercel 本地文件系统作为生产持久化**。ObjectStore 保持现有 CloudBase PG Storage HTTP API，与 Vercel `/tmp` 无关。本地 dev/test 仍使用 `local.ts` 文件 adapter，但仅限 `VERCEL != 1` 模式（与生产隔离）。
- **AC-09**：本报告**未创建 PostgreSQL、未升级套餐、未产生新费用**。CloudBase 文档数据库的免费额度（基础版）已足够 P0 流量；多文档事务若需要付费版，将在实施任务卡中明确告知用户决策，不在本调查任务内擅自开通。

---

## Stop Conditions 评估

| Stop Condition | 是否触发 | 评估 |
|---|---|---|
| #1：领域接口依赖复杂 SQL join 或 SQL-specific transaction | ❌ 不触发 | 接口本身无 SQL 类型；adapter 内部 SQL-specific 特性均有 NoSQL 等价物 |
| #2：需要使用腾讯云主账号永久密钥 | ❌ 不触发 | 使用子账号 + 环境变量；CAM 权限可收敛到 cloudbase:db + cloudbase:storage |
| #3：需要破坏现有 API 合同 | ❌ 不触发 | PersistenceDependencies 接口签名完全不变 |
| #4：预计改动跨越多个核心领域模块 | ❌ 不触发 | 改动仅在 `src/server/infrastructure/persistence/` 内（1 adapter + 1 test + 1 select + 1 index） |
| #5：无法保证幂等和恢复租约原子性 | ⚠️ 前提条件 | 需要 CloudBase 文档数据库的多文档事务支持。**实施前必须确认账号能力** |

---

## 关键风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| CloudBase 文档数据库多文档事务不可用 | UoW 跨集合原子性无法保证 | 实施前先在云控制台执行 `db.transaction(...)` 测试用例验证；若不可用，回退到方案 B（云函数后端）或方案 C（购买 PostgreSQL） |
| `@cloudbase/node-sdk` 在 Vercel Function 体积过大 | 部署超限 | 实施时用 `@cloudbase/node-sdk` 的轻量子集或 `tcb` HTTP API 直连 |
| 子账号权限收敛困难 | Secret 风险扩大 | 实施前先在 CAM 控制台配置最小权限策略，验证后再注入 Vercel env |
| 现有 `cloudbase.transaction.contract.test.ts` 是 SQL-specific 断言 | 测试无法直接复用 | 新建 `cloudbase.nosql.contract.test.ts`，复用测试矩阵但替换 SQL 断言为 NoSQL 等价断言 |
| `JobPatch` 三态语义在 MongoDB update 表达式中实现复杂 | 三态语义丢失 | 实现一个 `buildMongoUpdate(patch)` 工具函数，把 `JobPatch` 转成 `{ $set: {...}, $unset: {...} }` |

---

## 关键文件清单

### 不修改（接口冻结）

- `src/server/domain/persistence.ts`
- `src/server/services/ProjectService.ts`
- `src/server/services/GenerationService.ts`
- `src/server/routes/*`
- `src/client/*`
- `src/server/infrastructure/persistence/local.ts`（dev/test fallback，保持不变）

### 修改

- `src/server/package.json`：新增 `@cloudbase/node-sdk` 依赖
- `src/server/infrastructure/persistence/select.ts`：新增 NoSQL 模式或替换路径
- `src/server/infrastructure/persistence/index.ts`：导出新 adapter

### 新建

- `src/server/infrastructure/persistence/cloudbase.nosql.ts`：新 adapter（~700-900 行，参照 cloudbase.ts 的 1213 行精简）
- `src/server/infrastructure/persistence/cloudbase.nosql.contract.test.ts`：契约测试

### 保留

- `src/server/infrastructure/persistence/cloudbase.ts`：作为 fallback 或归档参考；若用户决定彻底切换，再删除
- `src/server/infrastructure/persistence/cloudbase.transaction.contract.test.ts`：作为 SQL 实现的对照测试归档

---

## 测试清单

| 测试 | 验证点 | 优先级 |
|---|---|---|
| `cloudbase.nosql.contract.test.ts` | 9 阶段状态机、Idempotency、Lease、级联删除 | P0 |
| `cloudbase.nosql.transaction.contract.test.ts` | UoW 共享 tx、嵌套复用、ROLLBACK、AC-05/AC-06 失败回滚 | P0 |
| `cloudbase.nosql.concurrency.test.ts` | claim 并发只有一个成功、heartbeat 续期 | P1 |
| `cloudbase.nosql.jobpatch.test.ts` | JobPatch 三态语义（absent/null/value） | P1 |
| 现有所有 `*.test.ts`（不修改） | 领域层无感知 | P0 |
| Vercel 部署后 e2e | 线上 Project 创建/查询/删除 | P0 |

---

## 协作建议（给 GPT 的下一步建议）

1. **本任务为只读调查，无代码改动**，不进入 GPT 验收流程。
2. 推荐用户启动 `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` 实施任务，进入 ready_for_trae 状态。
3. 实施前建议先在 CloudBase 控制台验证多文档事务能力（5 分钟 PoC），若失败则改走方案 B 或继续推进 Track B 收口。
4. `storage-options.md` 需要由 GPT 更新决策记录，新增 D-050「持久化方案从 PostgreSQL 切换到 CloudBase 文档数据库」。
5. 完成包输出到 `C:\Users\Catcher\Desktop\协作文件夹\picture-edit-collab-completion.md`，供 Web GPT 审查。

---

**报告作者**：Trae
**报告日期**：2026-07-21
**报告状态**：READY_FOR_GPT_REVIEW（仅作调查结论，无代码改动）
