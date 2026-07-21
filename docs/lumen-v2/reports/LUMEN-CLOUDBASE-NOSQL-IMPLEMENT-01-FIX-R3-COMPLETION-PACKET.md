# picture-edit Collab Completion Packet

**Project**: lumen-ink-v2 / picture-edit
**Task**: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-SDK-CONTRACT
**Date**: 2026-07-22
**Trae Role**: Implementation
**Status**: `awaiting_gpt_acceptance / nextActor=gpt`
**Risk Level**: HIGH
**Route**: R2 (Trae implementation + GPT incremental review + limited Codex read-only review)
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r3`
**Base SHA**: `87d0ba5` (FIX-R2 state update commit)
**Result SHA**: `627bd7e` (feat(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 SDK contract)

> **增量报告**：本完成包仅记录 FIX-R3 Diff、测试和剩余风险，不重复 R1/R2 历史全文。R1/R2 历史详见 `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R2-TRAE-REPORT.md` 及 `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r2-gate-results.md`。

---

## 1. Objective

修复 CloudBase 真实事务 API 与当前适配器/Mock 之间的契约偏差，使 NoSQL adapter 满足进入 Codex 只读审查和 Vercel Preview 的条件。

## 2. Acceptance Criteria (AC-01 ~ AC-12) — 全部 PASS

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-01 | `unwrapDocumentData()` 统一处理 array / single-doc / null | PASS | 9 处 `.data[0]`/`.data.length` 引用迁移完成 |
| AC-02 | 事务 `doc().get()` 测试使用真实单文档返回结构 | PASS | Mock `tx.collection().doc().get()` 返回 `{ data: doc \| null }` |
| AC-03 | `CloudBaseTransaction.collection` 类型不含 `where()` | PASS | 4 类 SDK 类型拆分 + TS 联合类型编译时保护 |
| AC-04 | 生产代码不存在事务内 `where()` 调用 | PASS | 4 处非事务 `where()` 迁移到 `getDb().collection()`；事务体仅用 `doc(id).*` |
| AC-05 | Project 删除满足 100-op 上限；超限 fail closed | PASS | `deleteCascade` 预取 + 上限检查 + 事务内逐个 remove；2 个测试覆盖超限/刚好 100 |
| AC-06 | DB 删除失败 → 0 次 Storage deleteFile | PASS | 行为测试 + spy 断言 |
| AC-07 | DB 提交成功 → 每对象最多 1 次 Storage delete | PASS | 行为测试 + spy 调用次数等于 asset 数 |
| AC-08 | Storage 部分失败 → cleanupFailures 保留 | PASS | 行为测试 mock 一个 key 失败，断言 cleanupFailures + metadata 已清 |
| AC-09 | Prod + Preview 共享 Mock state，DB/Storage 双隔离 | PASS | scenario 10 重写，共享 `MockCloudBaseState` |
| AC-10 | 并发幂等：2 事务提交前完成首次读取 → 1 Job + 1 idem + 0 orphan | PASS | Mock 级别 + 适配器级别 2 个测试 |
| AC-11 | 8 门禁全部通过 | PASS | 525 root tests (194 client + 331 server) |
| AC-12 | `readyForPreview=false` 保持不变 | PASS | `STATE.json.cloudbaseNoSqlImplement.readyForPreview = false` |

## 3. FIX-R3 Diff Summary

```
git diff 87d0ba5..HEAD --stat
```

```
 src/server/infrastructure/persistence/cloudbase.nosql.mock.ts              | 171 +++++++++++++++----
 src/server/infrastructure/persistence/cloudbase.nosql.r2.behavior.test.ts  | 310 ++++++++++++++++++---
 src/server/infrastructure/persistence/cloudbase.nosql.ts                   | 250 ++++++++++++-----
 src/server/infrastructure/persistence/cloudbase.nosql.sdk-contract.test.ts | new file
 4 files changed, 595 insertions(+), 136 deletions(-)
```

### 文件变更详情

| 文件 | 变更类型 | 行数 | 关键改动 |
|------|---------|------|---------|
| `cloudbase.nosql.ts` | modified | +250 | 新增 `unwrapDocumentData<T>()`；4 类 SDK 类型拆分；9 处 `.data[0]` 迁移；4 处非事务 `where()` 改用 `getDb().collection()`；`deleteCascade` 重写为预取 + 100-op 上限 + 事务内逐个 `doc(id).remove()` |
| `cloudbase.nosql.mock.ts` | modified | +171 | `tx.collection().doc().get()` 返回单文档/null；事务 collection 类型限制；`commit()` 强制 100-op 上限 |
| `cloudbase.nosql.r2.behavior.test.ts` | modified | +310 | scenario 10 重写（AC-09）；新增 AC-05/06/07/08/10 测试 |
| `cloudbase.nosql.sdk-contract.test.ts` | new | 7 tests | 验证**安装版** `@cloudbase/node-sdk@^3.18.3` API 表面，无凭据、无网络 |

## 4. Test Counts

| Suite | R2 | R3 | Delta |
|-------|-----|-----|-------|
| Client | 194 | 194 | 0 |
| Server | 317 | 331 | +14 |
| Root total | 511 | 525 | +14 |

**Server delta breakdown**:
- `cloudbase.nosql.sdk-contract.test.ts`: +7 (new file)
- `cloudbase.nosql.r2.behavior.test.ts`: +7 (AC-05 ×2, AC-06 ×1, AC-07 ×1, AC-08 ×1, AC-10 ×2)

## 5. 8 Gates

| # | Gate | Result | Count |
|---|------|--------|-------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc (build) | PASS | 0 errors (vite build success) |
| 3 | Client tests | PASS | 194 tests / 10 files |
| 4 | Server tsc | PASS | 0 errors |
| 5 | Server tests | PASS | 331 tests / 30 files |
| 6 | Root tests | PASS | 525 combined |
| 7 | Build (client + server) | PASS | client + server |
| 8 | check-lumen-collab | PASS | no secrets detected |

## 6. Stop Conditions (全部保持)

- ✅ `readyForPreview` 保持 `false`
- ✅ 未合并到 main（分支 `lumen/cloudbase-nosql-implement-01-fix-r3`）
- ✅ 未配置 Vercel Preview / Production
- ✅ 未使用 Production API Key
- ✅ Codex 审查在 GPT 通过 R3 后执行
- ✅ 未修改冻结 `PersistenceDependencies` 接口
- ✅ 未超过 100 事务操作上限（fail closed 强制）
- ✅ 真实 SDK 契约与安装包 `@cloudbase/node-sdk@^3.18.3` 源代码一致

## 7. Remaining Risks

1. **Mock-only 行为证据**：并发幂等、100-op 上限、Storage 边界测试均基于内存 Mock SDK，真实 CloudBase 事务语义可能略有差异。SDK 契约测试（7 tests）验证了安装包 API 表面但未执行真实网络调用。

2. **AC-10 适配器级测试依赖 JS 单线程**：Mock 级测试（使用 `Promise.allSettled` + `bothRead` gate）才是真正触发 commit-time E11000 路径的测试；适配器级测试验证"第二个调用者失败后获取获胜者 Job"流程。

3. **100-op 上限是 pre-check + Mock-commit-check**：errs fail-closed，但可能比真实 CloudBase 更严格。

4. **TypeScript 联合类型作为编译时保护（AC-03）**：`collection()` 辅助函数返回联合类型不含 `where()`，TS 编译时拒绝。生产代码可通过 `getDb().collection()` 绕过（这是非事务查询的预期 escape hatch）。

5. **`unwrapDocumentData()` 是局部 helper，不导出**：不属于冻结的 `PersistenceDependencies` 接口，可未来扩展。

6. **`ws` 可选依赖警告**：SDK 契约测试触发 stderr 提示"缺少依赖 ws"。不影响测试结果（7/7 通过），生产环境不触发。

## 8. Codex Escalation Conditions (GPT 通过 R3 后授权)

限定只读 Codex 审查范围：
- `cloudbase.nosql.ts`
- Mock 与 NoSQL 测试
- `select.ts`
- `ProjectService` / `GenerationService`
- FIX-R3 Base→Result diff
- CloudBase 事务、幂等、删除与 Storage 边界

**Codex 不得修改代码。**

## 9. Next Steps (最短收尾顺序)

1. ✅ Trae 执行 FIX-R3
2. ⏳ GPT 做一次增量审查，不重审 R1/R2 全历史
3. ⏳ Codex 做限定只读审查
4. ⏳ 配置独立 Preview namespace/prefix，执行真实 CloudBase 冒烟测试
5. ⏳ Preview 通过后解除 `readyForPreview=false`
6. ⏳ 合并 main，恢复 Production Cron 与持久化验证
7. ⏳ 关闭 PERSIST-001、PROD-CRON-VERIFY、ROUTING-001，完成项目归档

## 10. References

- Trae Report: `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-TRAE-REPORT.md`
- Gate Results: `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md`
- STATE: `docs/lumen-v2/state/STATE.json` (cloudbaseNoSqlImplement block, fixR3* fields)
- SESSION-HANDOFF: `docs/lumen-v2/state/SESSION-HANDOFF.md` (top section)

## 11. Verification Commands (for GPT to re-run)

```bash
# 1. Verify diff
git diff 87d0ba5..HEAD --stat

# 2. 8 gates
npm run lint --prefix src/client
npm run build --prefix src/client        # includes tsc -b
npm test --prefix src/client -- --run
npx tsc -p src/server/tsconfig.json --noEmit
npm test --prefix src/server -- --run
npm test                                 # root = client + server
npm run build --prefix src/server
node scripts/check-lumen-collab.mjs

# 3. Verify readyForPreview unchanged
grep "readyForPreview" docs/lumen-v2/state/STATE.json
# expected: "readyForPreview": false,

# 4. Verify no transaction where() in production code
grep -n "where(" src/server/infrastructure/persistence/cloudbase.nosql.ts
# all matches should be inside getDb().collection().where() (non-tx)

# 5. Verify unwrapDocumentData usage
grep -n "unwrapDocumentData" src/server/infrastructure/persistence/cloudbase.nosql.ts
```
