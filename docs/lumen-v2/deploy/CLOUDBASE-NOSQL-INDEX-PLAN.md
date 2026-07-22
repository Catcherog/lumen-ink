# CloudBase NoSQL Index Plan

> **Task**: LUMEN-CLOUDBASE-NOSQL-QUERY-INDEX-INVENTORY-01
> **Route**: R1 (LOW risk, docs-only)
> **Base SHA**: `a858d7f`
> **Companion doc**: `CLOUDBASE-NOSQL-QUERY-INVENTORY.md` (full query inventory)
> **Generated**: 2026-07-22
> **Status**: PLAN ONLY — no indexes have been created (AC-08).

---

## 1. Purpose

This plan defines the minimum index set required for Vercel Preview
deployment of the CloudBase NoSQL adapter, and the recommended index
set for Production. It is derived from the query inventory in
`CLOUDBASE-NOSQL-QUERY-INVENTORY.md` and exists to prevent Preview
from being blocked a second time by a missing composite index.

The plan is **namespace-aware**: every collection name below is shown
as `${ns}_<name>` where `${ns}` is the value of
`CLOUDBASE_DATA_NAMESPACE` for the target environment. The Preview
namespace and Production namespace MUST be distinct (NOSQL-R2-06,
`validateCloudBaseNoSqlConfig` lines 240–253). Indexes must be created
on the physical collection name, e.g. `preview_assets`, `prod_assets`.

---

## 2. Index creation prerequisites

Before creating any index:

1. Confirm the CloudBase env ID (`zeh-d7glqc07me2155c61` per STATE.json
   `cloudbaseNoSqlImplement.envId`).
2. Confirm the namespace value for the target environment
   (`CLOUDBASE_DATA_NAMESPACE`). Preview and Production must use
   different values.
3. Confirm the physical collection names exist. CloudBase may create
   collections on first write; if a collection does not yet exist,
   write a single seed document and delete it, or create the collection
   explicitly in the console.
4. Confirm the field names match the adapter's camelCase conventions
   (the adapter stores entities as-is using camelCase, per `toDoc` line
   312). Do NOT use snake_case field names in indexes — the adapter
   writes `projectId`, `createdAt`, `leaseExpiresAt`, `leaseToken`,
   `status`, never `project_id` etc.

---

## 3. Preview minimum index set (AC-05)

These indexes MUST exist before the NoSQL adapter is marked
`READY_FOR_PREVIEW`. They cover every Preview-critical query in §9 of
the QUERY-INVENTORY.

| # | Collection | Index fields | Type | Covers query | Reason |
|---|---|---|---|---|---|
| 1 | `${ns}_assets` | `projectId` (asc) | SINGLE | Q-01, Q-09 (assets) | Project detail page + delete cascade pre-fetch |
| 2 | `${ns}_versions` | `projectId` (asc), `createdAt` (asc) | COMPOUND | Q-02, O-01, Q-09 (versions) | Project detail + job start + delete cascade pre-fetch. The compound index subsumes a single-field `projectId` index. |
| 3 | `${ns}_generation_jobs` | `projectId` (asc), `status` (asc) | COMPOUND | Q-03 | Jobs list page (`listActiveByProject`) |
| 4 | `${ns}_generation_jobs` | `status` (asc), `leaseExpiresAt` (asc) | COMPOUND | Q-04 | `listLeaseExpired` — worker recovery sweeper runs every 500ms |
| 5 | `${ns}_version_idempotency` | `projectId` (asc) | SINGLE | Q-09 (versionIdempotency) | Delete cascade pre-fetch |
| 6 | `${ns}_job_idempotency` | `projectId` (asc) | SINGLE | Q-09 (jobIdempotency) | Delete cascade pre-fetch |

**Total: 6 indexes** (4 compound, 2 single-field) across 5 physical
collections.

### 3.1 Why these 6 and not more

- `${ns}_projects`, `${ns}_auth_throttle`, `${ns}_object_metadata` are
  accessed exclusively by primary key (`doc(id)`) — the default `_id`
  index covers them. See P-01 through P-24 in the inventory.
- The lease conditional updates (`updateIfClaimed`, `updateIfActive`,
  `claim`, `heartbeat` — Q-05 through Q-08) all include `_id: id` in
  the `and` clause, making them PK-scoped. No composite
  `(leaseToken, status)` index is needed. This is a deliberate adapter
  design choice documented in §7.5 of the inventory.
- `${ns}_assets` and `${ns}_versions` share `projectId` indexes with
  the `deleteCascade` pre-fetch (Q-09), so no separate cascade indexes
  are needed.
- `${ns}_versions`'s compound `(projectId, createdAt)` index subsumes
  a single-field `projectId` index, so only one index is created
  there.

### 3.2 Preview namespace note

For Preview, the namespace is expected to be `preview` (or similar).
All 6 indexes must be created on the `preview_*` physical collections.
Do NOT create them on `prod_*` collections — that is the Production
set in §4.

### 3.3 Preview creation order

Create indexes in this order to minimize risk:

1. `${ns}_assets(projectId)` — simplest, lowest risk
2. `${ns}_version_idempotency(projectId)` — simple
3. `${ns}_job_idempotency(projectId)` — simple
4. `${ns}_versions(projectId, createdAt)` — compound, needed for job start
5. `${ns}_generation_jobs(projectId, status)` — compound, needed for jobs list
6. `${ns}_generation_jobs(status, leaseExpiresAt)` — compound, needed for worker recovery

If any creation fails, stop and consult §6 (Stop conditions).

---

## 4. Production recommended index set (AC-05)

Production should start with the Preview set and add the following
optional/defensive indexes. These are NOT required for correctness but
improve query-planner flexibility under load.

| # | Collection | Index fields | Type | Reason | Priority |
|---|---|---|---|---|---|
| 7 | `${ns}_generation_jobs` | `leaseToken` (asc) | SINGLE | Helps the `listLeaseExpired` `or` branch `{ leaseToken: cmd.eq(null) }` if the planner cannot use the compound `(status, leaseExpiresAt)` for that branch. See ASSUMPTION_TO_VERIFY #3. | P2 |
| 8 | `${ns}_generation_jobs` | `status` (asc) | SINGLE | Defensive: if a future query filters by `status` alone (e.g., admin dashboards), this avoids a full scan. Currently no such query exists. | P3 |
| 9 | `${ns}_versions` | `projectId` (asc), `createdAt` (desc) | COMPOUND | Reverse-direction compound index for `orderBy('createdAt', 'desc')` if a future "newest first" query is added. Currently the adapter only uses `asc`. See ASSUMPTION_TO_VERIFY #4. | P3 |
| 10 | `${ns}_object_metadata` | `createdAt` (asc) | SINGLE | Optional: enables TTL-style cleanup queries on stale metadata. Currently no such query exists in the adapter. | P3 |

**Production total: 6 (Preview set) + 4 (optional) = 10 indexes.**

The 4 optional indexes should only be created after the ASSUMPTION_TO_VERIFY
items in §5 are resolved and after Production load testing confirms the
Preview set is insufficient.

---

## 5. ASSUMPTION_TO_VERIFY resolution plan (AC-04)

These must be resolved before Production. They do NOT block Preview.

| # | Assumption | How to verify | Resolution action |
|---|---|---|---|
| 1 | Single-field auto-index behavior | In CloudBase console, run a single-field `where({ projectId })` query on a collection with no manual index. Check the EXPLAIN / query plan. | If auto-indexed: no action needed for Q-01, Q-09 single-field queries. If not: confirm the manual single-field indexes in §3 cover them. |
| 2 | `cmd.in` compound index usage | In CloudBase console, run `where({ projectId, status: cmd.in([...7 values]) })` with the compound `(projectId, status)` index. Check EXPLAIN. | If used: no action. If not: add a single-field `projectId` index as fallback (already present for `${ns}_assets`, would need adding for `${ns}_generation_jobs` — but the compound index already covers `projectId` as the prefix). |
| 3 | `cmd.or` compound index usage | In CloudBase console, run `listLeaseExpired`'s exact query shape with the compound `(status, leaseExpiresAt)` index. Check EXPLAIN for the `leaseToken eq null` branch. | If not covered: create the optional single-field `leaseToken` index (#7 in §4). The planner can then use index intersection or choose the better branch. |
| 4 | Compound index direction | In CloudBase console, run `orderBy('createdAt', 'asc')` and `orderBy('createdAt', 'desc')` against the same compound `(projectId, createdAt asc)` index. | If `desc` is not covered: create the optional reverse compound index (#9 in §4) when a desc query is added. Currently no desc query exists, so this is deferred. |
| 5 | `cmd.nin` index usage | In CloudBase console, check EXPLAIN for `where({ _id: id, status: cmd.nin([...]) })`. | No action required — these are PK-scoped (Q-05–Q-08). Document the result for future reference. |
| 6 | Transaction `where()` prohibition | Already verified in FIX-R3 AC-03 against `@cloudbase/node-sdk ^3.18.3` types. | No action. |
| 7 | Collection name length | In CloudBase console, confirm `${ns}_generation_jobs` (e.g. `preview_generation_jobs`, 25 chars) is accepted. | No action expected — well under any reasonable limit. |

---

## 6. Stop conditions (AC-06)

Index creation MUST stop and escalate to GPT if any of the following
fire. Do not attempt to work around them by creating alternative
indexes without GPT approval.

| # | Condition | Action |
|---|---|---|
| S-01 | CloudBase console rejects a composite index creation (field name conflict, quota exceeded, unsupported field type). | Stop. Document the error verbatim. Escalate to GPT with the error message and the index definition. |
| S-02 | A query's EXPLAIN shows a collection scan despite the expected index existing. | Stop. The index does not cover the query shape (e.g., `or` branch not covered, field type mismatch). Document the EXPLAIN output. Escalate to GPT. |
| S-03 | Preview deployment fails with a CloudBase index-related error (e.g., "no index for compound query", "query requires sort but no index"). | Stop. The index plan is incomplete. Capture the exact error, identify which query triggered it, cross-reference with the inventory, and escalate to GPT for a revised plan. |
| S-04 | CloudBase console shows a different field name or type than the adapter writes (e.g., `createdAt` stored as string but index expects Date; `projectId` stored as ObjectId but adapter writes string). | Stop. Type mismatch between adapter and index. Document the mismatch. Escalate to GPT — may require adapter code change (out of scope for this task). |
| S-05 | The 100-op transaction limit (`CLOUDBASE_TX_OP_LIMIT`, line 182) is hit during `deleteCascade`. | Stop. This is not an index issue but a deletion-path stop condition. The project has too many child documents for a single transaction. Escalate to GPT for a batched-deletion design. |
| S-06 | Creating an index on the Production namespace accidentally (e.g., creating `prod_*` indexes when only `preview_*` was authorized). | Stop immediately. Do NOT delete Production indexes without explicit user authorization. Document what was created and escalate to user. |
| S-07 | Index creation requires CloudBase credentials that are not available. | Stop. Do not attempt to obtain credentials programmatically. Escalate to user to create the indexes manually in the console. |

---

## 7. Verification checklist (post-creation)

After creating the Preview index set, verify each query is
index-covered:

| Query | Verification command | Expected result |
|---|---|---|
| Q-01 `assets.listByProject` | `where({ projectId: '<test-project-id>' }).get()` with EXPLAIN | Uses `projectId` index, no COLLSCAN |
| Q-02 `versions.listByProject` | `where({ projectId: '<test>' }).orderBy('createdAt', 'asc').get()` with EXPLAIN | Uses compound `(projectId, createdAt)` index, no SORT stage |
| Q-03 `listActiveByProject` | `where({ projectId: '<test>', status: cmd.in(ACTIVE_JOB_STATUSES) }).get()` with EXPLAIN | Uses compound `(projectId, status)` index |
| Q-04 `listLeaseExpired` | `where(cmd.and([...])).get()` with EXPLAIN | Uses compound `(status, leaseExpiresAt)` index for the `leaseExpiresAt` branch. The `leaseToken eq null` branch is ASSUMPTION_TO_VERIFY #3. |
| Q-09 `deleteCascade` pre-fetch | `where({ projectId: '<test>' }).get()` on each of the 5 child collections | Uses `projectId` index (or compound prefix) on each |

If CloudBase does not expose EXPLAIN, fall back to timing the query
with a seeded dataset of ~1000 documents per collection. A
sub-100ms query indicates index usage; a multi-second query indicates
a collection scan.

---

## 8. Preview deployment gate

The NoSQL adapter MUST NOT be marked `READY_FOR_PREVIEW` until ALL of
the following are true:

1. All 6 indexes in §3 have been created on the Preview namespace
   physical collections.
2. The verification checklist in §7 confirms each Preview-critical
   query is index-covered (or, for ASSUMPTION_TO_VERIFY items, the
   query completes in acceptable time for Preview volumes).
3. No stop condition in §6 is currently triggered.
4. The Preview namespace (`CLOUDBASE_DATA_NAMESPACE`) and storage
   prefix (`CLOUDBASE_STORAGE_PREFIX`) are set in the Vercel Preview
   environment variables and are distinct from Production values.
5. The CloudBase env ID and API key are configured
   (`CLOUDBASE_ENV_ID`, `CLOUDBASE_API_KEY`).

This gate is independent of the GPT + Codex review gate for the NoSQL
adapter code (LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01). Both gates must
pass before `READY_FOR_PREVIEW`.

---

## 9. Rollback

If an index causes a regression (e.g., write performance degradation,
incorrect query results due to stale index):

1. Delete the index in the CloudBase console.
2. Document the regression in this file under "Verification results".
3. The adapter continues to function — queries fall back to collection
   scans, which are correct but slower.
4. Do NOT delete the default `_id` index under any circumstances.

Index deletion is safe and reversible. Index creation is also safe but
should be done one at a time with verification between each, per §3.3.

---

## 10. Verification results

> This section is filled in after the indexes are actually created
> (out of scope for this docs-only task). It records:
> - which indexes were created and when,
> - the EXPLAIN / timing result for each Preview-critical query,
> - which ASSUMPTION_TO_VERIFY items were resolved and how,
> - any stop conditions that fired and how they were handled.

(Empty — no indexes created yet, per AC-08.)

---

## 11. Scope compliance

- AC-05: Preview minimum index set in §3 (6 indexes); Production
  recommended set in §4 (10 indexes total).
- AC-06: Stop conditions in §6 (7 conditions).
- AC-07: No adapter code modified.
- AC-08: No real indexes created. §10 is empty.
