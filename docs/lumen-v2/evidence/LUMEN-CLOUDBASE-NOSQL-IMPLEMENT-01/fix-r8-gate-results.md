# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R8 Gate Results

**Date**: 2026-07-23
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r8`
**Base SHA**: `44add08` (FIX-R7 gate-evidence SHA backfill — branch HEAD at FIX-R8 task start)
**Implementation SHA**: `0439924` (full: `043992435e95803fd1f592a7af48abdf95c3d04f` — code + tests + Trae Report commit)
**Trae Role**: Implementation (production code + test changes; addresses Codex READ_ONLY audit findings)
**Status**: `awaiting_gpt_acceptance / nextActor=gpt`
**readyForPreview**: false (unchanged — stop condition enforced)
**Risk Level**: HIGH

## SHA Evidence

### Distinguished SHAs

| Label | SHA (short) | Role |
|-------|-------------|------|
| R7 Closure (parent of R8) | `44add08` | FIX-R7 gate-evidence SHA backfill — branch HEAD when FIX-R8 worktree created |
| R8 Implementation | `0439924` | FIX-R8 code + tests + Trae Report commit (this round) |

### Ancestor Verification (post-commit)

```
git merge-base --is-ancestor 44add08 0439924  → exit 0 (TRUE: 44add08 is ancestor of 0439924)
```

Chain: `fb7066a → 44add08 → 0439924`

### Post-Implementation git status

```
git status --short  (after implementation commit)
```

```
 M docs/lumen-v2/state/SESSION-HANDOFF.md
 M docs/lumen-v2/state/STATE.json
?? docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r8-gate-results.md
```

Remaining changes are docs-only (state transition + this evidence file), to be committed in a follow-up docs commit.

## Scope of FIX-R8 (per Codex READ_ONLY audit findings)

**Production code + test changes.** Addresses 4 specific concurrency/fail-open risks identified by Codex READ_ONLY audit on FIX-R7:

1. **AC-01 — deleteProject concurrent ownership**: `deleteCascade` Phase B unconditionally wrote the cleanup ledger with `set()`. Two concurrent deleteCascade calls could overwrite the first call's committed ledger, losing already-deleted Storage keys. **Fix**: Check existing ledger before writing; OCC retry on concurrent Phase B preserves first call's authoritative snapshot.

2. **AC-02 — removeCleanupKeys atomicity**: `removeCleanupKeys` used a non-atomic read → compute → update/remove sequence. Two concurrent workers could both read the same snapshot, compute different "remaining" sets, and the second write would resurrect keys the first worker already cleaned. **Fix**: Replaced with `getDb().runTransaction()` for atomic read-modify-write; OCC conflict triggers retry, no keys resurrected.

3. **AC-03 — OBJECT_NOT_FOUND semantic distinction**: `objects.delete()` threw `OBJECT_NOT_FOUND` when the metadata doc was missing — same error code used for SDK-confirmed remote object deletion. Callers could not distinguish "metadata gone, remote NOT confirmed" from "SDK confirmed remote object not found". This is a fail-open risk. **Fix**: New `METADATA_MISSING` error code for missing-metadata case; `ProjectService.deleteProject()` treats `METADATA_MISSING` as probable success (crash-window recovery) with explicit warning, distinct from `OBJECT_NOT_FOUND` (SDK-confirmed idempotent success).

4. **AC-04 — Preview production storage prefix validation**: `validatePreviewIsolation()` checked `productionNamespace` required but NOT `productionStoragePrefix`. A missing `productionStoragePrefix` would silently pass the equality comparison, allowing misconfigured Preview to share Production storage. **Fix**: Added `PRODUCTION_STORAGE_PREFIX_REQUIRED` check parallel to `productionNamespace` check.

## Diff Verification

```
git diff --stat 44add08..0439924
```

```
 src/server/infrastructure/persistence/cloudbase.nosql.cascade-boundary.test.ts | 327 +++++++++++++++---
 src/server/infrastructure/persistence/cloudbase.nosql.ts                       |  72 ++++-
 src/server/infrastructure/persistence/select.preview-isolation.test.ts         |  82 ++++-
 src/server/infrastructure/persistence/select.ts                                |  10 +
 src/server/services/ProjectService.ts                                          |  18 +-
 docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R8-TRAE-REPORT.md | 139 +++++++++
 6 files changed, 701 insertions(+), 43 deletions(-)
```

**Files total**: 3 production code + 2 test files + 1 new Trae Report. All modifications in `src/server/` + `docs/lumen-v2/`. **No PersistenceDependencies interface changes.**

## Gates (subset run for FIX-R8 — server-focused changes)

| # | Gate | Command | Result | Count |
|---|------|---------|--------|-------|
| 1 | Server tsc | `npx tsc -p tsconfig.json --noEmit` (from `src/server/`) | PASS | 0 errors |
| 2 | Server tests | `npx vitest run` (from `src/server/`) | PASS | 429 tests / 34 files |
| 3 | check-lumen-collab | `node scripts/check-lumen-collab.mjs` | PASS | no secrets detected |
| 4 | readyForPreview | (state invariant) | PASS | false (unchanged) |
| 5 | main merge | (stop condition) | PASS | none |
| 6 | real CloudBase writes | (stop condition) | PASS | none |

**Note on client gates**: FIX-R8 changes are confined to `src/server/` (persistence adapter + service + tests). Client code is untouched. Client gates (lint/tsc/tests/build) are unchanged from FIX-R7 baseline (194 client tests). Server gate (429 tests) supersedes R7's 416.

## Test Count Comparison (R7 → R8)

| Suite | R7 | R8 | Delta |
|-------|-----|-----|-------|
| Client | 194 | 194 | 0 (unchanged — no client changes) |
| Server | 416 | 429 | +13 |
| Root total | 610 | 623 | +13 |

Server delta breakdown (+13):
- `cloudbase.nosql.cascade-boundary.test.ts`: +8 tests (AC-01×2, AC-02×3, AC-03×3); 1 existing test (AC-R6-03) updated for new METADATA_MISSING semantic
- `select.preview-isolation.test.ts`: +5 tests (AC-04: 3 pure-function + 2 integration)

## New Test Inventory (13 tests)

### AC-01: deleteCascade concurrent ledger ownership (2 tests)

| # | Test | Scenario |
|---|------|----------|
| 1 | concurrent Phase B: second call preserves first call's ledger (no overwrite) | `occReadTracking=true` + `preCommitHook` simulates first call's Phase B committing ledger before second call's commit; OCC retry makes second call re-read and skip the write |
| 2 | ledger is NOT overwritten when already present from a prior Phase B commit | Pre-populates the ledger, runs deleteCascade, verifies original keys preserved |

### AC-02: removeCleanupKeys atomicity (3 tests)

| # | Test | Scenario |
|---|------|----------|
| 3 | concurrent removeCleanupKeys: second worker does NOT resurrect keys removed by first | Ledger starts [k0,k1,k2]; preCommitHook simulates Worker A committing [k1,k2]; Worker B removes k1 → OCC retry → remaining [k2] (k0 NOT resurrected) |
| 4 | concurrent removeCleanupKeys: returns [] when ledger already deleted by another worker | preCommitHook deletes ledger doc; removeCleanupKeys returns [] |
| 5 | sequential removeCleanupKeys: removes keys one batch at a time | Normal sequential: batch 1 removes k0/k1 → [k2]; batch 2 removes k2 → ledger deleted |

### AC-03: OBJECT_NOT_FOUND semantic distinction (3 tests)

| # | Test | Scenario |
|---|------|----------|
| 6 | objects.delete() throws METADATA_MISSING when metadata is missing (not OBJECT_NOT_FOUND) | Verifies `METADATA_MISSING: missing-key` error and NOT bare `OBJECT_NOT_FOUND:` |
| 7 | objects.exists() returns false (no throw) when metadata is missing, logs METADATA_MISSING | Spies on `console.warn`; verifies `METADATA_MISSING` and `remote NOT confirmed deleted` in logs |
| 8 | ProjectService.deleteProject() treats METADATA_MISSING as probable success, logs warning | Creates project, puts object, runs deleteCascade, manually deletes metadata, calls service.deleteProject(); verifies METADATA_MISSING warning logged and ledger cleaned |

### AC-04: Preview production storage prefix validation (5 tests)

| # | Test | Scenario |
|---|------|----------|
| 9 | throws PRODUCTION_STORAGE_PREFIX_REQUIRED when productionStoragePrefix is empty | Pure-function test on `validatePreviewIsolation` |
| 10 | throws PRODUCTION_STORAGE_PREFIX_REQUIRED when productionStoragePrefix is whitespace-only | Pure-function test |
| 11 | throws PRODUCTION_STORAGE_PREFIX_REQUIRED when productionStoragePrefix is undefined | Pure-function test |
| 12 | Preview with missing CLOUDBASE_PRODUCTION_STORAGE_PREFIX → PRODUCTION_STORAGE_PREFIX_REQUIRED | Integration test on `selectPersistenceByEnv`; verifies `mockCreateNoSql` NOT called |
| 13 | Preview with empty CLOUDBASE_PRODUCTION_STORAGE_PREFIX → PRODUCTION_STORAGE_PREFIX_REQUIRED | Integration test; verifies `mockCreateNoSql` NOT called |

## Updated Test (AC-R6-03 — reflects new METADATA_MISSING semantic)

The existing AC-R6-03 crash-window fixture expected `OBJECT_NOT_FOUND` when metadata was missing. After AC-03 production code change, `objects.delete()` now throws `METADATA_MISSING` instead. The test was updated to handle both error codes and verify the semantic distinction via a `metadataMissingKeys` bucket:

```typescript
const completedKeys: string[] = [];
const metadataMissingKeys: string[] = [];
for (const key of ledgerKeys) {
  try {
    await deps.objects.delete(key);
    completedKeys.push(key);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('METADATA_MISSING')) {
      completedKeys.push(key);
      metadataMissingKeys.push(key);
    } else if (msg.includes('OBJECT_NOT_FOUND')) {
      completedKeys.push(key);
    } else {
      throw err;
    }
  }
}
expect(completedKeys.sort()).toEqual(['key-0', 'key-1']);
expect(metadataMissingKeys).toEqual(['key-0']);
```

This preserves the R7 crash-window test's PASS status (AC-05) while reflecting the new METADATA_MISSING semantic.

## AC Coverage Summary (AC-01 ~ AC-06)

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | PASS | 2 NEW tests: concurrent Phase B preserves first call's ledger (OCC retry); ledger not overwritten when already present |
| AC-02 | PASS | 3 NEW tests: concurrent removeCleanupKeys no resurrection (OCC retry); returns [] when ledger already deleted; sequential batches |
| AC-03 | PASS | 3 NEW tests + 1 updated test: objects.delete throws METADATA_MISSING; objects.exists logs distinctly; ProjectService treats as probable success with warning; AC-R6-03 updated |
| AC-04 | PASS | 5 NEW tests: empty/whitespace/undefined productionStoragePrefix throws PRODUCTION_STORAGE_PREFIX_REQUIRED; integration tests for missing/empty env var |
| AC-05 | PASS | R7 crash-window test (AC-R6-04) remains PASS; all 33 cascade-boundary tests PASS |
| AC-06 | PASS | 429/429 server tests PASS + tsc exit 0 + check-lumen-collab exit 0 |

## Remaining Risks

1. **Mock-only concurrency evidence**: OCC retry is Mock-simulated via `occReadTracking` + `preCommitHook`. Real CloudBase OCC semantics may differ slightly, but the production code path (`runTransaction` + read-before-write) is correct regardless of Mock.
2. **METADATA_MISSING is best-effort for crash-window**: Treating missing metadata as "probable success" is the correct recovery semantic (most likely a previous delete succeeded), but operators should be aware remote deletion is NOT confirmed. A future Storage audit tool could verify.
3. **Codex READ_ONLY audit scope**: This round addresses the 4 specific audit findings. A follow-up Codex audit may be required to verify the fixes.

## Stop Conditions Verified

- `readyForPreview` remains `false` ✓
- No main merge ✓
- No real CloudBase writes ✓
- PersistenceDependencies interface unchanged ✓
- No new services ✓

## Production Code Changes (3 files)

| File | AC | Change |
|------|----|--------|
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | AC-01 | deleteCascade Phase B: check existing ledger before writing (lines ~683-695) |
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | AC-02 | removeCleanupKeys: replaced non-atomic read→compute→update with `runTransaction()` (lines ~797-831) |
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | AC-03 | objects.delete(): throw `METADATA_MISSING` when metadata missing (~line 1448); objects.exists(): log `METADATA_MISSING` distinctly (~line 1495) |
| `src/server/services/ProjectService.ts` | AC-03 | deleteProject() cleanup loop: handle `METADATA_MISSING` distinctly from `OBJECT_NOT_FOUND` (~line 351) |
| `src/server/infrastructure/persistence/select.ts` | AC-04 | validatePreviewIsolation(): `PRODUCTION_STORAGE_PREFIX_REQUIRED` check (~line 143) |

## Test Files Changed (2 files)

| File | AC | Change |
|------|----|--------|
| `src/server/infrastructure/persistence/cloudbase.nosql.cascade-boundary.test.ts` | AC-01/02/03/05 | +8 NEW tests (AC-01×2, AC-02×3, AC-03×3); AC-R6-03 test updated for METADATA_MISSING semantic |
| `src/server/infrastructure/persistence/select.preview-isolation.test.ts` | AC-04 | +5 NEW tests (3 pure-function + 2 integration) |
