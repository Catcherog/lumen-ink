# CloudBase NoSQL — 环境变量矩阵

> **任务**：LUMEN-CLOUDBASE-NOSQL-PREVIEW-DEPLOYMENT-READINESS-01
> **适用范围**：CloudBase NoSQL adapter（`PERSISTENCE_BACKEND=cloudbase-nosql`）的 Preview 与 Production 部署
> **关联文件**：
> - 模板：`/.env.cloudbase-nosql.preview.example`
> - Runbook：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-PREVIEW-RUNBOOK.md`
> - 回滚：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-ROLLBACK.md`
> **最后更新**：2026-07-22

---

## 1. 矩阵总览

### 1.1 CloudBase NoSQL 专属变量

| 变量名 | 必填 | Preview 示例 | 敏感 | 允许进仓库 | Production / Preview 隔离要求 |
|--------|------|-------------|------|-----------|------------------------------|
| `PERSISTENCE_BACKEND` | ✅ 部署模式必填 | `cloudbase-nosql` | 否 | ✅ 是（值非密钥） | Production 与 Preview 均为 `cloudbase-nosql`；部署模式下不允许 `local`（fail closed） |
| `CLOUDBASE_ENV_ID` | ✅ 必填 | `your-cloudbase-env-id-here` | 否（环境 ID 非密钥，但建议不公开） | ✅ 是（示例值） | Production 与 Preview **可共享**同一 envId；数据隔离通过 `CLOUDBASE_DATA_NAMESPACE` + `CLOUDBASE_STORAGE_PREFIX` 实现 |
| `CLOUDBASE_API_KEY` | ✅ 必填 | `your-cloudbase-server-api-key-here` | ✅ **是**（JWT 格式 Server API Key） | ❌ **禁止** | **Preview 必须使用 Preview-only API Key**；禁止复用 Production API Key。见 RUNBOOK 第 1 步 |
| `CLOUDBASE_DATA_NAMESPACE` | ✅ 必填 | `preview` | 否 | ✅ 是 | **必须不同**。Preview 推荐 `preview`，Production 推荐 `prod`。缺失时 fail closed（NOSQL-R2-06） |
| `CLOUDBASE_STORAGE_PREFIX` | ✅ 必填 | `preview/` | 否 | ✅ 是 | **必须不同**。Preview 推荐 `preview/`，Production 推荐 `prod/`。缺失时 fail closed（NOSQL-R2-06） |
| `CLOUDBASE_SIGNED_URL_TTL_SECONDS` | ⚙️ 可选 | `900` | 否 | ✅ 是 | 推荐均设为 `900`（15 分钟）。范围 60~3600。Production 与 Preview 可相同 |
| `ALLOW_CLOUDBASE_PREVIEW_SMOKE` | ✅ Preview 必填 | `true` | 否 | ✅ 是 | **Production 禁止设为 `true`**；Preview 必须为 `true` 才能执行 smoke harness |

### 1.2 部署模式标记变量

| 变量名 | 必填 | Preview 示例 | 敏感 | 允许进仓库 | Production / Preview 隔离要求 |
|--------|------|-------------|------|-----------|------------------------------|
| `VERCEL` | ✅ Vercel 自动注入 | `1`（自动） | 否 | N/A（Vercel 注入） | Production 与 Preview 均自动设为 `1`；无需手动配置 |
| `NODE_ENV` | ✅ Vercel 自动注入 | `production`（自动） | 否 | N/A（Vercel 注入） | Production 与 Preview 均自动设为 `production`；无需手动配置 |

### 1.3 内部安全底线变量（D-034，部署模式必填）

| 变量名 | 必填 | Preview 示例 | 敏感 | 允许进仓库 | Production / Preview 隔离要求 |
|--------|------|-------------|------|-----------|------------------------------|
| `AUTH_PASSWORD` | ✅ 部署模式必填（≥12 字符） | `your-preview-auth-password-min-12-chars` | ✅ **是** | ❌ **禁止** | **必须不同**。Preview 应使用独立密码 |
| `JWT_SECRET` | ✅ 部署模式必填（≥32 字符） | `your-preview-jwt-secret-min-32-chars-here` | ✅ **是** | ❌ **禁止** | **必须不同**。Preview 使用独立 JWT 密钥 |
| `PROVIDER_ENCRYPTION_KEY` | ✅ 部署模式必填（≥32 字符） | `your-preview-encryption-key-min-32-chars` | ✅ **是** | ❌ **禁止** | **必须不同**。Preview 使用独立加密密钥；共用会导致 Provider Key 无法解密 |
| `CORS_ALLOWLIST` | ✅ 部署模式必填 | `https://your-preview-domain.vercel.app` | 否 | ✅ 是（域名非密钥） | **必须不同**。Preview 域名格式 `https://<project>-git-<branch>-<owner>.vercel.app` |

### 1.4 Provider API Key 变量

| 变量名 | 必填 | Preview 示例 | 敏感 | 允许进仓库 | Production / Preview 隔离要求 |
|--------|------|-------------|------|-----------|------------------------------|
| `SEEDREAM_API_KEY` | ⚠️ 至少一个 Provider Key | `your-seedream-api-key-here` | ✅ **是** | ❌ **禁止** | 可共享同一 Key（Provider 计费维度）；但建议 Preview 使用独立 Key 以便限额和审计 |

### 1.5 Cron Secret 变量

| 变量名 | 必填 | Preview 示例 | 敏感 | 允许进仓库 | Production / Preview 隔离要求 |
|--------|------|-------------|------|-----------|------------------------------|
| `CRON_SECRET` | ✅ `/api/worker/recover` 鉴权必填 | `your-preview-cron-secret-min-32-chars-here` | ✅ **是** | ❌ **禁止** | **必须不同**。Preview 使用独立 Cron Secret。注意：Vercel Cron 仅在 Production Deployment 注册，Preview 不自动调度 |

---

## 2. 变量详细说明

### 2.1 `PERSISTENCE_BACKEND`

- **用途**：显式选择持久化后端适配器（NOSQL-R2-07）。
- **合法值**：`local` | `cloudbase-postgres` | `cloudbase-nosql`
- **部署模式行为**：未设置或值非法时 fail closed，抛出 `PERSISTENCE_BACKEND_REQUIRED` 或 `PERSISTENCE_BACKEND_INVALID`。
- **代码位置**：`src/server/infrastructure/persistence/select.ts` → `parseBackend()` + `selectPersistenceByEnv()`
- **Preview 配置**：必须为 `cloudbase-nosql`。

### 2.2 `CLOUDBASE_ENV_ID`

- **用途**：CloudBase 环境 ID，用于初始化 `@cloudbase/node-sdk` 的 `tcb.init({ env })`。
- **格式**：字符串，如 `zeh-d7glqc07me2155c61`。
- **获取方式**：CloudBase 控制台 → 环境列表 → 环境 ID。
- **隔离说明**：Preview 与 Production 可共享同一 envId。数据隔离完全通过 `CLOUDBASE_DATA_NAMESPACE` 和 `CLOUDBASE_STORAGE_PREFIX` 实现。如需更强隔离，可为 Preview 创建独立 envId。

### 2.3 `CLOUDBASE_API_KEY`

- **用途**：CloudBase Server API Key（JWT 格式），用于服务端 SDK 鉴权。
- **格式**：JWT 字符串。
- **获取方式**：CloudBase 控制台 → 环境 → 安全设置 → API Key 管理。
- **敏感等级**：**高**。泄露后可读写对应环境的全部数据库和存储。
- **隔离要求**：
  - **Preview 必须使用 Preview-only API Key**（见 RUNBOOK 第 1 步创建流程）。
  - **禁止复用 Production API Key**（AC-03）。
  - API Key 不得进入仓库（AC-01）。
- **代码位置**：`cloudbase.nosql.ts` → `validateCloudBaseNoSqlConfig()` 强制非空。

### 2.4 `CLOUDBASE_DATA_NAMESPACE`

- **用途**：所有数据库集合名的前缀（NOSQL-R2-06）。
- **格式**：字符串，不含特殊字符。推荐 `preview` / `prod`。
- **生效方式**：`makeCollections(namespace)` 返回 `{ projects: '${namespace}_projects', ... }`。
- **隔离要求**：
  - **Preview 与 Production 必须不同**（AC-02）。
  - 缺失或为空时 fail closed，抛出 `CLOUDBASE_CONFIG_REQUIRED`。
- **受影响的集合**：`projects` / `assets` / `versions` / `version_idempotency` / `generation_jobs` / `job_idempotency` / `auth_throttle` / `object_metadata`。

### 2.5 `CLOUDBASE_STORAGE_PREFIX`

- **用途**：所有对象存储 cloudPath 的前缀（NOSQL-R2-06）。
- **格式**：字符串，推荐以 `/` 结尾（如 `preview/` / `prod/`）。
- **生效方式**：`objects.put(key)` 实际上传路径为 `${storagePrefix}${key}`。
- **隔离要求**：
  - **Preview 与 Production 必须不同**（AC-02）。
  - 缺失或为空时 fail closed，抛出 `CLOUDBASE_CONFIG_REQUIRED`。

### 2.6 `CLOUDBASE_SIGNED_URL_TTL_SECONDS`

- **用途**：CloudBase `getTempFileURL` 颁发的签名 URL 有效期。
- **格式**：整数秒，范围 60~3600。
- **默认值**：未设置时代码默认 `900`（15 分钟）。
- **Preview 推荐**：`900`。

### 2.7 `ALLOW_CLOUDBASE_PREVIEW_SMOKE`

- **用途**：Preview smoke harness 的门控开关。
- **合法值**：`true` | `false`。
- **隔离要求**：
  - **Preview 必须设为 `true`** 才能执行 smoke harness（RUNBOOK 第 5 步）。
  - **Production 禁止设为 `true`**（避免生产环境被 smoke test 写入测试数据）。
- **注意**：此变量为部署配置层的门控标志，不替代 GPT 验收门禁。

### 2.8 安全底线变量（D-034）

详见 `docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md` 第 2.1 节。Preview 部署模式下同样适用全部 fail-fast 规则：
- `AUTH_PASSWORD` ≥ 12 字符
- `JWT_SECRET` ≥ 32 字符
- `PROVIDER_ENCRYPTION_KEY` ≥ 32 字符
- `CORS_ALLOWLIST` 至少包含 Preview 域名

---

## 3. 隔离原则汇总

| 隔离维度 | Preview | Production | 强制方式 |
|---------|---------|------------|---------|
| 数据库集合 | `preview_*` | `prod_*` | `CLOUDBASE_DATA_NAMESPACE` fail closed |
| 对象存储路径 | `preview/*` | `prod/*` | `CLOUDBASE_STORAGE_PREFIX` fail closed |
| API Key | Preview-only Key | Production Key | AC-03 禁止复用；RUNBOOK 第 1 步 |
| Auth 密码 | 独立密码 | 独立密码 | D-034 强度校验 |
| JWT Secret | 独立密钥 | 独立密钥 | D-034 强度校验 |
| 加密密钥 | 独立密钥 | 独立密钥 | D-034 强度校验 |
| Smoke 开关 | `true` | `false` | `ALLOW_CLOUDBASE_PREVIEW_SMOKE` |
| Cron 调度 | 不自动调度 | 自动调度 `0 0 * * *` | Vercel Cron 仅注册 Production |

---

## 4. 禁止行为

- ❌ 将 `CLOUDBASE_API_KEY` 真实值提交到仓库（AC-01）
- ❌ Preview 复用 Production API Key（AC-03）
- ❌ Preview 与 Production 共享 `CLOUDBASE_DATA_NAMESPACE`（AC-02）
- ❌ Preview 与 Production 共享 `CLOUDBASE_STORAGE_PREFIX`（AC-02）
- ❌ Production 设置 `ALLOW_CLOUDBASE_PREVIEW_SMOKE=true`
- ❌ 未设置 `CLOUDBASE_DATA_NAMESPACE` 或 `CLOUDBASE_STORAGE_PREFIX` 时启动（fail closed）

---

## 5. 更新历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-07-22 | 1.0 | 初版（LUMEN-CLOUDBASE-NOSQL-PREVIEW-DEPLOYMENT-READINESS-01） |
