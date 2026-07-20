# Production Flag 切换与回滚 Runbook

> **适用范围**：Lumen Ink V2 部署与回滚操作
> **维护者**：Trae / 用户
> **关联任务**：HARDEN-001C（Gate D 公开发布加固）
> **最后更新**：2026-07-21

---

## 1. Production Flag 定义

V2 的"production 模式"由 `src/server/config/runtime.ts` 中的 `loadRuntimeConfig()` 判定：

```typescript
isDeployed = env.VERCEL === '1' || env.NODE_ENV === 'production'
```

`isDeployed=true` 触发的行为分支：

| 子系统 | local/dev (`isDeployed=false`) | production (`isDeployed=true`) |
|--------|-------------------------------|-------------------------------|
| ProviderStore | 文件持久化 `providers.json` | 环境变量管理，零 fs 读写 |
| Persistence | 本地文件适配器 | CloudBase PostgreSQL + PG Storage |
| Job Executor | `createLocalJobExecutor`（手动） | `createWorkerJobExecutor`（轮询 + sweeper） |
| Auth 密码 | 默认 `changeme`（仅本地） | 必须显式设置 ≥12 字符，否则 boot fail-fast |
| CORS | `http://localhost:5173` | 必须显式设置 `CORS_ALLOWLIST` |
| Trust Proxy | 已启用（`app.set('trust proxy', 1)`） | 已启用（同上） |
| Secrets 校验 | 警告但允许启动 | 任何缺失/弱密钥直接抛错拒绝启动 |

**关键不变量**：`isDeployed=true` 时绝不可回退到文件存储、绝不可使用默认密码、绝不可在 `/tmp` 读写 Provider 配置（D-011）。

---

## 2. 切换到 Production 模式

### 2.1 前置条件检查

- [ ] `VERCEL=1` 或 `NODE_ENV=production` 已在部署平台环境变量中设置
- [ ] 以下环境变量全部已设置且通过强度校验：
  - `AUTH_PASSWORD` ≥ 12 字符
  - `JWT_SECRET` ≥ 32 字符
  - `PROVIDER_ENCRYPTION_KEY` ≥ 32 字符
  - `CORS_ALLOWLIST`（逗号分隔的允许 Origin）
  - `SEEDREAM_API_KEY`（或其他 Provider Key）
  - `CRON_SECRET`（Vercel Cron 调用 `/api/worker/recover` 所需）
- [ ] CloudBase PostgreSQL 已开通且连接参数可解析
- [ ] Vercel 项目已配置函数 `maxDuration ≥ 60s`（worker 单跳限制）
- [ ] `app.set('trust proxy', 1)` 已在 `src/server/index.ts` 启用（HARDEN-001C 验证）

### 2.2 切换步骤

1. **本地验证**：在本地用 `VERCEL=1` + 全套生产环境变量启动一次，确认 boot 不抛错。
   ```powershell
   $env:VERCEL='1'; $env:AUTH_PASSWORD='<强密码>'; $env:JWT_SECRET='<32字符>'; `
   $env:PROVIDER_ENCRYPTION_KEY='<32字符>'; $env:CORS_ALLOWLIST='https://your.domain'; `
   $env:SEEDREAM_API_KEY='sk-xxx'; $env:CRON_SECRET='<32字符>'; `
   npm run build; node dist/server/index.js
   ```
   预期：启动日志 `Server running on http://localhost:3001`，无 `PROVIDER_STORE_LOAD_FAILED` / `AUTH_PASSWORD_TOO_SHORT` 等错误。

2. **Vercel 部署**：
   - 在 Vercel Dashboard → Project → Settings → Environment Variables 中确认所有变量已设置（Production 环境）。
   - Push 到 `main` 触发自动部署。
   - 部署日志中确认 `CloudBase persistence adapter ready` 和 `Worker executor started`。

3. **部署后冒烟测试**：
   - `curl https://<domain>/api/health` → 期望 `{"status":"ok"}`，无其他字段。
   - 不带 JWT 请求 `/api/providers` → 期望 401。
   - 错误密码请求 `/api/auth/` 5 次 → 第 6 次期望 429（throttle 生效，依赖 trust proxy）。

### 2.3 切换后验证清单

- [ ] `/api/health` 仅返回 `{"status":"ok"}`
- [ ] `/api/providers` 列表响应中 `apiKey` 字段为空字符串（`ProviderStore.list()` 已删除）
- [ ] Vercel 日志中无 `console.error(..., err)` 含 raw Error stack
- [ ] Vercel 日志中无 `mimeType=` raw 用户输入（应为 `redactString` 处理后）
- [ ] 登录失败 5 次后第 6 次返回 429（验证 `req.ip` 来自 `X-Forwarded-For`，非反向代理 IP）

---

## 3. 回滚到 Local/Dev 模式

### 3.1 触发条件

- 生产环境出现 P0 故障且短时间无法修复
- 需要降级到本地文件存储以维持基础可用性
- 用户明确决定回滚

### 3.2 回滚步骤（Vercel → 本地）

1. **Vercel 端禁用 production 部署**：
   - Vercel Dashboard → Project → Settings → Functions → 将 Production Domain 解绑或指向维护页。
   - 不要删除环境变量（保留以便重新启用）。

2. **本地启动 dev 实例**（应急用）：
   ```powershell
   # 不设置 VERCEL，使用本地默认
   $env:AUTH_PASSWORD='<强密码>'; $env:JWT_SECRET='<32字符>'; `
   $env:PROVIDER_ENCRYPTION_KEY='<32字符>'; `
   npm run dev
   ```
   预期：`isDeployed=false`，使用文件持久化，`authThrottle` 仍生效但 throttle key 基于 `req.ip`（本地无 trust proxy 影响）。

3. **数据迁移警告**：
   - Production 模式的数据存储在 CloudBase PostgreSQL。
   - Local 模式使用文件存储。
   - **两者不互通**。回滚到 local 不会自动迁移 production 数据。
   - 如需迁移，必须先在 production 模式下导出数据，再手动导入 local 文件存储（不在本 runbook 范围内）。

### 3.3 回滚后验证

- [ ] 本地 `/api/health` 返回 `{"status":"ok"}`
- [ ] 本地 `providers.json` 文件被正确读写（local 模式）
- [ ] Vercel Production 域名返回维护页或 503
- [ ] 用户已被告知数据不互通

---

## 4. 紧急回滚（代码层）

### 4.1 Git Revert 流程

当生产代码出现严重 regression 时：

1. 确认 `main` 分支最新 commit hash。
2. `git revert <commit-hash> -m 1`（如果是 merge commit）。
3. 推送 revert commit 到 `main`，Vercel 自动重新部署。
4. 在 `docs/lumen-v2/state/DECISION-LOG.md` 记录 revert 决策。

### 4.2 环境变量快速禁用

如需立即关闭生产服务而不改代码：

- Vercel Dashboard → Project → Settings → Environment Variables → 删除或重命名 `SEEDREAM_API_KEY`。
- 下次 cold start 时 `loadRuntimeConfig()` 仍可能通过（取决于其他 Provider Key），但实际 Provider 调用会 401。
- 这不是推荐的禁用方式，仅用于紧急止血。

---

## 5. 风险与注意事项

### 5.1 Trust Proxy 依赖

- `app.set('trust proxy', 1)` 是 HARDEN-001C 强制要求（DEBT-HARDEN-001A-03）。
- 如果移除或更改此设置，`req.ip` 将落到反向代理 IP，导致：
  - 登录失败 throttle 所有请求被视为同一 IP，throttle 实质失效。
  - `authThrottle` 的 per-IP 隔离失效。
- **禁止**在未评估安全影响的情况下移除 trust proxy 设置。

### 5.2 Provider Key 环境变量管理

- Production 模式下 ProviderStore 不读写文件，完全依赖环境变量。
- `SEEDREAM_API_KEY` 在环境变量中设置后，会自动创建默认 Provider。
- 修改 Provider 配置（如切换默认模型）必须通过环境变量，API 修改会被 `PROVIDER_CONFIG_ENV_MANAGED` 403 拒绝。

### 5.3 日志脱敏

- `redactError()` 是所有路由错误日志的强制入口（HARDEN-001C AC-C10/C14）。
- `redactString()` 处理用户控制的 `mimeType` 等字段（HARDEN-001C AC-C12）。
- 如果新增路由，必须使用 `redactError` 包装 catch 块的日志，否则会违反 Gate D。

### 5.4 Cron Secret

- `/api/worker/recover` 使用 `CRON_SECRET` bearer token，不是用户 JWT。
- 未设置 `CRON_SECRET` 时端点返回 503。
- Vercel Cron 必须在 Dashboard 中配置 `Authorization: Bearer <CRON_SECRET>` header。

---

## 6. 相关文档

- `docs/lumen-v2/specs/07-ACCEPTANCE-PLAN.md` — Gate D 验收门禁
- `docs/lumen-v2/tasks/active/HARDEN-001.md` — HARDEN-001 任务卡（含 001C 范围）
- `docs/lumen-v2/reviews/HARDEN-001B-GPT-REVIEW.md` — HARDEN-001B GPT 审查（含 C 的执行步骤）
- `src/server/config/runtime.ts` — `loadRuntimeConfig()` 实现
- `src/server/index.ts` — 生产入口（trust proxy 设置位置）
- `src/server/security/redaction.ts` — `redactError` / `redactString` 工具

---

## 7. 更新历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-07-21 | 1.0 | 初版（HARDEN-001C Gate D 公开发布加固） |
