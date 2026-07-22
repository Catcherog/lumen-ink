# CloudBase NoSQL Query Inventory

> **Task**: LUMEN-CLOUDBASE-NOSQL-QUERY-INDEX-INVENTORY-01
> **Route**: R1 (LOW risk, docs-only, read-only analysis)
> **Base SHA**: `a858d7f` (branch `lumen/cloudbase-nosql-implement-01-fix-r3`)
> **Analyzed file**: `src/server/infrastructure/persistence/cloudbase.nosql.ts` (1061 lines)
> **Companion doc**: `CLOUDBASE-NOSQL-INDEX-PLAN.md` (Preview + Production index sets)
> **Generated**: 2026-07-22

---

## 1. Purpose

This document is a complete, line-referenced inventory of every database
query executed by the CloudBase NoSQL adapter
(`src/server/infrastructure/persistence/cloudbase.nosql.ts`) at commit
`a858d7f`. It exists so that the Vercel Preview deployment of the NoSQL
adapter is not blocked a second time by a missing composite index.

It covers:

- every `where()` call (AC-01),
- every `orderBy()` call (AC-02),
- every primary-key `doc(id)` call (for completeness, marked as needing
  no index),
- the collection, calling function, query / orderBy fields, operation
  type, frequency, index category, Preview-criticality, and expected
  behavior when the index is absent.

CloudBase console fields are never guessed; anything that depends on
CloudBase-specific planner behavior is tagged `ASSUMPTION_TO_VERIFY`
(AC-04).

---

## 2. Collections in use

All collection names are prefixed with `${dataNamespace}_` so Preview and
Production cannot collide on the same CloudBase env (NOSQL-R2-06). The
namespace is required at config-validation time
(`validateCloudBaseNoSqlConfig`, lines 240–253) and missing/empty
namespaces fail closed.

| Logical name | Physical collection | Source |
|---|---|---|
| projects | `${ns}_projects` | `makeCollections`, line 268 |
| assets | `${ns}_assets` | line 269 |
| versions | `${ns}_versions` | line 270 |
| versionIdempotency | `${ns}_version_idempotency` | line 271 |
| jobs | `${ns}_generation_jobs` | line 272 |
| jobIdempotency | `${ns}_job_idempotency` | line 273 |
| authThrottle | `${ns}_auth_throttle` | line 274 |
| objectMetadata | `${ns}_object_metadata` | line 275 (new in FIX-R2, NOSQL-R2-04) |

`object_metadata` is internal Storage metadata (storageKey → fileID
mapping), not a domain entity table.

---

## 3. Index category legend (AC-03)

| Category | Meaning | CloudBase behavior |
|---|---|---|
| **PK** | Primary-key `doc(id)` lookup on `_id`. | Always uses the default `_id` index. No manual index required. |
| **SINGLE** | `where()` on a single non-`_id` field. | `ASSUMPTION_TO_VERIFY`: MongoDB-compatible stores usually create single-field indexes automatically on first query; CloudBase's exact behavior must be confirmed in the console. |
| **COMPOUND** | `where()` on 2+ fields, or `where()` + `orderBy()` on a different field. | Manual composite index required in the CloudBase console. |
| **COMPOUND-OR** | `where()` containing `cmd.or(...)` over multiple fields. | Index utilization is planner-dependent; a single compound index may not cover all branches. Tagged `ASSUMPTION_TO_VERIFY`. |

---

## 4. Primary-key `doc(id)` queries (no index required)

These all hit the default `_id` index and are listed for completeness
only. They satisfy AC-01/AC-02 trivially because they use neither
`where()` nor `orderBy()`.

| # | Collection | Function | Line | Operation | Notes |
|---|---|---|---|---|---|
| P-01 | projects | `projects.get` | 482 | `doc(id).get()` | |
| P-02 | projects | `projects.updatePointers` | 500, 506 | `doc(id).get()` | pre-check + post-read |
| P-03 | projects | `projects.updatePointers` | 505 | `doc(id).update()` | |
| P-04 | projects | `projects.deleteCascade` | 576 | `doc(id).remove()` | inside transaction |
| P-05 | assets | `assets.get` | 591 | `doc(id).get()` | |
| P-06 | versions | `versions.get` | 670 | `doc(id).get()` | |
| P-07 | versionIdempotency | `versions.createIdempotent` | 621, 654 | `doc(idemId).get()` | deterministic `_id = ${projectId}__${key}` (NOSQL-R2-03) |
| P-08 | versionIdempotency | `versions.createIdempotent` (tx) | 636 | `tx.collection(...).doc(idemId).get()` | transaction-scoped re-check |
| P-09 | versions | `versions.createIdempotent` | 624–626, 657–660 | `doc(existingDoc.versionId).get()` | follow-up by FK |
| P-10 | jobs | `jobs.get` | 788 | `doc(id).get()` | |
| P-11 | jobs | `jobs.update` | 797, 800 | `doc(id).update()` + `doc(id).get()` | |
| P-12 | jobs | `jobs.createIdempotent` | 730, 774 | `doc(idemId).get()` | deterministic `_id` (NOSQL-R2-03) |
| P-13 | jobs | `jobs.createIdempotent` (tx) | 745 | `tx.collection(...).doc(idemId).get()` | transaction-scoped re-check |
| P-14 | jobs | `jobs.createIdempotent` (tx) | 748–750 | `tx.collection(COLLECTIONS.jobs).doc(recheckDoc.jobId).get()` | |
| P-15 | jobs | `jobs.createIdempotent` | 733–735, 777–779 | `doc(existingDoc.jobId).get()` | follow-up by FK |
| P-16 | jobs | `jobs.updateIfClaimed` | 816, 829 | `doc(id).get()` | fallback when patch empty + post-update read |
| P-17 | jobs | `jobs.updateIfActive` | 841, 853 | `doc(id).get()` | fallback when patch empty + post-update read |
| P-18 | jobs | `jobs.claim` | 890 | `doc(id).get()` | failure-diagnosis read when claim returned 0 |
| P-19 | objectMetadata | `objects.resolveFileId` | 441 | `doc(storageKey).get()` | `_id = storageKey` (NOSQL-R2-04) |
| P-20 | objectMetadata | `objects.saveFileMetadata` | 458 | `doc(storageKey).set()` | upsert |
| P-21 | objectMetadata | `objects.deleteFileMetadata` | 468 | `doc(storageKey).remove()` | |
| P-22 | authThrottle | `authThrottle.get` | 1030 | `doc(key).get()` | `_id = HMAC-SHA256(ip, jwtSecret)` (D-034) |
| P-23 | authThrottle | `authThrottle.put` | 1037 | `doc(key).set()` | upsert |
| P-24 | authThrottle | `authThrottle.delete` | 1045 | `doc(key).remove()` | |

**Index requirement**: none. CloudBase (MongoDB-compatible) always
creates the default `_id` index. These queries are the most frequent in
the system (object_metadata lookups happen on every Storage read/write,
authThrottle on every login attempt) and they are all PK lookups.

---

## 5. `where()` queries (AC-01)

Every non-transaction `where()` call in the adapter. Transaction bodies
cannot call `where()` — this is enforced at compile time by the
`TransactionCollectionRef` type (lines 93–96, FIX-R3 AC-03), so
transactions are structurally excluded from this section.

### Q-01 — `assets.listByProject`

| Field | Value |
|---|---|
| Collection | `${ns}_assets` |
| Calling function | `assets.listByProject(projectId)` (line 595) |
| Query fields | `{ projectId }` (line 597) |
| orderBy | none |
| Operation | `get()` |
| Callers | `ProjectService.getProjectDetail` (line 220), `ProjectService.deleteProject` (line 302) |
| Frequency | **Medium-high** — every project detail GET, every project delete |
| Index category | SINGLE (`projectId`) |
| Preview-critical | **YES** — project detail page is a core user flow |
| Behavior without index | `ASSUMPTION_TO_VERIFY`: CloudBase likely performs a collection scan. For Preview volumes (single-digit projects) this is acceptable; for Production it will degrade as assets grow. |

### Q-02 — `versions.listByProject`

| Field | Value |
|---|---|
| Collection | `${ns}_versions` |
| Calling function | `versions.listByProject(projectId)` (line 674) |
| Query fields | `{ projectId }` (lines 676–677) |
| orderBy | `createdAt` asc (line 678) |
| Operation | `get()` |
| Callers | `ProjectService.getProjectDetail` (line 221), `ProjectService.approveVersion` (line 260), `ProjectService.rejectVersion` (line 282), `GenerationService.startJob` (lines 187, 443) |
| Frequency | **High** — every project detail, every version approve/reject, every job start (twice per job) |
| Index category | **COMPOUND** `(projectId, createdAt)` — orderBy on a different field forces a compound index |
| Preview-critical | **YES** — blocks job start, project detail, and version management |
| Behavior without index | CloudBase must sort in-memory after a collection scan. With orderBy, the query may be rejected or slow. For Preview this is risky because `startJob` depends on it. |

### Q-03 — `jobs.listActiveByProject`

| Field | Value |
|---|---|
| Collection | `${ns}_generation_jobs` |
| Calling function | `jobs.listActiveByProject(projectId)` (line 921) |
| Query fields | `{ projectId, status: cmd.in(ACTIVE_JOB_STATUSES) }` (lines 925–928). `ACTIVE_JOB_STATUSES` = `['queued','uploading','analyzing','generating','postprocessing','saving']` (lines 194–201) |
| orderBy | none |
| Operation | `get()` |
| Callers | `GenerationService.listJobsByProject` (line 167) → route `GET /api/projects/:id/jobs` |
| Frequency | **Medium** — user-facing jobs list |
| Index category | **COMPOUND** `(projectId, status)` |
| Preview-critical | **YES** — jobs list page |
| Behavior without index | Collection scan + filter. Preview volumes are low but `cmd.in` with 7 values may not use a single-field `status` index efficiently. `ASSUMPTION_TO_VERIFY`: whether CloudBase uses the `status` index for `cmd.in`. |
| Note | A compound `(projectId, status)` index covers this query. A single-field `projectId` index would also help but would not be optimal for the `in` filter. |

### Q-04 — `jobs.listLeaseExpired`

| Field | Value |
|---|---|
| Collection | `${ns}_generation_jobs` |
| Calling function | `jobs.listLeaseExpired(now)` (line 936) |
| Query fields | `cmd.and([ { status: cmd.in(ACTIVE_JOB_STATUSES) }, cmd.or([ { leaseToken: cmd.eq(null) }, { leaseExpiresAt: cmd.lte(now) } ]) ])` (lines 940–948) |
| orderBy | none |
| Operation | `get()` |
| Callers | `worker.ts` sweeper (line 178, runs every `sweeperIntervalMs` = 500ms in production per `index.ts` line 141), `worker-recovery.ts` `recoverPendingJobs` (line 127, called by `/api/worker/recover` cron `0 0 * * *`) |
| Frequency | **Very high** when a worker is active (every 500ms) + daily cron |
| Index category | **COMPOUND-OR** — the `or` over `leaseToken` and `leaseExpiresAt` makes a single compound index insufficient. Best candidate: compound `(status, leaseExpiresAt)` covers the second `or` branch + the `and` filter; the `leaseToken eq null` branch is `ASSUMPTION_TO_VERIFY`. |
| Preview-critical | **YES** — without this, lease recovery fails and queued Jobs never get reclaimed after a worker restart, which is the entire point of PERSIST-001 |
| Behavior without index | Collection scan every 500ms. Acceptable for Preview's tiny dataset but will degrade immediately in Production. **This is the single highest-risk query in the system.** |
| Note | Because the sweeper runs at 500ms intervals, this query must be index-covered even in Preview to avoid burning read quota. |

### Q-05 — `jobs.updateIfClaimed` (conditional update)

| Field | Value |
|---|---|
| Collection | `${ns}_generation_jobs` |
| Calling function | `jobs.updateIfClaimed(id, leaseToken, patch)` (line 811) |
| Query fields | `cmd.and([ { _id: id }, { leaseToken: cmd.eq(leaseToken) }, { status: cmd.nin(TERMINAL_JOB_STATUSES) } ])` (lines 822–826). `TERMINAL_JOB_STATUSES` = `['succeeded','failed','cancelled']` (lines 184–188) |
| orderBy | none |
| Operation | `where(query).update(update)` (line 827) |
| Callers | `worker.ts` executeJob path (state transitions during job execution) |
| Frequency | **High** — every job state transition while a worker holds the lease |
| Index category | **PK** — the `_id: id` clause makes this a primary-key-scoped update. The additional `leaseToken` and `status` conditions are post-filter on the single matched document. No composite index needed. |
| Preview-critical | NO (PK) |
| Behavior without index | N/A — uses the default `_id` index. |

### Q-06 — `jobs.updateIfActive` (conditional update)

| Field | Value |
|---|---|
| Collection | `${ns}_generation_jobs` |
| Calling function | `jobs.updateIfActive(id, patch)` (line 836) |
| Query fields | `cmd.and([ { _id: id }, { status: cmd.nin(TERMINAL_JOB_STATUSES) } ])` (lines 847–850) |
| orderBy | none |
| Operation | `where(query).update(update)` (line 851) |
| Callers | `GenerationService` job-state transitions from non-worker contexts |
| Frequency | Medium |
| Index category | **PK** — `_id: id` scopes the update to a single document |
| Preview-critical | NO (PK) |
| Behavior without index | N/A |

### Q-07 — `jobs.claim` (atomic lease claim)

| Field | Value |
|---|---|
| Collection | `${ns}_generation_jobs` |
| Calling function | `jobs.claim(id, input)` (line 867) |
| Query fields | `cmd.and([ { _id: id }, { status: cmd.nin(TERMINAL_JOB_STATUSES) }, cmd.or([ { leaseToken: cmd.eq(null) }, { leaseToken: cmd.eq(input.leaseToken) }, { leaseExpiresAt: cmd.lte(input.now) } ]) ])` (lines 873–881) |
| orderBy | none |
| Operation | `where(query).update(update)` (line 888) |
| Callers | `worker.ts` executeJob — every job pickup |
| Frequency | **High** — once per job execution attempt |
| Index category | **PK** — `_id: id` scopes to a single document. The `or`/`and` conditions are evaluated against that one document. |
| Preview-critical | NO (PK) |
| Behavior without index | N/A |

### Q-08 — `jobs.heartbeat` (lease renewal)

| Field | Value |
|---|---|
| Collection | `${ns}_generation_jobs` |
| Calling function | `jobs.heartbeat(id, input)` (line 899) |
| Query fields | `cmd.and([ { _id: id }, { leaseToken: cmd.eq(input.leaseToken) }, { status: cmd.nin(TERMINAL_JOB_STATUSES) } ])` (lines 905–909) |
| orderBy | none |
| Operation | `where(query).update(update)` (line 914) |
| Callers | `worker.ts` — called periodically while a job is executing |
| Frequency | **High** — once per lease renewal interval during execution |
| Index category | **PK** — `_id: id` scopes to a single document |
| Preview-critical | NO (PK) |
| Behavior without index | N/A |

### Q-09 — `projects.deleteCascade` pre-fetch (5 child collections)

| Field | Value |
|---|---|
| Collection | `${ns}_version_idempotency`, `${ns}_generation_jobs`, `${ns}_job_idempotency`, `${ns}_versions`, `${ns}_assets` (lines 540–546) |
| Calling function | `projects.deleteCascade(id)` (line 530), pre-fetch loop at lines 549–553 |
| Query fields | `{ projectId: id }` (line 550) — identical for all 5 collections |
| orderBy | none |
| Operation | `get()` — pre-fetch only; the actual deletes happen inside the transaction by `doc(id).remove()` (P-04 style) |
| Callers | `ProjectService.deleteProject` (after collecting storage keys, before `unitOfWork.run`) |
| Frequency | **Low** — only on project deletion |
| Index category | **SINGLE** (`projectId`) on each of the 5 collections. Note: `version_idempotency` and `job_idempotency` store `projectId` as a denormalized field (lines 643, 759) specifically for this cascade lookup. |
| Preview-critical | **YES** — project deletion must work in Preview; without these indexes the pre-fetch scans the whole collection |
| Behavior without index | Collection scan × 5. For Preview's tiny dataset, acceptable; for Production, dangerous as Jobs grow. |
| Note | The 100-op transaction limit check (lines 556–564) depends on the pre-fetch returning the correct IDs. A scan returning stale data could cause the limit check to miscount. |
| Overlap | The `assets` and `versions` pre-fetches are identical in shape to Q-01 and Q-02 (without orderBy). A single `projectId` single-field index on each collection covers both `listByProject` and `deleteCascade` pre-fetch. For `versions`, the compound `(projectId, createdAt)` index from Q-02 also covers this query. |

---

## 6. `orderBy()` queries (AC-02)

Only one `orderBy()` call exists in the adapter.

### O-01 — `versions.listByProject` orderBy

| Field | Value |
|---|---|
| Collection | `${ns}_versions` |
| Calling function | `versions.listByProject` (line 674) |
| orderBy | `createdAt` asc (line 678) |
| Combined with | `where({ projectId })` (Q-02) |
| Index implication | Forces compound `(projectId, createdAt)` instead of single-field `projectId` |
| Note | Direction is `asc`. CloudBase compound indexes are direction-aware; `ASSUMPTION_TO_VERIFY`: whether CloudBase supports bidirectional traversal of a compound index for asc/desc queries. |

No other `orderBy()` calls exist. The `listActiveByProject`, `listLeaseExpired`, `updateIfClaimed`, `updateIfActive`, `claim`, `heartbeat`, `deleteCascade` pre-fetch, `assets.listByProject` queries do not use `orderBy`.

---

## 7. Special patterns called out by the task

### 7.1 assets by projectId

Covered by **Q-01**. Single-field `projectId` index on `${ns}_assets`.
Preview-critical.

### 7.2 versions by projectId + createdAt

Covered by **Q-02** + **O-01**. Compound `(projectId, createdAt)` index
on `${ns}_versions`. Preview-critical. This is the only orderBy query in
the adapter.

### 7.3 jobs by projectId + status

Covered by **Q-03** (`listActiveByProject`). Compound
`(projectId, status)` index on `${ns}_generation_jobs`. Preview-critical.

Note: the `status` field uses `cmd.in(ACTIVE_JOB_STATUSES)` with 7
values. `ASSUMPTION_TO_VERIFY`: whether CloudBase's planner uses a
compound `(projectId, status)` index for an `in` predicate on the
second field. If not, the fallback is a single-field `projectId` index
+ in-memory filter, which is acceptable for Preview.

### 7.4 lease expiry query

Covered by **Q-04** (`listLeaseExpired`). This is the highest-risk
query in the system because the sweeper runs every 500ms.

Recommended index: compound `(status, leaseExpiresAt)` on
`${ns}_generation_jobs`. The `or` branch
`{ leaseToken: cmd.eq(null) }` is `ASSUMPTION_TO_VERIFY` — it may not
be covered by this index. Mitigation: also create a single-field index
on `leaseToken` so the planner can choose a branch. See INDEX-PLAN for
the full rationale.

### 7.5 lease conditional updates

Covered by **Q-05** (`updateIfClaimed`), **Q-07** (`claim`),
**Q-08** (`heartbeat`). All three include `_id: id` in the `and`, so
they are PK-scoped updates. **No composite index required.** The
`leaseToken` and `status` conditions are post-filters on the single
matched document.

This is a deliberate design choice: by including `_id` in the query,
the adapter avoids needing a compound `(leaseToken, status)` index
that would otherwise be required for a `where({ leaseToken, status })`
query.

### 7.6 project cascade child lookup

Covered by **Q-09**. Five single-field `projectId` indexes (one per
child collection). For `versions`, the compound `(projectId, createdAt)`
index from Q-02 subsumes the single-field. Preview-critical because
project deletion must work.

### 7.7 job/version idempotency deterministic `_id`

Covered by **P-07** (version idempotency) and **P-12** (job
idempotency). Both use `doc(idemId)` where
`idemId = ${projectId}__${key}` (line 336). This is a PK lookup — **no
index required**. The deterministic `_id` is the atomicity mechanism
(NOSQL-R2-03): duplicate inserts fail with E11000 at the `_id` level,
and the transaction rolls back both the idempotency record and the
entity.

### 7.8 auth throttle key lookup

Covered by **P-22–P-24**. The throttle key is
`HMAC-SHA256(ip, jwtSecret)` (line 43, `authThrottle.ts`), opaque and
stable. All three operations (`get`/`put`/`delete`) are PK lookups on
`${ns}_auth_throttle._id`. **No index required.**

### 7.9 object metadata key lookup

Covered by **P-19–P-21**. The metadata key is the `storageKey` itself,
stored as `_id` (line 458). All `objects.get`/`getSignedUrl`/`delete`/
`exists` calls go through `resolveFileId(storageKey)` which is a PK
lookup. **No index required.** This is the most frequent read path in
the system (every Storage read).

---

## 8. Frequency summary

| Query | Frequency | Reason |
|---|---|---|
| P-19 `object_metadata.doc(storageKey).get()` | Very high | Every Storage read (download, signed URL, delete, exists) |
| Q-04 `listLeaseExpired` | Very high (500ms sweeper) | Worker recovery loop |
| P-22–P-24 `auth_throttle` PK ops | Medium | Every login attempt |
| Q-02 `versions.listByProject` | High | Every project detail, every job start (×2), every version approve/reject |
| Q-05/Q-07/Q-08 lease conditional updates | High | Every job state transition |
| Q-01 `assets.listByProject` | Medium-high | Project detail, project delete |
| Q-03 `listActiveByProject` | Medium | Jobs list page |
| Q-09 `deleteCascade` pre-fetch | Low | Project delete only |

---

## 9. Preview-critical queries (must have indexes before READY_FOR_PREVIEW)

| Query | Index needed | Reason |
|---|---|---|
| Q-01 `assets.listByProject` | SINGLE `projectId` on `${ns}_assets` | Project detail page |
| Q-02 `versions.listByProject` | COMPOUND `(projectId, createdAt)` on `${ns}_versions` | Project detail + job start |
| Q-03 `jobs.listActiveByProject` | COMPOUND `(projectId, status)` on `${ns}_generation_jobs` | Jobs list page |
| Q-04 `jobs.listLeaseExpired` | COMPOUND `(status, leaseExpiresAt)` on `${ns}_generation_jobs` | Worker recovery — runs every 500ms |
| Q-09 `deleteCascade` pre-fetch (×5) | SINGLE `projectId` on `${ns}_version_idempotency`, `${ns}_generation_jobs`, `${ns}_job_idempotency`, `${ns}_assets`. `versions` covered by Q-02 compound. | Project deletion |

All other queries are PK-scoped and need no manual index.

---

## 10. ASSUMPTION_TO_VERIFY items (AC-04)

These items must be confirmed against the CloudBase console or official
docs before Production. They do not block Preview.

1. **Single-field auto-index**: Does CloudBase automatically create a
   single-field index on first query (MongoDB default), or must every
   index be created manually? Affects Q-01, Q-09.
2. **`cmd.in` index usage**: Does a compound `(projectId, status)`
   index support an `in` predicate on `status` with 7 values? Affects
   Q-03, Q-04.
3. **`cmd.or` index usage**: Does the planner use a compound
   `(status, leaseExpiresAt)` index for the `or` branch
   `{ leaseToken: cmd.eq(null) }`? Affects Q-04.
4. **Compound index direction**: Is a compound `(projectId, createdAt)`
   index usable for both `asc` and `desc` orderBy, or must the index
   direction match? Affects Q-02/O-01.
5. **`cmd.nin` index usage**: Do `cmd.nin(TERMINAL_JOB_STATUSES)`
   conditions in Q-05/Q-06/Q-07/Q-08 use an index on `status`? These
   are PK-scoped so it doesn't matter, but worth confirming for
   documentation.
6. **Transaction `where()` prohibition**: Confirmed in FIX-R3 AC-03 —
   CloudBase transactions only support `doc(id)` and `add()`. Not an
   assumption; verified against `@cloudbase/node-sdk ^3.18.3` types.
7. **Collection name length**: CloudBase may enforce a max collection
   name length. `${ns}_generation_jobs` is the longest at 22+ chars;
   should be well under any reasonable limit, but worth confirming in
   the console.

---

## 11. Stop conditions check (AC-06)

The following conditions halt index creation and require human
intervention before proceeding:

1. CloudBase console rejects a composite index creation (e.g., field
   name conflict, quota exceeded).
2. A query's actual EXPLAIN plan shows a collection scan despite the
   expected index existing — indicates the index does not cover the
   query shape (e.g., `or` branch not covered).
3. Preview deployment fails with a CloudBase index-related error
   (e.g., "no index for compound query") — the index plan is
   incomplete and must be revised.
4. CloudBase console shows a different field name or type than what
   the adapter writes (e.g., `createdAt` stored as string but index
   expects Date).
5. The 100-op transaction limit (CLOUDBASE_TX_OP_LIMIT, line 182) is
   hit during `deleteCascade` — not an index issue, but a stop
   condition for the deletion path.

When any of these fire, stop creating new indexes, document the
failure in `CLOUDBASE-NOSQL-INDEX-PLAN.md` under "Verification
results", and escalate to GPT for a revised plan.

---

## 12. Scope compliance

- AC-01: Every `where()` is covered — Q-01 through Q-09.
- AC-02: Every `orderBy()` is covered — O-01 (only one).
- AC-03: PK / SINGLE / COMPOUND / COMPOUND-OR distinguished in §3 and
  per-query.
- AC-04: 7 `ASSUMPTION_TO_VERIFY` items in §10.
- AC-07: No adapter code modified. This is a docs-only analysis.
- AC-08: No real indexes created. This is a plan only.

Preview/Production index sets and creation-order stop conditions are in
`CLOUDBASE-NOSQL-INDEX-PLAN.md` (AC-05, AC-06).
