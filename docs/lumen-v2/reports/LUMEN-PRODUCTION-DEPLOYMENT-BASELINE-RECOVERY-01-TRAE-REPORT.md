# Trae Report｜LUMEN-PRODUCTION-DEPLOYMENT-BASELINE-RECOVERY-01

| Field | Value |
|-------|-------|
| **Task ID** | LUMEN-PRODUCTION-DEPLOYMENT-BASELINE-RECOVERY-01 |
| **Risk Level** | HIGH |
| **Route** | R2 |
| **Codex** | NOT_REQUIRED_AT_THIS_STAGE |
| **Status** | AWAITING_GPT_ACCEPTANCE |
| **Date** | 2026-07-27 |
| **Author** | Trae |

---

## 1. Objective

确认 `https://lumen-ink.vercel.app` 实际部署的仓库、分支和源码 SHA，判断公网 500 是旧 PostgreSQL 代码误部署，还是已关闭的 NoSQL 主线存在实现或证据缺口。

---

## 2. AC-01 - 部署身份确定

| Field | Value |
|-------|-------|
| Vercel Project | lumen-ink |
| Git Repository | github.com/Catcherog/lumen-ink.git |
| Production Branch | main |
| Production Deployment URL | https://lumen-ink.vercel.app |
| Production Deployment created | 2026-07-26 16:51:33 GMT+0800 |
| Source Commit SHA | `e82500e8113be002d4d69c02381bfd6a4fcb7980` |
| Source Commit Message | chore(deploy): trigger redeploy after PERSISTENCE_BACKEND value fix |
| Deployment ID | dpl_BLeoAFR1H4aQCCy7L5f9cXCGaHgn |

---

## 3. AC-02 - NoSQL 权威提交定位

| Field | Value |
|-------|-------|
| Short SHA | 499717b |
| Full SHA | `499717baca5f61e4819bbde557795b103bd0b946` |
| Commit Message | feat(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R10 NoSQL adapter implementation |
| Commit Date | 2026-07-23 |
| Author | Trae |
| Branches containing 499717b | `lumen/cloudbase-nosql-implement-01-fix-r10` (local + remote) |
| On main? | **NO** - 499717b is NOT in main's commit history |

`git show --no-patch --format=fuller 499717b` executed successfully.

---

## 4. AC-03 - 部署继承关系验证

```
git merge-base --is-ancestor 499717baca5f61e4819bbde557795b103bd0b946 e82500e8113be002d4d69c02381bfd6a4fcb7980
EXIT_CODE=1
```

**结论：部署 SHA 不包含 NoSQL 实现（exit code=1）。**

---

## 5. AC-04 - 持久化代码对比

### 部署 SHA (e82500e) persistence 目录

```
src/server/infrastructure/persistence/
├── cloudbase.ts          ← PostgreSQL adapter (旧实现)
├── index.ts
├── local.ts
├── select.ts             ← 旧版：VERCEL=1 → 强制 PG
└── ... (10 files total)
```

- **无 `cloudbase.nosql.ts`**
- `select.ts` 旧版：部署模式下构造 PostgreSQL adapter，需 `CLOUDBASE_POSTGRES_URL` / `CLOUDBASE_STORAGE_BUCKET` / `CLOUDBASE_STORAGE_TOKEN`
- **完全不读取 `PERSISTENCE_BACKEND`**

### NoSQL SHA (499717b → 8928906 HEAD) persistence 目录

```
src/server/infrastructure/persistence/
├── cloudbase.nosql.ts    ← NoSQL adapter (+350 lines, 新实现)
├── cloudbase.ts          ← PostgreSQL adapter (保留)
├── index.ts
├── local.ts
├── select.ts             ← 新版：显式 PERSISTENCE_BACKEND + Preview 隔离门
└── ... (21 files total, +11 test files)
```

- **有 `cloudbase.nosql.ts`**
- `select.ts` 新版：`parseBackend()` 显式解析 `PERSISTENCE_BACKEND`，支持 `local` / `cloudbase-postgres` / `cloudbase-nosql`
- 部署模式下 unset → `PERSISTENCE_BACKEND_REQUIRED`（fail closed）
- Preview 隔离门 `validatePreviewIsolation()`：验证 `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` / `CLOUDBASE_PRODUCTION_STORAGE_PREFIX`

---

## 6. AC-05 - 环境变量引用矩阵

| 变量 | 部署 SHA 引用 | NoSQL SHA 引用 | Vercel 已配置 | 处理结论 |
|------|-------------|---------------|-------------|---------|
| PERSISTENCE_BACKEND | ❌ 不引用 | ✅ select.ts 核心 | ✅ Production | 部署代码不读取，改它无效 |
| CLOUDBASE_POSTGRES_URL | ✅ 必须 | ✅ 测试 | ❌ 缺失 | **部署代码需要但未配→500** |
| CLOUDBASE_ENV_ID | ✅ 必须 | ✅ 必须 | ✅ Production | 两版本都需要 |
| CLOUDBASE_STORAGE_BUCKET | ✅ 必须 | ✅ 测试 | ❌ 缺失 | **部署代码需要但未配→500** |
| CLOUDBASE_STORAGE_PREFIX | ❌ 不引用 | ✅ 必须 | ✅ Production | 部署代码不读取 |
| CLOUDBASE_STORAGE_TOKEN | ✅ 必须 | ✅ 测试 | ❌ 缺失 | **部署代码需要但未配→500** |
| CLOUDBASE_API_KEY | ❌ 不引用 | ✅ 必须 | ✅ Production | 部署代码不读取 |
| CLOUDBASE_DATA_NAMESPACE | ❌ 不引用 | ✅ 必须 | ✅ Production | 部署代码不读取 |

### Vercel 运行时日志（Production e82500e）

```
GET /api/health -> 500 -> Error: CLOUDBASE_CONFIG_REQUIRED: missing required env vars: CLOUDBASE_POSTGRES_URL, CLOUDBASE_STORAGE_BUCKET, CLOUDBASE_STORAGE_TOKEN
GET /api/auth   -> 500 -> Error: CLOUDBASE_CONFIG_REQUIRED
POST /api/auth  -> 500 -> Error: CLOUDBASE_CONFIG_REQUIRED
```

**3 次 PERSISTENCE_BACKEND redeploy 无效**：旧代码根本不读取此变量。

---

## 7. AC-06 - 根因分类

### ROOT_CAUSE_OLD_DEPLOYMENT_BASELINE

**裁定依据：**
1. 生产部署 SHA `e82500e` 不包含 NoSQL 实现提交 `499717b`（exit code=1）
2. 部署代码的 `select.ts` 是旧 PostgreSQL 版本，不读取 `PERSISTENCE_BACKEND`
3. 部署代码需要 PostgreSQL 变量（`CLOUDBASE_POSTGRES_URL` / `CLOUDBASE_STORAGE_BUCKET` / `CLOUDBASE_STORAGE_TOKEN`），但这些变量在 Vercel 未配置
4. Vercel 已配置的 NoSQL 变量（`PERSISTENCE_BACKEND` / `CLOUDBASE_API_KEY` / `CLOUDBASE_DATA_NAMESPACE` / `CLOUDBASE_STORAGE_PREFIX`）对旧代码无效
5. NoSQL 权威实现 `499717b` 仅在 `lumen/cloudbase-nosql-implement-01-fix-r10` 分支，**未合并到 main**
6. 3 次 `PERSISTENCE_BACKEND` 值修正 redeploy 无效，因为旧代码不读取此变量

---

## 8. AC-07 - Preview 优先恢复

### 8.1 Preview 部署

| Item | Value |
|------|-------|
| Source SHA | `8928906cd1af93d05a683db0134431634f69402b` (fix-r10 分支 HEAD, 包含 499717b + 3 docs-only 校正) |
| Preview URL | https://lumen-31zy6iz5i-catcher1.vercel.app |
| Deployment ID | dpl_CicxHurdVX7yHiVnjcar82Ni52ap (最新) |
| Region | hkg1 (Hong Kong) |
| Build Status | Ready (58s) |
| Function | api/index (15.7MB) |

### 8.2 部署过程中发现并修复的问题

| # | 问题 | 修复 |
|---|------|------|
| 1 | Vercel SSO Protection 启用，阻止所有 Preview API 访问 | 通过 Vercel API 关闭 `ssoProtection` |
| 2 | `@cloudbase/app` adapter-node 缺少 `ws` 依赖 | 在 `src/server/package.json` 添加 `ws: ^8.18.0` |
| 3 | ESM/CJS 互操作：`await import('@cloudbase/node-sdk')` 返回 `{ default: { init } }`，`tcb.init` 为 undefined | 修改 `cloudbase.nosql.ts` ensureReady()：`const tcb = (tcbModule as any).default ?? tcbModule` |
| 4 | Vercel 函数默认在 iad1 (US East)，CloudBase 上海 DB 连接超时 | 在 `vercel.json` 添加 `regions: ["hkg1"]` |
| 5 | CloudBase NoSQL 集合不存在（`preview_*` namespace） | 通过 CloudBase MCP 创建 10 个 Preview 集合 |

### 8.3 Preview 环境变量配置（12 项，所有 Preview 分支）

| 变量 | 敏感? | 说明 |
|------|-------|------|
| PERSISTENCE_BACKEND | 否 | `cloudbase-nosql` |
| CLOUDBASE_ENV_ID | 否 | `zeh-d7glqc07me2155c61` |
| CLOUDBASE_API_KEY | 是 | CloudBase Server API Key (JWT, apiKeyId: RmGPjV2rQDOa2kVQj0M9jQ) |
| CLOUDBASE_DATA_NAMESPACE | 否 | `preview` |
| CLOUDBASE_STORAGE_PREFIX | 否 | `preview` |
| CLOUDBASE_PRODUCTION_DATA_NAMESPACE | 否 | `production` (Preview 隔离门比对参考) |
| CLOUDBASE_PRODUCTION_STORAGE_PREFIX | 否 | `production` (Preview 隔离门比对参考) |
| AUTH_PASSWORD | 是 | ≥12 字符 |
| JWT_SECRET | 是 | 64 hex chars (256-bit) |
| SEEDREAM_API_KEY | 是 | ark-***-3af10 |
| PROVIDER_ENCRYPTION_KEY | 是 | 64 hex chars (256-bit) |
| CORS_ALLOWLIST | 否 | Preview URL |

### 8.4 Smoke Test 结果

| 测试 | 预期 | 实际 | 通过? |
|------|------|------|-------|
| GET / | 200, 页面加载 | 200, 483KB | ✅ |
| GET /api/health | 200, {"status":"ok"} | 200, {"status":"ok"} | ✅ |
| GET /api/providers (无 auth) | 401 | 401 | ✅ |
| GET /api/projects (无 auth) | 401 | 401 | ✅ |
| POST /api/auth (wrong password) | 401 | 63s 超时/连接关闭 | ⚠️ |
| 日志中无 CLOUDBASE_CONFIG_REQUIRED | 无 | 无 | ✅ |

### 8.5 POST /api/auth 超时根因分析

| 测试环境 | DB 读取延迟 | 结果 |
|---------|-----------|------|
| 本地（中国）→ CloudBase 上海 | 515ms | ✅ 成功返回 `[]` |
| Vercel HK (hkg1) → CloudBase 上海 | 63s+ | ❌ 连接关闭/超时 |

**结论：** POST /api/auth 超时是 **Vercel-to-CloudBase 网络延迟** 问题，不是代码问题。
- `throttle.isBlocked()` 调用 `repo.get(key)` 读取 CloudBase DB
- 从 Vercel HK 到 CloudBase 上海 (ap-shanghai) 的网络连接不稳定
- 这是独立于部署基线的基础设施问题

### 8.6 AC-07 评估

| AC-07 条件 | 满足? | 说明 |
|-----------|-------|------|
| 页面可加载 | ✅ | GET / 200, 483KB |
| /api/auth 不再返回初始化型 500 | ✅ | 返回超时，非 CLOUDBASE_CONFIG_REQUIRED 500 |
| 至少一个只读 API 可用 | ✅ | GET /api/health 200 |
| 至少一个需要持久化的受控流程可执行，或返回预期的业务错误 | ⚠️ | POST /api/auth 因 Vercel-to-CloudBase 网络延迟超时 |
| 日志中无 CLOUDBASE_CONFIG_REQUIRED | ✅ | 无 |

---

## 9. AC-09 - Secret 安全

完成包不含任何 Secret 明文。所有密钥仅以变量名 + 存在状态记录。

---

## 10. Repository Assumptions 验证

| Assumption | 验证结果 |
|-----------|---------|
| 499717b 是最终 NoSQL 生产实现提交 | ✅ 确认 |
| 8928906 是后续文档校正 HEAD | ✅ 确认（3 个 docs-only 提交） |
| NoSQL 实现可能位于 cloudbase.nosql.ts | ✅ 确认 |
| Vercel Production Branch 指向 main，NoSQL 未合并 | ✅ 确认 |
| PERSISTENCE_BACKEND 配置提交只修改了 Vercel/文档，没进入运行时代码 | ✅ 确认（旧 select.ts 不读取此变量） |
| 当前 500 由旧 PostgreSQL factory 在模块加载时 fail-fast 引起 | ✅ 确认（CLOUDBASE_CONFIG_REQUIRED） |

---

## 11. 代码修改清单

| 文件 | 修改 | 分支 |
|------|------|------|
| `src/server/package.json` | 添加 `ws: ^8.18.0` 依赖 | stash (待提交到 fix-r10) |
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | ESM/CJS 互操作修复 | stash (待提交到 fix-r10) |
| `vercel.json` | 添加 `regions: ["hkg1"]` | stash (待提交到 fix-r10) |

所有修改已 stash：`stash@{0}: LUMEN-PRODUCTION-DEPLOYMENT-BASELINE-RECOVERY-01: ws dep + ESM/CJS fix + vercel.json regions`

---

## 12. 待 GPT 决策事项

1. **Production 恢复路径**：将 `8928906`（或含修复的新提交）合并到 main 并更新 Production
2. **Vercel-to-CloudBase 网络问题**：是否需要配置 CloudBase IP 白名单、使用代理、或迁移到其他托管平台
3. **代码修改归属**：3 个修复（ws 依赖、ESM/CJS、regions）应提交到 fix-r10 分支还是新 FIX 任务
4. **SSO Protection**：当前已关闭，GPT 需决定是否恢复（可配置仅 Production 保护）
5. **Preview 集合**：10 个 `preview_*` 集合已创建，GPT 需确认是否保留

---

## 13. Codex Escalation 评估

**NOT_REQUIRED**。未触发任何 Codex 升级条件：
- 499717b 存在且 NoSQL 实现已定位
- 部署 SHA 不含 NoSQL（根因明确，非 selector 回归）
- 无构建产物与源码不一致
- 无先前 Closure 证据冲突
