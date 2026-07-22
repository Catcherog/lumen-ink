# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R4 GPT Review

**Date**: 2026-07-22
**Reviewer**: GPT
**Verdict**: FIX_REQUIRED
**Next Owner**: Trae
**Status**: `changes_requested / nextActor=trae`
**readyForPreview**: false
**Codex**: DEFERRED_UNTIL_FIX_R5_IMPLEMENTED

## Verdict

本轮不能推进为 `gpt_evidence_review_pass`，不得授权 Preview、创建合并 PR 或合并 main。

FIX-R4 对事务复用、Job 条件更新和 Storage 补偿的修复方向基本成立，但 Project 删除并发屏障和 Vercel Preview 隔离门禁仍存在阻断性缺陷。完成包所声称的"AC-01～AC-40 全部 PASS"不能成立。

本结论是基于上传完成包及 GitHub 分支代码的证据审查，不代表在本地重新运行了测试。

## Acceptance Criteria Review

### 可保留为证据通过

以下范围暂不要求重写：

- **AC-01～AC-08**：事务复用与 Job/Version 幂等原子性
  - `withCurrentOrNewTransaction()` 能复用 AsyncLocalStorage 当前事务。
  - Job 事务内条件更新已切换为 `tx.collection().doc().get/update()`。
  - `jobs.create(idempotencyKey)` 已委托给原子入口。
- **AC-11**：99/100/101 操作数边界
- **AC-13**：事务提交失败时数据库删除回滚
- **AC-15～AC-21**：Storage fault-injection
  - Upload 补偿、逐项 delete 状态检查、signed URL 状态检查及远端存在性检查的代码方向合理。
- **AC-30～AC-34、AC-36、AC-39** — 仅接受为提交证据，不代表独立运行验证。

### 阻断或未被证明

| AC | 裁决 | 原因 |
|----|------|------|
| AC-09 | FAIL | Tombstone 在删除事务内写入，又在同一次事务提交前删除，其他并发事务无法可靠观察到它。 |
| AC-10 | FAIL | 所谓"稳定快照"是在一个尚未提交、对外不可见的 tombstone 后，通过事务外查询取得。 |
| AC-12 | FAIL | 测试没有制造删除与 child create 的确定性交错。 |
| AC-14 | FAIL / integrated behavior | ProjectService 仍在 tombstone 设置前独立读取 storage keys，且未消费 `project_cleanup_keys` 中的权威快照。 |
| AC-22 | FAIL for real Vercel Preview | Preview 环境判定使用 `VERCEL + NODE_ENV` 推断，而未使用 Vercel 的 `VERCEL_ENV=preview`。 |
| AC-27 | NOT PROVEN | "门禁失败时不 import SDK"只在错误的 Preview 判定条件成立时有效。 |
| AC-29 | FAIL / overstated | 当前只有纯函数导出和 selector 调用，未存在完成包声称的共享 Smoke Harness。 |
| AC-35 | FAIL | 已提交 gate evidence 仍包含 Result SHA 和 AC-37/38/40 的 TODO/PENDING。 |
| AC-37 | FAIL as written | `00ce304` 只是远端 HEAD `342541d` 的祖先，不等于 Remote branch HEAD。 |
| AC-38、AC-40 | 证据包成立，但权威 gate 文件未闭合 | 需要同步修正文档。 |

## Diff Risks

### P1-01：Tombstone 屏障在真实并发下无效

当前实现执行的是：
1. 在删除事务中写 tombstone。
2. 使用 `getDb()` 执行事务外 child 查询。
3. 删除 child、project。
4. 在同一事务中删除 tombstone。
5. 最后一次性提交。

代码明确显示 tombstone 写入和删除发生在同一个事务内。

这意味着：
- 另一个并发 child create 在删除事务提交前，看不到未提交 tombstone。
- 删除事务提交后，tombstone 已同时消失。
- `assertProjectNotDeleting()` 与 child insert 也不是在所有路径中处于同一个事务边界，仍存在 check-then-write TOCTOU。

因此完成包中的以下结论不成立："删除快照期间新增 child 不会形成孤儿。"

### P1-02：所谓并发测试实际没有测试并发

测试注释直接承认无法在 `deleteCascade()` 中间插入并发 child create，随后只是等待删除成功；测试还明确指出删除完成后创建 child 会形成 orphan，并把它排除在 adapter 范围外。

这与 AC-12"确定性交错证明无孤儿"正面冲突。

### P1-03：ProjectService 仍使用 tombstone 之前的 storage 快照

`ProjectService.deleteProject()` 在调用 `deleteCascade()` 前先执行 `assets.listByProject()`：

```
assets.listByProject()
→ storageKeys
→ deleteCascade()
```

并非注释所称的"tombstone 设置后取得稳定快照"。

此外，虽然 adapter 写入了 `project_cleanup_keys`，但 ProjectService 没有读取它，而是继续使用自己的旧 `storageKeys`。因此在两个读取点之间新增的 Asset 可能：
- 被 `deleteCascade` 删除 metadata；
- 被写入 cleanup plan；
- 但不会在当前请求中删除对应 Storage object。

项目现阶段又没有 sweeper，这会留下可恢复但实际未闭合的 Storage orphan 风险。

### P1-04：真实 Vercel Preview 会绕过隔离门禁

实现将 Preview 定义为：
```
VERCEL === '1' && NODE_ENV !== 'production'
```

并明确让 `NODE_ENV=production` 跳过门禁。

但 Vercel 已提供专用系统变量 `VERCEL_ENV`，取值包括 `production`、`preview` 和 `development`；这是部署环境判定的权威信号。

当前代码完全没有读取 `VERCEL_ENV`。因此，只要某个 Preview runtime 同时具有：
- `VERCEL=1`
- `NODE_ENV=production`
- `VERCEL_ENV=preview`

该实现就会把它识别为非 Preview，并跳过 Production namespace gate。完成包中的测试恰好把 `VERCEL=1 + NODE_ENV=production` 当作 Production，证明测试固化了错误判定。

### P2：证据闭合存在冲突

远端 `342541d` 上的权威 gate 文件仍然包含：
- `Result SHA: TODO`
- `AC-37 PENDING`
- `AC-38 PENDING`
- `AC-40 PENDING`

但桌面完成包将这些项目声明为全部 PASS，形成双事实源冲突。

另外：
- 已提交 evidence 使用 `47475ad` 作为 FIX-R4 实施基线。
- 桌面完成包使用 `a858d7f` 作为 Base，同时宣称实施 diff 只有 14 文件。

应区分：
- 逻辑祖先范围：`a858d7f → 342541d`
- FIX-R4 实施 commit 的直接范围：`47475ad → 00ce304`
- State-only 范围：`00ce304 → 342541d`

## Required Fixes

### RF-R5-01：重构为可见的两阶段删除屏障

最低安全设计：

**Phase A：提交删除屏障**
- 在独立事务中将 Project 标记为 `deleting`，或创建持久 tombstone。
- 必须先提交，不能在同一个事务中创建后又删除。

**所有 child create 必须原子校验**
- `assets.create`
- `versions.create`
- `versions.createIdempotent`
- `jobs.create`
- `jobs.createIdempotent`

每条路径必须在同一个 `current-or-new transaction` 中：
1. 读取 Project/tombstone；
2. 验证 Project 存在且不是 `deleting`/`deleted`；
3. 写入 child。

禁止事务外 check 后再单独写入。

**Phase B：屏障提交后取得稳定快照**
1. 读取所有 child IDs 和 storage keys。
2. 删除 metadata。
3. 持久化准确 cleanup plan。
4. 在 Storage cleanup 完成前保留 `deleting`/`deleted` 屏障，或确保 child create 对不存在 Project 永远 fail closed。

ProjectService 必须消费 Phase B 返回或持久化的同一份 storage-key 快照，不得再次独立预取。

可以增加基础设施层内部 capability，但不得修改冻结的 `src/server/domain/persistence.ts` 公共接口。

### RF-R5-02：增加真正的确定性交错测试

至少包含：

- **T1**：child transaction 先读取"未删除"，随后 Phase A 提交 deleting；child commit 必须冲突或失败。
- **T2**：Phase A 已提交，Asset/Version/Job create 全部返回 `PROJECT_DELETING`。
- **T3**：Project 已删除且 tombstone 清理后，child create 返回 `PROJECT_NOT_FOUND`，不得形成 orphan。
- **T4**：在旧 storage prefetch 点之后尝试创建 Asset，证明实际 cleanup keys 与删除 snapshot 完全一致。
- **T5**：服务进程在 DB commit 后、Storage cleanup 前失败，cleanup plan 可被下一次调用或 sweeper 重放。

### RF-R5-03：使用 Vercel 权威环境变量

建议逻辑：
```typescript
if (env.CLOUDBASE_PREVIEW_MODE === '1') return true;

if (env.VERCEL === '1') {
  if (env.VERCEL_ENV === 'preview') return true;
  if (env.VERCEL_ENV === 'production') return false;
  throw new Error('VERCEL_ENV_REQUIRED_OR_INVALID');
}

return false;
```

必须增加：
- `VERCEL=1, VERCEL_ENV=preview, NODE_ENV=production` → 执行隔离 gate。
- `VERCEL=1, VERCEL_ENV=production, NODE_ENV=production` → Production 合法。
- `VERCEL=1, VERCEL_ENV 缺失或未知` → fail closed。

不得再以 `NODE_ENV` 区分 Vercel Preview 和 Production。

### RF-R5-04：修正证据文件
- 将 gate evidence 的 Result SHA 回填为 `00ce304...`。
- 回填 State Commit `342541d...`、Remote HEAD 和 clean status。
- 将实施 diff 固定为 `47475ad → 00ce304`。
- 单独记录 `00ce304 → 342541d` 的 2 个 state 文件。
- 删除 AC-37 的"相等"错误表述，改为：
  - `Local branch HEAD = Remote branch HEAD = 342541d`
  - `Implementation SHA 00ce304 is ancestor of HEAD`
- 在修复前将 AC-09、10、12、14、22、27、29 标记为 FAIL 或 PENDING。

## Codex Necessity

当前不需要立即调用 Codex。

Trae 应先执行 FIX-R5，因为阻断点已经能够从代码直接确定。考虑到任务涉及事务并发和生产数据隔离，FIX-R5 完成并通过 GPT 增量审查后，建议再进行一次严格限域的 Codex READ_ONLY audit，只检查：

1. 两阶段删除屏障与 child create 冲突语义；
2. storage cleanup snapshot 一致性；
3. Vercel Preview 判定和 fail-closed 路径。

不需要重新审计已经基本闭合的 Workstream A-D 和 G。

## Prohibitions

不得 Preview、不得合并 main、不得标记完成。
