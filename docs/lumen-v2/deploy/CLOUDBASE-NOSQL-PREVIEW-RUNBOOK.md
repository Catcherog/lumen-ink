# CloudBase NoSQL — Preview 部署 Runbook

> **任务**：LUMEN-CLOUDBASE-NOSQL-PREVIEW-DEPLOYMENT-READINESS-01
> **用途**：冻结 CloudBase NoSQL Preview 的部署、验证和清理步骤，使 FIX-R4 验收后可直接进入真实 Preview
> **前置条件**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` FIX-R4 GPT 验收通过 + Codex 限定只读审查通过
> **关联文件**：
> - 环境变量矩阵：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-ENV-MATRIX.md`
> - 回滚手册：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-ROLLBACK.md`
> - 环境变量模板：`/.env.cloudbase-nosql.preview.example`
> - 生产 flag runbook：`docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md`
> **最后更新**：2026-07-22
> **执行者**：用户（手动操作）；Trae 不执行任何真实部署或凭据配置

---

## 0. 前置条件检查

在开始本 Runbook 任何步骤前，必须确认以下条件全部满足：

- [ ] `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` FIX-R4 已通过 GPT 证据验收
- [ ] Codex 限定只读审查已通过
- [ ] `STATE.json.cloudbaseNoSqlImplement.readyForPreview` 当前为 `false`
- [ ] 已阅读环境变量矩阵 `CLOUDBASE-NOSQL-ENV-MATRIX.md`
- [ ] 已准备好 CloudBase 控制台访问权限
- [ ] 已准备好 Vercel Dashboard 访问权限

**禁止行为**：在前置条件未满足时执行本 Runbook 的任何步骤。

---

## 第 1 步：创建 Preview-only API Key

**目标**：为 Preview 部署创建独立的 CloudBase Server API Key，禁止复用 Production API Key（AC-03）。

### 操作

1. 登录 CloudBase 控制台 → 选择目标环境（如 `zeh-d7glqc07me2155c61`）。
2. 进入「环境」→「安全设置」→「API Key 管理」。
3. 点击「创建 API Key」：
   - 名称：`lumen-preview-nosql`（与 Production 的 `lumen-prod-nosql` 区分）
   - 权限范围：见第 2 步「最小权限原则」
   - 过期时间：建议设置 90 天过期（与 Production 的 `never` 区分），到期前续期或重建
4. 创建后立即复制 API Key 值（JWT 格式），妥善保存。
5. **不要**将 API Key 写入任何文件或提交到仓库。

### 验证

- [ ] API Key 名称包含 `preview` 标识
- [ ] API Key 过期时间 ≠ `never`
- [ ] API Key 值未出现在任何本地文件中
- [ ] Production API Key（`lumen-prod-nosql`，ID `RmGPjV2rQDOa2kVQj0M9jQ`）未被读取或复用

---

## 第 2 步：最小权限原则

**目标**：Preview API Key 仅授予 Preview 所需的最小权限，禁止全环境管理员权限。

### 操作

在 CloudBase 控制台 API Key 权限配置中，按以下矩阵设置：

| 资源类型 | 权限 | 说明 |
|---------|------|------|
| 数据库集合 `preview_*` | 读写（CRUD） | 仅 Preview namespace 下的 8 个集合 |
| 数据库集合 `prod_*` | **拒绝** | 禁止访问 Production namespace |
| 对象存储 `preview/*` | 读写 + 删除 | 仅 Preview 前缀下的对象 |
| 对象存储 `prod/*` | **拒绝** | 禁止访问 Production 前缀下的对象 |
| 环境级管理操作 | **拒绝** | 禁止环境配置修改、API Key 管理等 |

### 验证

- [ ] API Key 权限范围不包含 `prod_*` 集合
- [ ] API Key 权限范围不包含 `prod/*` 存储路径
- [ ] API Key 不具备环境管理员角色

### 注意

如 CloudBase 控制台不支持按集合名前缀授权，则至少应确保：
- API Key 不具备「环境管理员」角色
- API Key 仅授予「数据库读写」+「存储读写」基础权限
- 通过 `CLOUDBASE_DATA_NAMESPACE` 和 `CLOUDBASE_STORAGE_PREFIX` 在应用层强制隔离（已在代码中实现，NOSQL-R2-06）

---

## 第 3 步：Vercel Preview 环境变量配置

**目标**：在 Vercel Dashboard 的 Preview 环境中配置全部必需环境变量。

### 操作

1. 登录 Vercel Dashboard → 选择 `lumen-ink` 项目。
2. 进入 Settings → Environment Variables。
3. 对每个变量点击「Add New」，Scope 选择 **Preview**（不要选 Production 或 All Environments）：

| 变量名 | 值 | Scope | 备注 |
|--------|-----|-------|------|
| `PERSISTENCE_BACKEND` | `cloudbase-nosql` | Preview | 部署模式必填 |
| `CLOUDBASE_ENV_ID` | （从 CloudBase 控制台复制） | Preview | 环境 ID |
| `CLOUDBASE_API_KEY` | （第 1 步创建的 Preview-only Key） | Preview | 敏感，Vercel 自动加密 |
| `CLOUDBASE_DATA_NAMESPACE` | `preview` | Preview | 集合名前缀 |
| `CLOUDBASE_STORAGE_PREFIX` | `preview/` | Preview | 存储路径前缀 |
| `CLOUDBASE_SIGNED_URL_TTL_SECONDS` | `900` | Preview | 签名 URL TTL |
| `ALLOW_CLOUDBASE_PREVIEW_SMOKE` | `true` | Preview | Smoke 测试开关 |
| `AUTH_PASSWORD` | （≥12 字符独立密码） | Preview | 敏感 |
| `JWT_SECRET` | （≥32 字符独立密钥） | Preview | 敏感 |
| `PROVIDER_ENCRYPTION_KEY` | （≥32 字符独立密钥） | Preview | 敏感 |
| `CORS_ALLOWLIST` | `https://<preview-domain>.vercel.app` | Preview | Preview 域名 |
| `SEEDREAM_API_KEY` | （Provider Key） | Preview | 敏感 |
| `CRON_SECRET` | （≥32 字符独立密钥） | Preview | 敏感 |

4. 确认每个变量的 Scope 为 **Preview**，不要误选 Production。

### 验证

- [ ] 所有 13 个变量已添加
- [ ] 每个变量的 Scope 均为 Preview（非 Production、非 All Environments）
- [ ] 敏感变量在 Vercel 中显示为加密状态
- [ ] `CLOUDBASE_DATA_NAMESPACE` 值为 `preview`，不是 `prod`
- [ ] `CLOUDBASE_STORAGE_PREFIX` 值为 `preview/`，不是 `prod/`
- [ ] `ALLOW_CLOUDBASE_PREVIEW_SMOKE` 值为 `true`

### 禁止行为

- ❌ 不要修改 `vercel.json`（AC-07）
- ❌ 不要将任何变量 Scope 设为 Production 或 All Environments
- ❌ 不要将真实 API Key 值写入 `.env.cloudbase-nosql.preview.example` 或任何仓库文件

---

## 第 4 步：首次部署检查

**目标**：触发 Vercel Preview 部署并验证三个独立门禁的第一个——**部署成功**（AC-05）。

### 操作

1. 确认 NoSQL 修复分支（如 `lumen/cloudbase-nosql-implement-01-fix-r4`）已 push 到 GitHub。
2. Vercel Dashboard → Deployments → 找到对应分支的 Preview 部署。
3. 等待部署完成（Build → Ready 状态）。
4. 检查部署日志：
   - 无 `CLOUDBASE_CONFIG_REQUIRED` 错误
   - 无 `PERSISTENCE_BACKEND_REQUIRED` 错误
   - 无 `AUTH_PASSWORD_TOO_SHORT` 或其他 D-034 fail-fast 错误
   - 出现 `CloudBase NoSQL persistence adapter ready`（或类似启动日志）

### 门禁 1：部署成功

- [ ] Vercel 部署状态为 **Ready**
- [ ] 部署日志中无 boot fail-fast 错误
- [ ] 部署日志中无 `CLOUDBASE_CONFIG_REQUIRED`
- [ ] 部署日志中无 `PERSISTENCE_BACKEND_REQUIRED`

**如部署失败**：不要继续后续步骤。执行回滚（见 `CLOUDBASE-NOSQL-ROLLBACK.md`）。

---

## 第 5 步：执行 Smoke Harness

**目标**：验证第二个独立门禁——**应用启动成功**（AC-05），并执行 smoke 测试。

### 操作

1. 获取 Preview 部署的 URL（格式：`https://<project>-git-<branch>-<owner>.vercel.app`）。
2. 执行以下 smoke 检查（按顺序）：

#### 5.1 健康检查
```powershell
curl https://<preview-url>/api/health
```
预期：`{"status":"ok"}`，无其他字段。

#### 5.2 认证边界检查
```powershell
# 未认证请求应返回 401
curl https://<preview-url>/api/providers
```
预期：`401 Unauthorized`。

#### 5.3 Provider 配置检查
```powershell
# 认证后请求 Provider 列表
curl -H "Authorization: Bearer <jwt>" https://<preview-url>/api/providers
```
预期：200，`apiKey` 字段为空字符串（脱敏）。

#### 5.4 持久化后端验证
```powershell
# 创建测试项目（验证 NoSQL 写入）
curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -H "Idempotency-Key: smoke-test-<timestamp>" \
  -d '{"name":"smoke-test"}' \
  https://<preview-url>/api/projects
```
预期：201，返回 `projectId`。

### 门禁 2：应用启动成功

- [ ] `/api/health` 返回 `{"status":"ok"}`
- [ ] 未认证请求返回 401
- [ ] 认证后 Provider 列表 `apiKey` 字段为空
- [ ] 项目创建 API 返回 201

**Smoke test 失败时**：**不得合并到 main**（AC-06）。执行回滚（见 `CLOUDBASE-NOSQL-ROLLBACK.md`）。

### 注意

- `ALLOW_CLOUDBASE_PREVIEW_SMOKE` 必须为 `true` 才能执行本步骤。
- Smoke 测试产生的数据应在第 9 步清理。
- Smoke 测试不替代 GPT 验收门禁。

---

## 第 6 步：验证数据库隔离

**目标**：验证 Preview 数据库与 Production 数据库完全隔离（AC-02）。

### 操作

1. 在 CloudBase 控制台 → 数据库，检查集合列表。
2. 确认存在 `preview_*` 前缀的集合（如 `preview_projects`、`preview_generation_jobs` 等）。
3. 确认 `prod_*` 前缀的集合（如 `prod_projects`）中**没有**因 Preview 部署产生的新数据。
4. 在 `preview_projects` 集合中确认第 5 步创建的 smoke test 项目存在。
5. 在 `prod_projects` 集合中确认 smoke test 项目**不存在**。

### 验证

- [ ] `preview_*` 集合存在且有 smoke test 数据
- [ ] `prod_*` 集合无 smoke test 数据污染
- [ ] `preview_object_metadata` 集合存在（NOSQL-R2-04 新增）
- [ ] `prod_object_metadata` 集合与 `preview_object_metadata` 互不干扰

### 失败处理

如发现 `prod_*` 集合被污染：
- 立即停止 Preview 部署
- 执行回滚（见 `CLOUDBASE-NOSQL-ROLLBACK.md`）
- 通知用户审查 Production 数据完整性

---

## 第 7 步：验证 Storage 隔离

**目标**：验证 Preview 对象存储与 Production 对象存储完全隔离（AC-02）。

### 操作

1. 在 CloudBase 控制台 → 存储，检查文件列表。
2. 确认 Preview 上传的对象路径以 `preview/` 前缀开头。
3. 确认 `prod/` 前缀下没有因 Preview 部署产生的新文件。
4. 通过 smoke test 创建的项目上传一张测试图片，验证：
   - 对象路径为 `preview/<storageKey>`
   - 签名 URL 可正常访问
   - `preview_object_metadata` 集合中有对应的 `storageKey → fileID` 映射记录

### 验证

- [ ] Preview 对象路径均以 `preview/` 开头
- [ ] `prod/` 前缀下无 Preview 产生的文件
- [ ] 签名 URL 可正常访问（TTL 内）
- [ ] `object_metadata` 集合有 fileID 映射记录

### 失败处理

如发现 `prod/` 存储被污染：
- 立即停止 Preview 部署
- 执行回滚（见 `CLOUDBASE-NOSQL-ROLLBACK.md`）
- 通知用户审查 Production 存储完整性

---

## 第 8 步：失败回滚

**目标**：当部署、启动或 smoke 验证失败时，执行回滚。

**详细步骤见**：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-ROLLBACK.md`

### 快速回滚决策树

```
部署失败（门禁 1）
  → 检查环境变量配置是否完整
  → 检查 Vercel 构建日志
  → 修复后重新部署
  → 仍失败 → 禁用 Preview Deployment（不删除环境变量）

应用启动失败（门禁 2）
  → 检查 boot 日志 fail-fast 原因
  → 验证 CloudBase 连接
  → 修复后重新部署
  → 仍失败 → 禁用 Preview Deployment

功能验证失败（门禁 3）
  → 不要合并到 main（AC-06）
  → 记录失败场景和证据
  → 通知 GPT 进行缺陷分析
  → 执行回滚（见 ROLLBACK.md）
```

**关键原则**：回滚步骤不依赖删除生产数据（AC-04）。

---

## 第 9 步：Preview 数据清理

**目标**：在 Preview 验证完成或不再需要时，清理 Preview 产生的测试数据。

### 操作

#### 9.1 数据库清理

在 CloudBase 控制台 → 数据库，对每个 `preview_*` 集合执行清空操作：
- `preview_projects`
- `preview_assets`
- `preview_versions`
- `preview_version_idempotency`
- `preview_generation_jobs`
- `preview_job_idempotency`
- `preview_auth_throttle`
- `preview_object_metadata`

或通过 API 逐项目删除（推荐，验证级联删除）：
```powershell
# 列出所有 preview 项目
curl -H "Authorization: Bearer <jwt>" https://<preview-url>/api/projects

# 逐个删除（触发级联删除）
curl -X DELETE -H "Authorization: Bearer <jwt>" https://<preview-url>/api/projects/<projectId>
```

#### 9.2 存储清理

在 CloudBase 控制台 → 存储，删除 `preview/` 前缀下的所有文件。

#### 9.3 清理验证

- [ ] 所有 `preview_*` 集合为空或已删除
- [ ] `preview/` 存储前缀下无文件
- [ ] `prod_*` 集合和 `prod/` 存储未受影响

### 注意

- 数据清理仅针对 `preview_*` 和 `preview/`，**禁止触碰** `prod_*` 和 `prod/`（AC-04）。
- 如需完全移除 Preview 部署，可在 Vercel Dashboard 禁用 Preview 分支部署（不删除环境变量，保留以便重新启用）。

---

## 第 10 步：何时可以将 `readyForPreview` 改为 `true`

**目标**：明确 `STATE.json.cloudbaseNoSqlImplement.readyForPreview` 的切换条件。

### 切换条件（全部满足）

- [ ] **GPT FIX-R4 验收通过**（`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` 状态为 `awaiting_gpt_acceptance` 且 GPT 返回 `EVIDENCE_REVIEW_PASS`）
- [ ] **Codex 限定只读审查通过**（`cloudbaseNoSqlImplement.codexStatus` 为 `PASS`）
- [ ] **本 Runbook 第 1~7 步全部通过**（3 个独立门禁：部署成功 + 应用启动成功 + 功能验证成功）
- [ ] **数据库隔离验证通过**（第 6 步）
- [ ] **Storage 隔离验证通过**（第 7 步）
- [ ] **smoke test 全部通过**（第 5 步）

### 切换操作

**由 Trae 执行**（本任务不执行，仅记录条件）：

1. 更新 `STATE.json`：
   ```json
   "cloudbaseNoSqlImplement": {
     "readyForPreview": true,
     "previewVerifiedDate": "<YYYY-MM-DD>",
     "previewVerificationRunbook": "docs/lumen-v2/deploy/CLOUDBASE-NOSQL-PREVIEW-RUNBOOK.md"
   }
   ```
2. 更新 `SESSION-HANDOFF.md` 记录切换决策。
3. 在 `DECISION-LOG.md` 追加决策记录。

### 禁止行为

- ❌ Trae 自行宣布 Preview 已验证（需 GPT 验收 + Codex 审查 + 用户执行 Runbook）
- ❌ 在 smoke test 失败时将 `readyForPreview` 改为 `true`（AC-06）
- ❌ 跳过任何门禁直接切换

---

## 附录 A：三独立门禁汇总（AC-05）

| 门禁 | 名称 | 验证步骤 | 通过条件 |
|------|------|---------|---------|
| 门禁 1 | 部署成功 | 第 4 步 | Vercel 部署 Ready + 无 boot fail-fast |
| 门禁 2 | 应用启动成功 | 第 5 步 5.1~5.3 | health/认证/Provider 脱敏正常 |
| 门禁 3 | 功能验证成功 | 第 5 步 5.4 + 第 6~7 步 | 项目创建 + DB/Storage 隔离验证 |

**三个门禁独立判定**：任一失败不得继续后续门禁，且不得合并 main（AC-06）。

---

## 附录 B：执行清单（可打印）

执行者按顺序勾选：

```
前置条件
  [ ] FIX-R4 GPT 验收通过
  [ ] Codex 限定只读审查通过
  [ ] 阅读环境变量矩阵

第 1 步：创建 Preview-only API Key
  [ ] API Key 名称含 preview 标识
  [ ] 未复用 Production API Key

第 2 步：最小权限原则
  [ ] API Key 不具备 prod_* 访问权限
  [ ] API Key 不具备环境管理员角色

第 3 步：Vercel Preview 环境变量配置
  [ ] 13 个变量全部添加
  [ ] 所有变量 Scope 为 Preview
  [ ] namespace=preview, prefix=preview/

第 4 步：首次部署检查（门禁 1：部署成功）
  [ ] Vercel 部署 Ready
  [ ] 无 boot fail-fast

第 5 步：执行 Smoke Harness（门禁 2：应用启动成功）
  [ ] /api/health 返回 ok
  [ ] 未认证返回 401
  [ ] apiKey 字段为空
  [ ] 项目创建返回 201（门禁 3：功能验证成功）

第 6 步：验证数据库隔离
  [ ] preview_* 有 smoke 数据
  [ ] prod_* 无污染

第 7 步：验证 Storage 隔离
  [ ] preview/ 前缀正确
  [ ] prod/ 无污染

第 8 步：失败回滚（仅在失败时执行）
  [ ] 参见 ROLLBACK.md

第 9 步：Preview 数据清理（验证完成后）
  [ ] preview_* 已清空
  [ ] preview/ 已清空
  [ ] prod 未受影响

第 10 步：readyForPreview 切换（由 Trae 在全部通过后执行）
  [ ] 全部门禁通过
  [ ] GPT 验收通过
  [ ] Codex 审查通过
```

---

## 更新历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-07-22 | 1.0 | 初版（LUMEN-CLOUDBASE-NOSQL-PREVIEW-DEPLOYMENT-READINESS-01） |
