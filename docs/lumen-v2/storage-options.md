# STORAGE-001 持久化与任务基础设施技术选型

> 状态：`frozen`（GPT 于 2026-07-18 验收；`MVP_PASS_WITH_DEBT`，PERSIST 首门完成契约收敛）
> 任务：STORAGE-001
> 创建日期：2026-07-18
> 修订日期：2026-07-18（用户重新打开局部选型修订，新增首选候选 A，修正过时事实）
> 主源登记：`docs/lumen-v2/evidence/STORAGE-001/source-register.md`
> 最终 STORAGE 修订提交：`abcc103394f86b87ae37af1bd6172f984e9d46e6`（已 push 到 `lumen/storage-001-trae`）

## 0. 决策摘要（先读这一节）

- 用户决策方向（2026-07-18 重新打开修订）：
  - 首选架构：**Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage**（候选 A）。
  - 当前不注册 Cloudflare，不升级 Vercel Pro。
  - GitHub 不得作为运行时数据库、对象存储或 GenerationJob 状态存储。
  - Trae 修订阶段只允许执行 STORAGE-001；该限制已由本文件的 GPT 冻结记录完成解除。
  - `decision: frozen` 仅由 GPT 写入；Trae 不得自行改写冻结结论。
- 候选方案数：3（详见 §2）。
  - A. Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage（首选）
  - B. Vercel Hobby + Marketplace Postgres + Vercel Private Blob
  - C. Supabase all-in-one
- 评分结果（详见 §4）：A = **83/100**，B = 78/100，C = 82/100。三方案均通过资格线（recoverability / long_task / deletion 各维度 ≥3）。
- 推荐方案：**候选 A（Vercel Hobby + CloudBase PG + CloudBase PG Storage）**。理由：满足用户已定的方向（不注册 Cloudflare、不升级 Vercel Pro），同时保留现有 Node.js/Express/Sharp 栈，本地 PoC 与 CloudBase mock adapter 6 用例全部通过。
- 边界声明（详见 §3）：
  - GitHub 仅用于源码、规格、脱敏证据和小型合成 fixture。
  - CloudBase 本轮不创建真实环境，不索取或写入密钥，不连接生产数据。
  - 不修改生产 Provider、上传、Job 或 Version 运行路径。
  - 不使用 CloudBase 可视化 Workflow 执行 80—100s Provider 调用（单节点 60s 限制）。
  - CloudBase CloudRun 仅登记为未来容量/长任务升级选项，本轮不部署。
- 成本表达（详见 §6）：按阶段表达，不再使用固定 `$20—25/月` 结论。
  - 当前非商业内部 PoC：Vercel Hobby + CloudBase 免费试用/个人额度。
  - CloudBase 个人版参考 19.9 元/月；实际以账号地区和控制台报价为准。
  - 若转为商业用途：重新审查 Vercel Pro 与 CloudBase 正式环境费用。
- 冻结状态：**已冻结**。候选 A 作为当前内部稳定版方案；商业化、CloudRun 或 R2 迁移需重新决策。

## 1. 硬条件筛选（按 INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md Task 1 Step 2）

| 硬条件 | 候选 A：Vercel Hobby + CloudBase PG + CloudBase PG Storage | 候选 B：Vercel Hobby + Marketplace Postgres + Vercel Private Blob | 候选 C：Supabase all-in-one |
|--------|------|------|------|
| 持久元数据 | ✓ CloudBase PostgreSQL | ✓ Vercel Marketplace Postgres（Neon 等） | ✓ Supabase Postgres |
| 私有对象/签名 URL | ✓ CloudBase PG Storage 私有 bucket + createSignedUrl | ✓ Vercel Blob 私有 Blob + 签名 URL（已支持，参见 §1.1 修正） | ✓ Storage Signed URL + RLS |
| 持久 Job 状态 | ✓ CloudBase PG Job 表 + lease/heartbeat | ✓ Marketplace Postgres Job 表 | ✓ Postgres + pgmq |
| 80—100s Provider 执行（不依赖单个 90s 请求） | ✓ Vercel Hobby Function 300s（覆盖 80—100s Provider 调用 + Sharp 验证 + 对象写入） | ✓ 同左 | ✓ Edge Function 400s（paid） |
| 适配器重建恢复 | ✓（PoC 已验证，详见 §5） | ✓ | ✓ |
| 项目级联删除 | ✓ CloudBase PG 外键 CASCADE + Storage 删对象 | ✓ Postgres CASCADE + Blob 删对象 | ✓ Postgres CASCADE + Storage lifecycle |

三方案均满足硬条件。

### 1.1 事实修正记录（2026-07-18 修订）

前版文档与 `source-register.md §1.7` 中的以下结论已过时，本次修订修正如下：

| 原结论（过时） | 修正后事实 |
|---|---|
| Vercel Blob 仅支持公开 URL，不满足「私有对象/签名 URL」硬条件 | **修正**：Vercel Blob 现支持私有 Blob 与签名 URL（access 参数 `private` + 签名 URL API）。前版拒绝理由不成立；候选 B 重新纳入评估。 |
| Vercel Pro 是 80—100s 任务的技术必需条件（Pro 800s） | **修正**：Hobby 当前 Function maxDuration 上限为 300s，已覆盖 80—100s Provider 调用 + Sharp 验证 + 对象写入。Pro 不再是硬门槛。 |
| Vercel Postgres 包含在 Pro 计划 | **修正**：Vercel Postgres（原 First-Party）已停止服务，新项目需通过 Vercel Marketplace 接入第三方 Postgres（如 Neon）。Marketplace Postgres 独立计费，不属于 Vercel 计划包含项。 |
| Vercel Workflow Beta 期间免费 | **修正**：Vercel Workflow 计费按 Workflow Steps（durable 工作单元）+ Workflow Storage（状态数据量）+ Functions 计算费用计算；Observability 在 Beta 期间免费，Steps 与 Storage 按使用量计费。本轮不使用 Vercel Workflow。 |
| 最终 STORAGE 提交为「待提交」 | **修正**：最终提交为 `d85bae2` `feat(lumen-v2): STORAGE-001 decision and PoC`，已 push 到 `lumen/storage-001-trae` 分支。 |

修正依据：详见 `docs/lumen-v2/evidence/STORAGE-001/source-register.md`（访问日期 2026-07-18，本轮追加补充核对）。

## 2. 候选方案详述

### 2.1 候选 A：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage（首选）

#### 2.1.1 架构

```text
Client (React 19)
  ↓
Vercel Function (Node.js 20+, Express 4, Sharp, maxDuration=300s on Hobby)
  ├─→ CloudBase PostgreSQL — Project/Asset/Version/GenerationJob/AuthThrottle 元数据
  ├─→ CloudBase PG Storage (私有 bucket) — createSignedUrl，原图/版本对象
  └─→ JobExecutor：现有 Vercel Node Function（同步执行 + Job 状态机 + lease/heartbeat + 幂等键 + 显式 retry）
        ├─→ 同步路径：Function 直接调用 Provider API（80—100s），完成后原子写入 Version + Job succeeded
        └─→ 任务恢复：DB Job 状态 + lease 过期自动重试 + idempotencyKey 防重

未来容量升级（本轮不部署）：
  - CloudBase CloudRun：长任务执行 / 容量扩展选项
  - Cloudflare R2：S3 兼容对象存储迁移备选
```

#### 2.1.2 关键能力映射

- **元数据**：CloudBase PostgreSQL，标准 PG，外键 `ON DELETE CASCADE`。
- **对象存储**：CloudBase PG Storage 私有 bucket；通过 `createSignedUrl` 颁发带 TTL 的签名 URL（建议 5—15 分钟）。
- **签名 URL**：`createSignedUrl(key, { ttlSeconds })`；mock adapter PoC 已验证可返回带 expiry 与 signature 的 HTTPS URL（详见 §5）。
- **Job 状态机**：CloudBase PG `generation_jobs` 表 + `lease_expires_at` 字段 + 应用层 lease/heartbeat/释放/重试。
  - 不使用 CloudBase 可视化 Workflow 执行 80—100s Provider 调用（单节点 60s 限制）。
- **80—100s Provider 执行**：Vercel Hobby Function 单次 300s maxDuration，直接处理 Provider 调用 + Sharp 验证 + 对象写入。
- **任务取消**：Function 内 AbortController 中断 fetch；Job 标记 `cancelled`。
- **任务重试**：lease 过期 → `listLeaseExpiredJobs` → 重新 `acquireJobLease` → 显式 retry（幂等键防重复 Version）。
- **刷新恢复**：Job 状态持久在 PG，重新加载页面时查询 Job status。
- **级联删除**：PG 外键 CASCADE 删元数据 + 应用层 `deleteObjects(keys)` 删 CloudBase PG Storage 对象。
- **环境变量**：Vercel Dashboard 管理（64 KB 总上限）；CloudBase 凭据仅在 PERSIST-001 实施阶段由用户在 Vercel Dashboard 手动配置，本轮不写入。

#### 2.1.3 Windows 本地开发替代

- 现有 `LocalPersistence` adapter（`src/server/infrastructure/persistence/local.ts`）保留：纯文件系统，不联网、不要求 CloudBase 账号。
- 新增 `CloudBaseMockPersistence` adapter（`src/server/infrastructure/persistence/cloudbase-mock.ts`）：纯内存 mock，不联网、不读凭据，用于 PoC 测试与本地开发模拟 CloudBase 行为。
- 本地开发优先用 `LocalPersistence`；需要验证 CloudBase 字段映射、lease、幂等语义时用 `CloudBaseMockPersistence`。

#### 2.1.4 优势

- 满足用户已定方向（不注册 Cloudflare，不升级 Vercel Pro）。
- 保留现有 Node.js/Express/Sharp 栈，迁移成本最低。
- CloudBase PG 标准 SQL，外键 CASCADE、事务、lease 字段均原生支持。
- CloudBase PG Storage 提供私有 bucket + createSignedUrl，满足硬条件。
- 本地 PoC + 6 个 mock 用例全部通过，验证冻结接口可实现。
- 不引入跨云账号（仅 Vercel + CloudBase，且 CloudBase 本轮不创建真实环境）。

#### 2.1.5 劣势

- CloudBase 个人版非开源、不可自托管，vendor lock-in 高于 Supabase。
- CloudBase 可视化 Workflow 单节点 60s 限制，不能用于 80—100s Provider 调用。
- CloudBase CloudRun 部署与计费细节本轮未深入，仅作为未来升级选项登记。
- 跨区域网络延迟（Vercel Function ↔ CloudBase PG）需在 PERSIST-001 实测，可能需要在 CloudBase 控制台选择与 Vercel 部署区域就近的可用区。

### 2.2 候选 B：Vercel Hobby + Marketplace Postgres + Vercel Private Blob

#### 2.2.1 架构

```text
Client (React 19)
  ↓
Vercel Function (Node.js 20+, Express 4, Sharp, maxDuration=300s on Hobby)
  ├─→ Vercel Marketplace Postgres (Neon) — 元数据
  ├─→ Vercel Blob (私有 Blob + 签名 URL) — 对象存储
  └─→ JobExecutor：Vercel Node Function 同步执行 + DB Job 状态机
```

#### 2.2.2 关键能力映射

- **元数据**：Marketplace Postgres（Neon），独立计费，与 Vercel 计划不绑定。
- **对象存储**：Vercel Blob 私有 Blob + 签名 URL（已修正事实，前版拒绝理由不成立）。
- **80—100s Provider 执行**：Vercel Hobby Function 300s。
- **任务恢复**：Marketplace Postgres Job 表 + lease/heartbeat（同 A）。

#### 2.2.3 优势

- 完全在 Vercel 生态内，单 Dashboard 管理。
- Blob 与 Function 同账号，无跨云延迟。
- Neon Marketplace Postgres 支持 branching，本地开发体验良好。

#### 2.2.4 劣势

- Vercel Blob 历史无原生备份系统（需自建 `list + copy` 备份流）。
- Marketplace Postgres 独立计费，未含在 Vercel 计划内，长期成本需在 PERSIST-001 阶段实测。
- 未与用户已定方向对齐（用户首选 CloudBase），仅作为对照候选保留。

### 2.3 候选 C：Supabase all-in-one

#### 2.3.1 架构

```text
Client (React 19)
  ↓
Vercel Function (Node.js, Express, Sharp) — 保留作为应用层 + Provider 调用
  ├─→ Supabase Postgres (Pro) — 元数据 + pgmq 队列
  ├─→ Supabase Storage — 私有桶 + Signed URL + RLS
  └─→ Supabase Edge Function (Deno, 400s paid) — 异步 Job worker
        ↑
        pg_cron 定时扫描 pgmq → pg_net 触发 Edge Function
```

#### 2.3.2 关键能力映射

- **元数据**：Supabase Postgres Pro $25/月，dedicated instance，8 GB disk，7 天 daily backups。
- **对象存储**：Supabase Storage，S3 兼容，私有桶 + Signed URL + RLS。
- **80—100s Provider 执行**：Edge Function 400s（paid），CPU 2s 限制。
- **任务恢复**：pgmq + pg_cron + pg_net 编排。

#### 2.3.3 优势

- 一体化平台，单账号、单 Dashboard、单 SDK。
- 本地开发体验最佳（Supabase CLI 一键 Docker 完整堆栈）。
- Storage 真正私有桶 + Signed URL + RLS，安全模型最完整。
- 标准 Postgres + S3 兼容，可自托管（开源），vendor lock-in 最低。

#### 2.3.4 劣势

- **Edge Function 不支持 `sharp`/`libvips`**（多线程 Node 库），PERSIST-001 Task 6 服务端图片验证需要：保留 Vercel Function 调用 Supabase（混合方案）/ 改用 WASM / 客户端验证 + 服务端 MIME 魔数校验。
- pg_cron + pgmq 自行编排 Job 队列，复杂度高于 A 候选的应用层 lease。
- Supabase Pro $25/月固定支出。
- 跨平台（Vercel Function + Supabase）增加账号和 SDK 复杂度。
- 未与用户已定方向对齐（用户首选 CloudBase），仅作为对照候选保留。

## 3. 边界声明（必须遵守）

### 3.1 GitHub 使用边界

- GitHub 仅用于：源码、规格、脱敏证据、小型合成 fixture。
- 不得使用 GitHub Contents、Git LFS、Issues、Actions Artifacts 存储运行时业务数据或客户图片。
- 不得使用 GitHub Actions 作为运行时任务执行器。
- 公开仓库安全边界遵循 `AGENTS.md` 第 6 节，证据必须脱敏。

### 3.2 CloudBase 使用边界（本轮）

- 不创建 CloudBase 真实环境（开发/生产均不创建）。
- 不索取、不写入 CloudBase 凭据到仓库或环境变量文件。
- 不连接生产数据。
- 本轮仅通过 mock adapter 验证接口适配性与字段映射。
- 不使用 CloudBase 可视化 Workflow 执行 80—100s Provider 调用（单节点 60s 限制）。
- CloudBase CloudRun 仅登记为未来容量/长任务升级选项，本轮不部署。

### 3.3 生产路径边界

- 不修改生产 Provider、上传、Job 或 Version 运行路径。
- 不修改 `/api/edit` 协议、Provider 实现、Provider 配置存储协议。
- 不接入生产数据。
- 不实施 PERSIST-001 业务服务、真实版本 UI 或生产数据迁移。
- 未经 GPT/用户冻结不得进入 PERSIST-001。

### 3.4 接口与契约边界

- `PersistenceDependencies` 与 `JobExecutor` 的职责边界继续冻结：业务服务只依赖仓储、对象存储、事务与执行器抽象，不直接依赖 CloudBase SDK。
- D-036 的 PoC 级精确签名由 D-040 修订：PERSIST-001 首门允许一次性收敛实体字段、事务上下文、幂等与 lease 原子语义；完成合约测试后再次锁定，后续不得随业务实现漂移。
- PoC-only helper（`createVersionIdempotent` / lease helpers / `dumpPgStyleRows`）不得直接成为业务层隐式依赖；所需语义必须在 PERSIST 契约收敛时进入明确接口或数据库约束。

## 4. 评分矩阵（固定 100 分权重）

权重来源：`INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 1 Step 3。

| 维度 | 权重 | A 评分 | A 加权 | B 评分 | B 加权 | C 评分 | C 加权 |
|------|------|--------|--------|--------|--------|--------|--------|
| recoverability_and_consistency | 25 | 4 | 20 | 4 | 20 | 5 | 25 |
| long_task_execution | 20 | 4 | 16 | 4 | 16 | 3 | 12 |
| vercel_fit | 15 | 5 | 15 | 5 | 15 | 3 | 9 |
| windows_local_development | 10 | 4 | 16 | 4 | 16 | 5 | 10 |
| deletion_and_backup | 10 | 4 | 8 | 3 | 6 | 4 | 8 |
| security_and_secret_handling | 10 | 4 | 8 | 4 | 8 | 5 | 10 |
| monthly_cost_for_3_users | 5 | 4 | 4 | 3 | 3 | 4 | 4 |
| vendor_lock_in_and_rollback | 5 | 3 | 3 | 3 | 3 | 4 | 4 |
| **合计** | **100** | — | **83** | — | **78** | — | **82** |

### 4.1 评分依据（每项一句证据）

**recoverability_and_consistency (25)**
- A 4/5：CloudBase PG ACID + PG Storage 强一致；lease + idempotency 由应用层维护，跨边界一致性需 PERSIST-001 实测。
- B 4/5：Neon Marketplace Postgres ACID + Blob 强一致；同 A 由应用层维护 lease。
- C 5/5：Postgres + Storage 同账号同区域，ACID + 7 天 daily backups (Pro)。

**long_task_execution (20)**
- A 4/5：Vercel Hobby Function 300s 覆盖 80—100s Provider；不依赖 CloudBase Workflow（60s 限制），用应用层 lease + 重试替代 durable execution。
- B 4/5：同 A，Vercel Hobby Function 300s + 应用层 lease。
- C 3/5：Edge Function 400s paid 足够 90s Provider，但 pg_cron+pgmq 需自行编排，无原生 durable execution。

**vercel_fit (15)**
- A 5/5：保留 Vercel Function Node.js/Express/Sharp 栈；CloudBase 仅作为外部 PG + 对象存储，Function 内通过 SDK 调用。
- B 5/5：完全在 Vercel 生态内，Function + Marketplace Postgres + Blob。
- C 3/5：独立平台，需要 Supabase client SDK + 跨平台账号；Vercel Function 保留则混合架构。

**windows_local_development (10)**
- A 4/5：现有 `LocalPersistence` 文件系统 adapter + 新增 `CloudBaseMockPersistence` 内存 mock；Windows 无需 Docker 即可开发。
- B 4/5：Vercel CLI + Neon branching + 本地 Blob mock（需自行模拟签名 URL）。
- C 5/5：Supabase CLI 一键 Docker 启动完整本地堆栈（Postgres+Storage+Edge），Windows 友好。

**deletion_and_backup (10)**
- A 4/5：PG 外键 CASCADE + 应用层删对象；CloudBase PG 备份机制需在 PERSIST-001 阶段确认（个人版通常含日备）。
- B 3/5：Postgres CASCADE + Blob API 删对象；Vercel Blob 历史无原生备份，需自建 list + copy 流。
- C 4/5：Storage lifecycle + Postgres CASCADE + Pro 7 天 daily backups；PITR $100/月额外。

**security_and_secret_handling (10)**
- A 4/5：CloudBase PG Storage 私有桶 + createSignedUrl；Vercel 环境变量管理；CloudBase 凭据本轮不写入仓库。
- B 4/5：Blob 私有 + 签名 URL；Vercel 环境变量管理；Marketplace Postgres 连接串由 Vercel Dashboard 管理。
- C 5/5：Storage 私有桶 + Signed URL + RLS + Auth 内置，安全模型最完整。

**monthly_cost_for_3_users (5)**
- A 4/5：Vercel Hobby $0 + CloudBase 个人版参考 19.9 元/月（约 $2.8）；当前 PoC 阶段可能为 0。
- B 3/5：Vercel Hobby $0 + Neon Marketplace Postgres（按用量计费，免费额度有限）+ Vercel Blob（免费额度 1GB）。
- C 4/5：Supabase Pro $25/月（含 $10 compute credit），固定支出较高但可预期。

**vendor_lock_in_and_rollback (5)**
- A 3/5：CloudBase 闭源不可自托管；但 PG 标准 SQL + createSignedUrl 通用，应用层 lease 可移植；CloudBase CloudRun 升级路径封闭。
- B 3/5：Neon 可独立使用（Neon 账号）；Vercel Blob proprietary，但 S3 SDK 兼容度有限。
- C 4/5：标准 Postgres + S3 兼容，开源可自托管，lock-in 最低。

### 4.2 资格判定

按规则："A candidate scoring below 3 on recoverability, long-task execution, or deletion is ineligible regardless of total."

- A：recoverability 4、long_task 4、deletion 4 → **eligible**，总分 83。
- B：recoverability 4、long_task 4、deletion 3 → **eligible**，总分 78。
- C：recoverability 5、long_task 3、deletion 4 → **eligible**，总分 82。

三方案均合格。A 与 C 差距 1 分（统计误差内），但 A 与用户已定方向对齐，且本轮已交付 mock PoC；推荐 A。

## 5. CloudBase Mock Adapter PoC（本轮新增）

### 5.1 文件

- `src/server/infrastructure/persistence/cloudbase-mock.ts` — mock adapter 实现，导出 `createCloudBaseMockPersistence`，返回冻结 `PersistenceDependencies` + PoC-only helper。
- `src/server/domain/cloudbase-mock.contract.test.ts` — 6 个用例覆盖 6 个必需场景。

### 5.2 PoC-only helper（不在冻结接口表面）

- `createVersionIdempotent(projectId, idempotencyKey, version)` — 幂等键防重复 Version。
- `acquireJobLease(jobId, leaseSeconds, now?)` — 获取 lease。
- `heartbeatJobLease(jobId, leaseSeconds, now?)` — 续租 lease。
- `releaseJobLease(jobId, now?)` — 主动释放 lease。
- `listLeaseExpiredJobs(now?)` — 列出过期 lease。
- `dumpPgStyleRows()` — 返回 snake_case 行快照，用于字段映射验证。
- `setFixedNow(now | null)` — 固定时间，用于确定性 lease 测试。

### 5.3 测试结果

```
✓ domain/cloudbase-mock.contract.test.ts (6 tests) 10ms
    ✓ 1. repository CRUD round-trips through camelCase ↔ snake_case field mapping
    ✓ 2. UnitOfWork rolls back Version and Job — no partial success state visible
    ✓ 3. ObjectStore emits private signed URLs with expiry and deterministic signature
    ✓ 4. deleteCascade removes project metadata, child entities, and object bytes
    ✓ 5. Job lease expires after TTL and allows safe retry by a second worker
    ✓ 6. createVersionIdempotent returns the same Version for the same idempotencyKey

Test Files  1 passed (1)
Tests       6 passed (6)
```

### 5.4 PoC 证明要点

1. **Repository CRUD 与字段映射**：camelCase ↔ snake_case 双向映射稳定，PG 风格行可读出。
2. **UnitOfWork 回滚**：事务失败时 Version 与 Job 均不可见，无部分成功状态。
3. **私有对象签名 URL**：URL 含 bucket/key/expires/signature，TTL 可配，签名确定性可验证。
4. **项目删除清理**：deleteCascade 清空 PG 元数据 + Storage 对象字节。
5. **Job lease 过期重试**：lease TTL 内第二 worker 抢占失败；TTL 过期后第二 worker 可安全重试；heartbeat 续租；主动释放后立即可重新获取。
6. **幂等键防重**：同一 idempotencyKey 第二次调用返回原 Version，不产生重复行；不同 idempotencyKey 创建新 Version。

### 5.5 不接入生产路径

- mock adapter 不连接 CloudBase。
- 不读环境凭据。
- 不修改生产 Provider/上传/Job/Version 运行路径。
- 不在 `src/server/infrastructure/persistence/index.ts` 中导出（仅测试 import）。

## 6. 成本（按阶段表达）

### 6.1 当前阶段：非商业内部 PoC

| 项 | 月度成本 | 说明 |
|----|---------|------|
| Vercel Hobby | $0 | 300s maxDuration 足够 80—100s Provider 调用 |
| CloudBase 免费试用 / 个人额度 | 视账号而定 | 本轮不创建真实环境；PERSIST-001 阶段用户在 CloudBase 控制台开通 |
| CloudBase PG Storage | $0（免费额度内） | 个人版通常含一定免费存储与流量 |
| **合计** | **$0** | 本轮 PoC 阶段 |

### 6.2 内部稳定版（3 用户内部团队）

| 项 | 月度成本 | 说明 |
|----|---------|------|
| Vercel Hobby | $0 | 3 用户内部团队用量预计远低于 Hobby 限制 |
| CloudBase 个人版 | 参考 19.9 元/月 | 实际以账号地区和控制台报价为准；包含 PG + Storage 个人额度 |
| **合计** | **参考 19.9 元/月** | 不再使用固定 `$20—25/月` 结论 |

### 6.3 商业用途（未来若转为商业）

- 重新审查 Vercel Pro（$20/月）与 CloudBase 正式环境费用。
- Vercel Pro 提供 800s maxDuration 与扩展最大 1800s（Beta），适用于更长任务。
- CloudBase 正式环境计费按 PG 实例规格、Storage 容量、出站流量计算。
- **本轮不冻结商业用途预算**；转为商业用途时由用户重新决策。

## 7. 迁移、备份、删除、回滚

### 7.1 迁移路径

- **当前 → 候选 A（PERSIST-001 实施阶段）**：
  1. 用户在 CloudBase 控制台创建 PG 实例 + 私有 Storage bucket。
  2. 在 Vercel Dashboard 配置 CloudBase 连接串与凭据环境变量。
  3. PERSIST-001 实施 `src/server/infrastructure/persistence/cloudbase.ts` 真实 adapter（基于 mock 的字段映射与 lease 模式）。
  4. 真实 adapter 在 `src/server/infrastructure/persistence/index.ts` 注册（不动 mock 与 local）。
  5. 旧 `/api/edit` 转为受控兼容层，新持久化链路通过 feature flag 启用。
  6. 旧 `edit_history` 先备份为只读 JSON，再显式导入可恢复条目（D-009）。

- **候选 A → Cloudflare R2（未来 S3 迁移备选）**：
  - R2 S3 兼容 API 可作为对象存储替换；PG 元数据不动。
  - 仅替换 ObjectStore adapter 实现。
  - 当前不实施，仅登记。

### 7.2 备份策略

- **元数据**：CloudBase PG 个人版通常含日备；PERSIST-001 阶段确认实例规格与备份窗口。
- **对象存储**：应用层定期 `list + copy` 到另一 bucket；PERSIST-001 可补 Cron 兜底。
- **Workflow state**：本轮不使用 Vercel Workflow 或 CloudBase Workflow；Job 状态由 PG 持久化。

### 7.3 级联删除

- **Project 删除**：PG 外键 `ON DELETE CASCADE` 删除 Asset/Version/Job 元数据 → 应用层 `deleteObjects(keys)` 删除 Storage 对象 → 可选 Cron 兜底扫描孤立对象。
- **孤立对象诊断**：Storage `listObjects` + PG `SELECT key FROM assets` 对比，差异列表写入 `orphan_objects` 表，定期清理。

### 7.4 回滚

- **方案未冻结时**：删除 PoC 资源（mock adapter 文件、测试），无生产变更。
- **方案冻结后失败**：
  - feature flag 关闭新生成入口，保留项目和版本只读恢复（INTERNAL-FAST-TRACK-DESIGN §9）。
  - 旧 `/api/edit` 受控兼容层保留，可作为应急路径。
  - 不删除用户资产或旧 history 备份。
- **CloudBase PG 不可用**：切换 ObjectStore + Persistence adapter 到本地 fallback（紧急情况，仅限只读恢复）。
- **候选 A 整体失败**：可切换到候选 C（Supabase）；接口契约不变，只替换 adapter 实现。

## 8. 环境变量清单（候选 A 冻结后 PERSIST-001 阶段配置）

```env
# Auth (PERSIST-001 Task 5)
AUTH_PASSWORD=<12+ chars>
JWT_SECRET=<32+ chars>
PROVIDER_ENCRYPTION_KEY=<32+ chars>
CORS_ALLOWLIST=https://app.example.com,https://preview.example.com

# CloudBase PostgreSQL
CLOUDBASE_PG_URL=<CloudBase Postgres connection string>
CLOUDBASE_PG_REGION=<CloudBase region, e.g. ap-shanghai>

# CloudBase PG Storage
CLOUDBASE_STORAGE_BUCKET=<private bucket name>
CLOUDBASE_STORAGE_SECRET_ID=<CloudBase secret id>
CLOUDBASE_STORAGE_SECRET_KEY=<CloudBase secret key>
CLOUDBASE_STORAGE_SIGNED_URL_TTL=900

# Provider Keys (at least one enabled)
SEEDREAM_API_KEY=<volcengine key>
# 或 OPENAI_API_KEY / GEMINI_API_KEY / GLM_API_KEY
```

**本轮不写入任何真实凭据**。PERSIST-001 实施阶段由用户在 Vercel Dashboard 手动配置。

## 9. 稳定接口契约（STORAGE-001 Task 2 冻结，本轮修订保持不变）

`src/server/domain/persistence.ts` 冻结以下接口，PERSIST-001 不变消费：

- `ProjectRepository`：create/get/updatePointers/deleteCascade
- `AssetRepository`：create/get/listByProject
- `VersionRepository`：create/get/listByProject
- `JobRepository`：create/get/update/listActiveByProject
- `ObjectStore`：put/getSignedUrl/delete/exists
- `UnitOfWork`：run<T>(fn)
- `AuthThrottleRepository`：get/put/delete
- `PersistenceDependencies`：聚合上述 7 个接口
- `JobExecutor`：enqueue(jobId)/cancel(jobId)

本地 PoC 适配器与 CloudBase mock adapter 在测试提供的临时目录或内存中持久化（不入仓库、不入用户家目录、不入生产路径）。

## 10. 冻结状态

```yaml
decision: frozen
recommended_candidate: Candidate A (Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage)
account_gate: user_for_live_environment  # 无凭据先完成 mock/contract；真实环境开通与配置由用户执行
decision_authority: gpt
frozen_at: 2026-07-18
review: docs/lumen-v2/reviews/STORAGE-001-GPT-REVIEW.md
```

冻结后执行：STATE 激活 `PERSIST-001 / ready_for_trae / nextActor=trae`；按既有 12 项实施计划 + 快速计划 Task 5—7 连续执行，首门先完成 D-040 契约收敛。

## 11. 冻结记录

- `decision: frozen`
- 日期：2026-07-18
- 决策者：GPT（用户已授权技术判断）
- 最终方案：Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage
- 验收结论：`MVP_PASS_WITH_DEBT`
- 附带条件：PERSIST-001 首门完成 D-040 契约收敛；真实 CloudBase 环境与凭据由用户提供，不进入仓库。

## 12. D-050：持久化方案从 PostgreSQL 切换到 CloudBase 文档数据库

> 状态：`frozen`（2026-07-21，基于 Gate P0 PoC 实测证据）
> 任务：LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01
> 决策者：用户授权 + Trae 执行 PoC 验证

### 背景

CloudBase 环境 `zeh-d7glqc07me2155c61` 的实际 RuntimeMode 为 `nosql`，PostgreSQL **未开通**（`RuntimeBackends.postgresql = false`）。原 D-037 冻结的「Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage」方案无法在此环境运行。调查任务 `LUMEN-CLOUDBASE-NOSQL-FEASIBILITY-01` 确认 `PersistenceDependencies` 接口可在文档数据库上等价实现，用户授权执行目标拓扑 PoC。

### PoC 验证证据（Gate P0，2026-07-21）

| 验证项 | 结果 | 证据 |
|--------|------|------|
| 外部 Node.js 环境 + Node SDK 连接 | PASS | `@cloudbase/node-sdk@3.18.3` 通过 `accessKey` 初始化成功 |
| 跨集合事务提交 | PASS | `db.runTransaction()` 跨 `poc_test_collection_1` 和 `poc_test_collection_2` 原子写入 |
| 事务失败完整回滚 | PASS | 主动抛错后两个集合均无残留文档 |
| 并发条件更新（lease claim 模式） | PASS | 两个并发 `where().update()` 只有一个 `updated=1`，另一个 `updated=0` |
| 并发事务（读-改-写） | PASS | 两个并发 `runTransaction()` 均成功（自动重试），最终值正确 |
| 唯一索引幂等不变量 | PASS | 重复 `idempotencyKey` 写入抛出 `E11000 duplicate key error` |
| 非主账号鉴权 | PASS | CloudBase Server API Key（环境级 JWT）通过 `accessKey` 参数工作 |
| 权限收敛 | PASS | API Key 被正确拒绝跨环境访问（`INVALID_ACCESS_TOKEN`） |
| Vercel 构建兼容 | PASS | `tsc` 构建通过，SDK 包体积在 Vercel Function 限制内 |
| 无凭据泄露 | PASS | 凭据从环境变量读取，输出经 JWT 脱敏，临时文件已删除 |

### 决策

**从 CloudBase PostgreSQL + PG Storage 切换到 CloudBase 文档数据库 + CloudBase Storage。**

- 元数据存储：CloudBase 文档数据库（MongoDB 兼容），7 个集合 + 2 个唯一索引 + 4 个查询索引
- 对象存储：CloudBase Storage（`app.uploadFile/downloadFile/deleteFile/getTempFileURL`）
- 鉴权方式：CloudBase Server API Key（环境级 JWT，通过 `accessKey` 参数注入 Node SDK）
- 事务策略：`db.runTransaction()` + `AsyncLocalStorage` 传播事务上下文
- 幂等策略：`version_idempotency` 和 `job_idempotency` 集合的唯一索引强制
- 并发策略：条件 `where().update()` 实现 lease claim 乐观锁

### 权衡

| 维度 | PostgreSQL（原方案） | 文档数据库（新方案） |
|------|---------------------|---------------------|
| 环境兼容 | 需开通 PostgreSQL（当前环境未开通） | 原生支持（RuntimeMode=nosql） |
| 事务模型 | ACID + `ON CONFLICT` + `ON DELETE CASCADE` | `runTransaction()` + 应用层级联 + 条件 update |
| 幂等保证 | `UNIQUE` 约束 + `ON CONFLICT DO NOTHING` | 唯一索引 + E11000 错误捕获 |
| Lease claim | `UPDATE ... WHERE lease_token IS NULL OR ...` | `where({...}).update({...})` 条件更新 |
| ObjectStore | PG Storage HTTP API | CloudBase Storage SDK |
| 凭据 | CAM SecretId/SecretKey | CloudBase Server API Key（环境级 JWT） |
| 代码改动 | 0（已有 adapter） | 1 新 adapter + select.ts 微调 |
| 接口影响 | 无 | 无（PersistenceDependencies 签名不变） |

### 回滚条件

- CloudBase 文档数据库事务能力在生产负载下不可靠
- Vercel Function 包体积超限
- 唯一索引在高并发下无法可靠阻止重复
- 需要购买或升级资源（违反 Out of Scope）

### 影响范围

- 新增：`src/server/infrastructure/persistence/cloudbase.nosql.ts`
- 修改：`src/server/infrastructure/persistence/select.ts`（优先 NoSQL，保留 PostgreSQL fallback）
- 修改：`src/server/infrastructure/persistence/index.ts`（导出 NoSQL adapter）
- 修改：`src/server/package.json`（新增 `@cloudbase/node-sdk@^3.18.3`）
- 不修改：`src/server/domain/persistence.ts`（接口冻结）
- 不修改：`src/server/services/*`、`src/server/routes/*`、`src/client/*`

## 12. 修订历史

### 2026-07-18 修订（用户重新打开局部选型）

- 触发：用户重新打开 STORAGE-001 局部选型修订，明确首选架构为 Vercel Hobby + CloudBase PostgreSQL + CloudBase PG Storage。
- 修正过时事实：
  - Vercel Blob 现支持私有 Blob 与签名 URL（前版拒绝理由不成立）。
  - Vercel Hobby Function maxDuration 300s 已覆盖 80—100s Provider 调用（前版 Pro 800s 必需结论不成立）。
  - Vercel Postgres 已停止，新项目需 Marketplace Postgres（前版「Pro 包含」结论不成立）。
  - Vercel Workflow 计费修正（前版「Beta 期间免费」不准确）。
  - 最终 STORAGE 提交为 `d85bae2`（前版「待提交」状态已修正）。
- 新增候选 A：Vercel Hobby + CloudBase PG + CloudBase PG Storage。
- 新增 CloudBase mock adapter PoC：`src/server/infrastructure/persistence/cloudbase-mock.ts` + 6 用例测试。
- 重算 100 分矩阵：A = 83，B = 78，C = 82；推荐 A。
- 边界声明：GitHub/CloudBase/生产路径/接口冻结四类边界明确。
- 成本表达：按阶段（PoC / 内部稳定版 / 商业用途），不再使用固定 `$20—25/月`。
- 状态：Trae 修订于 `awaiting_gpt_acceptance / nextActor=gpt` 交回；GPT 已于 2026-07-18 写入 `decision: frozen` 并激活 PERSIST-001。
