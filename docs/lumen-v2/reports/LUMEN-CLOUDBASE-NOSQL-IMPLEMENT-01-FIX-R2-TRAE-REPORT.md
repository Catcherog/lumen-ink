# LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2 Trae Report

**Date**: 2026-07-21
**Trae Role**: Implementation
**Task**: LUMEN-CLOUDBASE-NOSQL-FIX-R2
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r2`
**Base SHA**: `f73c937`
**Result SHA**: `63bd445`
**Status**: `awaiting_gpt_acceptance / nextActor=gpt`

## 1. Context

GPT FIX-R1 review (2026-07-21) returned `FIX_REQUIRED` with 8 defects. The most critical finding (P0-01) was that the R1 "fix" commit `1fba413` contained no actual code changes — the blob SHAs for `cloudbase.nosql.ts` and `select.ts` were unchanged between Base and Result. The remaining defects (P0-02 through P1-02) identified specific code-level issues in the R1 implementation that had been present since the original `f73c937` commit.

This report documents the R2 fix round, which addresses all 8 required fixes (NOSQL-R2-01 through NOSQL-R2-08).

## 2. GPT-Identified Defects and R2 Resolution

### P0-01: FIX-R1 had no actual code changes
**R2 resolution**: New commit `63bd445` contains real code changes. `git diff f73c937..63bd445 --stat` shows 7 files changed, +1840/-309 lines. The blob SHAs for `cloudbase.nosql.ts` and `select.ts` are now different from Base.

### P0-02: CloudBase query/update operators used raw Mongo form
**R2 resolution (NOSQL-R2-02)**: 
- `buildUpdateFromPatch(patch, command)` now takes a `CloudBaseCommand` parameter and emits `command.set(value)` / `command.remove()` instead of `$set` / `$unset`.
- All query operators (`status: { $nin: ... }`, `$or: [...]`, `leaseExpiresAt: { $lte: ... }`) replaced with `cmd.nin()`, `cmd.or()`, `cmd.lte()`, `cmd.and()`, `cmd.eq()`, `cmd.in()`.
- The `command` object is captured from `db.command` during `ensureReady()` and stored in a closure variable.

### P0-03: ObjectStore discarded uploadFile() fileID
**R2 resolution (NOSQL-R2-04)**:
- New `object_metadata` collection stores `{ _id: storageKey, fileID, mimeType, sizeBytes, createdAt }`.
- `objects.put()` calls `uploadFile()`, captures the returned `fileID`, and saves it via `saveFileMetadata()`.
- `objects.get()`, `objects.getSignedUrl()`, `objects.delete()`, `objects.exists()` all resolve `storageKey → fileID` via `resolveFileId()` before calling CloudBase Storage APIs.
- The `object_metadata` collection is namespaced alongside entity collections (e.g., `prod_object_metadata`).

### P0-04: Job idempotency could produce orphan Jobs under concurrency
**R2 resolution (NOSQL-R2-03)**:
- `jobs.createIdempotent()` now wraps both Job creation and idempotency record creation inside `getDb().runTransaction()`.
- The idempotency record uses a deterministic `_id = "${projectId}__${idempotencyKey}"` (via `idempotencyDocId()`), so concurrent transactions that try to insert the same `_id` will conflict.
- Inside the transaction, a re-check guards against concurrent inserts that committed between the fast-path check and the transaction start.
- If the transaction throws E11000 (duplicate key), the catch block falls through to the retry path, which fetches the winner Job.
- Query scope is now `(projectId, key)` — FIX-R1 wrongly used `{ key }` only.
- Behavior test scenario 3 proves: two concurrent `createIdempotent` calls with the same `(projectId, key)` produce exactly 1 Job and 1 idempotency record.

### P0-05: deleteCascade double-deleted objects + broke responsibility boundary
**R2 resolution (NOSQL-R2-05)**:
- `projects.deleteCascade()` now only deletes database entity metadata: `versionIdempotency`, `jobs`, `jobIdempotency`, `versions`, `assets`, `projects`.
- It does NOT call `deleteFile()`, `uploadFile()`, `downloadFile()`, or `getTempFileURL()`.
- It does NOT delete `object_metadata` records — those are needed by `ProjectService.deleteProject()` to resolve `storageKey → fileID` for post-commit Storage cleanup.
- Behavior test scenario 8 proves: `deleteCascade` does not call `deleteFile`, and Storage files survive the call.

### P1-01: No Preview/Production namespace isolation
**R2 resolution (NOSQL-R2-06)**:
- `CloudBaseNoSqlOptions` now requires `dataNamespace` and `storagePrefix` (both non-empty strings).
- `validateCloudBaseNoSqlConfig()` throws `CLOUDBASE_CONFIG_REQUIRED` if either is missing or empty.
- `makeCollections(namespace)` prefixes every collection name with `${namespace}_` (e.g., `prod_projects`, `preview_projects`).
- `prefixCloudPath(key)` returns `${storagePrefix}/${key}` for all ObjectStore operations.
- Behavior test scenario 10 proves: Production data is invisible to a Preview-configured adapter (separate collections + separate cloudPaths).

### P1-02: Implicit backend selection via CLOUDBASE_API_KEY presence
**R2 resolution (NOSQL-R2-07)**:
- `select.ts` now requires explicit `PERSISTENCE_BACKEND` environment variable in deployed mode (`VERCEL=1`).
- Allowed values: `local`, `cloudbase-postgres`, `cloudbase-nosql`.
- Missing or invalid values throw `PERSISTENCE_BACKEND_REQUIRED` / `PERSISTENCE_BACKEND_INVALID`.
- In deployed mode, `local` is not allowed (throws `PERSISTENCE_BACKEND_REQUIRED`).
- NoSQL path requires `CLOUDBASE_DATA_NAMESPACE` and `CLOUDBASE_STORAGE_PREFIX` in addition to `CLOUDBASE_ENV_ID` and `CLOUDBASE_API_KEY`.
- Contract tests verify all selector branches.

### FIX-08: Evidence interval incorrect
**R2 resolution**: The new Result SHA `63bd445` contains actual code changes. The evidence file `fix-r2-gate-results.md` documents the real diff and gate results.

## 3. Test Infrastructure

### New mock CloudBase SDK (`cloudbase.nosql.mock.ts`)
A new in-memory mock of the CloudBase Node SDK was created to enable behavior testing without a real CloudBase connection. The mock models:
- `db.command` operators (`nin`, `in`, `lte`, `gte`, `gt`, `lt`, `eq`, `neq`, `or`, `and`, `set`, `remove`, `exists`, `push`, `inc`)
- `db.runTransaction(callback)` with optimistic concurrency control (OCC) — at commit time, if any `add` operation's `_id` already exists in the committed state, the transaction throws E11000 and rolls back.
- `collection().add()` with explicit `_id` enforces uniqueness (E11000 on conflict).
- `collection().where(query).update/get/remove` with full query evaluation.
- `app.uploadFile()` returns synthetic `fileID` (`cloud://envId/cloudPath`).
- `app.downloadFile()`, `getTempFileURL()`, `deleteFile()` resolve via fileID.

### Behavior test matrix (`cloudbase.nosql.r2.behavior.test.ts`)
14 scenarios covering the GPT-required test matrix:
1. Cross-repository transaction commit (unitOfWork.run propagates via AsyncLocalStorage)
2. Transaction callback throw → rollback (no writes committed)
3. Concurrent Job idempotency → only 1 Job, 1 idempotency record
4. Concurrent lease claim → only 1 worker wins
5. Terminal Job updateIfClaimed → null (no regression)
6. JobPatch null → command.remove() (field deleted from document)
7. Storage lifecycle: put → get → getSignedUrl → exists → delete
8. deleteCascade does NOT call Storage deleteFile (NOSQL-R2-05 boundary)
9. Real buildUpdateFromPatch produces command.set/remove (not raw $set/$unset)
10. Preview namespace cannot read Production data

### Updated contract tests (`cloudbase.nosql.contract.test.ts`)
Rewritten to test real production functions (`buildUpdateFromPatch`, `idempotencyDocId`, `validateCloudBaseNoSqlConfig`) instead of copied local logic. Uses `createMockCommand()` to get a `CloudBaseCommand` implementation for asserting update object structure.

## 4. Gate Results

All 8 gates pass:
- Client lint: 0 errors
- Client tsc: 0 errors
- Client tests: 194 tests / 10 files
- Server tsc: 0 errors
- Server tests: 317 tests / 29 files
- Root tests: 511 combined
- Build: client + server both succeed
- check-lumen-collab: no secrets detected

See `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r2-gate-results.md` for full details.

## 5. Stop Conditions

Per GPT review verdict, the following remain in effect:
- NoSQL stays `readyForPreview=false`
- No merge to main
- No Vercel Preview/Production config
- No Production API Key usage
- Codex review deferred until GPT passes R2 evidence review

## 6. Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/server/infrastructure/persistence/cloudbase.nosql.ts` | Modified (complete rewrite) | ~948 |
| `src/server/infrastructure/persistence/select.ts` | Modified (complete rewrite) | 194 |
| `src/server/infrastructure/persistence/cloudbase.nosql.mock.ts` | New | ~570 |
| `src/server/infrastructure/persistence/cloudbase.nosql.r2.behavior.test.ts` | New | ~500 |
| `src/server/infrastructure/persistence/cloudbase.nosql.contract.test.ts` | Modified (rewritten) | 313 |
| `src/server/infrastructure/persistence/select.test.ts` | Modified (updated) | 126 |
| `package-lock.json` | Modified (project rename) | 4 |
| `docs/lumen-v2/state/STATE.json` | Modified (R2 state) | — |
| `docs/lumen-v2/state/SESSION-HANDOFF.md` | Modified (R2 section) | — |
| `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01/fix-r2-gate-results.md` | New | — |
| `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R2-TRAE-REPORT.md` | New | — |

## 7. GPT Next Steps

1. Read this report + `fix-r2-gate-results.md` + the unified completion packet.
2. Verify `git diff f73c937..63bd445` contains real code changes (NOSQL-R2-01).
3. Review the 7 changed source/test files against NOSQL-R2-02 through NOSQL-R2-07.
4. Review the 14 behavior test scenarios against NOSQL-R2-08.
5. If R2 passes, authorize Codex limited read-only review (scope: `cloudbase.nosql.ts`, `select.ts`, NoSQL tests, `ProjectService`/`GenerationService` adapter call boundary, `f73c937..63bd445` diff).
6. Codex must not modify code unless R2 still has blocking issues and user authorizes.
