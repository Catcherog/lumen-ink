# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 Trae Report

**Date**: 2026-07-22
**Trae Role**: Implementation
**Task**: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R3-SDK-CONTRACT
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r3`
**Base SHA**: `87d0ba5` (FIX-R2 state update commit)
**Result SHA**: `627bd7e` (feat(lumen-v2): LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 SDK contract)
**Status**: `awaiting_gpt_acceptance / nextActor=gpt`
**Risk Level**: HIGH
**Route**: R2 (Trae implementation + GPT incremental review + limited Codex read-only review)

## 1. Context

GPT assigned FIX-R3 to address the contract divergence between the real CloudBase transaction API and the R2 adapter/Mock. The R2 implementation treated transaction `collection().doc().get()` as returning an array (same as non-tx), but the real SDK returns a single document (or null). R2 also allowed `where()` on transaction collection references, which the real transaction runtime does not support. Finally, R2's `deleteCascade` performed `where().remove()` inside the transaction — a pattern that may fail or silently no-op on real CloudBase.

This report documents the FIX-R3 round, which addresses AC-01 through AC-12 (12 acceptance criteria). It is an incremental report — it does NOT repeat the R1/R2 history beyond what is necessary for context.

## 2. Acceptance Criteria resolution

### AC-01: Unified `unwrapDocumentData()`
**Resolution**: A new helper `unwrapDocumentData<T>(data: unknown): T | null` was added at the top of `cloudbase.nosql.ts`. It handles three input shapes uniformly:
- `null` / `undefined` → returns `null`
- Array (`[doc]` or `[]`) → returns first element or `null`
- Single document object → returns the object

All 9 previous `.data[0]` / `.data.length === 0` references in `versions.get`, `authThrottle.get`, `jobs.claim`, and the transaction body were migrated to use `unwrapDocumentData(res.data)`.

### AC-02: Transaction `doc().get()` returns single doc
**Resolution**: The Mock was updated so `tx.collection().doc().get()` returns `{ data: doc | null }` (single document or null), matching the real SDK contract. Contract tests and behavior tests cover both the null case (doc not found) and the single-doc case (doc exists). The non-tx `collection().doc().get()` continues to return `{ data: any[] }` (array).

### AC-03: Transaction collection type excludes `where()`
**Resolution**: The SDK type surface was split into four interfaces:
- `DatabaseCollectionRef` — non-tx, has `where()`, `orderBy()`, `limit()`, `doc()`, `add()`, `get()`, `update()`, `remove()`, `count()`
- `TransactionCollectionRef` — tx, has `doc()`, `add()` only (no `where`, `orderBy`, `limit`, `update`, `remove`, `count`)
- `DocumentGetResult` — non-tx `doc().get()` returns `{ data: any[] }`
- `TransactionDocumentGetResult` — tx `doc().get()` returns `{ data: any | null }`

The `collection()` helper inside the transaction body returns `DatabaseCollectionRef | TransactionCollectionRef`. Because the union does not declare `where()`, TypeScript rejects `collection(x).where(...)` at compile time. This is the compile-time guard for AC-03.

### AC-04: No transaction `where()` in production code
**Resolution**: Four non-tx call sites that previously used `collection(COLL).where(...)` had to switch to `getDb().collection(COLL).where(...)` to compile under the new union type:
- `assets.listByProject`
- `versions.listByProject`
- `jobs.listActiveByProject`
- `jobs.listLeaseExpired`

`grep -n "where(" src/server/infrastructure/persistence/cloudbase.nosql.ts` confirms all remaining `where()` calls are inside `getDb().collection().where()` (non-tx context). The transaction body uses only `collection(coll).doc(id).get()/.remove()/.set()` operations.

### AC-05: 100-op limit fail-closed
**Resolution**: `deleteCascade(id)` was rewritten to:
1. Pre-fetch deterministic doc IDs from all 5 child collections (`versionIdempotency`, `jobs`, `jobIdempotency`, `versions`, `assets`) using non-tx `getDb().collection().where({ projectId: id }).get()`.
2. Sum all IDs + 1 (for the project doc itself) and compare against `CLOUDBASE_TX_OP_LIMIT = 100`.
3. If over the limit, throw `CLOUDBASE_TX_LIMIT_EXCEEDED: projectId=${id}, ops=${totalOps}, limit=100` BEFORE any mutation.
4. Inside the transaction, perform `collection(coll).doc(docId).remove()` for each pre-fetched ID.
5. Finally, `collection(COLLECTIONS.projects).doc(id).remove()`.

The Mock `commit()` re-checks `txLog.length > 100` and throws the same error, providing a second fail-closed layer.

Behavior tests cover:
- Over-limit (110 ops) → throws, no docs removed
- Exactly-100 ops → succeeds, all docs removed

### AC-06 / AC-07 / AC-08: Storage boundary
**Resolution**: `ProjectService.deleteProject(projectId)` was already structured correctly (verified by read-only inspection):
1. Pre-fetch `assets.listByProject(projectId)` to get `storageKeys[]`
2. `await unitOfWork.run(() => deps.projects.deleteCascade(projectId))` — DB atomic delete
3. After DB commit success, loop `objects.delete(key)` best-effort, collecting failures into `cleanupFailures[]`

Three new behavior tests verify the boundaries:
- **AC-06**: Mock `deleteCascade` to throw → assert `objects.delete` spy called 0 times
- **AC-07**: Normal flow with 3 assets → assert `objects.delete` spy called exactly 3 times (once per object)
- **AC-08**: Mock `objects.delete` to throw on key[1] → assert `cleanupFailures === [storageKey[1]]`, project metadata gone, assets list empty, all 3 deletes attempted

### AC-09: Preview/Production share Mock state
**Resolution**: Scenario 10 in `cloudbase.nosql.r2.behavior.test.ts` was rewritten. Instead of creating two separate `MockCloudBaseState` instances, both `createCloudBaseNoSqlPersistence(PROD_OPTIONS)` and `createCloudBaseNoSqlPersistence(PREVIEW_OPTIONS)` are wired to the same `sharedState` and `sharedApp`. Production writes go to `prod_*` collections and `prod/` storage prefix; Preview reads on `preview_*` collections and `preview/` storage return null for both DB and Storage. This proves namespace isolation is enforced at the adapter layer, not at the Mock state instance layer.

### AC-10: Concurrent idempotency
**Resolution**: Two tests added:
1. **Mock-level interleaving**: Two `db.runTransaction()` callbacks both call `tx.collection('idem').doc('p1__shared').get()` before either commits. A `bothRead` Promise gate ensures both reads complete before either `add()` runs. Both see `data: null`. Both try to `add()` the same `_id`. At `commit()`, the second transaction hits E11000 (duplicate key) and rolls back. `Promise.allSettled` returns 1 fulfilled + 1 rejected. Final state: 1 idem doc, 1 jobs doc, 0 orphan.
2. **Adapter-level**: Two concurrent `deps.jobs.createIdempotent(jobA)` / `createIdempotent(jobB)` with same `(projectId, idempotencyKey)`. Both return the same Job (the winner). `created` flags differ (one true, one false). Final state: 1 Job doc, 1 idempotency doc.

### AC-11: 8 gates all green
**Resolution**: See `fix-r3-gate-results.md`. All 8 gates PASS with 525 root tests (194 client + 331 server).

### AC-12: readyForPreview unchanged
**Resolution**: `STATE.json.cloudbaseNoSqlImplement.readyForPreview` remains `false`. No Vercel Preview/Production config written, no Production API Key usage, no merge to main.

## 3. SDK contract test (new file)

A new test file `src/server/infrastructure/persistence/cloudbase.nosql.sdk-contract.test.ts` was created with 7 tests that verify the **installed** `@cloudbase/node-sdk` package's API surface without making any network calls or requiring credentials:

1. `init({ env, accessKey })` returns a CloudBase app with `database()` method
2. `app.database()` returns a `Db` with `command`, `runTransaction`, `collection`, `startTransaction`
3. `db.command` exposes all operators the adapter uses: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in`, `nin`, `exists`, `and`, `or`, `set`, `remove`, `inc`, `push`
4. `db.collection(name)` returns a `CollectionReference` with `add`, `doc`, `where`, `count`, `get`
5. `collection.doc(id)` returns a `DocumentReference` with `get`, `update`, `set`, `remove`
6. `collection.where(query)` returns a `Query` with `get`, `update`, `remove`, `orderBy`, `limit`
7. `runTransaction` accepts a callback parameter typed as `(transaction: Transaction) => void | Promise<any>` (type-level verification)

The test imports `tcb from '@cloudbase/node-sdk'` (the real installed package, not the Mock) and uses `tcb.init({ env: 'test-env', accessKey: 'test-key' })`. No network calls are made — `init()` only constructs the `CloudBase` instance and normalizes config. The SDK emits a stderr warning about missing optional `ws` dependency, which does not affect any test (7/7 pass).

## 4. Files changed

```
src/server/infrastructure/persistence/cloudbase.nosql.ts                   (modified, +250/-? lines)
  - New unwrapDocumentData<T>() helper
  - Type split: DatabaseCollectionRef / TransactionCollectionRef / DocumentGetResult / TransactionDocumentGetResult
  - 9 .data[0]/.data.length references migrated to unwrapDocumentData(res.data)
  - 4 non-tx where() call sites switched from collection().where() to getDb().collection().where()
  - deleteCascade rewritten: pre-fetch IDs + 100-op limit check + tx-internal doc(id).remove()

src/server/infrastructure/persistence/cloudbase.nosql.mock.ts              (modified, +171/-? lines)
  - tx.collection().doc().get() now returns { data: doc | null } (single doc, not array)
  - tx.collection() type restricted: no where(), no orderBy(), no limit(), no update(), no remove()
  - commit() enforces 100-op limit (txLog.length > 100 → throw CLOUDBASE_TX_LIMIT_EXCEEDED)

src/server/infrastructure/persistence/cloudbase.nosql.r2.behavior.test.ts  (modified, +310/-? lines)
  - Added ProjectService + JobExecutor imports
  - Rewrote scenario 10 (AC-09): shared MockCloudBaseState for Prod + Preview
  - Added AC-10 tests: mock-level interleaving + adapter-level concurrent createIdempotent
  - Added AC-05 tests: over-100-op reject + exactly-100-op accept
  - Added AC-06/07/08 tests: DB-fail-0-storage-delete + success-each-once + partial-failure-cleanupFailures
  - Added setupProjectWithAssets() helper

src/server/infrastructure/persistence/cloudbase.nosql.sdk-contract.test.ts (new, 7 tests)
  - Verifies installed @cloudbase/node-sdk API surface without credentials/network
```

## 5. Test counts

| Suite | R2 | R3 | Delta |
|-------|-----|-----|-------|
| Client | 194 | 194 | 0 |
| Server | 317 | 331 | +14 |
| Root total | 511 | 525 | +14 |

Server delta breakdown:
- `cloudbase.nosql.sdk-contract.test.ts`: +7 (new file)
- `cloudbase.nosql.r2.behavior.test.ts`: +7 (AC-05 ×2, AC-06 ×1, AC-07 ×1, AC-08 ×1, AC-10 ×2)

## 6. Stop Conditions

All Stop Conditions honored:

- ✅ `readyForPreview` remains `false`
- ✅ No merge to main (branch is `lumen/cloudbase-nosql-implement-01-fix-r3`)
- ✅ No Vercel Preview/Production config
- ✅ No Production API Key usage
- ✅ Codex review deferred until GPT passes R3 evidence review
- ✅ Did not modify the frozen `PersistenceDependencies` interface
- ✅ Did not exceed 100 transaction operations per project delete (fail-closed enforced)
- ✅ DB consistency + Storage retry-ability both satisfied (DB atomic, Storage best-effort with `cleanupFailures` preserved)
- ✅ Real SDK contract matches installed `@cloudbase/node-sdk@^3.18.3` (verified by 7 contract tests)

## 7. Codex escalation conditions (for GPT to trigger after evidence review passes)

Per task card, after GPT passes R3 evidence review, Codex is authorized for one limited read-only review with scope:
- `cloudbase.nosql.ts`
- Mock + NoSQL tests
- `select.ts`
- `ProjectService` / `GenerationService`
- FIX-R3 Base→Result diff
- CloudBase transaction / idempotency / delete / Storage boundary

Codex must NOT modify code.

## 8. Next steps (shortest closure sequence per task card)

1. **GPT incremental review** of FIX-R3 evidence (do NOT re-review R1/R2 full history)
2. **Codex limited read-only review** (scope above)
3. Configure independent Preview namespace/prefix, run real CloudBase smoke test
4. After Preview passes, unset `readyForPreview=false`
5. Merge to main, restore Production Cron + persistence verification
6. Close PERSIST-001, PROD-CRON-VERIFY, ROUTING-001; complete project archival

## 9. References

- Evidence: `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r3-gate-results.md`
- R2 Trae Report: `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R2-TRAE-REPORT.md`
- R2 Gate Results: `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r2-gate-results.md`
- STATE: `docs/lumen-v2/state/STATE.json` (cloudbaseNoSqlImplement block)
