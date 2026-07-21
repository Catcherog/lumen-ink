# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3 Gate Results

**Date**: 2026-07-22
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r3`
**Base SHA**: `87d0ba5` (FIX-R2 state update commit)
**Result SHA**: pending commit (worktree HEAD before commit: `87d0ba5`)
**Trae Role**: Implementation
**Status**: `awaiting_gpt_acceptance / nextActor=gpt`

## Diff verification

```
git diff HEAD --stat  (before commit)
```

```
 src/server/infrastructure/persistence/cloudbase.nosql.mock.ts              | 171 +++++++++++++++----
 src/server/infrastructure/persistence/cloudbase.nosql.r2.behavior.test.ts  | 310 ++++++++++++++++++---
 src/server/infrastructure/persistence/cloudbase.nosql.ts                   | 250 ++++++++++++-----
 src/server/infrastructure/persistence/cloudbase.nosql.sdk-contract.test.ts | new file
 4 files changed, 595 insertions(+), 136 deletions(-)
```

**FIX-R3-01 satisfied**: The diff contains real code modifications to `cloudbase.nosql.ts` (250-line delta), `cloudbase.nosql.mock.ts` (171-line delta), `cloudbase.nosql.r2.behavior.test.ts` (310-line delta), plus a brand-new `cloudbase.nosql.sdk-contract.test.ts` file (7 SDK contract tests).

## 8 Gates

| # | Gate | Result | Count |
|---|------|--------|-------|
| 1 | Client lint (`npm run lint --prefix src/client`) | PASS | 0 errors |
| 2 | Client tsc (`tsc -b` in client build) | PASS | 0 errors (vite build success) |
| 3 | Client tests (`npm test --prefix src/client`) | PASS | 194 tests / 10 files |
| 4 | Server tsc (`npx tsc -p src/server/tsconfig.json --noEmit`) | PASS | 0 errors |
| 5 | Server tests (`npm test --prefix src/server`) | PASS | 331 tests / 30 files |
| 6 | Root tests (`npm test`) | PASS | 525 combined (194 client + 331 server) |
| 7 | Build (`npm run build --prefix src/client` + `npm run build --prefix src/server`) | PASS | client + server |
| 8 | check-lumen-collab (`node scripts/check-lumen-collab.mjs`) | PASS | no secrets detected |

## Test count comparison

| Suite | R2 count | R3 count | Delta |
|-------|----------|----------|-------|
| Client | 194 | 194 | 0 |
| Server | 317 | 331 | +14 (7 new SDK contract tests + 7 new behavior tests for AC-05/06/07/08/09/10) |
| Root total | 511 | 525 | +14 |

## R3 Acceptance Criteria coverage

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-01 | `unwrapDocumentData()` unifies array / single-doc / null handling | PASS | All 9 previous `.data[0]`/`.data.length` references migrated to `unwrapDocumentData(res.data)`; helper handles `null`, single-doc object, and array uniformly |
| AC-02 | All transaction `doc().get()` tests use real single-doc return shape | PASS | Mock `tx.collection().doc().get()` returns `{ data: doc \| null }` (not array); contract + behavior tests cover both null and single-doc cases |
| AC-03 | `CloudBaseTransaction.collection` type excludes `where()` | PASS | Type-split into `TransactionCollectionRef` (no `where`) vs `DatabaseCollectionRef` (has `where`); `collection()` helper returns union type that does NOT expose `where()` — TS compile-time guard; 4 non-tx `where()` call sites had to switch to `getDb().collection()` to compile |
| AC-04 | No transaction `where()` calls in production code | PASS | `grep -n "where(" cloudbase.nosql.ts` confirms all remaining `where()` are inside `getDb().collection().where()` (non-tx); transaction body uses only `collection(coll).doc(id).*` operations |
| AC-05 | Project delete honors 100-op limit; over-limit fails closed | PASS | `deleteCascade` pre-fetches doc IDs, sums operations, throws `CLOUDBASE_TX_LIMIT_EXCEEDED` before any mutation if `> CLOUDBASE_TX_OP_LIMIT (100)`; Mock `commit()` re-checks and throws; behavior tests cover both over-limit (reject) and exactly-100 (accept) |
| AC-06 | DB delete failure → 0 Storage deleteFile calls | PASS | `ProjectService.deleteProject` calls `unitOfWork.run(deleteCascade)` first; only on success does it loop `objects.delete()`; behavior test `AC-06: DB delete failure -> 0 Storage deletes` uses spy to assert `objects.delete` not called when DB throws |
| AC-07 | DB commit success → each object deleted at most once | PASS | Behavior test `AC-07: DB commit success -> each object deleted exactly once` asserts spy call count equals asset count |
| AC-08 | Storage partial failure → cleanupFailures preserved, metadata gone | PASS | `ProjectService.deleteProject` catches per-key errors into `cleanupFailures[]`; behavior test `AC-08` mocks one key failure, asserts `cleanupFailures=[storage-key-1]`, `projects.get()` returns null, `assets.listByProject()` returns `[]`, all 3 storage deletes attempted |
| AC-09 | Prod + Preview share one Mock state, still DB/Storage isolated | PASS | Scenario 10 rewritten: both adapters built from `createMockCloudBaseState('test-env')` sharing the same `MockCloudBaseState`; Production data written to `prod_*` collections + `prod/` storage prefix; Preview reads return null for both DB and Storage |
| AC-10 | Concurrent idempotency: 2 tx both read before commit → 1 Job + 1 idempotency + 0 orphan | PASS | Two tests: (1) Mock-level interleaving using `Promise.allSettled` + `bothRead` gate — exactly one tx fulfills, other rejects with E11000, final state has 1 `idem` + 1 `jobs` doc; (2) Adapter-level `createIdempotent` called twice concurrently — both return same Job, `created` flag differs, only 1 Job + 1 idempotency doc in state |
| AC-11 | 8 gates all green | PASS | See table above; all 8 gates PASS |
| AC-12 | `readyForPreview` remains `false` | PASS | `STATE.json.cloudbaseNoSqlImplement.readyForPreview = false` (unchanged from R2); no Preview/Production config written |

## R3 test matrix coverage

| Required test | Status | Test file |
|---------------|--------|-----------|
| Normal `doc().get()` returns array | PASS | `cloudbase.nosql.contract.test.ts` (uses real `getDb().collection().doc().get()` shape) |
| Transaction `doc().get()` returns single doc | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-10 mock-level test |
| Transaction `doc().get()` returns null | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-10 mock-level test (both tx see null initially) |
| Two interleaved transactions competing for same idempotency key | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-10 mock-level + adapter-level tests |
| Project delete transaction rollback | PASS | `cloudbase.nosql.r2.behavior.test.ts` scenario 2 (transaction throw → rollback) |
| Project delete commit + Storage cleanup | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-07 test |
| Storage cleanup partial failure | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-08 test |
| Over 100 delete operations fail closed | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-05 over-limit test |
| Exactly 100 delete operations succeed | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-05 exactly-100 test |
| Same Mock state Preview/Production DB isolation | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-09 test |
| Same Mock state Preview/Production Storage isolation | PASS | `cloudbase.nosql.r2.behavior.test.ts` AC-09 test |
| Existing lease state machine regression | PASS | `cloudbase.nosql.lease.contract.test.ts` (5 tests) + `worker-recovery.test.ts` (5 tests) |
| Full 8 gates | PASS | See table above |
| SDK contract (installed @cloudbase/node-sdk, no credentials) | PASS | `cloudbase.nosql.sdk-contract.test.ts` (7 tests) |

## Stop Conditions

- `readyForPreview` remains `false` ✅
- No merge to main ✅ (branch is `lumen/cloudbase-nosql-implement-01-fix-r3`)
- No Vercel Preview/Production config ✅
- No Production API Key usage ✅
- Codex review deferred until GPT passes R3 evidence review ✅

## Remaining risks

1. **Mock-only behavioral evidence**: All transaction idempotency, 100-op limit, and Storage boundary tests run against the in-memory Mock SDK, not a real CloudBase instance. Real CloudBase transaction semantics (especially OCC conflict rates and E11000 timing) may differ slightly. The SDK contract test (7 tests) verifies the installed `@cloudbase/node-sdk` API surface but does not exercise real network calls.

2. **100-op limit is pre-check + Mock-commit-check**: Production code counts pre-fetched IDs and throws before any mutation; Mock `commit()` re-checks. If a real CloudBase transaction allows more than 100 ops or counts differently, the production pre-check may be too strict — but this is fail-closed, so it errs on the safe side.

3. **AC-10 adapter-level test relies on Mock single-threadedness**: JS is single-threaded, so the two `createIdempotent` calls do not truly interleave at the CPU level. The Mock-level test (using `Promise.allSettled` + `bothRead` gate) is the one that genuinely exercises the commit-time E11000 path; the adapter-level test verifies the "second caller loses, fetches winner" flow but cannot prove true parallelism.

4. **TypeScript union type as compile-time guard (AC-03)**: The `collection()` helper returns `DatabaseCollectionRef | TransactionCollectionRef`. Both interfaces declare `doc()/add()` but only `DatabaseCollectionRef` declares `where()`. TypeScript correctly rejects `where()` on the union. However, this guard is bypassed if production code uses `getDb().collection()` directly (which is the intended escape hatch for non-tx queries). The 4 non-tx call sites that were updated to `getDb().collection().where()` are correctly outside transactions.

5. **`unwrapDocumentData()` is a local helper, not exported**: It lives at the top of `cloudbase.nosql.ts` and is not part of the frozen `PersistenceDependencies` interface. Future adapter work can extend or refactor it without breaking the contract.

6. **`ws` optional dependency warning**: The SDK contract test triggers a stderr warning "缺少依赖 ws" from the SDK's internal module loader. This does not affect test results (7/7 pass) and the warning is suppressed in production because the adapter never calls WebSocket-based APIs.
