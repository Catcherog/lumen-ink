# Trae Report — LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R7

**Date**: 2026-07-22
**Task ID**: LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R7-SERVICE-CRASH-TEST-CORRECTION
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r7`
**Base SHA**: `5d28b32` (FIX-R6 state transition commit — branch HEAD at task start)
**Risk Level**: MEDIUM
**Route**: R3 (GPT planned → Trae implements → GPT evidence review → Codex limited read-only audit)
**readyForPreview**: false (unchanged)

## GPT Verdict Addressed

FIX_REQUIRED (changes_requested) from GPT FIX-R6 verdict. Three required fixes:

| ID | Severity | Description |
|----|----------|-------------|
| RF-R7-01 | MEDIUM | Missing real service-path crash-window test (AC-R6-04 FAIL) |
| RF-R7-02 | MEDIUM | Test and evidence statements incorrectly claimed all 5 tests go through service layer |
| RF-R7-03 | MEDIUM | Re-run gates after test addition; maintain readyForPreview=false |

## Implementation Summary

### RF-R7-01: Real Service-Path Crash-Window Test (AC-R6-04 official closure)

**Problem**: The existing AC-R6-04 test only covered "partial Storage failure → second `service.deleteProject()` retry". It did NOT cover the crash window where:
- Storage objects are deleted successfully
- `removeCleanupKeys()` fails (simulating crash after object-delete but before ledger-update)
- The ledger still contains already-deleted keys
- A second `service.deleteProject()` call must treat `OBJECT_NOT_FOUND` as idempotent success and clean the ledger

**Fix**: Added 1 new test in `cloudbase.nosql.cascade-boundary.test.ts`:

`AC-R6-04 crash-window (FIX-R7): removeCleanupKeys fails after Storage delete → retry via service.deleteProject cleans ledger`

The test:
1. Creates a project with 2 Storage keys
2. Injects a one-shot fault on `repo.removeCleanupKeys()` so the first call throws after Storage objects are deleted
3. First `service.deleteProject()` call:
   - `deleteCascade` succeeds (Phase A + Phase B complete, ledger persisted)
   - Storage cleanup loop deletes both objects successfully
   - `removeCleanupKeys` throws → service swallows the error (console.warn) and returns `{deleted: true, cleanupFailures: []}`
4. Verifies crash-window state:
   - Storage objects are gone (deleted)
   - Ledger still contains both keys (removeCleanupKeys failed)
   - Project metadata is gone (deleteCascade succeeded)
5. Restores normal `removeCleanupKeys`
6. Second `service.deleteProject()` call:
   - `deleteCascade` is a no-op (project already deleted, cleans stale tombstone)
   - `getCleanupKeys` returns both keys (still in ledger)
   - Storage cleanup loop: both objects already gone → `OBJECT_NOT_FOUND` → idempotent success (service layer recognizes and adds to completedKeys)
   - `removeCleanupKeys` succeeds → ledger empty → doc deleted
7. Verifies final state:
   - Ledger is gone (deleted)
   - No cleanupFailures
   - `OBJECT_NOT_FOUND` was treated as success by the service layer

**This test officially closes AC-R6-04.** It does NOT use direct `deleteCascade()` or manual ledger operations — every step goes through `ProjectService.deleteProject()`.

### RF-R7-02: Test and Evidence Statement Corrections

**Problem**: FIX-R6 evidence made inaccurate claims:
- Test file header claimed "These tests verify the REAL ProjectService.deleteProject() service path (NOT direct deleteCascade calls)"
- Trae Report claimed "All tests use the real ProjectService.deleteProject() service path — no direct deleteCascade() bypass"
- STATE.json claimed "5 real service-path tests" and "no deleteCascade bypass"
- Gate evidence and completion packet repeated these claims

**Actual test classification** (corrected):

| Test | Classification | Goes through ProjectService.deleteProject()? |
|------|---------------|---------------------------------------------|
| AC-R6-01 full success | REAL SERVICE-PATH | ✅ Yes |
| AC-R6-02 partial failure | REAL SERVICE-PATH | ✅ Yes |
| AC-R6-03 crash window (adapter fixture) | ADAPTER-LEVEL | ❌ No (direct deleteCascade + manual loop + manual removeCleanupKeys) |
| AC-R6-04 partial-failure retry | REAL SERVICE-PATH | ✅ Yes (but only tests partial-failure retry, not crash window) |
| AC-R6-01 regression mid-cleanup crash | ADAPTER-LEVEL | ❌ No (direct deleteCascade) |
| **AC-R6-04 crash-window (FIX-R7 NEW)** | **REAL SERVICE-PATH** | ✅ Yes (officially closes AC-R6-04) |

**Corrections applied**:
1. **Test file header** (`cloudbase.nosql.cascade-boundary.test.ts` lines 714-739): Rewritten to accurately classify each test as REAL SERVICE-PATH or ADAPTER-LEVEL CRASH FIXTURE
2. **AC-R6-03 test comment**: Added "ADAPTER-LEVEL CRASH FIXTURE (NOT a service-path test)" preamble explaining it uses direct deleteCascade + manual ledger operations
3. **AC-R6-01 regression test comment**: Added "ADAPTER-LEVEL CRASH FIXTURE (NOT a service-path test)" preamble explaining it uses direct deleteCascade
4. **Test names**: AC-R6-03 and AC-R6-01-regression test names now include "(adapter-level fixture)" suffix for clarity
5. **This Trae Report**: Accurately records the correction (this section)
6. **Gate evidence**: New FIX-R7 gate evidence file with corrected test count and classification
7. **STATE.json**: Corrected fixR6 test classification claims; added fixR7 fields
8. **SESSION-HANDOFF**: Added FIX-R7 section with corrected classification
9. **Completion packet**: Updated to reflect FIX-R7 corrections

### RF-R7-03: Re-run Gates

All 9 gates re-run after adding the new test. Expected test count: 609 → 610 (+1 new crash-window test).

## Files Changed (3 files)

| File | Status | Description |
|------|--------|-------------|
| `src/server/infrastructure/persistence/cloudbase.nosql.cascade-boundary.test.ts` | M | +1 new test (AC-R6-04 crash-window); corrected test file header; added adapter-level classification comments to AC-R6-03 and AC-R6-01-regression |
| `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R7-TRAE-REPORT.md` | NEW | This report |
| `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r7-gate-results.md` | NEW | FIX-R7 gate evidence |

**Plus state-only updates**: STATE.json, SESSION-HANDOFF.md, completion packet.

**No production code changes.** The new test exercises existing production code paths; no production code modifications were needed.

## AC Coverage (AC-R6-01 ~ AC-R6-10, with FIX-R7 corrections)

| AC | Status | Evidence |
|----|--------|----------|
| AC-R6-01 | PASS | Ledger NOT deleted until all Storage objects cleaned; `removeCleanupKeys()` only called after cleanup loop |
| AC-R6-02 | PASS | Failed keys persist in ledger via `removeCleanupKeys()` filtering; sweeper can replay |
| AC-R6-03 | PASS_CODE / TEST_GAP→PASS_WITH_LIMITATION | Production code correct (OBJECT_NOT_FOUND idempotent). FIX-R7 correction: the existing AC-R6-03 test is an ADAPTER-LEVEL fixture, not a service-path test. The service-path coverage is now provided by the new AC-R6-04 crash-window test. |
| AC-R6-04 | **PASS (FIX-R7)** | The new AC-R6-04 crash-window test officially closes this AC. It exercises the real `ProjectService.deleteProject()` service path through the crash window: removeCleanupKeys fails after Storage delete → second service.deleteProject() treats OBJECT_NOT_FOUND as idempotent success and cleans the ledger. |
| AC-R6-05 | PASS | `scripts/verify-preview-isolation.ts` imports production selector functions |
| AC-R6-06 | PASS | Smoke Harness exits 1 on bad Preview config (verified: `VERCEL=1` without `VERCEL_ENV` → exit 1) |
| AC-R6-07 | PASS | Evidence distinguishes: Implementation SHA=`ff6d33d` (R6), Evidence commit=docs commit, ancestor verified |
| AC-R6-08 | PASS | Deployment statement: no manual deploy, no runtime validation; Vercel auto-build acknowledged |
| AC-R6-09 | PASS | 9 gates PASS (610 root tests: 194 client + 416 server; +1 vs R6) |
| AC-R6-10 | PASS | `readyForPreview=false` unchanged |

## Diff Risks (Carried Forward from FIX-R6 Verdict)

The GPT FIX-R6 verdict noted that `removeCleanupKeys()` is documented as "atomically" but is implemented as read → compute → update/remove (no transaction). This is not a blocking issue for FIX-R7 (test-only changes), but must remain in the Codex concurrent audit scope:

- Two cleanup workers simultaneously replaying the same ledger
- One worker deleting the ledger while another updates based on a stale snapshot
- Whether stale writes can permanently leave the ledger or produce incorrect success states

## Stop Conditions Verified

- `readyForPreview` remains `false`
- No real CloudBase writes
- No merge to main
- No production code changes (test-only + evidence corrections)
- Codex scope unchanged (cleanup ledger crash-window + partial-failure; cleanup worker concurrency; tombstone + child create concurrency; Smoke Harness production reuse)

## Next Steps

1. GPT evidence review of this FIX-R7 implementation
2. If GPT accepts → Codex READ_ONLY limited audit (scope unchanged from FIX-R6 verdict):
   - cleanup ledger crash-window + partial-failure semantics
   - cleanup worker concurrency and read-modify-write semantics
   - tombstone + child create concurrency invariants
   - Preview Smoke Harness production reuse
3. Codex audit does NOT re-audit closed workstreams
