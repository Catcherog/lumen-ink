# Preview Deployment Readiness Runbook — Lumen CloudBase NoSQL Adapter

> **⚠️ This runbook does NOT execute real Preview. It prepares for Preview deployment readiness only.**
>
> 本 runbook 仅为 Preview 上线准备材料，不执行任何真实的 Preview 部署、不写入真实 CloudBase 数据。

| Field | Value |
|-------|-------|
| **Status** | Engineering validated; final repository audit and real CloudBase Preview pending. |
| **Task** | LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01 (Section C — Preview preparation materials) |
| **readyForPreview** | `false` — this runbook does NOT unlock Preview |
| **Adapter** | `cloudbase-nosql` (CloudBase document database, MongoDB-compatible via `@cloudbase/node-sdk`) |
| **Backend selection rule** | NOSQL-R2-07 — backend is selected EXPLICITLY via `PERSISTENCE_BACKEND`, no implicit credential detection |
| **Last code-verified** | 2026-07-23 against `src/server/infrastructure/persistence/select.ts`, `cloudbase.nosql.ts`, `select.preview-isolation.test.ts` |

---

## Source-of-truth code references

Every checklist item below maps to a concrete code location. Read these files when validating:

| Concern | File | Symbol |
|---------|------|--------|
| Preview isolation gate | `src/server/infrastructure/persistence/select.ts` | `validatePreviewIsolation()` (line ~123) |
| Preview environment detection | `src/server/infrastructure/persistence/select.ts` | `isPreviewEnvironment()` (line ~198) |
| Gate execution (before SDK init) | `src/server/infrastructure/persistence/select.ts` | `runPreviewIsolationGateIfPreview()` (line ~220) |
| NoSQL config validation | `src/server/infrastructure/persistence/cloudbase.nosql.ts` | `validateCloudBaseNoSqlConfig()` (line ~240) |
| Adapter factory | `src/server/infrastructure/persistence/cloudbase.nosql.ts` | `createCloudBaseNoSqlPersistence()` (line ~357) |
| Collection name prefixing | `src/server/infrastructure/persistence/cloudbase.nosql.ts` | `makeCollections()` (line ~265) |
| Storage path prefixing | `src/server/infrastructure/persistence/cloudbase.nosql.ts` | `prefixCloudPath()` (line ~456) |
| SDK lazy init | `src/server/infrastructure/persistence/cloudbase.nosql.ts` | `ensureReady()` (line ~371) |
| Gate accept/reject cases | `src/server/infrastructure/persistence/select.preview-isolation.test.ts` | full suite |

---

## 1. Preview Environment Variables Checklist

> 所有 env var 必须在 Vercel Preview 环境中配置。Secret 类变量只在 Vercel/CloudBase 控制台配置，**严禁**写入仓库或本 runbook。

### 1.1 Required — CloudBase NoSQL core

| Env var | Required | Example value (PLACEHOLDER) | Purpose | Validated by |
|---------|----------|------------------------------|---------|--------------|
| `PERSISTENCE_BACKEND` | ✅ MUST | `cloudbase-nosql` | Explicitly selects the NoSQL adapter. In deployed mode any other value (or unset) → `PERSISTENCE_BACKEND_REQUIRED`. | `parseBackend()` / `selectPersistenceByEnv()` deployed-mode guard |
| `CLOUDBASE_ENV_ID` | ✅ MUST | `preview-env-id` | Preview CloudBase environment ID. Used as `tcb.init({ env })`. | `validateCloudBaseNoSqlConfig()` — missing → `CLOUDBASE_CONFIG_REQUIRED` |
| `CLOUDBASE_API_KEY` | ✅ MUST (secret) | `preview-api-key` | Preview CloudBase Server API Key (JWT). Used as `tcb.init({ accessKey })`. **Never log, never commit.** | `validateCloudBaseNoSqlConfig()` — missing → `CLOUDBASE_CONFIG_REQUIRED` |
| `CLOUDBASE_DATA_NAMESPACE` | ✅ MUST | `preview` | Prefixes EVERY collection name. MUST be `preview` (or similar), NOT `prod`/`production`. Produces `preview_projects`, `preview_assets`, … | `validateCloudBaseNoSqlConfig()` + Preview isolation gate |
| `CLOUDBASE_STORAGE_PREFIX` | ✅ MUST | `preview` | Prefixes EVERY cloudPath. MUST be `preview` (or similar), NOT `prod`/`production`. Produces `preview/<key>` paths. | `validateCloudBaseNoSqlConfig()` + Preview isolation gate |

### 1.2 Required — Preview isolation gate (compares Preview vs Production)

| Env var | Required | Example value (PLACEHOLDER) | Purpose | Validated by |
|---------|----------|------------------------------|---------|--------------|
| `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` | ✅ MUST | `production` | Production data namespace. The gate compares this against the Preview namespace to confirm isolation. | `validatePreviewIsolation()` — missing → `PRODUCTION_NAMESPACE_REQUIRED` |
| `CLOUDBASE_PRODUCTION_STORAGE_PREFIX` | ✅ MUST | `production` | Production storage prefix. The gate compares this against the Preview prefix (FIX-R8 AC-04). | `validatePreviewIsolation()` — missing → `PRODUCTION_STORAGE_PREFIX_REQUIRED` |

> **⚠️ Critical**: The Production `CLOUDBASE_PRODUCTION_*` values are the *reference* the gate compares against. They describe **Production**, not Preview. They MUST be set in the Preview environment's env vars so the pure-function gate can run without contacting Production. Without either, the gate fails closed (the SDK is never initialised — see Section 2).

### 1.3 Required — Vercel Preview detection (authoritative)

| Env var | Required | Example value | Purpose | Validated by |
|---------|----------|---------------|---------|--------------|
| `VERCEL` | ✅ MUST | `1` | Marks a Vercel deployment (deployed mode). Without it, the selector falls back to the local adapter. | `selectPersistenceByEnv()` — `isDeployed` check |
| `VERCEL_ENV` | ✅ MUST | `preview` | **Authoritative** Preview/Production signal (FIX-R5). `preview` → gate runs; `production` → gate skipped. Any other value (or missing) with `VERCEL=1` → `VERCEL_ENV_REQUIRED_OR_INVALID` (fail closed). | `isPreviewEnvironment()` |

> **P1-04 fix note**: A Vercel Preview deployment frequently ships with `NODE_ENV=production`. The gate uses `VERCEL_ENV=preview` as the authoritative signal — `NODE_ENV` is NOT consulted for Preview detection. Do not rely on `NODE_ENV` to distinguish Preview from Production.

### 1.4 Optional / conditional

| Env var | Required | Example value | Purpose |
|---------|----------|---------------|---------|
| `CLOUDBASE_SIGNED_URL_TTL_SECONDS` | Optional | `900` | Signed URL TTL (default 900 = 15 min). Parsed via `Number()`. |
| `CLOUDBASE_PREVIEW_MODE` | Optional (local only) | `1` | Explicit Preview opt-in for **local** integration tests when `VERCEL` is not set. Triggers the gate in non-deployed mode. Do NOT set on Vercel. |
| `SEEDREAM_API_KEY` | If Seedance/Seedream provider used | `preview-seedream-key` (placeholder) | Provider API key — configure per the active Provider. |
| Other Provider env vars | If applicable | — | Any Provider keys the generation pipeline reads. Set their **Preview-scoped** values; never reuse Production keys unless intentionally testing against a Preview-only Provider account. |

### 1.5 Provider key guidance

Provider API keys (e.g. `SEEDREAM_API_KEY`) are read by the generation pipeline, not by the persistence adapter. They do **not** affect the Preview isolation gate. Still:
- Use a Preview-scoped key where the Provider supports per-environment quotas.
- Treat every Provider key as a secret — store in Vercel Project Environment settings (Preview scope), never in the repo.

---

## 2. Namespace and Storage Prefix Isolation Checklist

> 隔离校验清单。以下每一项必须全部通过，否则 Preview 部署将 fail-closed（SDK 不初始化）。

The gate is the pure function `validatePreviewIsolation()` in `select.ts`. It runs **BEFORE** `validateCloudBaseNoSqlConfig()` and **BEFORE** `createCloudBaseNoSqlPersistence()`, so the CloudBase SDK is never initialised against Production data when Preview == Production (AC-22, AC-27).

### 2.1 Checks (all must pass)

| # | Check | Failure error code | Code reference |
|---|-------|---------------------|----------------|
| C-1 | `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` is set and non-whitespace | `PRODUCTION_NAMESPACE_REQUIRED` | `select.ts:132` |
| C-2 | `CLOUDBASE_PRODUCTION_STORAGE_PREFIX` is set and non-whitespace | `PRODUCTION_STORAGE_PREFIX_REQUIRED` (FIX-R8 AC-04) | `select.ts:143` |
| C-3 | Preview `dataNamespace` ≠ Production `dataNamespace` (case-insensitive, whitespace-trimmed) | `PREVIEW_PRODUCTION_NAMESPACE_EQUAL` | `select.ts:154` |
| C-4 | Preview `storagePrefix` ≠ Production `storagePrefix` (case-insensitive, whitespace-trimmed) | `PREVIEW_STORAGE_PREFIX_EQUAL` | `select.ts:160` |
| C-5 | Preview `dataNamespace` does NOT contain `prod` (case-insensitive substring) | `PREVIEW_NAMESPACE_CONTAINS_PROD` | `select.ts:166` |
| C-6 | Preview `storagePrefix` does NOT contain `prod` (case-insensitive substring) | `PREVIEW_STORAGE_PREFIX_CONTAINS_PROD` | `select.ts:172` |

### 2.2 Environment-detection prerequisite

Before the gate even runs, `isPreviewEnvironment()` must classify the deployment as Preview:

| Condition | Result |
|-----------|--------|
| `VERCEL=1` + `VERCEL_ENV=preview` | ✅ Preview — gate runs (even if `NODE_ENV=production`) |
| `CLOUDBASE_PREVIEW_MODE=1` | ✅ Preview — gate runs (local integration tests only) |
| `VERCEL=1` + `VERCEL_ENV=production` | ❌ Production — gate **skipped** (AC-28, never blocks Production) |
| `VERCEL=1` + `VERCEL_ENV` missing/unknown | 🛑 `VERCEL_ENV_REQUIRED_OR_INVALID` — fail closed, SDK not initialised |
| Neither `VERCEL` nor `CLOUDBASE_PREVIEW_MODE` set | Not Preview — gate skipped (local/dev mode) |

### 2.3 Manual verification steps

1. Confirm `VERCEL=1` and `VERCEL_ENV=preview` are set in the Vercel Preview Environment.
2. Confirm `CLOUDBASE_DATA_NAMESPACE` value (e.g. `preview`) does NOT contain the substring `prod` case-insensitively. `preview` ✅, `Prod` 🛑, `my-prod-data` 🛑.
3. Confirm `CLOUDBASE_STORAGE_PREFIX` value does NOT contain `prod` case-insensitively.
4. Confirm `CLOUDBASE_DATA_NAMESPACE` ≠ `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` after trimming whitespace and lowercasing both.
5. Confirm `CLOUDBASE_STORAGE_PREFIX` ≠ `CLOUDBASE_PRODUCTION_STORAGE_PREFIX` after trimming and lowercasing.
6. Confirm both `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` and `CLOUDBASE_PRODUCTION_STORAGE_PREFIX` are present and non-empty.
7. Cross-reference: run the unit suite `select.preview-isolation.test.ts` — it enumerates every accept/reject case above.

### 2.4 Accepted vs rejected examples (from the test suite)

| Preview namespace | Preview prefix | Prod namespace | Prod prefix | Outcome |
|-------------------|----------------|----------------|-------------|---------|
| `preview` | `preview` | `production` | `production` | ✅ Pass |
| `preview` | `preview-prefix` | `production` | `production-prefix` | ✅ Pass |
| `lumen` | `preview` | `lumen` | `production` | 🛑 `PREVIEW_PRODUCTION_NAMESPACE_EQUAL` |
| `LUMEN` | `preview` | `lumen` | `production` | 🛑 `PREVIEW_PRODUCTION_NAMESPACE_EQUAL` (case) |
| `  lumen  ` | `preview` | `lumen` | `production` | 🛑 `PREVIEW_PRODUCTION_NAMESPACE_EQUAL` (whitespace) |
| `preview` | `LUMEN-PREFIX` | `production` | `lumen-prefix` | 🛑 `PREVIEW_STORAGE_PREFIX_EQUAL` |
| `my-prod-data` | `preview` | `production` | `production` | 🛑 `PREVIEW_NAMESPACE_CONTAINS_PROD` |
| `Prod` | `preview` | `production` | `production` | 🛑 `PREVIEW_NAMESPACE_CONTAINS_PROD` (case) |
| `preview` | `prod-storage` | `production` | `production` | 🛑 `PREVIEW_STORAGE_PREFIX_CONTAINS_PROD` |
| `preview` | `preview` | `` (empty) | `production` | 🛑 `PRODUCTION_NAMESPACE_REQUIRED` |
| `preview` | `preview` | `production` | `` (empty) | 🛑 `PRODUCTION_STORAGE_PREFIX_REQUIRED` |

---

## 3. Preview Smoke Steps (read-only, NO writes)

> 以下为手动只读验证步骤。**不执行任何写操作**，不创建项目、不上传资源、不删除任何数据。
>
> These steps verify readiness WITHOUT writing data. They are NOT a write smoke test.

### Step 1 — Verify env vars are set (print without secrets)

For each variable in Section 1, confirm presence. Print only a redacted indicator, never the value:

```text
PERSISTENCE_BACKEND            = cloudbase-nosql          ✅
CLOUDBASE_ENV_ID               = <set, len=N>             ✅   (print length, NOT the value)
CLOUDBASE_API_KEY              = <set, len=N>             ✅   (print length, NOT the value)
CLOUDBASE_DATA_NAMESPACE       = preview                  ✅   (non-secret, print value)
CLOUDBASE_STORAGE_PREFIX       = preview                  ✅   (non-secret, print value)
CLOUDBASE_PRODUCTION_DATA_NAMESPACE = production          ✅
CLOUDBASE_PRODUCTION_STORAGE_PREFIX = production          ✅
VERCEL                         = 1                        ✅
VERCEL_ENV                     = preview                  ✅
```

**Secret masking rule**: For `CLOUDBASE_API_KEY` and any `*_API_KEY`, print only `<set, length=N>` or `<set>`. Never echo the key. If a script is used, it must redact before any `console.log`.

### Step 2 — Verify the Preview isolation gate passes

Call the pure function directly with the resolved config. No SDK import, no network, no side effects — it is safe to invoke:

```typescript
// Pseudocode — do NOT run against real credentials in a shared terminal.
import { validatePreviewIsolation, isPreviewEnvironment } from './select.js';

const env = process.env;
if (!isPreviewEnvironment(env)) {
  throw new Error('NOT_PREVIEW: expected VERCEL_ENV=preview');
}
validatePreviewIsolation({
  dataNamespace: env.CLOUDBASE_DATA_NAMESPACE!,           // e.g. 'preview'
  storagePrefix: env.CLOUDBASE_STORAGE_PREFIX!,           // e.g. 'preview'
  productionNamespace: env.CLOUDBASE_PRODUCTION_DATA_NAMESPACE!, // e.g. 'production'
  productionStoragePrefix: env.CLOUDBASE_PRODUCTION_STORAGE_PREFIX!, // e.g. 'production'
});
// If this returns without throwing, the gate passed.
```

Expected: no throw. Any throw means the deployment is misconfigured — fix the env var and re-run before proceeding.

### Step 3 — Verify adapter initialization (ensureReady succeeds)

Construct the adapter and call `ensureReady()`. This dynamically imports `@cloudbase/node-sdk` and calls `tcb.init({ env, accessKey })`. A success here proves credentials + env ID are valid against the **Preview** CloudBase env.

```typescript
const deps = selectPersistenceByEnv(env); // gate + config validation run here
await deps.ensureReady();                 // SDK init against Preview env
await deps.close();                       // release
```

Expected: `ensureReady()` resolves. If it throws, the Preview env ID or API key is wrong, or the CloudBase env is unreachable. **Do not proceed to Step 4.**

### Step 4 — Read-only smoke test (list, NO writes)

Perform ONLY read operations that exist on the frozen `PersistenceDependencies` surface. Do NOT call `create`, `put`, `update`, `claim`, `deleteCascade`, or any mutation:

- `projects.listByProject(...)` — or equivalent read path — to confirm the projects collection is reachable.
- `assets.listByProject(...)` — confirm the assets collection is reachable.
- `versions.listByProject(...)` — confirm versions collection.
- `objects.exists(key)` — for a known-non-existent key, expect `false` (this performs a metadata read, not a write).

Expected: reads return empty (or known Preview data) without error. If a read throws `OBJECT_NOT_FOUND` for a lookup, that is expected for non-existent keys — not a failure.

> **Forbidden in this step**: any `create()`, `put()`, `update()`, `claim()`, `deleteCascade()`, `removeCleanupKeys()`. These mutate data and belong to the real CloudBase validation matrix in Section 5, which runs ONLY after Preview is unlocked.

### Step 5 — Verify Preview data is isolated from Production

Confirm collection names are prefixed with `preview_` (or whatever `CLOUDBASE_DATA_NAMESPACE` was set to) and Storage paths are prefixed with `preview/`:

- Collection names produced by `makeCollections(namespace)` are `${namespace}_<table>`. For `namespace='preview'`:
  - `preview_projects`, `preview_assets`, `preview_versions`, `preview_version_idempotency`, `preview_generation_jobs`, `preview_job_idempotency`, `preview_auth_throttle`, `preview_object_metadata`, `preview_project_tombstones`, `preview_project_cleanup_keys`
- Storage paths produced by `prefixCloudPath(key)` are `${storagePrefix}/${key}`. For `storagePrefix='preview'`: `preview/<key>`.
- Confirm NO collection name starts with `prod_` / `production_` and NO cloudPath starts with `prod/` / `production/`.

If any collection/path resolves to a Production-prefixed name, **stop** — the namespace/prefix env vars are misconfigured. Revisit Section 2.

---

## 4. Rollback Steps

> 如果 Preview 部署失败或隔离校验未通过，按以下步骤回滚。优先保证 Production 数据不受影响。

### Step 1 — Bypass or remove the Preview deployment

Pick ONE:

- **Preferred**: Remove the Preview deployment from Vercel (Vercel dashboard → Deployments → the Preview deployment → Delete). This stops all traffic to the Preview build.
- **Alternative (keeps the build but neutralises the gate)**: Set `VERCEL_ENV=production` in the Preview environment so `isPreviewEnvironment()` returns `false` and the gate is skipped. ⚠️ Use this ONLY if you understand the Preview build will then talk to whatever namespace is configured — it does NOT make a broken Preview safe, it only stops the gate from blocking boot. Prefer deleting the deployment.

### Step 2 — Delete the Preview CloudBase env if one was created

If a dedicated Preview CloudBase environment was provisioned (separate env ID), delete it via the CloudBase console:

- CloudBase console → Environments → select the Preview env → Delete.
- Confirm all `preview_*` collections and `preview/` Storage objects are removed with the env.

If Preview and Production share the same CloudBase env ID but use distinct namespaces, **do NOT delete the env**. Instead, optionally drop only the `preview_*` collections via the console (manual, low-risk). Never touch `prod_*` / `production_*` collections.

### Step 3 — Verify no Production data was affected

Audit the Production collections (namespaced with `prod_` / `production_`, per `CLOUDBASE_PRODUCTION_DATA_NAMESPACE`):

- Confirm record counts in `production_projects`, `production_assets`, `production_versions` match the pre-deployment baseline.
- Confirm no `preview_*`-sourced documents leaked into Production collections.
- Confirm Production Storage paths (`production/...`) are unchanged.

If any Production collection shows unexpected changes, treat as an incident — capture evidence and escalate per the Lumen V2 collaboration contract (do not silently "fix" Production data).

### Step 4 — Roll back the Vercel deployment to the previous version

- Vercel dashboard → Deployments → find the last known-good deployment → Promote / Redeploy.
- If the Preview build was promoted toward Production by accident, ensure the Production deployment (`VERCEL_ENV=production`) is pinned to the previously-verified Production build, NOT the Preview build.
- Confirm `readyForPreview` is still `false` in `STATE.json` after rollback — this runbook does not change that flag.

---

## 5. Real CloudBase Validation Matrix

> 真实 CloudBase 验证矩阵。**仅在 Preview 解锁后执行**（readyForPreview=true 且 GPT 验收通过后）。在此之前严禁运行任何写操作测试。

These tests write real data to the **Preview** CloudBase env. Run them ONLY after Preview is unlocked. Each test targets a specific adapter behavior proven against the Mock but not yet against real CloudBase.

| # | Test | Target code | Expected outcome | Coverage |
|---|------|-------------|------------------|----------|
| T1 | Create project in Preview | `projects.create()` | Project appears in `preview_projects` collection ONLY. Confirm `production_projects` is unchanged. | NOSQL-R2-06 namespace isolation |
| T2 | Upload asset | `objects.put()` → `uploadFile()` + `saveFileMetadata()` | Storage cloudPath is prefixed `preview/<key>`. `fileID` is persisted to `preview_object_metadata`. | NOSQL-R2-04 fileID persistence + storage prefix |
| T3 | Delete project | `projects.deleteCascade()` (Phase A tombstone + Phase B cascade) + `ProjectService.deleteProject()` Storage cleanup | Two-phase delete completes; `preview_project_cleanup_keys` ledger is written then drained; tombstone removed last. | FIX-R5/FIX-R6 delete + cleanup ledger |
| T4 | Concurrent operations | `jobs.claim()` / `updateIfClaimed()` + `removeCleanupKeys()` under concurrent calls | CloudBase OCC retries on conflict; no duplicate claims; no resurrected cleanup keys. | NOSQL-R2-02 conditional updates + FIX-R8 AC-02 atomicity |
| T5 | Storage cleanup | `objects.delete()` after metadata commit | Remote object deleted first, then `preview_object_metadata` doc removed. `METADATA_MISSING` thrown if metadata absent (crash-window). | FIX-R4 Workstream G + FIX-R8 AC-03 |
| T6 | Crash recovery | Kill process between metadata commit and object deletion; run sweeper | `preview_project_cleanup_keys` retains orphaned keys; sweeper re-attempts and treats `OBJECT_NOT_FOUND`/`METADATA_MISSING` as idempotent success; ledger drains to empty. | FIX-R6 AC-R6-03 crash-window safety |
| T7 | Preview / Production isolation | Cross-environment read/write attempt | No `preview_*` document appears in `production_*` collections and vice versa. Storage paths never cross prefixes. | AC-22…AC-29 isolation gate + namespace/prefix enforcement |

### Test execution notes

- **T1–T7 must run against the Preview env only.** Configure `VERCEL_ENV=preview` with `preview` namespace/prefix and the `production` reference values for the gate.
- **T4 (concurrency)**: CloudBase's real OCC may differ slightly from the Mock simulation (`occReadTracking` + `preCommitHook` used in tests). Observe actual retry counts and final state. The production code path (`runTransaction` + read-before-write) is correct regardless.
- **T3 (delete limit)**: `CLOUDBASE_TX_OP_LIMIT = 100`. A project with > 97 children (N + 3 > 100) must fail closed with `CLOUDBASE_TX_LIMIT_EXCEEDED` and leave the tombstone committed. Verify this threshold on real CloudBase.
- **T6 (crash recovery)**: This is the riskiest test. Run in a disposable Preview env. Confirm the sweeper can drain the ledger without manual intervention.

---

## 6. Security Constraints (CRITICAL)

> 安全约束 — 必须严格遵守。

1. **No real secrets in this runbook.** This document does NOT provide, read, or save real Secrets. Every example value is a placeholder (`preview-env-id`, `preview-api-key`, `preview-seedream-key`, `production`). Replace placeholders with real values only in the Vercel/CloudBase console — never in the repository.
2. **No real CloudBase writes from this runbook.** This runbook does NOT execute real Preview. Sections 1–4 are readiness checks (read-only). Section 5 is a matrix to execute LATER, only after Preview is unlocked — and even then, only against the Preview env.
3. **All examples are placeholder values.** No real env IDs, API keys, JWTs, Provider keys, or customer data appear here. If a real value is needed for validation, source it from the operator's secret store at runtime; never inline it.
4. **Secret masking in any helper script.** If a script is written to assist Section 3 Step 1, it MUST redact every `*_API_KEY` and credential before any log/output. Print `<set, length=N>` for secrets; print non-secret config values only.
5. **Public-repo safety boundary.** Per AGENTS.md §6, do not commit: `.env`, API keys, JWT secrets, real customer photos/orders/chat logs, model weights, production DB exports, or anything that can reconstruct credentials. Run `node scripts/check-lumen-collab.mjs` before any public-bound change (automated scan does not replace human review).
6. **`readyForPreview` stays `false`.** This runbook does NOT unlock Preview. Producing this runbook is a readiness artifact, not a go-live. Preview remains blocked until: (a) GPT accepts the final closure batch, (b) the repository audit passes, and (c) an explicit decision flips `readyForPreview` to `true` in `STATE.json` per the Lumen V2 state machine.

---

## Appendix A — Error code reference (Preview-relevant)

| Error code | Meaning | Where thrown |
|------------|---------|--------------|
| `PERSISTENCE_BACKEND_REQUIRED` | Deployed mode but `PERSISTENCE_BACKEND` unset or not a deployed backend. | `select.ts` `selectPersistenceByEnv()` |
| `PERSISTENCE_BACKEND_INVALID` | `PERSISTENCE_BACKEND` value not one of `local \| cloudbase-postgres \| cloudbase-nosql`. | `select.ts` `parseBackend()` |
| `CLOUDBASE_CONFIG_REQUIRED` | A required CloudBase env var is missing (lists the offending vars). | `cloudbase.nosql.ts` `validateCloudBaseNoSqlConfig()` |
| `VERCEL_ENV_REQUIRED_OR_INVALID` | `VERCEL=1` but `VERCEL_ENV` is missing or not `preview\|production`. Fail closed. | `select.ts` `isPreviewEnvironment()` |
| `PRODUCTION_NAMESPACE_REQUIRED` | `CLOUDBASE_PRODUCTION_DATA_NAMESPACE` empty/missing in Preview. | `select.ts` `validatePreviewIsolation()` |
| `PRODUCTION_STORAGE_PREFIX_REQUIRED` | `CLOUDBASE_PRODUCTION_STORAGE_PREFIX` empty/missing in Preview (FIX-R8 AC-04). | `select.ts` `validatePreviewIsolation()` |
| `PREVIEW_PRODUCTION_NAMESPACE_EQUAL` | Preview namespace == Production namespace (case-insensitive, trimmed). | `select.ts` `validatePreviewIsolation()` |
| `PREVIEW_STORAGE_PREFIX_EQUAL` | Preview prefix == Production prefix (case-insensitive, trimmed). | `select.ts` `validatePreviewIsolation()` |
| `PREVIEW_NAMESPACE_CONTAINS_PROD` | Preview namespace contains `prod` (case-insensitive). | `select.ts` `validatePreviewIsolation()` |
| `PREVIEW_STORAGE_PREFIX_CONTAINS_PROD` | Preview prefix contains `prod` (case-insensitive). | `select.ts` `validatePreviewIsolation()` |
| `CLOUDBASE_NOT_READY` | Adapter used before `ensureReady()`. | `cloudbase.nosql.ts` `assertReady()` |

## Appendix B — Gate execution order (why the SDK never boots on a misconfigured Preview)

```
selectPersistenceByEnv(env)
  ↓
isDeployed? (VERCEL=1 || NODE_ENV=production) → yes
  ↓
backend = cloudbase-nosql
  ↓
runPreviewIsolationGateIfPreview(env, noSqlOptions)
  ├─ isPreviewEnvironment(env)?
  │    └─ VERCEL=1 + VERCEL_ENV=preview → YES
  │       → validatePreviewIsolation(...)   ← FAILS HERE on misconfig
  │                                          (SDK NOT yet imported)
  ↓ (gate passed)
validateCloudBaseNoSqlConfig(noSqlOptions)   ← config-only check
  ↓
createCloudBaseNoSqlPersistence(options)
  ↓ (lazy)
ensureReady() → import('@cloudbase/node-sdk') → tcb.init({ env, accessKey })
```

The gate is a pure function with no SDK imports and no network, so a misconfigured Preview fails closed **before** any CloudBase credential is used. This is the core guarantee of AC-22 / AC-27.

---

**End of runbook.** This document is a Section C Preview preparation material for LUMEN-NOSQL-FINAL-CLOSURE-BATCH-01. It does not unlock Preview, does not write data, and does not contain secrets.
