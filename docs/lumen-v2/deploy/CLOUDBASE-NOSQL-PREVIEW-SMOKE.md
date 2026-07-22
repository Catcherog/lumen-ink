# CloudBase NoSQL — Preview Smoke Harness 操作手册

> **任务**：LUMEN-CLOUDBASE-NOSQL-PREVIEW-SMOKE-HARNESS-01
> **用途**：冻结 CloudBase NoSQL Preview namespace 真实冒烟测试工具的执行步骤、输出格式、安全模型和故障排查路径，使 FIX-R4 GPT 验收后可立即执行真实 CloudBase 验证，无需临时编写脚本
> **前置条件**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` FIX-R4 GPT 验收通过 + Codex 限定只读审查通过
> **关联文件**：
> - 冒烟脚本：`src/server/scripts/cloudbase-nosql-preview-smoke.ts`
> - 环境变量模板：`/.env.cloudbase-nosql.preview.example`
> - 环境变量矩阵：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-ENV-MATRIX.md`
> - Preview Runbook：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-PREVIEW-RUNBOOK.md`
> - 回滚手册：`docs/lumen-v2/deploy/CLOUDBASE-NOSQL-ROLLBACK.md`
> **最后更新**：2026-07-22
> **执行者**：用户（操作员）；Trae 不执行任何真实 CloudBase 调用或凭据配置

---

## 0. 适用范围与禁止行为

### 适用范围
本文档仅描述 `cloudbase-nosql-preview-smoke.ts` 冒烟测试工具的使用方式。该工具直接调用真实 CloudBase NoSQL adapter（`src/server/infrastructure/persistence/cloudbase.nosql.ts`），对独立 Preview namespace 执行真实读写。

### 禁止行为
- ❌ 在 Production 环境运行本工具（`ALLOW_CLOUDBASE_PREVIEW_SMOKE=true` 在 Production 禁止设置）
- ❌ 复用 Production API Key 执行本工具
- ❌ 在 `CLOUDBASE_DATA_NAMESPACE` 或 `CLOUDBASE_STORAGE_PREFIX` 含 `prod` 时运行
- ❌ 在 SMOKE_RUN_ID 缺失时运行
- ❌ 在 FIX-R4 GPT 验收通过前运行
- ❌ 修改 `STATE.json`（AC-08）
- ❌ 修改任何生产代码、服务代码、测试文件（AC-08）

---

## 1. 前置条件

执行本工具前必须确认以下条件全部满足：

- [ ] `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01` FIX-R4 已通过 GPT 证据验收
- [ ] Codex 限定只读审查已通过
- [ ] 已阅读 `CLOUDBASE-NOSQL-ENV-MATRIX.md` 和 `CLOUDBASE-NOSQL-PREVIEW-RUNBOOK.md`
- [ ] 已按 RUNBOOK 第 1 步创建 Preview-only API Key
- [ ] 已按 RUNBOOK 第 2 步完成 API Key 最小权限配置
- [ ] 已在本地终端准备好以下环境变量（不写入任何文件）：
  - `ALLOW_CLOUDBASE_PREVIEW_SMOKE=true`
  - `SMOKE_RUN_ID=<YYYYMMDD-HHMM>`（唯一运行标识，用于追踪和清理）
  - `CLOUDBASE_ENV_ID=<Preview 环境 ID>`
  - `CLOUDBASE_API_KEY=<Preview-only API Key>`
  - `CLOUDBASE_DATA_NAMESPACE=preview`
  - `CLOUDBASE_STORAGE_PREFIX=preview/`
  - `CLOUDBASE_SIGNED_URL_TTL_SECONDS=900`（可选）

---

## 2. 执行命令

### 2.1 PowerShell（推荐）

```powershell
$env:ALLOW_CLOUDBASE_PREVIEW_SMOKE = "true"
$env:SMOKE_RUN_ID = "20260722-1430"
$env:CLOUDBASE_ENV_ID = "<Preview 环境 ID>"
$env:CLOUDBASE_API_KEY = "<Preview-only API Key>"
$env:CLOUDBASE_DATA_NAMESPACE = "preview"
$env:CLOUDBASE_STORAGE_PREFIX = "preview/"
$env:CLOUDBASE_SIGNED_URL_TTL_SECONDS = "900"

npx tsx src/server/scripts/cloudbase-nosql-preview-smoke.ts
```

### 2.2 Bash / WSL

```bash
ALLOW_CLOUDBASE_PREVIEW_SMOKE=true \
SMOKE_RUN_ID=20260722-1430 \
CLOUDBASE_ENV_ID=<Preview 环境 ID> \
CLOUDBASE_API_KEY=<Preview-only API Key> \
CLOUDBASE_DATA_NAMESPACE=preview \
CLOUDBASE_STORAGE_PREFIX=preview/ \
CLOUDBASE_SIGNED_URL_TTL_SECONDS=900 \
npx tsx src/server/scripts/cloudbase-nosql-preview-smoke.ts
```

### 2.3 从 .env 文件加载（可选）

如使用 `.env.cloudbase-nosql.preview.local`（**禁止提交到仓库**）：

```powershell
# 手动 source，禁止使用 dotenv 库（避免污染 Vercel 部署）
Get-Content .env.cloudbase-nosql.preview.local | ForEach-Object {
    if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$') {
        Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
    }
}
$env:SMOKE_RUN_ID = "20260722-1430"

npx tsx src/server/scripts/cloudbase-nosql-preview-smoke.ts
```

### 2.4 退出码

| 退出码 | 含义 | 是否需要后续动作 |
|--------|------|------------------|
| `0` | `pass`（全部步骤通过）或 `skipped`（gate 未开，AC-01 默认 no-write） | 无 |
| `1` | `fail`（任一步骤失败或清理失败） | 检查报告 `steps[].error` 与 `cleanupFailures`，必要时手动清理 |
| `2` | `blocked`（gate 开启但配置错误：缺 namespace/prefix/runId，或含 `prod`） | 修正配置后重试 |

---

## 3. 9 步流程详解

脚本按以下顺序执行 9 个步骤，对应任务 In Scope 中的 9 项覆盖点。每步成功记录 `pass`，失败记录 `fail` + 脱敏错误；失败后进入清理阶段。

### Step 1：配置 fail-closed（`config-fail-closed`）
**对应任务项**：1. 配置 fail-closed

- 检查 `ALLOW_CLOUDBASE_PREVIEW_SMOKE === 'true'`（AC-01 / AC-02）
- 检查 `SMOKE_RUN_ID` 非空
- 检查 `CLOUDBASE_ENV_ID`、`CLOUDBASE_API_KEY`、`CLOUDBASE_DATA_NAMESPACE`、`CLOUDBASE_STORAGE_PREFIX` 全部非空
- 检查 namespace 和 storage prefix 不含 `prod`（Safety Requirements）
- 失败时返回 `blocked` 报告，退出码 2，**不进行任何网络调用**

### Step 2：namespace/prefix 安全复查（`namespace-prefix-safety`）
**对应任务项**：2. Preview namespace/prefix 安全检查

- 在 adapter 构造前再次显式检查 namespace 与 prefix 不含 `prod`
- 双重防御：避免依赖单一检查点

### Step 3：SDK 初始化（`sdk-init-ensureReady`）⚠️ 首次网络调用
**对应任务项**：（adapter 内部 lazy init，非任务列出的 9 项之一，但必要）

- 调用 `deps.ensureReady()`
- 触发 `@cloudbase/node-sdk` 动态 `import()`（AC-07：无凭据时 TypeScript 编译通过，模块加载不发包）
- CloudBase `tcb.init()` 在此发生
- **abortOnFail**：失败则直接进入清理阶段，不执行后续写入步骤
- **Test Matrix**：「SDK 初始化失败」在此处理

### Step 4：Project 创建与读取（`project-create-read`）
**对应任务项**：3. Project 创建与读取

- 创建 `_id = smoke-${smokeRunId}-proj` 的项目（AC-03 唯一 smokeRunId 标识）
- 立即 `projects.get(projectId)` 验证可读
- 验证返回 id 与写入 id 一致
- **Test Matrix**：「中途 DB 写入失败」可在此发生

### Step 5：Asset / Version 创建与读取（`asset-version-create-read`）
**对应任务项**：4. Asset / Version 创建与读取

- 创建 `_id = smoke-${smokeRunId}-asset` 的 Asset，关联到 Step 4 创建的 Project
- Asset 的 storageKey = `smoke/${smokeRunId}/asset.bin`（落在 Preview prefix 下）
- 调用 `versions.createIdempotent(projectId, 'v1-${smokeRunId}', versionEntity)` 验证幂等创建路径
- `versions.get(versionId)` 验证可读

### Step 6：Job 幂等性顺序调用验证（`job-idempotency-sequential`）
**对应任务项**：5. Job idempotency 顺序调用验证

- 第一次 `jobs.createIdempotent({ idempotencyKey: 'smoke-${smokeRunId}-idem', ... })` → `created: true`
- 第二次用相同 `idempotencyKey` 调用 → `created: false`，且返回的 `job.id` 与第一次相同
- 验证 CloudBase `runTransaction` 内的确定性 `_id = ${projectId}__${key}` 原子预留（NOSQL-R2-03）

### Step 7：ObjectStore put/get/delete（`objectstore-put-get-delete`）
**对应任务项**：6. ObjectStore put/get/delete

- `objects.put('smoke/${smokeRunId}/os-test.bin', payload)` → 触发 CloudBase `uploadFile` + `object_metadata` 记录写入（NOSQL-R2-04）
- `objects.get(key)` → 触发 `object_metadata` 查询 + `downloadFile`，验证字节级 round-trip
- `objects.exists(key)` → 必须返回 `true`
- `objects.delete(key)` → 触发 `deleteFile` + `object_metadata` 删除
- 再次 `objects.exists(key)` → 必须返回 `false`
- 成功后清除 `state.objectStoreKey`，清理阶段跳过该对象
- **Test Matrix**：「Storage 删除失败」可在此发生（如 CloudBase 权限不足）

### Step 8：Project 级联删除（`project-delete-cascade`）
**对应任务项**：7. Project 删除

- `projects.deleteCascade(projectId)` 删除 Project 元数据 + 关联 Asset/Version/Job/idempotency 记录（NOSQL-R2-05：DB 元数据级联，100 操作限制 fail-closed）
- Storage 清理由 `ProjectService.deleteProject()` 在服务层负责，本 smoke 不触发服务层；Step 7 已单独验证 Storage 删除
- 验证 `projects.get(projectId)` 返回 `null`
- 成功后清除 `state.projectId`，清理阶段跳过 DB 级联删除

### Step 9：测试数据最终清理（`cleanup`）
**对应任务项**：8. 测试数据最终清理

- 在 `finally` 块中执行，**无论成功或失败都执行**（AC-04）
- **第一轮**：删除仍存在的 Storage 对象 + 对仍存在的 Project 执行 `deleteCascade`
- **第二轮（幂等性验证）**：对曾创建的 Project 再次 `deleteCascade`，验证「二次清理保持幂等」（Test Matrix）
- 清理失败不静默吞掉，记录到 `cleanupFailures[]`（AC-05）
- 「already gone」类错误（`OBJECT_NOT_FOUND` / `NOT_FOUND` / `updated: 0`）视为幂等成功，不记录为失败
- 最后调用 `deps.close()` 释放 SDK 资源；失败同样记录到 `cleanupFailures`

---

## 4. 输出报告 schema

脚本在 stdout 输出一个 JSON 对象（缩进 2 空格）。该对象是脱敏的（AC-06）。

### 4.1 完整 schema

```typescript
interface SmokeReport {
  smokeRunId: string | null;          // 本次运行 ID；skipped/blocked 时为 null
  namespace: string | null;           // CLOUDBASE_DATA_NAMESPACE（非密钥）
  storagePrefix: string | null;        // CLOUDBASE_STORAGE_PREFIX（非密钥）
  envIdMasked: string | null;          // 截断的 envId（如 "zeh-d7***"）
  startedAt: string;                   // ISO 8601 起始时间
  finishedAt: string | null;           // ISO 8601 结束时间
  overall: 'pass' | 'fail' | 'blocked' | 'skipped';
  blockReason: string | null;         // 仅 blocked/skipped 时非空
  steps: Array<{
    step: number;                      // 1~9
    name: string;
    status: 'pass' | 'fail' | 'skip';
    durationMs?: number;
    error?: string;                    // 脱敏后的错误消息（仅 fail 时）
  }>;
  cleanupFailures: Array<{
    target: string;                    // 如 "objects.delete(smoke/.../os-test.bin)"
    error: string;                     // 脱敏后的错误消息
  }>;
  redacted: true;                      // 标记位：报告已脱敏
}
```

### 4.2 脱敏规则（AC-06）

`redactError()` 按以下顺序脱敏，截断为 600 字符：

1. 字面 `apiKey`（精确匹配）→ `***API_KEY_REDACTED***`
2. `Bearer <token>` → `Bearer ***REDACTED***`
3. JWT（`eyJ...`）→ `***JWT_REDACTED***`
4. AKID 前缀的腾讯云密钥 ID → `***AKID_REDACTED***`
5. CloudBase fileID 中的长标识符段 → `***REDACTED***`
6. 任意 40+ 字符的连续 token → `***REDACTED***`

### 4.3 输出示例

**skipped（gate 未开，AC-01 默认 no-write）**：
```json
{
  "smokeRunId": null,
  "namespace": null,
  "storagePrefix": null,
  "envIdMasked": null,
  "startedAt": "2026-07-22T06:30:00.000Z",
  "finishedAt": "2026-07-22T06:30:00.001Z",
  "overall": "skipped",
  "blockReason": "ALLOW_CLOUDBASE_PREVIEW_SMOKE is not \"true\"; smoke harness defaults to no-write.",
  "steps": [{ "step": 1, "name": "config-fail-closed", "status": "skip" }],
  "cleanupFailures": [],
  "redacted": true
}
```

**blocked（配置错误）**：
```json
{
  "smokeRunId": null,
  "namespace": null,
  "overall": "blocked",
  "blockReason": "CLOUDBASE_DATA_NAMESPACE \"prod\" contains \"prod\"; refusing to target production.",
  "steps": [{ "step": 1, "name": "config-fail-closed", "status": "fail", "error": "..." }],
  "cleanupFailures": [],
  "redacted": true
}
```

**pass（全流程成功）**：
```json
{
  "smokeRunId": "20260722-1430",
  "namespace": "preview",
  "storagePrefix": "preview/",
  "envIdMasked": "zeh-d7***",
  "startedAt": "2026-07-22T06:30:00.000Z",
  "finishedAt": "2026-07-22T06:30:12.345Z",
  "overall": "pass",
  "blockReason": null,
  "steps": [
    { "step": 1, "name": "config-fail-closed", "status": "pass" },
    { "step": 2, "name": "namespace-prefix-safety", "status": "pass", "durationMs": 0 },
    { "step": 3, "name": "sdk-init-ensureReady", "status": "pass", "durationMs": 423 },
    { "step": 4, "name": "project-create-read", "status": "pass", "durationMs": 580 },
    { "step": 5, "name": "asset-version-create-read", "status": "pass", "durationMs": 712 },
    { "step": 6, "name": "job-idempotency-sequential", "status": "pass", "durationMs": 645 },
    { "step": 7, "name": "objectstore-put-get-delete", "status": "pass", "durationMs": 1287 },
    { "step": 8, "name": "project-delete-cascade", "status": "pass", "durationMs": 498 }
  ],
  "cleanupFailures": [],
  "redacted": true
}
```

---

## 5. Test Matrix 映射

任务列出的 9 个测试矩阵全部由脚本或本手册覆盖：

| # | 测试矩阵 | 触发方式 | 期望行为 | 验证位置 |
|---|---------|---------|---------|---------|
| 1 | 缺少 Preview 开关 | 不设 `ALLOW_CLOUDBASE_PREVIEW_SMOKE` 或设为非 `true` | `overall: skipped`，退出码 0，无网络调用 | `resolveConfig()` 第 1 分支 |
| 2 | 缺少 namespace | gate 开启但 `CLOUDBASE_DATA_NAMESPACE` 为空 | `overall: blocked`，退出码 2，无网络调用 | `resolveConfig()` 第 2 分支 |
| 3 | namespace 含 prod | `CLOUDBASE_DATA_NAMESPACE=prod-anything` | `overall: blocked`，退出码 2，无网络调用 | `resolveConfig()` 第 3 分支 |
| 4 | storage prefix 含 prod | `CLOUDBASE_STORAGE_PREFIX=prod/anything` | `overall: blocked`，退出码 2，无网络调用 | `resolveConfig()` 第 4 分支 |
| 5 | SDK 初始化失败 | 提供无效 envId 或 API Key | Step 3 `fail`，abortOnFail 触发清理，退出码 1 | Step 3 + cleanup |
| 6 | 中途 DB 写入失败 | CloudBase 权限不足或集合不存在 | Step 4/5/6/8 `fail`，进入清理，退出码 1 | 对应 Step + cleanup |
| 7 | Storage 删除失败 | CloudBase Storage 权限不足 | Step 7 `fail` 或 cleanup 记录 `cleanupFailures`，退出码 1 | Step 7 + `cleanupFailures` |
| 8 | 全流程成功 | 全部配置正确且权限完整 | `overall: pass`，退出码 0，`cleanupFailures: []` | 全部 Step + cleanup |
| 9 | 二次清理保持幂等 | 在首次运行后再次运行同一 `SMOKE_RUN_ID` | 第二轮 cleanup 对已删除对象不抛错（`isAlreadyGone` 命中），`cleanupFailures: []` | `runCleanup()` 第二轮 |

> **操作建议**：矩阵 1~4 可在本地无凭据环境下运行验证 fail-closed 行为；矩阵 5~9 需在 Preview 凭据就绪后运行。

---

## 6. 安全模型

### 6.1 AC 映射

| AC | 要求 | 实现位置 |
|----|------|---------|
| AC-01 | 默认不运行真实写操作 | `resolveConfig()`：`ALLOW_CLOUDBASE_PREVIEW_SMOKE !== 'true'` → `skipped`，退出码 0 |
| AC-02 | 只有显式 Preview 开关存在时才运行 | 同上；非 `true` 值（如 `false`、空、未设）一律 `skipped` |
| AC-03 | 所有创建记录均带唯一 `smokeRunId` | Step 4~7 中所有 `_id`、`storageKey`、`prompt`、`label` 均嵌入 `smokeRunId` |
| AC-04 | 成功与失败路径均尝试清理 | `runSmoke()` 的 `finally` 块无条件调用 `runCleanup()` |
| AC-05 | 清理失败以 `cleanupFailures` 返回 | `runCleanup()` 将异常 push 到 `cleanupFailures`，不 `throw` |
| AC-06 | 输出报告仅包含 namespace、步骤、结果、脱敏错误 | `SmokeReport` schema + `redactError()`；`redacted: true` 标记 |
| AC-07 | 无凭据时可 TypeScript 编译，不发包 | `@cloudbase/node-sdk` 在 `ensureReady()` 内动态 `import()`；模块加载不发包 |
| AC-08 | 不修改现有生产代码、服务代码、测试文件、状态文件 | 仅新增 2 个文件；git diff 无其他改动 |

### 6.2 凭据保护

脚本运行时凭据仅在内存中存在，**禁止**：

- ❌ 将 `CLOUDBASE_API_KEY` 写入任何文件
- ❌ 将报告中的 `redacted: true` 字段篡改为 `false`
- ❌ 将脚本输出重定向到包含完整 API Key 的日志文件（脚本已脱敏，但请避免额外日志）
- ❌ 在终端共享屏幕时执行（API Key 通过 `$env:` 设置时会短暂出现在终端历史中，建议执行后 `Clear-History`）

### 6.3 namespace / prefix 保护

`resolveConfig()` 和 Step 2 双重检查：

- namespace 含 `prod`（不区分大小写）→ 拒绝
- storagePrefix 含 `prod` → 拒绝
- namespace 为空 → 拒绝
- storagePrefix 为空 → 拒绝

---

## 7. 清理行为详解

### 7.1 清理顺序

```
finally {
  runCleanup(deps, state, apiKey, cleanupFailures)
    ↓
  第一轮：删除 state.objectStoreKey 指向的 Storage 对象
    ↓
  第一轮：删除 state.assetStorageKey 指向的 Asset Storage 对象
    ↓
  第一轮：若 state.projectId 非空，执行 projects.deleteCascade(projectId)
    ↓
  第二轮（幂等性验证）：对曾创建的 projectId 再次 deleteCascade
    ↓
  deps.close()
}
```

### 7.2 「already gone」识别

以下错误视为幂等成功，**不**记入 `cleanupFailures`：

- `OBJECT_NOT_FOUND`
- `PROJECT_NOT_FOUND`
- `NOT_FOUND`（通用）
- `updated: 0`
- `deleted: 0`

其他错误一律记入 `cleanupFailures`，不静默吞掉（AC-05）。

### 7.3 手动清理

如脚本因 SDK 初始化失败（Step 3）未能进入主流程，但已部分写入 CloudBase 数据，需手动清理：

```powershell
# 在 CloudBase 控制台手动删除 preview_projects 等集合中以 smoke-<SMOKE_RUN_ID>- 开头的文档
# 或使用 tcb-cli：
tcb fn call delete-smoke-records --data '{"runId":"20260722-1430"}'
```

> **注意**：手动清理脚本不在本工具范围内。如需重复执行，使用相同 `SMOKE_RUN_ID` 即可依赖第二轮幂等性验证安全重跑。

---

## 8. 故障排查

### 8.1 Step 3 `sdk-init-ensureReady` 失败

**典型错误（脱敏后）**：
- `INVALID_ENV_ID` → envId 不存在或拼写错误
- `INVALID_API_KEY` → API Key 无效或已过期
- `PERMISSION_DENIED` → API Key 权限不足（见 RUNBOOK 第 2 步）
- `NETWORK_TIMEOUT` → 本地网络问题或 VPN 未开

**排查**：
1. 确认 `CLOUDBASE_ENV_ID` 在 CloudBase 控制台存在
2. 确认 API Key 名称含 `preview` 标识，未复用 Production Key
3. 确认本地可访问 CloudBase（必要时开启 VPN，代理端口 7890）
4. 在 CloudBase 控制台 → API Key 管理确认 Key 未被禁用

### 8.2 Step 6 `job-idempotency-sequential` 失败

**典型错误**：
- `SECOND_CREATE_RETURNED_CREATED (idempotency broken)` → CloudBase 事务未正确预留幂等记录
- `IDEMPOTENT_JOB_MISMATCH` → 第二次返回的 job.id 与第一次不同

**排查**：
1. 检查 CloudBase 是否对 `preview_job_idempotency` 集合启用了唯一索引（`_id`）
2. 检查 adapter `idempotencyDocId(projectId, key)` 是否生成确定性 `_id`
3. 如之前运行残留了同 idempotencyKey 的记录，使用相同 `SMOKE_RUN_ID` 重跑即可触发幂等路径

### 8.3 `cleanupFailures` 非空

**典型错误**：
- `objects.delete(smoke/...)` → `PERMISSION_DENIED`：API Key 缺少 Storage 删除权限
- `projects.deleteCascade(...)` → `TX_OP_LIMIT_EXCEEDED`：Project 关联记录超过 100 条（CLOUDBASE_TX_OP_LIMIT）

**处理**：
1. **不**将 `cleanupFailures` 视为可忽略；它代表 CloudBase 中存在残留数据
2. 在 CloudBase 控制台手动删除对应 `preview_*` 集合中以 `smoke-<SMOKE_RUN_ID>-` 开头的文档
3. 修正 API Key 权限后用相同 `SMOKE_RUN_ID` 重跑（第二轮幂等性验证会清理残留）
4. 如 `TX_OP_LIMIT_EXCEEDED`，说明 Project 关联记录异常多，需检查 Step 4~6 是否重复写入

### 8.4 退出码 2（blocked）

按 `blockReason` 修正：
- `SMOKE_RUN_ID is missing or empty` → 设置 `SMOKE_RUN_ID` 环境变量
- `CLOUDBASE_* is missing or empty` → 补齐对应环境变量
- `contains "prod"` → 将 namespace/prefix 改为 `preview` / `preview/`

---

## 9. 与 Runbook 的关系

| Runbook 步骤 | 本工具角色 |
|--------------|-----------|
| 第 1 步：创建 Preview-only API Key | 本工具消费该 Key |
| 第 2 步：最小权限原则 | 本工具依赖权限正确配置 |
| 第 3 步：Vercel 环境变量配置 | 本工具不依赖 Vercel；本地运行 |
| 第 4 步：首次部署检查（门禁 1） | 本工具不验证部署；在部署成功后运行 |
| 第 5 步：执行 Smoke Harness | **本工具是该步骤的可执行实现**；Runbook 5.1~5.4 是 HTTP 级 smoke，本工具是 adapter 级 smoke，两者互补 |
| 第 6 步：数据库隔离验证 | 本工具的 Step 2 + 创建的 `preview_*` 记录辅助验证 |
| 第 7 步：Storage 隔离验证 | 本工具的 Step 7 验证 `preview/` prefix 写入 |
| 第 8 步：失败回滚 | 本工具失败时按 ROLLBACK.md 处理 |
| 第 9 步：Preview 数据清理 | 本工具自带清理（Step 9）；如清理失败需手动补齐 |

---

## 10. 审计范围合规性

本任务（LUMEN-CLOUDBASE-NOSQL-PREVIEW-SMOKE-HARNESS-01）的审计范围：

### 10.1 仅新增文件
- ✅ `src/server/scripts/cloudbase-nosql-preview-smoke.ts`
- ✅ `docs/lumen-v2/deploy/CLOUDBASE-NOSQL-PREVIEW-SMOKE.md`（本文件）

### 10.2 禁止修改的文件（AC-08）
- ❌ `src/server/infrastructure/persistence/cloudbase.nosql.ts`
- ❌ `src/server/infrastructure/persistence/cloudbase.nosql.mock.ts`
- ❌ `src/server/infrastructure/persistence/select.ts`
- ❌ `src/server/domain/persistence.ts`
- ❌ 任何 `*.test.ts` 文件
- ❌ 任何服务代码（`src/server/services/**`）
- ❌ `docs/lumen-v2/state/STATE.json`
- ❌ `docs/lumen-v2/state/PROJECT-MEMORY.md`
- ❌ `docs/lumen-v2/state/DECISION-LOG.md`
- ❌ `docs/lumen-v2/state/SESSION-HANDOFF.md`

### 10.3 安全扫描
提交前必须通过：
```powershell
node scripts/check-lumen-collab.mjs
```
扫描应确认：
- 无 API Key 字面值
- 无 JWT 字符串
- 无 AKID 前缀
- 无 `cloud://` 完整 fileID
- 无 Production 配置（`prod` namespace、`prod/` prefix）
- 无 `ALLOW_CLOUDBASE_PREVIEW_SMOKE=true` 以外的 Preview gate 值（仅作为示例值允许）

---

## 更新历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-07-22 | 1.0 | 初版（LUMEN-CLOUDBASE-NOSQL-PREVIEW-SMOKE-HARNESS-01） |
