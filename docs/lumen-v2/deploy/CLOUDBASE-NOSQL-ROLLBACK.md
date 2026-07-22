# CloudBase NoSQL — 回滚手册

> **任务**：LUMEN-CLOUDBASE-NOSQL-PREVIEW-DEPLOYMENT-READINESS-01
> **用途**：CloudBase NoSQL Preview 部署失败或验证不通过时的回滚操作
> **关联文件**：
> - Runbook：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-PREVIEW-RUNBOOK.md`
> - 环境变量矩阵：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-ENV-MATRIX.md`
> - 生产 flag runbook：`docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md`
> **最后更新**：2026-07-22

---

## 0. 核心原则

- **AC-04**：回滚步骤不依赖删除生产数据。所有回滚操作仅影响 Preview 资源（`preview_*` 集合、`preview/` 存储前缀、Vercel Preview Deployment）。
- **AC-06**：smoke test 失败时不得合并 main。
- **不可逆操作需用户授权**：删除 Preview API Key、清空 Preview 数据等操作需用户确认。

---

## 1. 回滚场景分类

| 场景 | 触发条件 | 回滚范围 | 影响生产 |
|------|---------|---------|---------|
| A. 部署失败 | 门禁 1 失败（Vercel 构建或 boot fail-fast） | Vercel Preview Deployment | 否 |
| B. 应用启动失败 | 门禁 2 失败（health/认证/Provider 异常） | Vercel Preview Deployment + 环境变量 | 否 |
| C. 功能验证失败 | 门禁 3 失败（项目创建/DB/Storage 异常） | Vercel Preview Deployment + Preview 数据 | 否 |
| D. 隔离失败 | Preview 数据污染 Production | 立即停止 Preview + 审查 Production | ⚠️ 需审查 |
| E. 代码层回滚 | 合并后发现 regression | Git revert + 重新部署 | 取决于是否已合并 |

---

## 2. 场景 A：部署失败回滚

### 触发条件

- Vercel Preview 部署状态为 Error
- 部署日志出现 `CLOUDBASE_CONFIG_REQUIRED`、`PERSISTENCE_BACKEND_REQUIRED` 等 fail-fast 错误

### 回滚步骤

1. **不要重新推送代码**（先诊断原因）。
2. 检查 Vercel 部署日志，定位 fail-fast 原因：
   - `CLOUDBASE_CONFIG_REQUIRED` → 环境变量缺失，回到 RUNBOOK 第 3 步补全
   - `PERSISTENCE_BACKEND_REQUIRED` → `PERSISTENCE_BACKEND` 未设置或值非法
   - `AUTH_PASSWORD_TOO_SHORT` → 密码不满足 D-034 强度要求
3. 修复环境变量配置后，Vercel 会自动重新部署（如配置了自动部署）。
4. 如需手动触发：Vercel Dashboard → Deployments → 找到失败的部署 → Redeploy。

### 验证

- [ ] 部署日志无 fail-fast 错误
- [ ] 部署状态为 Ready
- [ ] 无 Production 数据被访问或修改

---

## 3. 场景 B：应用启动失败回滚

### 触发条件

- 部署成功（门禁 1 通过）但应用无法正常响应
- `/api/health` 不返回 `{"status":"ok"}`
- 认证边界异常（如未认证请求不返回 401）

### 回滚步骤

1. **禁用 Preview Deployment**（不影响 Production）：
   - Vercel Dashboard → Project → Settings → Domains → 找到 Preview 域名 → Disable（或删除 Preview 域名绑定）
   - **不要删除环境变量**（保留以便诊断和重新启用）

2. 检查 Vercel Function Logs：
   - 进入 Vercel Dashboard → Project → Logs → 选择 Preview Deployment
   - 过滤 `Error` 级别日志
   - 排查 CloudBase 连接问题（envId 错误、API Key 无效、网络超时）

3. 诊断 CloudBase 连接：
   - 确认 `CLOUDBASE_ENV_ID` 正确
   - 确认 `CLOUDBASE_API_KEY` 有效（未过期、未禁用）
   - 确认 `CLOUDBASE_DATA_NAMESPACE` 和 `CLOUDBASE_STORAGE_PREFIX` 非空

4. 修复后重新启用 Preview Deployment。

### 验证

- [ ] Preview 域名返回 503 或维护页（禁用后）
- [ ] Production 部署不受影响
- [ ] 无 Production 环境变量被修改

---

## 4. 场景 C：功能验证失败回滚

### 触发条件

- smoke test 失败（项目创建 API 返回非 201）
- Provider 调用失败
- **AC-06**：smoke test 失败时不得合并 main

### 回滚步骤

1. **立即停止合并流程**：
   - 不要创建 PR 合并 NoSQL 分支到 main
   - 不要执行 `git merge` 或 `git push` 到 main

2. **记录失败证据**：
   - 截图 smoke test 失败的 HTTP 响应
   - 保存 Vercel Function Logs 中的错误日志
   - 在 `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/` 下记录失败场景

3. **通知 GPT 进行缺陷分析**：
   - 将失败证据提交给 GPT
   - GPT 输出缺陷分析到 `docs/lumen-v2/reviews/`
   - 等待 GPT 指示是否需要新的 FIX 轮次

4. **清理 Preview 测试数据**（见 RUNBOOK 第 9 步）：
   - 清空 `preview_*` 集合
   - 删除 `preview/` 存储前缀下的文件
   - **禁止触碰** `prod_*` 或 `prod/`

5. **禁用 Preview Deployment**（可选）：
   - 如需完全停止 Preview，按场景 B 第 1 步操作

### 验证

- [ ] NoSQL 分支未合并到 main
- [ ] 失败证据已记录
- [ ] GPT 已收到缺陷分析请求
- [ ] Preview 测试数据已清理
- [ ] Production 数据未受影响

---

## 5. 场景 D：隔离失败回滚（紧急）

### 触发条件

- Preview 部署的写入操作出现在 `prod_*` 集合中
- Preview 部署的文件上传出现在 `prod/` 存储前缀下
- 第 6 步或第 7 步验证发现 Production 数据被污染

### 紧急回滚步骤

1. **立即禁用 Preview Deployment**：
   - Vercel Dashboard → Project → Settings → Domains → Disable Preview 域名

2. **吊销 Preview API Key**：
   - CloudBase 控制台 → 安全设置 → API Key 管理 → 找到 `lumen-preview-nosql` → 禁用或删除

3. **审查 Production 数据完整性**：
   - 检查 `prod_*` 集合是否有异常文档（按 `createdAt` 时间戳过滤 Preview 部署时段）
   - 检查 `prod/` 存储前缀是否有异常文件（按上传时间过滤）
   - 如发现污染数据，由用户决定是否手动清理（**不在本手册提供自动清理步骤，避免误删生产数据**）

4. **根因分析**：
   - 检查 `CLOUDBASE_DATA_NAMESPACE` 是否误设为 `prod`
   - 检查 `CLOUDBASE_STORAGE_PREFIX` 是否误设为 `prod/`
   - 检查 Preview API Key 权限是否过宽（是否授予了 `prod_*` 访问权限）
   - 记录根因到 `docs/lumen-v2/state/DECISION-LOG.md`

5. **修复后重新部署**：
   - 修正环境变量配置
   - 创建新的 Preview-only API Key（旧 Key 已吊销）
   - 重新执行 RUNBOOK 第 1~7 步

### 验证

- [ ] Preview Deployment 已禁用
- [ ] Preview API Key 已吊销
- [ ] Production 数据完整性已审查
- [ ] 根因已记录
- [ ] 用户已确认是否需要手动清理 Production 数据

### 注意

- 此场景是唯一可能影响 Production 的场景。
- **禁止**自动清理 `prod_*` 或 `prod/` 数据；必须由用户逐条确认后手动删除。
- **禁止**在生产环境执行批量删除操作。

---

## 6. 场景 E：代码层回滚（Git Revert）

### 触发条件

- NoSQL 修复已合并到 main 但发现严重 regression
- 需要回退 main 上的 NoSQL 相关 commit

### 回滚步骤

> **注意**：本场景假设 NoSQL 分支已合并到 main。在 `readyForPreview` 切换前，NoSQL 分支不应合并到 main。

1. 确认 main 分支最新 commit hash。
2. 识别需要 revert 的 NoSQL commit（可能是 merge commit 或直接 commit）。
3. 执行 revert：
   ```powershell
   git revert <commit-hash> -m 1  # 如果是 merge commit
   # 或
   git revert <commit-hash>        # 如果是直接 commit
   ```
4. 推送 revert commit 到 main：
   ```powershell
   git push origin main
   ```
   Vercel 自动重新部署 Production。
5. 在 `docs/lumen-v2/state/DECISION-LOG.md` 记录 revert 决策。
6. 通知用户和 GPT。

### 验证

- [ ] revert commit 已推送到 main
- [ ] Vercel Production 重新部署完成
- [ ] Production 功能正常（`/api/health` 返回 ok）
- [ ] DECISION-LOG 已记录

### 禁止行为

- ❌ `git push --force` 到 main（AGENTS.md 第 5 节）
- ❌ 在未通知用户的情况下执行 revert

---

## 7. 回滚后环境变量处理

| 回滚场景 | 环境变量处理 | 理由 |
|---------|-------------|------|
| A（部署失败） | 保留，修复后重新部署 | 诊断需要 |
| B（启动失败） | 保留，禁用 Preview 域名 | 诊断后可能重新启用 |
| C（功能验证失败） | 保留，清理 Preview 数据 | 等待 GPT 缺陷分析 |
| D（隔离失败） | **吊销 Preview API Key**，其他保留 | 防止继续污染 |
| E（代码层回滚） | 不涉及 Preview 变量 | Production 环境变量独立 |

---

## 8. 不可逆操作清单

以下操作不可逆，执行前必须获得用户明确授权：

- 删除 Preview API Key（CloudBase 控制台）
- 清空 `preview_*` 数据库集合
- 删除 `preview/` 存储前缀下的文件
- Git revert main 分支
- 删除 Vercel 项目（**禁止**——会丢失所有环境变量和部署历史）

---

## 9. 三个独立门禁与回滚关系（AC-05）

| 门禁 | 失败时回滚场景 | 是否可继续后续门禁 | 是否可合并 main |
|------|--------------|------------------|---------------|
| 门禁 1：部署成功 | 场景 A | ❌ 否 | ❌ 否 |
| 门禁 2：应用启动成功 | 场景 B | ❌ 否 | ❌ 否 |
| 门禁 3：功能验证成功 | 场景 C | ❌ 否 | ❌ 否 |

**AC-06 强制规则**：任一门禁失败 = smoke test 失败 = 不得合并 main。

---

## 更新历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-07-22 | 1.0 | 初版（LUMEN-CLOUDBASE-NOSQL-PREVIEW-DEPLOYMENT-READINESS-01） |
