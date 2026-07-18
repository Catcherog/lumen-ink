# STORAGE-001 持久化与任务基础设施技术选型

> 状态：`awaiting_user_decision`（推荐方案需要用户决策账号与预算）
> 任务：STORAGE-001
> 决策权限：用户
> 创建日期：2026-07-18
> 主源登记：`docs/lumen-v2/evidence/STORAGE-001/source-register.md`

## 0. 决策摘要（先读这一节）

- 候选方案数：2（Vercel+R2+Workflow / Supabase all-in-one），均满足硬条件。
- 评分结果：Vercel+R2+Workflow **84/100**，Supabase **82/100**，差异在统计误差内。
- 推荐方案：**Vercel + Cloudflare R2 + Vercel Workflow**（Candidate 1），理由是保留现有 Node.js/Express/Sharp 栈、Vercel Workflow 提供唯一 durable execution、迁移成本最低。
- 备选方案：Supabase all-in-one（Candidate 2），本地开发体验最佳，但 Edge Function 不支持 `sharp`，PERSIST-001 Task 6 需要改用 WASM 或外部服务。
- 账号门槛：`account_gate: user`，需要用户确认 Cloudflare 账号 + Vercel 计划升级 + 月度预算 + 不可逆迁移审批（详见 §6）。
- 决策权限：`decision_authority: user`。
- 冻结状态：**未冻结**。本文件不写 `decision: frozen`。GPT/用户冻结后由 STATE.json 激活 PERSIST-001。

## 1. 硬条件筛选（按 INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md Task 1 Step 2）

| 硬条件 | Vercel Blob | Vercel+R2+Workflow | Supabase all-in-one |
|--------|-------------|--------------------|---------------------|
| 持久元数据 | ✓ Vercel Postgres | ✓ Vercel Postgres (Neon) | ✓ Supabase Postgres |
| 私有对象/签名 URL | ✗ 公开 URL | ✓ R2 presigned URL | ✓ Storage Signed URL + RLS |
| 持久 Job 状态 | ✓ Postgres | ✓ Postgres + Workflow state | ✓ Postgres + pgmq |
| 80—100s Provider 执行（不依赖单个 90s 请求） | ✓ Function 300s | ✓ Function 800s + Workflow durable | ✓ Edge Function 400s (paid) |
| 适配器重建恢复 | ✓ | ✓ | ✓ |
| 项目级联删除 | ✓ Postgres CASCADE | ✓ Postgres CASCADE + R2 lifecycle | ✓ Postgres CASCADE + Storage lifecycle |

Vercel Blob 因不满足"私有对象/签名 URL"硬条件被拒绝（见 source-register.md §1.7）。Vercel+R2+Workflow 用 Cloudflare R2 替代 Vercel Blob 满足全部硬条件。

## 2. 候选方案 1：Vercel + Cloudflare R2 + Vercel Workflow

### 2.1 架构

```text
Client (React 19)
  ↓
Vercel Function (Node.js 20+, Express 4, Sharp, maxDuration=800s Pro)
  ├─→ Vercel Postgres (Neon) — Project/Asset/Version/Job/AuthThrottle 元数据
  ├─→ Cloudflare R2 (S3 SDK) — 私有桶 + presigned URL，原图/版本对象
  └─→ Vercel Workflow (Beta, durable) — Job 状态机，pause/resume/replay
        ├─→ 'use step' generateDraft → Provider API (80—100s)
        ├─→ sleep / hook (human-in-loop)
        └─→ Vercel Cron — 定期清理孤立对象（CRON_SECRET 校验）
```

### 2.2 关键能力映射

- **元数据**：Vercel Postgres (Neon)，PostgreSQL 15，外键 ON DELETE CASCADE。
- **对象存储**：Cloudflare R2，S3 兼容 SDK，私有桶 + presigned URL（GET/PUT），lifecycle rules 自动清理，object versioning 防误删。
- **签名 URL**：R2 presigned URL，TTL 可配置（建议 5—15 分钟）。
- **Job 状态机**：Vercel Workflow（Beta），`'use workflow'` + `'use step'`，可暂停几分钟到几个月，部署/崩溃后确定性重放。
- **80—100s Provider 执行**：
  - 同步路径：Vercel Function Pro 800s 单次处理 90s Provider 调用 + Sharp 验证 + R2 写入。
  - 异步路径：Vercel Workflow step（durable，无时间限制），失败自动重试。
- **任务取消**：Vercel Workflow 支持 hook 取消；Function 内 AbortController 中断 fetch。
- **任务重试**：Vercel Workflow step 内置重试。
- **刷新恢复**：Job 状态持久化在 Workflow 托管持久层 + Postgres，重新加载页面时查询 Job status。
- **级联删除**：Postgres 外键 CASCADE 删元数据 + R2 lifecycle/SDK 删对象 + Vercel Cron 兜底清理孤立对象。
- **环境变量**：Vercel Dashboard 管理，64 KB 总上限；`AUTH_PASSWORD`、`JWT_SECRET`、`PROVIDER_ENCRYPTION_KEY`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_ACCOUNT_ID`、Provider Keys。

### 2.3 Windows 本地开发替代

- Vercel CLI `vercel dev` 本地运行 Vercel Function（Node.js runtime）。
- 本地 Postgres（Docker `postgres:15`）或 Neon branching（云分支）替代 Vercel Postgres。
- MinIO（Docker）模拟 R2 S3 接口，本地签名 URL 测试。
- Vercel Workflow 本地通过 WDK + 本地持久化层（SQLite 或内存）模拟。

### 2.4 成本（3 用户内部团队）

| 项 | 月度成本 | 说明 |
|----|---------|------|
| Vercel Pro | $20 | Function 800s maxDuration、Workflow Beta、Cron |
| Cloudflare R2 | $0（免费额度内） | 10 GB 存储、1M Class A、10M Class B；3 用户内部用量预计远低于 |
| Vercel Postgres | 包含在 Pro | Hobby 计划受限；Pro 含一定额度 |
| Vercel Workflow Storage | Beta 期间免费 | Observability 免费；Steps 按使用计费 |
| **合计** | **~$20—25/月** | R2 超免费额度后按 $0.015/GB 计 |

### 2.5 优势

- 保留现有 Node.js/Express/Sharp 代码栈，迁移成本最低。
- Vercel Workflow 是唯一提供 durable execution（暂停/恢复/重放）的方案，长任务恢复最稳健。
- Vercel Function Pro 800s 足够 90s Provider 调用 + Sharp 验证 + R2 写入。
- R2 S3 兼容，未来可迁回 AWS S3 或其他 S3 兼容存储。
- Vercel + R2 都支持多区域部署，对网络抖动容忍度高。

### 2.6 劣势

- 跨云（Vercel + Cloudflare）需要两个账号，运维复杂度高于一体化方案。
- Vercel Workflow 是 Beta，生产稳定性待长期验证；Beta 期间 Observability 免费，GA 后计费规则可能变化。
- Cloudflare 注册需信用卡（免费额度内不收费）。
- R2 在中国访问需考虑网络（Vercel Function 同区域调用 R2 不影响终端用户）。

## 3. 候选方案 2：Supabase all-in-one

### 3.1 架构

```text
Client (React 19)
  ↓
Vercel Function (Node.js, Express, Sharp) — 保留作为应用层 + Provider 调用
  ├─→ Supabase Postgres (Pro) — 元数据 + pgmq 队列
  ├─→ Supabase Storage — 私有桶 + Signed URL + RLS
  └─→ Supabase Edge Function (Deno, 400s) — 异步 Job worker
        ↑
        pg_cron 定时扫描 pgmq → pg_net 触发 Edge Function
```

注：Vercel Function 仍保留用于 Sharp 图片验证和 Provider 调用（Node.js runtime 完整支持）；Supabase Edge Function 用于异步 Job 编排（pgmq 消费、状态机推进、回调通知）。这是混合架构，但 Supabase 作为独立运营的存储/队列后端。

### 3.2 关键能力映射

- **元数据**：Supabase Postgres（Pro $25/月），dedicated instance，8 GB disk，7 天 daily backups。
- **对象存储**：Supabase Storage，S3 兼容，私有桶 + Signed URL + RLS。
- **签名 URL**：Storage Signed URL，TTL 可配置。
- **Job 状态机**：pgmq 队列 + pg_cron 定时扫描 + pg_net 触发 Edge Function；状态持久在 Postgres。
- **80—100s Provider 执行**：
  - 同步路径：Vercel Function（保留）或 Edge Function 400s（paid）。
  - 异步路径：pgmq enqueue → pg_cron 扫描 → Edge Function dequeue → Provider 调用 → 更新 Job。
- **任务取消**：pgmq 删除消息或标记 Job cancelled；运行中的 Edge Function 用 AbortController。
- **任务重试**：pgmq 可见性超时 + 应用层重试计数。
- **刷新恢复**：Job 状态在 Postgres，重新加载页面时查询。
- **级联删除**：Postgres 外键 CASCADE 删元数据 + Storage API 删对象 + pg_cron 兜底清理孤立对象。
- **环境变量**：Supabase Dashboard 管理；Vercel 环境变量保留。

### 3.3 Windows 本地开发替代

- Supabase CLI `supabase start` 一键启动完整本地堆栈（Docker）：
  - 本地 Postgres（含 pgmq、pg_cron、pg_net 扩展）。
  - 本地 Storage（GoTrue + PostgREST + Storage API）。
  - 本地 Edge Runtime。
- 完全本地化，无需云账号即可开发。
- Vercel Function 本地通过 `vercel dev` 运行。

### 3.4 成本（3 用户内部团队）

| 项 | 月度成本 | 说明 |
|----|---------|------|
| Supabase Pro | $25 | 含 $10 compute credit（Micro 实例） |
| Vercel | $0—20 | 若当前已 Pro 则无新增；若 Hobby 则保留 |
| Storage 超额 | $0.0213/GB | 100 GB 内含 |
| Egress 超额 | $0.09/GB | 250 GB 内含 |
| **合计** | **~$25—45/月** | 取决于 Vercel 计划 |

### 3.5 优势

- 一体化平台，单账号、单 Dashboard、单 SDK。
- 本地开发体验最佳（Supabase CLI 一键 Docker 完整堆栈）。
- Storage 真正私有桶 + Signed URL + RLS，安全模型最完整。
- 标准 Postgres + S3 兼容，可自托管（开源），vendor lock-in 低。
- Postgres 原生外键 CASCADE + pgmq/pg_cron/pg_net 成熟扩展。

### 3.6 劣势

- **Edge Function 不支持 `sharp`/`libvips`**（多线程 Node 库），PERSIST-001 Task 6 服务端图片验证需要：
  - 选项 A：保留 Vercel Function 调用 Supabase（混合方案，但增加跨平台复杂度）；
  - 选项 B：改用 WASM 图片解码库（如 `@jsquash/png` 等，功能有限）；
  - 选项 C：客户端验证 + 服务端只做 MIME 魔数校验（安全性降低）。
- pg_cron + pgmq 自行编排 Job 队列，复杂度高于 Vercel Workflow。
- Supabase Pro $25/月固定支出（无免费生产方案）。
- 跨平台（Vercel Function + Supabase）增加账号和 SDK 复杂度。
- Edge Function Wall clock 400s（paid），CPU 2s 限制，复杂图片处理可能超限。

## 4. 评分矩阵（固定 100 分权重）

权重来源：`INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 1 Step 3。

| 维度 | 权重 | Vercel+R2+Workflow 评分 | 加权 | Supabase 评分 | 加权 |
|------|------|------------------------|------|---------------|------|
| recoverability_and_consistency | 25 | 4 | 20 | 5 | 25 |
| long_task_execution | 20 | 5 | 20 | 3 | 12 |
| vercel_fit | 15 | 5 | 15 | 3 | 9 |
| windows_local_development | 10 | 3 | 6 | 5 | 10 |
| deletion_and_backup | 10 | 4 | 8 | 4 | 8 |
| security_and_secret_handling | 10 | 4 | 8 | 5 | 10 |
| monthly_cost_for_3_users | 5 | 4 | 4 | 4 | 4 |
| vendor_lock_in_and_rollback | 5 | 3 | 3 | 4 | 4 |
| **合计** | **100** | — | **84** | — | **82** |

### 4.1 评分依据（每项一句证据）

**recoverability_and_consistency (25)**
- Vercel+R2 4/5：Neon Postgres ACID + R2 强一致，但跨云增加一致性边界。
- Supabase 5/5：Postgres + Storage 同账号同区域，ACID + 7 天 daily backups (Pro)。

**long_task_execution (20)**
- Vercel+R2 5/5：Vercel Workflow 是唯一提供 durable execution（暂停/恢复/重放，minutes to months）的方案。
- Supabase 3/5：Edge Function 400s paid 足够 90s Provider，但 pg_cron+pgmq 需自行编排，无原生 durable execution。

**vercel_fit (15)**
- Vercel+R2 5/5：保留 Vercel Function Node.js/Express/Sharp 代码栈，加 R2 SDK + Workflow SDK。
- Supabase 3/5：独立平台，需要 Supabase client SDK + 跨平台账号；Vercel Function 保留则混合架构。

**windows_local_development (10)**
- Vercel+R2 3/5：Vercel CLI 本地 + Docker Postgres + MinIO 模拟 R2，多组件配置。
- Supabase 5/5：Supabase CLI 一键 Docker 启动完整本地堆栈（Postgres+Storage+Edge），Windows 友好。

**deletion_and_backup (10)**
- Vercel+R2 4/5：R2 lifecycle rules + object versioning + Postgres 外键 CASCADE；Vercel Postgres 备份机制需确认 Neon。
- Supabase 4/5：Storage lifecycle + Postgres 外键 CASCADE + Pro 7 天 daily backups；PITR $100/月额外。

**security_and_secret_handling (10)**
- Vercel+R2 4/5：R2 私有桶 + presigned URL；Vercel 环境变量管理；Workflow state 受管。
- Supabase 5/5：Storage 私有桶 + Signed URL + RLS + Auth 内置，安全模型最完整。

**monthly_cost_for_3_users (5)**
- Vercel+R2 4/5：Vercel Pro $20 + R2 免费额度 ≈ $20—25/月。
- Supabase 4/5：Pro $25/月（含 $10 compute credit），若 Vercel 仍 Pro 则总 $45/月。

**vendor_lock_in_and_rollback (5)**
- Vercel+R2 3/5：R2 S3 兼容可迁回 AWS S3；Vercel Workflow proprietary；Vercel Postgres 可独立用 Neon。
- Supabase 4/5：标准 Postgres + S3 兼容，开源可自托管，lock-in 最低。

### 4.2 资格判定

按规则："A candidate scoring below 3 on recoverability, long-task execution, or deletion is ineligible regardless of total."

- Vercel+R2：recoverability 4、long_task 5、deletion 4 → **eligible**，总分 84。
- Supabase：recoverability 5、long_task 3、deletion 4 → **eligible**，总分 82。

两方案均合格，差异在统计误差内（2 分）。

## 5. 推荐方案与理由

**推荐：Vercel + Cloudflare R2 + Vercel Workflow（Candidate 1）**

### 5.1 关键理由

1. **保留现有代码栈**：当前后端是 Express 4 + TypeScript on Vercel Node.js runtime，使用 Sharp 做图片处理。Vercel+R2+Workflow 完全保留，迁移成本最低。
2. **Vercel Workflow durable execution 是唯一差异化能力**：可暂停几分钟到几个月、部署/崩溃后确定性重放、内置 hook 等待外部事件。Supabase 无对应能力，需自行用 pg_cron+pgmq+pg_net 编排。
3. **Sharp 原生支持**：PERSIST-001 Task 6 明确要求 Sharp 验证图片字节、MIME、像素、解码。Supabase Edge Function 不支持 Sharp（多线程 Node 库），需要改架构或换库。
4. **80—100s Provider 调用最稳健**：Vercel Function Pro 800s + Vercel Workflow durable 双路径，同步/异步都覆盖。
5. **评分略高**：84 vs 82，差异虽小但在 long_task_execution 维度（5 vs 3）有实质差距。

### 5.2 接受的折中

- 跨云（Vercel + Cloudflare）增加账号复杂度，但两个账号都是成熟 SaaS。
- Vercel Workflow 是 Beta，生产稳定性待验证；PERSIST-001 设计时需保留同步 Function 路径作为回退。
- Cloudflare 注册需信用卡（免费额度内不收费）。

### 5.3 不选 Supabase 的关键原因

- **Sharp 限制是架构性问题**：PERSIST-001 Task 6 服务端图片验证是安全底线（防 MIME 伪装、防超大像素、防畸形字节）。Supabase Edge Function 不支持 Sharp，要么改用 WASM（功能受限），要么保留 Vercel Function 调 Supabase（混合方案，反而比 Vercel+R2 更复杂）。
- **durable execution 缺失**：pg_cron+pgmq 自行编排 Job 状态机复杂度高，恢复语义需自己实现；Vercel Workflow 内置。

## 6. 账号门槛与用户决策（account_gate: user）

按 `INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 1 Step 4 要求记录：

```yaml
account_gate: user
required_action: |
  用户需确认以下事项后方可冻结方案并激活 PERSIST-001：
  1. 新增 Cloudflare 账号（注册需信用卡，免费额度内不收费）；
  2. 确认 Vercel 当前计划，若为 Hobby 需升级到 Pro（$20/月）以获得 800s Function maxDuration 和 Workflow Beta；
  3. 月度预算上限：$20—25（Vercel Pro + R2 免费额度），允许 R2 超额后按 $0.015/GB 计费；
  4. 不可逆迁移审批：无（R2 可迁回 AWS S3，Vercel Postgres 可独立用 Neon，Vercel Workflow Beta 期间可回退到同步 Function）；
  5. 接受 Vercel Workflow Beta 风险：生产稳定性待验证，PERSIST-001 保留同步 Function 回退路径。
decision_authority: user
```

## 7. 迁移、备份、删除、回滚

### 7.1 迁移路径

- **当前 → Vercel+R2+Workflow**：
  1. Vercel Postgres 创建数据库（同区域）；Kysely/Drizzle 建 schema。
  2. Cloudflare R2 创建私有桶；记录 R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY、R2_BUCKET、R2_ACCOUNT_ID 到 Vercel 环境变量。
  3. Vercel Function 加 `@aws-sdk/client-s3` 调用 R2；ObjectStore 适配器实现 put/getSignedUrl/delete/exists。
  4. Vercel Workflow（`workflow` npm 包）实现 JobExecutor.enqueue/cancel。
  5. 旧 `/api/edit` 转为受控兼容层，新持久化链路通过 feature flag 启用。
  6. 旧 `edit_history` 先备份为只读 JSON，再显式导入可恢复条目（D-009）。

- **Vercel+R2 → AWS S3**（如果未来需要迁出 Cloudflare）：
  - S3 兼容 API，仅需改 endpoint 和 credentials；lifecycle rules 等价迁移。

### 7.2 备份策略

- **元数据**：Vercel Postgres (Neon) 支持 branching 和 point-in-time restore（Neon 原生能力）。
- **对象存储**：R2 object versioning 启用，防误删；定期 `list + copy` 到另一 R2 桶或 AWS S3。
- **Workflow state**：Vercel Workflow 托管持久层，Beta 期间由 Vercel 管理；导出能力待 GA。

### 7.3 级联删除

- **Project 删除**：Postgres 外键 `ON DELETE CASCADE` 删除 Asset/Version/Job 元数据 → 应用层 `deleteObjects(keys)` 删除 R2 对象 → Vercel Cron 兜底扫描孤立对象（key 不在元数据中的对象）。
- **孤立对象诊断**：R2 `listObjectsV2` + Postgres `SELECT key FROM assets` 对比，差异列表写入 `orphan_objects` 表，Cron 定期清理。

### 7.4 回滚

- **方案未冻结时**：删除 PoC 资源（本地临时目录、测试数据库分支），无生产变更。
- **方案冻结后失败**：
  - feature flag 关闭新生成入口，保留项目和版本只读恢复（INTERNAL-FAST-TRACK-DESIGN §9）。
  - 旧 `/api/edit` 受控兼容层保留，可作为应急路径。
  - 不删除用户资产或旧 history 备份。
- **Cloudflare R2 不可用**：切换 ObjectStore 适配器到 AWS S3（同 S3 API，仅环境变量变更）。
- **Vercel Workflow Beta 严重问题**：JobExecutor 降级为同步 Vercel Function 调用（800s maxDuration），放弃 durable execution，保留基本可用性。

## 8. 环境变量清单（Vercel+R2+Workflow 冻结后）

```env
# Auth (PERSIST-001 Task 5)
AUTH_PASSWORD=<12+ chars>
JWT_SECRET=<32+ chars>
PROVIDER_ENCRYPTION_KEY=<32+ chars>
CORS_ALLOWLIST=https://app.example.com,https://preview.example.com

# Vercel Postgres
POSTGRES_URL=<neon connection string>

# Cloudflare R2
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key>
R2_SECRET_ACCESS_KEY=<secret key>
R2_BUCKET=<bucket name>
R2_REGION=auto

# Vercel Cron
CRON_SECRET=<16+ chars random>

# Provider Keys (at least one enabled)
SEEDREAM_API_KEY=<volcengine key>
# 或 OPENAI_API_KEY / GEMINI_API_KEY / GLM_API_KEY

# Vercel Workflow (Beta，无额外环境变量，通过 Vercel Dashboard 启用)
```

## 9. 稳定接口契约（在 Task 2 PoC 中冻结）

STORAGE-001 Task 2 将在 `src/server/domain/persistence.ts` 冻结以下接口，PERSIST-001 不变消费：

- `ProjectRepository`：create/get/updatePointers/deleteCascade
- `AssetRepository`：create/get/listByProject
- `VersionRepository`：create/get/listByProject
- `JobRepository`：create/get/update/listActiveByProject
- `ObjectStore`：put/getSignedUrl/delete/exists
- `UnitOfWork`：run<T>(fn)
- `AuthThrottleRepository`：get/put/delete
- `PersistenceDependencies`：聚合上述 7 个接口
- `JobExecutor`：enqueue(jobId)/cancel(jobId)

本地 PoC 适配器在测试提供的临时目录下持久化（不入仓库、不入用户家目录、不入生产路径），重新实例化同目录可恢复记录。

## 10. 冻结状态

```yaml
decision: pending_user_approval
recommended_candidate: Candidate 1 (Vercel + Cloudflare R2 + Vercel Workflow)
account_gate: user
decision_authority: user
frozen_at: null
```

GPT/用户冻结后：
- 在本文件追加 `## 11. 冻结记录`，写入 `decision: frozen`、冻结日期、冻结决策者、最终方案。
- 更新 STATE.json 激活 PERSIST-001（`currentTask=PERSIST-001`、`status=ready_for_trae`、`nextActor=trae`、从 `blockedTasks` 移除 PERSIST-001）。
- PERSIST-001 按既有 12 项实施计划 + 快速计划 Task 5—7 三个内部安全单元连续执行。
