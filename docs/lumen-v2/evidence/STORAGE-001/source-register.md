# STORAGE-001 主源登记

> 访问日期：2026-07-18
> 用途：STORAGE-001 选型材料的事实依据，仅供 GPT/用户冻结决策。
> 限制：仅记录官方文档事实，不包含供应商宣传材料或未验证信息。

## 候选方案 1：Vercel + Cloudflare R2 + Vercel Workflow

### 1.1 Vercel Postgres（Neon Marketplace 集成）

- 官方 URL：https://vercel.com/docs/storage/vercel-postgres
- 文档最后更新：2024-11-14
- 关键事实：
  - 自 2024-12 起从原 Vercel Postgres 迁移到 Neon Marketplace 集成，2025-01 完成迁移，无停机、无定价变化。
  - 创建数据库时需选择区域，**创建后无法更改区域**。
  - PostgreSQL 版本：15。
  - 与 Serverless/Edge Functions 兼容；推荐与 Function 同区域部署。
  - 不需要单独注册 Neon 账号，Vercel Dashboard 内管理。
  - 支持 Kysely / Prisma / Drizzle ORM。
- 计划可用性：Hobby、Pro。
- 限制页：https://vercel.com/docs/storage/vercel-postgres/limits
- 定价页：https://vercel.com/docs/storage/vercel-postgres/usage-and-pricing

### 1.2 Cloudflare R2（对象存储，S3 兼容）

- 官方 URL：https://developers.cloudflare.com/r2/
- 关键事实：
  - S3 兼容 API，可使用 AWS SDK 直接集成。
  - 支持私有桶 + 签名 URL（presigned URL）。
  - 零出站流量费用（egress free）。
  - 免费额度：10 GB 存储、1M Class A 操作/月、10M Class B 操作/月。
  - 超出免费额度计费：存储 $0.015/GB/月、Class A $4.50/百万、Class B $0.36/百万。
  - 需要 Cloudflare 账号；免费额度内不收费，但注册需信用卡验证。
  - 支持 lifecycle rules、object versioning。
  - 多区域可选（自动多区域复制）。

### 1.3 Vercel Functions（Node.js runtime）

- 官方 URL：https://vercel.com/docs/functions/runtimes
- 文档最后更新：2026-07-01
- 关键事实：
  - 支持 Node.js 20.x / 22.x / 24.x。
  - 文件系统：只读 + `/tmp` 暂存空间（最大 500 MB）。
  - 单区域默认 `iad1`，可多区域部署（Pro/Enterprise）。
  - 自动并发扩展至 30,000（Hobby/Pro）。
  - 隔离边界：microVM。
  - 完全支持 Node.js 库（包括 `sharp`、`libvips` 等多线程库）。
  - 环境变量总大小上限 64 KB。

### 1.4 Vercel Functions 最大持续时间（Fluid Compute）

- 官方 URL：https://vercel.com/docs/functions/configuring-functions/duration
- 文档最后更新：2026-07-01
- 关键事实（默认/最大/扩展最大）：
  - Hobby：300s / 300s / —
  - Pro：300s / 800s / 1800s（30 分钟，Beta）
  - Enterprise：300s / 800s / 1800s（Beta）
- 扩展最大持续时间（>800s）Beta 支持运行时：nodejs20.x、nodejs22.x、nodejs24.x、python3.12、python3.13、python3.14。
- Secure Compute 与 Static IPs 不支持 >800s。
- 长运行请求建议流式输出心跳避免 HTTP/1.1 空闲断开。
- 文档明确建议：无限制执行时间使用 **Vercel Workflow**。

### 1.5 Vercel Workflow（Durable Execution，Beta）

- 官方 URL：https://vercel.com/docs/workflow
- 关键事实：
  - Beta，所有计划可用。
  - 基于 Workflow Development Kit (WDK)，TypeScript 原生 async/await。
  - 三个指令：`'use workflow'`（有状态工作流）、`'use step'`（无状态可重试步骤）、`sleep`（暂停不消耗资源）、`defineHook`（等待外部事件）。
  - 可暂停几分钟到几个月，从断点恢复。
  - 部署/崩溃后确定性重放。
  - 内置日志、指标、追踪，Dashboard 可视化。
  - 底层使用 Vercel Functions + Vercel Queues（Limited Beta）+ 托管持久化层。
  - 计费：Workflow Steps（durable 工作单元）+ Workflow Storage（状态数据量）+ Functions 计算费用。
  - Beta 期间 Workflow Observability 免费；Steps 和 Storage 按使用量计费。

### 1.6 Vercel Cron Jobs

- 官方 URL：https://vercel.com/docs/cron-jobs 与 https://vercel.com/docs/cron-jobs/manage-cron-jobs
- 文档最后更新：2026-06-16 / 2026-06-02
- 关键事实：
  - 通过 `vercel.json` 配置 cron 表达式，触发 HTTP GET 到生产部署 URL。
  - 持续时间限制同 Vercel Functions（Hobby 300s、Pro 800s）。
  - **不重试失败调用**。
  - **不保证精确触发**：Hobby 在指定小时内任意时刻；其他计划在指定分钟内。
  - Hobby 限制：每天最多 1 次 cron 调用。
  - 并发无内置锁，需应用层用 Redis distributed lock 防止重叠。
  - cron delivery best-effort，可能漏触发或重复触发，要求 idempotent 设计。
  - 通过 `CRON_SECRET` 环境变量做 Authorization 校验。

### 1.7 Vercel Blob（已拒绝）

- 官方 URL：https://vercel.com/docs/storage/vercel-blob
- 拒绝理由：
  - URL 公开访问，仅靠不可猜测性作为安全机制，**不支持私有对象或签名 URL**。
  - 违反 STORAGE-001 硬条件"private objects/signed URLs"。
  - 删除后 5 分钟内仍可访问（边缘缓存延迟）。
  - 无原生备份系统（文档明确说明）。
- 替代：使用 Cloudflare R2（S3 兼容 + 签名 URL）。

## 候选方案 2：Supabase all-in-one

### 2.1 Supabase Postgres

- 官方 URL：https://supabase.com/pricing 与 https://supabase.com/docs/guides/database
- 关键事实：
  - Dedicated Postgres instance per project。
  - Free：500 MB database / 5 GB egress / 1 周不活动暂停。
  - Pro $25/月：8 GB disk / 250 GB egress / 7 天 daily backups / 不暂停。
  - Compute add-ons：Micro $10 起，Large $110 包含在 Pro。
  - 支持 pg_cron、pgmq、pgvector、pg_net 等扩展。
  - 标准 PostgreSQL，支持外键 ON DELETE CASCADE。
  - 可自托管（开源）。

### 2.2 Supabase Storage

- 官方 URL：https://supabase.com/docs/guides/storage
- 关键事实：
  - S3 兼容对象存储。
  - 支持私有桶 + 签名 URL（Signed URL）。
  - 支持自定义访问控制 + RLS（Row Level Security）。
  - Free：1 GB file storage / 50 MB max file upload / Basic CDN。
  - Pro：100 GB file storage / then $0.0213 per GB。
  - 支持 Image Transformations（Pro）。

### 2.3 Supabase Edge Functions

- 官方 URL：https://supabase.com/docs/guides/functions 与 https://supabase.com/docs/guides/functions/limits
- 关键事实（运行时限制）：
  - Runtime：Supabase Edge Runtime（Deno 兼容，TypeScript first）。
  - Maximum Memory：256 MB。
  - Maximum Duration (Wall clock limit)：
    - Free：150s
    - Paid：400s
  - Maximum CPU Time：2s per request（不含异步 I/O）。
  - Request idle timeout：150s。
  - Maximum Function Size：20 MB（CLI bundling 后）。
  - 每项目函数数：Free 100、Pro 500、Team 1000、Enterprise Unlimited。
  - **关键限制**：不支持需要多线程的 Node 库，包括 `libvips` 和 `sharp`。
  - Background Tasks：通过 `EdgeRuntime.waitUntil(promise)` 在请求处理器外执行，受 wall clock 限制。
  - 可监听 `beforeunload` 事件做清理。

### 2.4 Supabase Postgres 扩展（pgmq + pg_cron + pg_net）

- 官方 URL：https://supabase.com/docs/guides/database/extensions
- 关键事实：
  - `pgmq`：Postgres Message Queue，原子 enqueue/dequeue，支持可见性超时。
  - `pg_cron`：PostgreSQL 定时任务扩展，cron 表达式调度 SQL。
  - `pg_net`：PostgreSQL HTTP 客户端扩展，可从 Postgres 触发外部 HTTP 请求。
  - 组合使用：pg_cron 定时扫描 pgmq 队列 → pg_net 调用 Edge Function 或外部 Provider API。
  - 所有状态在 Postgres 内，ACID 保证。

## 3. Vercel 90 秒函数限制与长任务策略

- 当前项目 `vercel.json` 配置函数上限 90 秒。
- Vercel Functions Pro 最大 800s（Fluid Compute），扩展最大 1800s（Beta）。
- Vercel Workflow 提供无限制执行时间（minutes to months）。
- Supabase Edge Function Paid 400s wall clock。
- 80-100 秒 Provider 调用策略：
  - Vercel+R2：单次 Vercel Function（Pro 800s）直接处理，或 Vercel Workflow step（durable，无限制）。
  - Supabase：Edge Function 400s 直接处理（足够 90s Provider 调用），或 pg_cron + pgmq 异步链。

## 4. Windows 本地开发替代

### 4.1 Vercel+R2 本地替代

- Vercel CLI（`vercel dev`）本地运行 Vercel Function。
- Neon 本地分支（Neon branching）或本地 Postgres（Docker）替代 Vercel Postgres。
- MinIO（Docker）或 LocalStack 模拟 Cloudflare R2 S3 接口。
- Vercel Workflow 本地通过 WDK + 本地持久化层模拟。

### 4.2 Supabase 本地替代

- Supabase CLI（`supabase start`）一键启动完整本地堆栈（Docker）：
  - 本地 Postgres（含所有扩展：pgmq、pg_cron、pg_net）。
  - 本地 Storage（GoTrue + PostgREST + Storage API）。
  - 本地 Edge Runtime。
- 完全本地化，无需云账号即可开发。

## 5. 账号与付费要求摘要

| 项目 | Vercel+R2 | Supabase |
|------|-----------|----------|
| 当前已有 | Vercel 账号（计划未知） | 无 |
| 新增账号 | Cloudflare 账号（信用卡，免费额度内不收费） | Supabase 账号（Pro $25/月需信用卡） |
| 月度成本（3 用户） | Vercel Pro $20 + R2 免费额度 ≈ $20-25 | Supabase Pro $25（含 $10 compute credit） |
| 不可逆迁移 | 无（R2 可迁回 S3，Vercel Postgres 可独立用 Neon） | 无（标准 Postgres + S3 兼容，可自托管） |
| 信用卡 | 必须（Cloudflare 注册） | 必须（Pro 计费） |

## 6. 引用规范

本登记表所有事实均来自上述官方 URL，访问日期 2026-07-18。无供应商宣传材料、无未验证信息、无客户案例数据。
