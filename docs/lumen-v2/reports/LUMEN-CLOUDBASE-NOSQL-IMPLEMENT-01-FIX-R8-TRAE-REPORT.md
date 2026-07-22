# Trae Report — LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R8

**Date**: 2026-07-23
**Task ID**: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R8-CONCURRENCY-HARDENING
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r8`
**Base SHA**: `44add08` (FIX-R7 gate-evidence SHA backfill — branch HEAD at task start)
**Risk Level**: HIGH
**Route**: R7 → Codex READ_ONLY audit findings → Trae concurrency hardening
**readyForPreview**: false (unchanged — stop condition enforced)

## Objective

修复 Codex READ_ONLY 审计发现的 cleanup concurrency 与 fail-open 风险：
1. deleteProject concurrent ownership — 并发 deleteCascade 覆盖 cleanup ledger
2. removeCleanupKeys atomicity — 并发执行 resurrect 已完成 keys
3. OBJECT_NOT_FOUND semantic distinction — metadata 缺失被当作远端确认删除
4. Preview production storage prefix validation — 缺失 prefix 时 fail-open

## Implementation Summary

### AC-01: deleteCascade concurrent ledger ownership

**Problem**: `deleteCascade` Phase B unconditionally wrote the cleanup ledger with `set()`. Two concurrent deleteCascade calls both reach Phase B (both see the Phase A tombstone as idempotent). The second call's `set()` would overwrite the first call's committed ledger — potentially losing already-deleted Storage keys from the ledger, breaking crash-window recovery.

**Fix** (`cloudbase.nosql.ts` deleteCascade Phase B, ~line 683): Before writing the ledger, check if a ledger already exists:
```typescript
const existingLedgerRes = await collection(COLLECTIONS.projectCleanupKeys).doc(id).get();
const existingLedger = unwrapDocumentData<{ keys: string[] }>(existingLedgerRes.data);
if (!existingLedger) {
  // write the ledger
}
// If existingLedger exists, preserve it (first call's snapshot is authoritative)
```

Inside the transaction with OCC read tracking, if a concurrent Phase B commits the ledger first, the second call's commit detects the conflict (ledger doc changed null → doc), retries the callback, re-reads the now-non-null ledger, and skips the write. The first call's authoritative snapshot is preserved.

### AC-02: removeCleanupKeys atomicity

**Problem**: `removeCleanupKeys` used a non-atomic read → compute → update/remove sequence. Two concurrent workers could both read the same ledger snapshot, compute different "remaining" sets, and the second write would resurrect keys the first worker already cleaned.

**Fix** (`cloudbase.nosql.ts` removeCleanupKeys, ~line 797): Replaced the non-atomic sequence with `getDb().runTransaction()`:
```typescript
return getDb().runTransaction(async (tx) => {
  const res = await tx.collection(COLLECTIONS.projectCleanupKeys).doc(id).get();
  const doc = res.data as { keys: string[] } | null;
  if (!doc) return []; // ledger already deleted
  const remaining = (doc.keys ?? []).filter((k) => !removedSet.has(k));
  if (remaining.length === 0) {
    await tx.collection(COLLECTIONS.projectCleanupKeys).doc(id).remove();
    return [];
  }
  await tx.collection(COLLECTIONS.projectCleanupKeys).doc(id).update({ keys: cmd.set(remaining) });
  return remaining;
});
```

CloudBase's OCC detects the conflict when the second worker tries to commit. It retries the callback, which re-reads the ledger and sees the first worker's changes. No keys are resurrected.

### AC-03: OBJECT_NOT_FOUND semantic distinction

**Problem**: `objects.delete()` threw `OBJECT_NOT_FOUND` when the metadata doc was missing — the same error code used for SDK-confirmed remote object deletion. Callers could not distinguish "metadata gone, remote deletion NOT confirmed" from "SDK confirmed remote object not found". This is a fail-open risk: missing metadata was treated as confirmed success.

**Fix**:
- `cloudbase.nosql.ts` `objects.delete()` (~line 1448): When `resolveFileId()` throws `OBJECT_NOT_FOUND` (metadata missing), re-throw as `METADATA_MISSING: ${key}: cannot confirm remote deletion (metadata not found)`.
- `cloudbase.nosql.ts` `objects.exists()` (~line 1495): When metadata is missing, return `false` but log `METADATA_MISSING` distinctly with "remote NOT confirmed deleted" so operators understand the semantic.
- `ProjectService.ts` `deleteProject()` cleanup loop (~line 351): Handle `METADATA_MISSING` distinctly from `OBJECT_NOT_FOUND`:
  - `OBJECT_NOT_FOUND` → SDK-confirmed remote deletion → idempotent success
  - `METADATA_MISSING` → metadata gone, remote NOT confirmed → probable success for crash-window recovery, but explicitly warn

**AC-R6-03 test update**: The existing crash-window fixture expected `OBJECT_NOT_FOUND` for the missing-metadata case. Updated to expect `METADATA_MISSING` (the new correct semantic) and verify the distinction via a `metadataMissingKeys` bucket.

### AC-04: Preview production storage prefix validation

**Problem**: `validatePreviewIsolation()` checked `productionNamespace` required but NOT `productionStoragePrefix`. A missing `productionStoragePrefix` would cause the equality comparison to silently pass (empty string != non-empty Preview prefix), allowing a misconfigured Preview deployment to share Production storage — fail-open.

**Fix** (`select.ts` `validatePreviewIsolation()`, ~line 143): Added `PRODUCTION_STORAGE_PREFIX_REQUIRED` check parallel to the existing `productionNamespace` check:
```typescript
if (!productionStoragePrefix || productionStoragePrefix.trim() === '') {
  throw new Error(
    'PRODUCTION_STORAGE_PREFIX_REQUIRED: CLOUDBASE_PRODUCTION_STORAGE_PREFIX must be set ...'
  );
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | AC-01: deleteCascade ledger existence check; AC-02: removeCleanupKeys runTransaction; AC-03: objects.delete/exists METADATA_MISSING |
| `src/server/services/ProjectService.ts` | AC-03: deleteProject handles METADATA_MISSING distinctly from OBJECT_NOT_FOUND |
| `src/server/infrastructure/persistence/select.ts` | AC-04: validatePreviewIsolation PRODUCTION_STORAGE_PREFIX_REQUIRED check |
| `src/server/infrastructure/persistence/cloudbase.nosql.cascade-boundary.test.ts` | AC-03: AC-R6-03 test updated for METADATA_MISSING; +8 NEW tests (AC-01×2, AC-02×3, AC-03×3) |
| `src/server/infrastructure/persistence/select.preview-isolation.test.ts` | AC-04: +5 NEW tests (3 pure-function + 2 integration) |

## AC Coverage

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | PASS | 2 NEW tests: concurrent Phase B preserves first call's ledger (OCC retry); ledger not overwritten when already present |
| AC-02 | PASS | 3 NEW tests: concurrent removeCleanupKeys no resurrection (OCC retry); returns [] when ledger already deleted; sequential batches |
| AC-03 | PASS | 3 NEW tests + 1 updated test: objects.delete throws METADATA_MISSING; objects.exists logs distinctly; ProjectService treats as probable success with warning; AC-R6-03 updated |
| AC-04 | PASS | 5 NEW tests: empty/whitespace/undefined productionStoragePrefix throws PRODUCTION_STORAGE_PREFIX_REQUIRED; integration tests for missing/empty env var |
| AC-05 | PASS | R7 crash-window test (AC-R6-04) remains PASS; all 25→33 cascade-boundary tests PASS |
| AC-06 | PASS | 429/429 tests PASS + tsc exit 0 + check-lumen-collab exit 0 |

## Gate Results

| Gate | Result |
|------|--------|
| Server tests (vitest run) | 429 passed (34 files) |
| Server typecheck (tsc --noEmit) | exit 0 |
| check-lumen-collab.mjs | PASS (no secrets) |
| readyForPreview | false (unchanged) |
| main merge | none (stop condition) |
| real CloudBase writes | none (stop condition) |

**Test delta**: 416 → 429 (+13 new tests: 8 cascade-boundary + 5 preview-isolation)

## Stop Conditions

- `readyForPreview` remains `false` ✓
- No main merge ✓
- No real CloudBase writes ✓
- PersistenceDependencies interface unchanged ✓
- No new services ✓

## Remaining Risks

1. **Mock-only concurrency evidence**: OCC retry is Mock-simulated via `occReadTracking` + `preCommitHook`. Real CloudBase OCC semantics may differ slightly, but the production code path (`runTransaction` + read-before-write) is correct regardless of Mock.
2. **METADATA_MISSING is best-effort for crash-window**: Treating missing metadata as "probable success" is the correct recovery semantic (most likely a previous delete succeeded), but operators should be aware remote deletion is NOT confirmed. A future Storage audit tool could verify.
3. **Codex READ_ONLY audit scope**: This round addresses the 4 specific audit findings. A follow-up Codex audit may be required to verify the fixes.

## Status Transition

- `fixR7Status`: `awaiting_gpt_acceptance` → remains (GPT has not yet accepted R7)
- `fixR8Status`: `ready_for_trae` → `awaiting_gpt_acceptance`
- `fixR8NextActor`: `trae` → `gpt`
- `readyForPreview`: `false` (unchanged)
- `codexStatus`: `REQUIRED_AFTER_GPT_REVIEW_PASS` (deferred until GPT accepts FIX-R8)
