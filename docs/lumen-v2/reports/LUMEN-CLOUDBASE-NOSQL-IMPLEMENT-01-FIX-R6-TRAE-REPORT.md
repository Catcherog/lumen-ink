# Trae Report — LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R6

**Date**: 2026-07-22
**Task ID**: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R6-CLEANUP-LEDGER-CLOSURE
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r6`
**Base SHA**: `98764ad` (FIX-R5 docs backfill, branch HEAD at task start)
**Implementation SHA**: `ff6d33d` (full: `ff6d33d7f171e87a210d609f8e4a63c2e38f367b`)
**Risk Level**: HIGH
**Route**: R3 (GPT planned → Trae implements → GPT evidence review → Codex limited read-only audit)
**readyForPreview**: false (unchanged)

## GPT Verdict Addressed

FIX_REQUIRED (changes_requested) from [FIX-R5 GPT Review](../reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-GPT-REVIEW.md). Four defects:

| ID | Severity | Description |
|----|----------|-------------|
| P1-01 | P1 | Cleanup ledger deleted before Storage cleanup; crash recovery broken |
| P2-01 | P2 | AC-29 no real Smoke Harness, only pure function exports |
| P2-02 | P2 | AC-37 SHA statement incorrect (claimed HEAD=6b4b379 after 98764ad pushed) |
| P2-03 | P2 | Deployment statement incorrectly claims "未部署" despite Vercel auto-build |

## Implementation Summary

### RF-R6-01: Cleanup Ledger Lifecycle (AC-R6-01/02/03)

**Problem (P1-01)**: `ProjectService.deleteProject()` called `deleteCleanupKeys()` immediately after reading cleanup keys, BEFORE performing Storage cleanup. If the process crashed between ledger deletion and object deletion, the sweeper had no record to replay.

**Fix**: Added `removeCleanupKeys(id, removedKeys)` method to the NoSQL adapter. `ProjectService.deleteProject()` now:

1. Calls `deleteCascade()` (Phase A tombstone + Phase B snapshot/delete/cleanup-keys-persist)
2. Reads cleanup keys via `getCleanupKeys()` (consumes Phase B snapshot — no independent prefetch)
3. Iterates Storage cleanup, tracking `completedKeys` and `cleanupFailures`
4. **After** all Storage deletes attempted, calls `removeCleanupKeys(projectId, completedKeys)` which:
   - Reads current ledger
   - Filters out successfully-deleted keys
   - If remaining keys exist → updates ledger with failed keys (for sweeper recovery)
   - If no remaining keys → deletes the ledger doc entirely
5. **Crash-window idempotency (AC-R6-03)**: `OBJECT_NOT_FOUND` from Storage delete is treated as success, so a crash between object-delete and ledger-update is safe to retry — the object is already gone.

**Files changed**:
- `src/server/services/ProjectService.ts` — refactored `deleteProject()`
- `src/server/infrastructure/persistence/cloudbase.nosql.ts` — added `removeCleanupKeys()` to `projects` interface and implementation

### RF-R6-02: Real Service-Path Crash/Retry Tests (AC-R6-04)

**Problem**: Existing T5 test bypassed `ProjectService.deleteProject()` by calling `deleteCascade()` directly, so it never exercised the premature-ledger-deletion bug.

**Fix**: Added 5 new tests in `cloudbase.nosql.cascade-boundary.test.ts` under `describe("FIX-R6: ProjectService cleanup ledger lifecycle")`:

| Test | AC | Scenario | Verification |
|------|----|----------|--------------|
| AC-R6-01 | full success | All objects deleted | Ledger survives during cleanup; deleted after all keys cleaned |
| AC-R6-02 | partial failure | 1 of 3 objects fails | Failed key persists in ledger; successful keys removed |
| AC-R6-03 | crash window | OBJECT_NOT_FOUND on retry | Treated as idempotent success; key removed from ledger |
| AC-R6-04 | service retry | Partial failure → retry via `service.deleteProject()` | Failed keys replayed; ledger cleaned after retry success |
| AC-R6-01 regression | mid-cleanup crash | Ledger read mid-cleanup | Un-cleaned keys remain in ledger for sweeper |

All tests use the real `ProjectService.deleteProject()` service path — no direct `deleteCascade()` bypass.

### RF-R6-03: Preview Isolation Smoke Harness (AC-R6-05/06)

**Problem (P2-01)**: AC-29 had no executable Smoke Harness — only pure function exports.

**Fix**: Created `scripts/verify-preview-isolation.ts` — an executable TypeScript script (run via `tsx`) that:

- **Imports** `isPreviewEnvironment` and `validatePreviewIsolation` from `../src/server/infrastructure/persistence/select.js` (production code, not a copy)
- Runs **9 synthetic self-tests** covering all isolation scenarios:
  1. `VERCEL_ENV=preview` → true
  2. `VERCEL_ENV=production` → false (not blocked)
  3. `VERCEL=1`, `VERCEL_ENV` missing → throw (fail closed)
  4. `VERCEL=1`, `VERCEL_ENV=unknown` → throw (fail closed)
  5. Preview ns == Production ns → throw
  6. Preview prefix == Production prefix → throw
  7. Preview ns contains "prod" → throw
  8. Missing `productionNamespace` → throw
  9. Valid isolation → pass (no throw)
- Runs **current-env check**: if not Vercel/Preview → no-op; if Preview detected → runs `validatePreviewIsolation` with current env
- **Exit codes**: 0 on success, 1 on any failure

**Verified**:
- No env vars set → exit 0 (all self-tests pass, current-env no-ops)
- `VERCEL=1` without `VERCEL_ENV` → exit 1 (fail-closed behavior confirmed for AC-R6-06)

**Gate command**: `cd src/server && npx tsx ../../scripts/verify-preview-isolation.ts`

### RF-R6-04: Evidence Corrections (AC-R6-07/08)

**Problem (P2-02)**: STATE.json and gate evidence claimed `Local HEAD = Remote HEAD = 6b4b379` after `98764ad` was already pushed.

**Fix**: This report and the gate evidence file now explicitly distinguish:
- **Implementation SHA** (R5): `6b4b379` — the code commit
- **Evidence Closure HEAD** (R5): `98764ad` — docs-only backfill commit
- **Ancestor**: `6b4b379` is an ancestor of `98764ad` (verified via `git merge-base --is-ancestor`)

**Problem (P2-03)**: Evidence claimed "未部署" despite Vercel auto-build status.

**Fix**: Deployment statement corrected to: "No manual deployment, no real Preview runtime validation, no real CloudBase credentials or data writes; branch push triggered Vercel auto Preview build/deploy status."

## Files Changed (5 files)

| File | Status | Description |
|------|--------|-------------|
| `src/server/services/ProjectService.ts` | M | `deleteProject()` refactored: ledger survives during cleanup, `removeCleanupKeys()` after Storage deletes |
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | M | Added `removeCleanupKeys()` to `projects` interface + implementation |
| `src/server/infrastructure/persistence/cloudbase.nosql.cascade-boundary.test.ts` | M | +5 FIX-R6 service-path tests (AC-R6-01..04) |
| `scripts/verify-preview-isolation.ts` | NEW | Smoke Harness (AC-R6-05/06) |
| `docs/lumen-v2/reviews/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R5-GPT-REVIEW.md` | NEW | GPT review file (the verdict) |

## AC Coverage (AC-R6-01 ~ AC-R6-10)

| AC | Status | Evidence |
|----|--------|----------|
| AC-R6-01 | PASS | Ledger NOT deleted until all Storage objects cleaned; `removeCleanupKeys()` only called after cleanup loop |
| AC-R6-02 | PASS | Failed keys persist in ledger via `removeCleanupKeys()` filtering; sweeper can replay |
| AC-R6-03 | PASS | `OBJECT_NOT_FOUND` treated as idempotent success; crash window safe to retry |
| AC-R6-04 | PASS | 5 real service-path tests via `ProjectService.deleteProject()` — no `deleteCascade()` bypass |
| AC-R6-05 | PASS | `scripts/verify-preview-isolation.ts` imports production selector functions |
| AC-R6-06 | PASS | Smoke Harness exits 1 on bad Preview config (verified: `VERCEL=1` without `VERCEL_ENV` → exit 1) |
| AC-R6-07 | PASS | Evidence distinguishes: Implementation SHA=`ff6d33d`, Evidence commit=docs commit, ancestor verified |
| AC-R6-08 | PASS | Deployment statement: no manual deploy, no runtime validation; Vercel auto-build acknowledged |
| AC-R6-09 | PASS | 9 gates PASS (609 root tests: 194 client + 415 server; +5 vs R5) |
| AC-R6-10 | PASS | `readyForPreview=false` unchanged |

## Stop Conditions Verified

- `readyForPreview` remains `false`
- No real CloudBase writes
- No merge to main
- Cleanup ledger preserves failed keys on failure path
- Smoke Harness actually executes (exit 0 on pass, exit 1 on fail)

## Next Steps

1. GPT evidence review of this FIX-R6 implementation
2. If GPT accepts → Codex READ_ONLY limited audit (cleanup ledger crash-window, two-phase tombstone concurrency, Smoke Harness production reuse)
3. Codex audit scope only — does not re-audit closed workstreams
