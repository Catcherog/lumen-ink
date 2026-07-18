# Internal Stable Fast Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a recoverable and security-bounded internal workflow for a three-person studio with the fewest safe GPT/Trae handoffs.

**Architecture:** STORAGE-001 remains a short decision gate that freezes persistence and executor adapters behind stable contracts. PERSIST-001 then runs as one continuous TDD package: core Tasks 1—11, three internal-security tasks, and final Task 12 evidence handoff; ROUTING, public-release hardening, and non-critical UX are deferred.

**Tech Stack:** React 19, TypeScript, Express 4, Vitest 4, Sharp 0.33, Vercel Serverless, and the database/object-store/executor selected by STORAGE-001.

## Global Constraints

- Current authority remains `STORAGE-001 / ready_for_trae / nextActor=trae` until Trae starts or returns evidence.
- Do not implement PERSIST-001 until `docs/lumen-v2/storage-options.md` is frozen and STATE activates PERSIST-001.
- Use only synthetic or authorized images; never persist secrets, production exports, or unredacted prompts in evidence.
- S0/S1, persistence consistency, authentication, upload validation, recovery, and deletion cannot be deferred.
- Record non-critical findings only in `docs/lumen-v2/FAST-TRACK-DEFERRED.md`.
- Preserve unrelated dirty-worktree changes and stage exact paths only.
- No ROUTING, Preview, multi-workspace IAM, public rollout, layers, or fabricated progress.

---

### Task 0: Land the Accepted FLOW-001 Control Plane

**Files:**
- Stage: `docs/lumen-v2/reviews/FLOW-001-GPT-REVIEW.md`
- Stage: `docs/lumen-v2/state/STATE.json`
- Stage: `docs/lumen-v2/state/PROJECT-MEMORY.md`
- Stage: `docs/lumen-v2/state/DECISION-LOG.md`
- Stage: `docs/lumen-v2/state/CHANGELOG.md`
- Stage: `docs/lumen-v2/state/SESSION-HANDOFF.md`
- Stage: `docs/ai/PROJECT_STATE.md`
- Stage rename: `docs/lumen-v2/tasks/active/FLOW-001.md` → `docs/lumen-v2/tasks/completed/FLOW-001.md`
- Stage rename: `docs/lumen-v2/tasks/backlog/STORAGE-001.md` → `docs/lumen-v2/tasks/active/STORAGE-001.md`
- Stage: `docs/lumen-v2/specs/10-INTERNAL-FAST-TRACK-DESIGN.md`
- Stage: `docs/lumen-v2/specs/09-PERSISTENT-GENERATION-CLOSURE-DESIGN.md`
- Stage: `docs/lumen-v2/plans/INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md`
- Stage: `docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md`
- Stage: `docs/lumen-v2/FAST-TRACK-DEFERRED.md`
- Stage: `docs/lumen-v2/prompts/INTERNAL-FAST-TRACK-TRAE.md`
- Stage: `docs/lumen-v2/tasks/backlog/PERSIST-001.md`

**Produces:** A clean, reviewable docs-only baseline whose STATE points to STORAGE-001.

- [ ] **Step 1: Verify authority and exact task paths**

Run:

```powershell
$s = Get-Content -Raw -Encoding utf8 docs/lumen-v2/state/STATE.json | ConvertFrom-Json
$s.currentTask
$s.status
$s.nextActor
Test-Path docs/lumen-v2/tasks/active/STORAGE-001.md
Test-Path docs/lumen-v2/tasks/completed/FLOW-001.md
```

Expected: `STORAGE-001`, `ready_for_trae`, `trae`, `True`, `True`.

- [ ] **Step 2: Run the control-plane safety check**

Run: `node scripts/check-lumen-collab.mjs`

Expected: exit 0 and `Lumen collaboration state and basic public-repo safety checks passed.`

- [ ] **Step 3: Stage exact control-plane paths only**

Run `git add` with each file listed in this task. Then run `git diff --staged --name-status`.

Expected: only the listed review/state/task/spec/plan/prompt files; no source code and no unrelated dirty files.

- [ ] **Step 4: Commit and push the control plane**

```powershell
git commit -m "docs(lumen-v2): accept FLOW-001 and start internal fast track"
git push origin lumen/flow-001-trae
```

Expected: push succeeds. Record this SHA in the STORAGE-001 report created later; do not create a hash-only follow-up commit.

---

### Task 1: STORAGE-001 Two-Option Decision Matrix

**Files:**
- Create: `docs/lumen-v2/storage-options.md`
- Create: `docs/lumen-v2/evidence/STORAGE-001/source-register.md`
- Modify: `docs/lumen-v2/tasks/active/STORAGE-001.md`

**Interfaces:**
- Consumes: Vercel 90-second function limit, Windows local-development requirement, three-person internal-workspace goal.
- Produces: two named complete candidates, one weighted score, exact account/cost requirements, and a recommended PoC target.

- [ ] **Step 1: Create the STORAGE branch after Task 0 is pushed**

Run: `git switch -c lumen/storage-001-trae`

Expected: current branch is `lumen/storage-001-trae`.

- [ ] **Step 2: Select exactly two complete candidates using primary documentation**

Candidate 1 must be the lowest-operations Vercel-compatible managed stack available to the team. Candidate 2 must be an independently operated managed stack with Postgres-compatible metadata, object storage, and durable/background execution. Record official URLs, access date, product limits, pricing basis, local alternative, and whether an account or payment method is required in `source-register.md`.

Reject a candidate before scoring if it cannot support all of: persistent metadata, private objects/signed URLs, durable Job state, 80—100 second Provider execution without relying on one 90-second request, adapter re-instantiation, and project cascade deletion.

- [ ] **Step 3: Score both candidates with fixed weights**

Use this 100-point matrix in `storage-options.md`:

```text
recoverability_and_consistency: 25
long_task_execution: 20
vercel_fit: 15
windows_local_development: 10
deletion_and_backup: 10
security_and_secret_handling: 10
monthly_cost_for_3_users: 5
vendor_lock_in_and_rollback: 5
```

Each score must be 0—5 with one evidence-backed sentence. Convert to weighted totals. A candidate scoring below 3 on recoverability, long-task execution, or deletion is ineligible regardless of total.

- [ ] **Step 4: Declare account and decision gates**

Write exactly one of:

```yaml
account_gate: none
decision_authority: gpt
```

or:

```yaml
account_gate: user
required_action: "record the exact account name, payment-method requirement, monthly budget ceiling, and irreversible migration approval requested from the user"
decision_authority: user
```

Do not mark `decision: frozen` in this task.

- [ ] **Step 5: Commit the comparison**

```powershell
git add docs/lumen-v2/storage-options.md docs/lumen-v2/evidence/STORAGE-001/source-register.md docs/lumen-v2/tasks/active/STORAGE-001.md
git commit -m "docs(lumen-v2): STORAGE-001 compare two complete stacks"
```

---

### Task 2: Freeze Persistence and Executor Contracts with a Local PoC

**Files:**
- Create: `src/server/domain/persistence.ts`
- Create: `src/server/domain/persistence.contract.test.ts`
- Create: `src/server/infrastructure/persistence/index.ts`
- Create: `src/server/infrastructure/persistence/local.ts`
- Create: `src/server/infrastructure/executor/index.ts`
- Create: `src/server/infrastructure/executor/local.ts`
- Create: `docs/lumen-v2/evidence/STORAGE-001/poc-result.md`

**Interfaces:**
- Produces: `PersistenceDependencies`, `ProjectRepository`, `AssetRepository`, `VersionRepository`, `JobRepository`, `ObjectStore`, `UnitOfWork`, and `JobExecutor` used unchanged by PERSIST-001.

- [ ] **Step 1: Write failing contract tests**

The test must create one synthetic Project, original Asset, V0, queued Job, and auth-throttle bucket; construct a new adapter instance; read all five records; update the Job; delete the Project; assert that Project, Asset, Version, Job, and object bytes are absent; then delete the throttle bucket and assert it is absent.

Required top-level assertion sequence:

```ts
expect(await reloaded.projects.get(project.id)).not.toBeNull();
expect(await reloaded.assets.listByProject(project.id)).toHaveLength(1);
expect(await reloaded.versions.listByProject(project.id)).toHaveLength(1);
expect(await reloaded.jobs.get(job.id)).toMatchObject({ status: 'queued' });
await reloaded.projects.deleteCascade(project.id);
expect(await reloaded.projects.get(project.id)).toBeNull();
expect(await reloaded.objects.exists(asset.storageKey)).toBe(false);
```

- [ ] **Step 2: Run red tests**

Run: `npm test --prefix src/server -- domain/persistence.contract.test.ts`

Expected: FAIL because the contracts/adapters do not exist.

- [ ] **Step 3: Implement the exact stable surface**

Implement this exact stable surface; PERSIST-001 consumes it unchanged:

```ts
export interface ProjectRepository {
  create(input: Project): Promise<Project>;
  get(id: string): Promise<Project | null>;
  updatePointers(id: string, input: { activeVersionId?: string; approvedVersionId?: string }): Promise<Project>;
  deleteCascade(id: string): Promise<void>;
}
export interface AssetRepository { create(input: Asset): Promise<Asset>; get(id: string): Promise<Asset | null>; listByProject(id: string): Promise<Asset[]>; }
export interface VersionRepository { create(input: Version): Promise<Version>; get(id: string): Promise<Version | null>; listByProject(id: string): Promise<Version[]>; }
export interface JobRepository { create(input: GenerationJob): Promise<GenerationJob>; get(id: string): Promise<GenerationJob | null>; update(id: string, patch: Partial<GenerationJob>): Promise<GenerationJob>; listActiveByProject(id: string): Promise<GenerationJob[]>; }
export interface ObjectStore { put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>; getSignedUrl(key: string): Promise<string>; delete(key: string): Promise<void>; exists(key: string): Promise<boolean>; }
export interface UnitOfWork { run<T>(fn: () => Promise<T>): Promise<T>; }
export interface AuthThrottleRepository {
  get(key: string): Promise<{ failures: number; windowStartedAt: string } | null>;
  put(key: string, value: { failures: number; windowStartedAt: string }): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface PersistenceDependencies {
  projects: ProjectRepository;
  assets: AssetRepository;
  versions: VersionRepository;
  jobs: JobRepository;
  objects: ObjectStore;
  unitOfWork: UnitOfWork;
  authThrottle: AuthThrottleRepository;
}
export interface JobExecutor {
  enqueue(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<'cancelled' | 'best_effort'>;
}
```

The local adapter must persist beneath a test-provided temporary directory, never under the repository, user home, or production path. Re-instantiation with the same directory must recover records.

- [ ] **Step 4: Run green contract tests**

Run: `npm test --prefix src/server -- domain/persistence.contract.test.ts`

Expected: PASS with no network account.

- [ ] **Step 5: Record PoC evidence**

`poc-result.md` must contain the command, exit code, synthetic IDs, adapter re-instantiation proof, deletion proof, selected candidate mapping, and remaining account gate. Do not include object bytes, secrets, or full connection strings.

- [ ] **Step 6: Commit contracts and local PoC**

```powershell
git add src/server/domain src/server/infrastructure docs/lumen-v2/evidence/STORAGE-001/poc-result.md
git commit -m "feat(lumen-v2): STORAGE-001 persistence contract PoC"
```

---

### Task 3: STORAGE-001 Evidence, Gates, and Freeze Handoff

**Files:**
- Create: `docs/lumen-v2/reports/STORAGE-001-TRAE-REPORT.md`
- Modify: `docs/lumen-v2/storage-options.md`
- Modify: `docs/lumen-v2/state/STATE.json`
- Modify: `docs/lumen-v2/state/SESSION-HANDOFF.md`
- Modify: `docs/lumen-v2/state/PROJECT-MEMORY.md`
- Modify: `docs/lumen-v2/state/DECISION-LOG.md`
- Modify: `docs/lumen-v2/state/CHANGELOG.md`

**Produces:** One bounded GPT/user freeze decision; no PERSIST implementation.

- [ ] **Step 1: Run STORAGE-focused tests and all eight gates**

```powershell
npm run lint --prefix src/client
npx tsc --noEmit -p src/client/tsconfig.json
npm test --prefix src/client
npx tsc --noEmit -p src/server/tsconfig.json
npm test --prefix src/server
npm test
npm run build
node scripts/check-lumen-collab.mjs
```

Expected: every command exits 0; report exact counts.

- [ ] **Step 2: Verify decision material**

Confirm two eligible named candidates, primary-source register, fixed-weight scores, local PoC recovery/deletion proof, stable exports, environment list, account gate, migration/backup/rollback, and no real customer data.

- [ ] **Step 3: Request the correct freeze actor**

If `account_gate: none`, set STATE to `awaiting_gpt_acceptance / nextActor=gpt`. If `account_gate: user`, set STATE to `awaiting_user_decision / nextActor=user`. In both cases leave PERSIST-001 blocked and set `latestTraeReport` to the STORAGE report.

- [ ] **Step 4: Commit and push**

```powershell
git add docs/lumen-v2 src/server/domain src/server/infrastructure
git commit -m "feat(lumen-v2): STORAGE-001 decision and PoC"
git push -u origin lumen/storage-001-trae
```

Expected: one pushed STORAGE branch and an exact commit recorded in the report.

---

### Task 4: PERSIST-001 Core Tasks 1—11

**Files:**
- Execute: `docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md`
- Activate: `docs/lumen-v2/tasks/active/PERSIST-001.md`

**Interfaces:**
- Consumes: frozen STORAGE `PersistenceDependencies` and `JobExecutor`.
- Produces: the full Project/Asset/Version/GenerationJob closure, real client version/job UI, recovery, retry/cancel, deletion, migration, evidence, and report.

- [ ] **Step 1: Verify the freeze gate**

Run the exact PERSIST plan Task 1 checks. Expected: STATE is `PERSIST-001 / ready_for_trae / trae` and `storage-options.md` contains `decision: frozen`.

- [ ] **Step 2: Execute PERSIST Tasks 2—11 without ordinary handoff pauses**

For every task: write the specified failing test, run it red, implement the exact interface, run it green, and create the specified task-level commit. Stop only on a fast-track hard stop from the design.

- [ ] **Step 3: Do not execute PERSIST Task 12 final handoff yet**

Proceed directly to Tasks 5—7 below so the final evidence includes the internal security floor in the same PERSIST report and acceptance cycle.

---

### Task 5: Runtime Secrets, Authentication Throttle, and CORS Allowlist

**Files:**
- Create: `src/server/config/runtime.ts`
- Create: `src/server/config/runtime.test.ts`
- Create: `src/server/security/authThrottle.ts`
- Create: `src/server/security/authThrottle.test.ts`
- Create: `src/server/services/providers/ProviderStore.test.ts`
- Modify: `src/server/middleware/auth.ts`
- Modify: `src/server/routes/auth.ts`
- Modify: `src/server/routes/providers.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/.env.example`
- Modify: `src/server/domain/persistence.ts`
- Modify: `src/server/services/providers/ProviderStore.ts`

**Interfaces:**
- Produces: `loadRuntimeConfig`, `RuntimeConfig`, `AuthThrottleRepository`, and `createAuthThrottle`.

- [ ] **Step 1: Write failing runtime tests**

Cover deployed mode (`VERCEL=1` or `NODE_ENV=production`) rejecting absent/weak `AUTH_PASSWORD`, `JWT_SECRET`, and `PROVIDER_ENCRYPTION_KEY`; rejecting an empty CORS allowlist; accepting explicit values; and local test mode accepting injected test values without reading real secrets.

Required deployed assertions:

```ts
expect(() => loadRuntimeConfig({ VERCEL: '1' })).toThrow('AUTH_PASSWORD_REQUIRED');
expect(() => loadRuntimeConfig({ VERCEL: '1', AUTH_PASSWORD: 'short' })).toThrow('AUTH_PASSWORD_TOO_SHORT');
expect(() => loadRuntimeConfig(validButNoCors)).toThrow('CORS_ALLOWLIST_REQUIRED');
```

- [ ] **Step 2: Implement runtime config with no fallback secrets**

`RuntimeConfig` must include `authPassword`, `jwtSecret`, `providerEncryptionKey`, `corsAllowlist`, `maxUploadBytes=20971520`, `maxImagePixels=40000000`, and `loginWindowMs=900000`. Deployed minimums: password 12 characters; JWT/encryption secrets 32 characters; at least one exact CORS origin. Never assign default secrets to `process.env`. Before listening in deployed mode, load the configured default Provider from `SEEDREAM_API_KEY`/`VOLC_API_KEY` or `OPENAI_API_KEY` and fail with `DEFAULT_PROVIDER_CREDENTIAL_REQUIRED` unless at least one enabled Provider has a non-empty API key; do not return that key through any route.

In deployed mode, `ProviderStore` is environment-managed: construct sanitized Provider metadata from environment variables on each cold start, never read or write `/tmp/providers.json`, and make Provider create/update/delete routes return HTTP 403 with `PROVIDER_CONFIG_ENV_MANAGED`. Local development may retain the encrypted file store. Add tests proving a new deployed store instance reconstructs the same sanitized Provider list from environment variables and performs no filesystem write.

- [ ] **Step 3: Write failing durable throttle tests**

Use a fake `AuthThrottleRepository`. Assert five failed attempts in 15 minutes block the sixth for the same HMAC-derived key, a successful login clears failures, another key remains unaffected, and no raw password/token is stored.

- [ ] **Step 4: Implement auth throttle through the frozen persistence layer**

Consume the `AuthThrottleRepository` contract frozen by STORAGE-001 through `persistence.authThrottle`; do not introduce a process-memory-only production implementation:

```ts
export interface AuthThrottleRepository {
  get(key: string): Promise<{ failures: number; windowStartedAt: string } | null>;
  put(key: string, value: { failures: number; windowStartedAt: string }): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Hash `req.ip` with HMAC-SHA256 using `jwtSecret`; never persist the raw IP. Return HTTP 429 with `Retry-After` after five failures. Successful login deletes the bucket.

- [ ] **Step 5: Apply exact CORS and auth wiring**

Replace `cors()` with `cors({ origin(origin, callback) { ... }, credentials: false })`; allow requests with no Origin for same-process tests/health tooling, allow exact configured origins, reject all others. `auth.ts` consumes injected runtime config and has no module-level default constants. `ProviderStore.ts` consumes `providerEncryptionKey` and must not fall back to `JWT_SECRET` or a built-in string.

- [ ] **Step 6: Run focused and full server tests**

Run: `npm test --prefix src/server -- config/runtime.test.ts security/authThrottle.test.ts`

Expected: PASS. Then run server typecheck and all server tests.

- [ ] **Step 7: Commit**

```powershell
git add src/server/config src/server/security src/server/middleware/auth.ts src/server/routes/auth.ts src/server/routes/providers.ts src/server/index.ts src/server/.env.example src/server/domain/persistence.ts src/server/services/providers/ProviderStore.ts src/server/services/providers/ProviderStore.test.ts
git commit -m "feat(lumen-v2): PERSIST-001 internal auth safety floor"
```

---

### Task 6: Server-Side Image Decode and Size Validation

**Files:**
- Create: `src/server/security/imageValidation.ts`
- Create: `src/server/security/imageValidation.test.ts`
- Modify: `src/server/services/ProjectService.ts`
- Modify: `src/server/routes/edit.ts`
- Modify: `src/server/routes/detect.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- Produces: `validateImageBytes(bytes, declaredMimeType, limits)` returning decoded metadata or throwing stable `INVALID_IMAGE_*` errors.

- [ ] **Step 1: Write failing validation tests**

Generate tiny synthetic PNG/JPEG/WebP buffers with Sharp. Cover accepted formats, declared MIME mismatch, unsupported format, bytes over 20 MiB without allocating an oversized fixture, decoded pixels over 40,000,000 using a mocked metadata result, malformed bytes, and decompression/decode failure.

- [ ] **Step 2: Implement validation using Sharp metadata plus decode**

Required result:

```ts
export interface ValidatedImage {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  sizeBytes: number;
}
```

Reject before object storage write. Verify magic/decoded format matches declared MIME, width and height are positive, `width * height <= 40000000`, byte size `<= 20971520`, and `sharp(bytes).rotate().toBuffer()` succeeds.

- [ ] **Step 3: Apply at every image ingress**

Call validation from Project upload before Asset/ObjectStore writes. Apply the same function to compatibility `/api/edit` main image/reference images and `/api/detect/people` before Provider/dimension logic. Map stable validation errors to HTTP 400/413 without echoing bytes or base64.

- [ ] **Step 4: Keep request-body cap explicit**

Retain a 50 MiB total JSON limit for compatibility requests containing multiple base64 references, but enforce 20 MiB per decoded image and 40 MP per image. Add a comment and route test proving total-body and per-image limits are distinct.

- [ ] **Step 5: Run tests and commit**

Run: `npm test --prefix src/server -- security/imageValidation.test.ts`

Expected: PASS, followed by server typecheck and all server tests.

```powershell
git add src/server/security/imageValidation.ts src/server/security/imageValidation.test.ts src/server/services/ProjectService.ts src/server/routes/edit.ts src/server/routes/detect.ts src/server/index.ts
git commit -m "feat(lumen-v2): PERSIST-001 validate image ingress"
```

---

### Task 7: Redacted Health, Logs, and Provider Responses

**Files:**
- Create: `src/server/security/redaction.ts`
- Create: `src/server/security/redaction.test.ts`
- Create: `src/server/security/security.integration.test.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/routes/edit.ts`
- Modify: `src/server/routes/detect.ts`
- Modify: `src/server/routes/providers.ts`
- Modify: `src/server/services/providers/ProviderStore.ts`

**Interfaces:**
- Produces: `redactError(error): { diagnosticId: string; publicMessage: string; log: Record<string, unknown> }`.

- [ ] **Step 1: Write failing redaction tests**

Use errors containing `sk-test-secret`, bearer tokens, base64 payloads, Authorization headers, connection URLs, and nested provider responses. Assert none appear in serialized log/public response and each error has a UUID diagnosticId.

- [ ] **Step 2: Implement allowlist-based structured redaction**

Only retain `diagnosticId`, stable `errorCode`, HTTP/provider status, provider type, operation type, and bounded message category. Do not recursively copy arbitrary error objects. Public responses contain stable errorCode, diagnosticId, and user-safe Chinese text only.

- [ ] **Step 3: Minimize health output**

`GET /api/health` returns only:

```json
{"status":"ok"}
```

It must not return environment-variable presence, Provider names/configuration, model names, default flags, or key presence.

- [ ] **Step 4: Verify provider API never returns keys**

Integration tests must recursively scan GET/POST/PUT/PATCH provider responses and assert no `apiKey`, encrypted ciphertext, raw submitted key, JWT secret, or encryption key appears. Preserve only boolean `hasApiKey`.

- [ ] **Step 5: Replace sensitive logging paths**

Replace raw `console.error(..., error)` in edit/detect/providers and ProviderStore load errors with the structured redacted record. Detect success logs may retain dimensions and region count but never image/base64 or identifiers.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test --prefix src/server -- security/redaction.test.ts security/security.integration.test.ts`

Expected: PASS, followed by server typecheck and all server tests.

```powershell
git add src/server/security src/server/index.ts src/server/routes/edit.ts src/server/routes/detect.ts src/server/routes/providers.ts src/server/services/providers/ProviderStore.ts
git commit -m "feat(lumen-v2): PERSIST-001 redact internal service boundaries"
```

---

### Task 8: PERSIST Final Evidence and Internal-Stable Handoff

**Files:**
- Execute and extend: `docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md` Task 12
- Update: `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`
- Update: `docs/lumen-v2/evidence/PERSIST-001/`
- Update: `docs/lumen-v2/FAST-TRACK-DEFERRED.md`
- Update: project state/control files required by AGENTS.md

**Produces:** One acceptance packet for PERSIST core plus the internal security floor.

- [ ] **Step 1: Run the PERSIST failure/recovery matrix**

Prove upload/V0, Job success, failure without Version, cancellation, retry, duplicate idempotency, refresh recovery, activate/approve, legacy import, complete deletion, and orphan diagnostics with synthetic data.

- [ ] **Step 2: Run the internal security matrix**

Prove deployed missing secrets fail startup; sixth login failure is rate-limited; disallowed CORS origin is rejected; malformed/oversized/MIME-mismatched/over-pixel images are rejected before storage/provider; health/provider responses and logs contain no secret/base64/config detail.

- [ ] **Step 3: Run all eight gates**

Use the exact commands from STORAGE Task 3. Expected: all exit 0 and report exact test counts.

- [ ] **Step 4: Audit deferred findings**

Every remaining issue must be either resolved or present in `FAST-TRACK-DEFERRED.md` with severity, non-blocking reason, owner task, and deadline. Fail acceptance if any S0/S1 or internal security/core consistency issue is deferred.

- [ ] **Step 5: Update STATE for GPT acceptance**

Set `currentTask=PERSIST-001`, `status=awaiting_gpt_acceptance`, `nextActor=gpt`, and `latestTraeReport` to the PERSIST report. Do not activate ROUTING or HARDEN.

- [ ] **Step 6: Commit and push final evidence**

```powershell
git add docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md docs/lumen-v2/evidence/PERSIST-001 docs/lumen-v2/FAST-TRACK-DEFERRED.md docs/lumen-v2/state/STATE.json docs/lumen-v2/state/SESSION-HANDOFF.md docs/lumen-v2/state/PROJECT-MEMORY.md docs/lumen-v2/state/DECISION-LOG.md docs/lumen-v2/state/CHANGELOG.md
git commit -m "feat(lumen-v2): PERSIST-001 internal stable closure"
git push -u origin lumen/persist-001-trae
```

Expected: pushed PERSIST branch; exact SHA, commands, counts, deferred items, and rollback recorded in the report.

## Execution Handoff

Execution owner is Trae under the repository collaboration contract. Use `docs/lumen-v2/prompts/INTERNAL-FAST-TRACK-TRAE.md` as the single copyable entrypoint. GPT performs only the STORAGE freeze and final PERSIST acceptance unless a hard stop requires user authority.
