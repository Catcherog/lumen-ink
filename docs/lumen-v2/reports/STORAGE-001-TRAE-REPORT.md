# STORAGE-001 Trae Implementation Report

> 任务：STORAGE-001 持久化与任务基础设施技术选型
> 报告日期：2026-07-18
> 报告作者：Trae
> 分支：`lumen/storage-001-trae`
> 状态推进：`ready_for_trae / nextActor=trae` → `awaiting_user_decision / nextActor=user`
> 冻结声明：**未冻结**。本报告不写 `decision: frozen`。GPT/用户冻结后由 STATE.json 激活 PERSIST-001。

## 1. 执行摘要

STORAGE-001 在 `lumen/storage-001-trae` 分支连续执行 3 个子任务，产出两套完整候选方案、固定权重评分矩阵、本地 PoC、稳定接口契约与合约测试，全部 8 条门禁通过。推荐方案为 **Vercel + Cloudflare R2 + Vercel Workflow**，但需要用户决策账号注册、Vercel Pro 升级、月度预算和不可逆迁移审批；因此 `account_gate: user`、`decision_authority: user`，状态推进至 `awaiting_user_decision / nextActor=user`。PERSIST-001 继续阻塞，未实施任何生产代码改动。

## 2. 提交记录

| 顺序 | Commit | 说明 | 文件数 |
|------|--------|------|--------|
| 0 | `37c381d` | `docs(lumen-v2): accept FLOW-001 and start internal fast track` | 17 (+2170/-81) |
| 1 | `d59abbd` | `docs(lumen-v2): STORAGE-001 compare two complete stacks` | 2 (+549) |
| 2 | `13342b0` | `feat(lumen-v2): STORAGE-001 persistence contract PoC` | 7 (+937) |

分支：`lumen/storage-001-trae`（基于 `lumen/flow-001-trae`）。
累计：26 文件变更，+3656/-81。

## 3. 范围遵守

按用户指示与 INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md Task 0—3 执行：

- ✅ 仅执行 STORAGE-001，未启动 PERSIST-001。
- ✅ 严格保留工作区无关修改：使用精确 `git add <path>`，未触及相关未提交文件（`.gitignore`、`AGENTS.md`、`docs/ai/*` 等）。
- ✅ 非必要 S2/S3 登记到 `docs/lumen-v2/FAST-TRACK-DEFERRED.md`（本轮无新增延期项；既有 6 项延期项保持不变）。
- ✅ STORAGE 未经 GPT/用户冻结，未启动 PERSIST-001，未修改生产 Provider/存储实现。
- ✅ 未写 `decision: frozen`。

## 4. 候选方案对比（详见 `docs/lumen-v2/storage-options.md`）

### 4.1 硬条件筛选

| 硬条件 | Vercel Blob | Vercel+R2+Workflow | Supabase all-in-one |
|--------|-------------|--------------------|---------------------|
| 持久元数据 | ✓ | ✓ | ✓ |
| 私有对象/签名 URL | ✗ 公开 URL | ✓ R2 presigned URL | ✓ Storage Signed URL + RLS |
| 持久 Job 状态 | ✓ | ✓ | ✓ |
| 80—100s Provider 执行（不依赖单个 90s 请求） | ✓ | ✓ | ✓ |
| 适配器重建恢复 | ✓ | ✓ | ✓ |
| 项目级联删除 | ✓ | ✓ | ✓ |

Vercel Blob 因不满足「私有对象/签名 URL」硬条件被拒绝（详见 `source-register.md §1.7`）。其余两个候选进入评分。

### 4.2 评分矩阵（100 分固定权重）

| 维度 | 权重 | Vercel+R2+Workflow | Supabase all-in-one |
|------|------|--------------------|---------------------|
| recoverability_and_consistency | 25 | 4 → 20 | 5 → 25 |
| long_task_execution | 20 | 5 → 20 | 3 → 12 |
| vercel_fit | 15 | 5 → 15 | 3 → 9 |
| windows_local_development | 10 | 3 → 6 | 5 → 10 |
| deletion_and_backup | 10 | 4 → 8 | 4 → 8 |
| security_and_secret_handling | 10 | 4 → 8 | 5 → 10 |
| monthly_cost_for_3_users | 5 | 4 → 4 | 4 → 4 |
| vendor_lock_in_and_rollback | 5 | 3 → 3 | 4 → 4 |
| **合计** | 100 | **84** | **82** |

两个候选均通过资格线（recoverability / long_task / deletion 各维度 ≥3）。

### 4.3 推荐

推荐候选 1：**Vercel + Cloudflare R2 + Vercel Workflow**。

核心理由：

1. 保留现有 Node.js 20+ / Express 4 / Sharp 栈，无需迁移到 Deno Edge Runtime。
2. Vercel Workflow（durable execution）是两个候选中唯一真正的 durable execution；Supabase 的 pgmq/pg_cron 不提供 durable state machine。
3. Edge Function 不支持 `sharp`/`libvips`，PERSIST-001 Task 6 需要服务端图像验证，候选 2 需要改用 WASM 或外部服务。
4. 80—100s Provider 调用在 Vercel Pro 800s maxDuration 内有充足余量。
5. 评分 84 vs 82，差异在统计误差内但候选 1 在 long_task / vercel_fit 维度有结构性优势。

备选：Supabase all-in-one，本地开发体验最佳但 Edge Function 限制影响生产实现。

## 5. 账号门槛与决策权限

```yaml
account_gate: user
required_action: |
  1. Cloudflare 账号注册（免费额度内不收费，但需信用卡验证）
  2. Vercel Pro 计划升级（$20/月，Function 800s maxDuration、Workflow Beta、Cron）
  3. 月度预算上限确认（推荐 $20—25/月，超出 R2 免费额度按 $0.015/GB 计）
  4. Vercel Workflow Beta 风险接受（Beta 产品，可能有 API 变更）
  5. 不可逆迁移审批（一旦写入生产 R2 / Vercel Postgres，回滚需手动导出 + 重新导入）
decision_authority: user
```

## 6. 稳定接口契约（Task 2 冻结）

### 6.1 文件

- `src/server/domain/persistence.ts` — 接口定义
- `src/server/domain/persistence.contract.test.ts` — 合约测试
- `src/server/infrastructure/persistence/index.ts` — 适配器注册
- `src/server/infrastructure/persistence/local.ts` — 本地 PoC 适配器
- `src/server/infrastructure/executor/index.ts` — 执行器注册
- `src/server/infrastructure/executor/local.ts` — 本地 PoC 执行器

### 6.2 冻结接口

```ts
ProjectRepository   { create, get, updatePointers, deleteCascade }
AssetRepository     { create, get, listByProject }
VersionRepository   { create, get, listByProject }
JobRepository       { create, get, update, listActiveByProject }
ObjectStore         { put, getSignedUrl, delete, exists }
UnitOfWork          { run<T>(fn) }
AuthThrottleRepository { get, put, delete }
PersistenceDependencies { projects, assets, versions, jobs, objects, unitOfWork, authThrottle }
JobExecutor         { enqueue, cancel }
```

### 6.3 合约测试结果

```
✓ domain/persistence.contract.test.ts (3 tests) 568ms
    ✓ recovers records after adapter re-instantiation and cascades deletion (436ms)
    ✓ UnitOfWork rolls back on exception (no partial writes visible to a fresh instance)
    ✓ ObjectStore rejects reads of unknown keys without throwing unexpected errors

Test Files  1 passed (1)
Tests       3 passed (3)
```

### 6.4 PoC 证明要点

1. **适配器重建恢复**：同一 `rootDir` 构造的新实例可读回所有五条记录（Project / Asset / Version / Job / AuthThrottle）。
2. **级联删除**：`projects.deleteCascade(id)` 后，Project / Asset / Version / Job 元数据消失，对象字节文件也被删除。
3. **UnitOfWork 回滚**：异常时内存状态恢复并重新持久化，新实例无法看到部分写入。
4. **ObjectStore 缺失键稳定**：`exists` 返回 false、`delete` 静默处理 ENOENT、`getSignedUrl` 返回非空字符串。

详见 `docs/lumen-v2/evidence/STORAGE-001/poc-result.md`。

## 7. 8 条门禁结果

| 命令 | 结果 | 证据 |
|------|------|------|
| `npm run lint --prefix src/client` | exit 0，0 errors / 0 warnings | `evidence/STORAGE-001/gate-lint.txt` |
| `npx tsc --noEmit -p src/client/tsconfig.json` | exit 0 | `evidence/STORAGE-001/gate-typecheck-client.txt` |
| `npm test --prefix src/client` | exit 0，4 files / **104 passed** | `evidence/STORAGE-001/gate-test-client.txt` |
| `npx tsc --noEmit -p src/server/tsconfig.json` | exit 0 | `evidence/STORAGE-001/gate-typecheck-server.txt` |
| `npm test --prefix src/server` | exit 0，3 files / **19 passed**（含 3 个新合约测试） | `evidence/STORAGE-001/gate-test-server.txt` |
| `npm test` | exit 0，**123 passed**（104 client + 19 server） | `evidence/STORAGE-001/gate-test-root.txt` |
| `npm run build` | exit 0，client + server 构建成功 | `evidence/STORAGE-001/gate-build.txt` |
| `node scripts/check-lumen-collab.mjs` | exit 0，`Lumen collaboration state and basic public-repo safety checks passed.` | `evidence/STORAGE-001/gate-security-scan.txt` |

注：`src/server/dist/services/providers/operationType.test.js` 是 `npm run build` 产物，被 vitest 自动包含；该测试在 FLOW-001 已通过，本轮无变更。

## 8. 环境/迁移/备份/回滚（详见 storage-options.md §7—§10）

- **环境变量**：`AUTH_PASSWORD`、`JWT_SECRET`、`PROVIDER_ENCRYPTION_KEY`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`、`R2_ACCOUNT_ID`、各 Provider Key。
- **迁移**：旧 `edit_history` 先备份为只读数据，用户显式确认后导入到 Vercel Postgres + R2。
- **备份**：Vercel Postgres 自动备份（Pro 含 7 天日备）；R2 启用 object versioning 防误删。
- **回滚**：若候选 1 不可用，可切换到候选 2（Supabase）；接口契约不变，只替换 adapter 实现。

## 9. 不包含的内容（安全边界）

- 真实客户照片、订单、聊天记录、未脱敏 Prompt（无）。
- API Key、JWT Secret、Provider 完整配置、模型权重（无）。
- 生产数据库导出、对象字节内容（仅 12 字节合成占位）。
- 完整连接字符串（仅记录官方文档 URL）。

## 10. 状态推进

| 字段 | 旧值 | 新值 |
|------|------|------|
| `STATE.status` | `ready_for_trae` | `awaiting_user_decision` |
| `STATE.nextActor` | `trae` | `user` |
| `STATE.latestTraeReport` | `docs/lumen-v2/reports/FLOW-001-TRAE-REPORT.md` | `docs/lumen-v2/reports/STORAGE-001-TRAE-REPORT.md` |
| `STATE.lastUpdatedAt` | `2026-07-18` | `2026-07-18` |
| `STATE.lastUpdatedBy` | `gpt` | `trae` |
| `STATE.phase` | `storage-selection` | `storage-selection`（保持；冻结后再切 `persist-implementation`） |
| `blockedTasks` | `["PERSIST-001"]` | `["PERSIST-001"]`（保持阻塞） |

因 `account_gate: user`，按 INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md Task 3 Step 3 指引推进至 `awaiting_user_decision / nextActor=user`，等待用户决策账号与预算。

## 11. 用户决策项

请用户明确答复以下 5 项后，再由 GPT 写入冻结决策：

1. 是否注册 Cloudflare 账号（R2 免费额度内不收费，需信用卡验证）。
2. 是否将 Vercel 升级到 Pro（$20/月）。
3. 月度预算上限（推荐 $20—25/月）。
4. 是否接受 Vercel Workflow Beta 风险。
5. 是否批准不可逆迁移（生产数据写入 R2 / Vercel Postgres 后回滚需手动导出）。

可选：若用户拒绝候选 1 的账号门槛，可切换到候选 2（Supabase），但需接受 Edge Function 不支持 `sharp` 的限制（PERSIST-001 Task 6 需要改用 WASM 或外部服务）。

## 12. 下一步

- 用户决策账号与预算 → GPT 写入 `decision: frozen` 到 `storage-options.md` 并更新 DECISION-LOG.md → STATE.json 推进至 `PERSIST-001 / ready_for_trae / nextActor=trae` → 解除 PERSIST-001 阻塞。
- 用户未决策前，PERSIST-001 保持阻塞；任何窗口不得提前实施 PERSIST-001。
- 冻结后执行 `INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 4—8（PERSIST-001 主体）+ Task 5—7（内部安全底线）。

## 13. 验收建议（供 GPT/用户）

按变更风险驱动验收，建议聚焦：

1. 两方案评分矩阵与硬条件筛选（`docs/lumen-v2/storage-options.md` §1—§5）。
2. 主源登记的官方文档 URL 与访问日期（`docs/lumen-v2/evidence/STORAGE-001/source-register.md`）。
3. 稳定接口契约与合约测试（`src/server/domain/persistence.ts` + `persistence.contract.test.ts`）。
4. PoC 重建恢复与级联删除证明（`docs/lumen-v2/evidence/STORAGE-001/poc-result.md` §3—§5）。
5. 8 条门禁结果（§7）。
6. 账号门槛与决策权限（§5）。

无需重审 FLOW-001 视觉证据（已冻结）；未变更的 FLOW-001 文件不重审。
