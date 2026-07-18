# PERSIST-001 Persistent Generation Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one recoverable, persistent workflow from image upload through Project/Asset/V0, GenerationJob, immutable result Version, refresh recovery, approval, retry/cancel, deletion, and the D-034 internal security floor.

**Architecture:** STORAGE-001 supplies the frozen database/object-store/executor adapters behind stable contracts. PERSIST-001 adds domain types and a `GenerationService` orchestration layer, exposes authenticated project/job APIs, then replaces AppV2 in-memory history/version placeholders with server snapshots. Repository writes stay behind services; UI never composes cross-repository transactions. After core Task 11, execute `INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 5—7 before this plan's final Task 12 evidence handoff.

**Tech Stack:** React 19, TypeScript, Express 4, Vitest 4, the database/object-storage/durable-execution adapters frozen by STORAGE-001, existing ProviderFactory and EditRecipe v1.

## Global Constraints

- Do not start until FLOW-001 passes and STORAGE-001 is frozen by GPT/user.
- One task ID, branch, PR, and report: `PERSIST-001` / `lumen/persist-001-trae`.
- Never fabricate progress percentages or successful versions.
- A failed or cancelled Job must not create a successful Version.
- Success order is Asset → Version → Job `succeeded`.
- Preserve the old `/api/edit` as a controlled compatibility route during this task.
- Do not implement model routing, multi-workspace IAM, Preview mode, layers, or production-wide HARDEN work. The only security additions allowed are D-034's internal floor: secret fail-fast, durable login throttle, CORS allowlist, server-side image validation, and redacted health/provider/log boundaries.
- Use synthetic images and redacted logs only.
- Preserve unrelated dirty-worktree changes.

---

## File Map

**Shared contracts**

- Modify `src/shared/types.ts`: Project, Asset, Version, GenerationJob, API DTOs and status enums.

**Server domain and infrastructure**

- Verify `src/server/domain/persistence.ts`: STORAGE-001 frozen repository/object-store/unit-of-work interfaces; change only if the frozen decision explicitly requires a compatible correction.
- Create `src/server/domain/jobState.ts`: legal Job transitions and retryability.
- Create `src/server/domain/errors.ts`: stable error codes and diagnostic errors.
- Create `src/server/services/ProjectService.ts`: upload, restore, activate, approve and delete orchestration.
- Create `src/server/services/GenerationService.ts`: create, execute, cancel and retry Jobs.
- Create `src/server/routes/projects.ts`: Project and Version endpoints.
- Create `src/server/routes/jobs.ts`: Job endpoints.
- Verify `src/server/infrastructure/persistence/index.ts`: exports the STORAGE-001 frozen adapters.
- Verify `src/server/infrastructure/executor/index.ts`: exports the STORAGE-001 frozen executor.
- Modify `src/server/index.ts`: mount routes and dependency container.
- Modify `src/server/routes/edit.ts`: controlled compatibility delegation.

**Client**

- Create `src/client/src/api/projects.ts`: typed Project/Job HTTP client.
- Create `src/client/src/hooks/useProject.ts`: server snapshot and Job polling state.
- Create `src/client/src/components/v2/VersionStrip.tsx`: real immutable Version strip.
- Create `src/client/src/components/v2/JobStatusPanel.tsx`: real status/cancel/retry UI.
- Create `src/client/src/components/v2/LegacyHistoryImport.tsx`: backup and explicit import UI.
- Modify `src/client/src/AppV2.tsx`: use Project/Version/Job truth.
- Remove `src/client/src/components/v2/VersionStripPlaceholder.tsx` after replacement tests pass.

**Tests and evidence**

- Create focused `*.test.ts`/`*.test.tsx` beside every new domain, service, route, hook and component.
- Create `docs/lumen-v2/evidence/PERSIST-001/` and `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md` during execution.

---

### Task 1: Freeze Preconditions and Adapter Contract

**Files:**
- Modify: `docs/lumen-v2/tasks/active/PERSIST-001.md`
- Verify: `docs/lumen-v2/storage-options.md`
- Verify: `src/server/infrastructure/persistence/index.ts`
- Verify: `src/server/infrastructure/executor/index.ts`
- Create: `docs/lumen-v2/evidence/PERSIST-001/base-commit.txt`

**Interfaces:**
- Consumes: STORAGE-001 frozen `PersistenceDependencies` and `JobExecutor`.
- Produces: recorded adapter version and exact environment-variable list in the Trae report.

- [ ] **Step 1: Verify state and decision gates**

Run:

```powershell
$s = Get-Content -Raw -Encoding utf8 docs/lumen-v2/state/STATE.json | ConvertFrom-Json
$s.currentTask
$s.status
$s.nextActor
Select-String -Path docs/lumen-v2/storage-options.md -Pattern 'decision: frozen|状态：冻结'
```

Expected: `PERSIST-001`, `ready_for_trae`, `trae`, and one frozen-decision match.

- [ ] **Step 2: Verify adapter exports compile**

Required exports:

```ts
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

Run: `npx tsc --noEmit -p src/server/tsconfig.json`

Expected: exit 0. Stop and mark `blocked` if the frozen adapter does not provide these interfaces.

- [ ] **Step 3: Record the immutable scope baseline**

Run:

```powershell
New-Item -ItemType Directory -Force docs/lumen-v2/evidence/PERSIST-001 | Out-Null
$persistBase = git rev-parse HEAD
Set-Content -Encoding utf8 docs/lumen-v2/evidence/PERSIST-001/base-commit.txt $persistBase
```

Expected: `base-commit.txt` contains exactly the pre-PERSIST commit SHA plus a trailing newline.

- [ ] **Step 4: Create branch only after the gate passes**

Run: `git switch -c lumen/persist-001-trae`

Expected: current branch `lumen/persist-001-trae`.

---

### Task 2: Domain Types and Job State Machine

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/server/domain/jobState.ts`
- Create: `src/server/domain/jobState.test.ts`
- Create: `src/server/domain/errors.ts`

**Interfaces:**
- Produces: `Project`, `Asset`, `Version`, `GenerationJob`, `JobStatus`, `transitionJob`, `canRetryJob`, `DomainError`.

- [ ] **Step 1: Write failing state-machine tests**

```ts
import { describe, expect, it } from 'vitest';
import { canRetryJob, transitionJob } from './jobState.js';

describe('GenerationJob state machine', () => {
  it('allows queued -> uploading -> generating -> saving -> succeeded', () => {
    expect(transitionJob('queued', 'uploading')).toBe('uploading');
    expect(transitionJob('uploading', 'generating')).toBe('generating');
    expect(transitionJob('generating', 'saving')).toBe('saving');
    expect(transitionJob('saving', 'succeeded')).toBe('succeeded');
  });

  it('rejects failed -> succeeded', () => {
    expect(() => transitionJob('failed', 'succeeded')).toThrow('ILLEGAL_JOB_TRANSITION');
  });

  it('retries only retryable failed jobs', () => {
    expect(canRetryJob({ status: 'failed', errorCode: 'PROVIDER_TIMEOUT' })).toBe(true);
    expect(canRetryJob({ status: 'failed', errorCode: 'INVALID_RECIPE' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests and confirm red**

Run: `npm test --prefix src/server -- domain/jobState.test.ts`

Expected: FAIL because `jobState.ts` does not exist.

- [ ] **Step 3: Add exact shared types**

```ts
export type JobStatus =
  | 'queued' | 'uploading' | 'analyzing' | 'generating'
  | 'postprocessing' | 'saving' | 'succeeded' | 'failed' | 'cancelled';

export interface Project {
  id: string; workspaceId: string; name: string;
  originalAssetId: string; activeVersionId: string; approvedVersionId?: string;
  createdAt: string; updatedAt: string;
}

export interface Asset {
  id: string; projectId: string; kind: 'original' | 'reference' | 'result' | 'export';
  storageKey: string; mimeType: string; width: number; height: number;
  sizeBytes: number; sha256?: string; createdAt: string;
}

export interface Version {
  id: string; projectId: string; parentVersionId?: string; assetId: string;
  recipe?: EditRecipe; jobId?: string; ordinal: number;
  approved: boolean; createdAt: string;
}

export interface GenerationJob {
  id: string; projectId: string; inputVersionId: string; recipe: EditRecipe;
  status: JobStatus; attempt: number; parentJobId?: string;
  resultVersionId?: string; errorCode?: string; diagnosticId?: string;
  createdAt: string; updatedAt: string;
}
```

- [ ] **Step 4: Implement legal transitions and stable errors**

```ts
const allowed: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['uploading', 'cancelled', 'failed'],
  uploading: ['analyzing', 'generating', 'cancelled', 'failed'],
  analyzing: ['generating', 'cancelled', 'failed'],
  generating: ['postprocessing', 'saving', 'cancelled', 'failed'],
  postprocessing: ['saving', 'cancelled', 'failed'],
  saving: ['succeeded', 'failed'],
  succeeded: [], failed: [], cancelled: [],
};
```

`transitionJob` must throw `new DomainError('ILLEGAL_JOB_TRANSITION', ...)`; `canRetryJob` permits only timeout, quota-temporary, network and save-temporary errors.

- [ ] **Step 5: Run focused tests**

Run: `npm test --prefix src/server -- domain/jobState.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/types.ts src/server/domain/jobState.ts src/server/domain/jobState.test.ts src/server/domain/errors.ts
git commit -m "feat(lumen-v2): PERSIST-001 domain state machine"
```

---

### Task 3: Repository Contracts and Frozen Adapters

**Files:**
- Verify: `src/server/domain/persistence.ts`
- Modify: `src/server/infrastructure/persistence/index.ts`
- Create: `src/server/infrastructure/persistence/contract.test.ts`

**Interfaces:**
- Produces: repository methods used by ProjectService and GenerationService.

- [ ] **Step 1: Write the contract test**

The test must create a Project, original Asset, V0 and queued Job; reload them through a new adapter instance; then delete the Project and assert no Project/Version/Job/object remains.

```ts
expect(await deps.projects.get(project.id)).toMatchObject({ id: project.id });
expect(await deps.versions.listByProject(project.id)).toHaveLength(1);
expect(await deps.jobs.get(job.id)).toMatchObject({ status: 'queued' });
await deps.projects.deleteCascade(project.id);
expect(await deps.objects.exists(asset.storageKey)).toBe(false);
```

- [ ] **Step 2: Run and confirm red**

Run: `npm test --prefix src/server -- infrastructure/persistence/contract.test.ts`

Expected: FAIL on missing domain contracts or methods.

- [ ] **Step 3: Verify the frozen contracts match the required surface**

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
export interface AuthThrottleRepository { get(key: string): Promise<{ failures: number; windowStartedAt: string } | null>; put(key: string, value: { failures: number; windowStartedAt: string }): Promise<void>; delete(key: string): Promise<void>; }
```

- [ ] **Step 4: Correct only contract mismatches, then use the frozen STORAGE implementation**

The selected adapter in `src/server/infrastructure/persistence/index.ts` must implement every method above and export `persistence`. If the frozen STORAGE artifact lacks a method, make the smallest compatible correction and record it in the report. Do not add a second database or object store.

- [ ] **Step 5: Run contract and type tests**

Run: `npm test --prefix src/server -- infrastructure/persistence/contract.test.ts`

Expected: PASS after process restart/re-instantiation.

- [ ] **Step 6: Commit**

```powershell
git add src/server/domain/persistence.ts src/server/infrastructure/persistence
git commit -m "feat(lumen-v2): PERSIST-001 persistence contracts"
```

---

### Task 4: Project Upload, V0, Restore and Delete Service

**Files:**
- Create: `src/server/services/ProjectService.ts`
- Create: `src/server/services/ProjectService.test.ts`

**Interfaces:**
- Consumes: `PersistenceDependencies`.
- Produces: `createProject`, `getProjectSnapshot`, `activateVersion`, `approveVersion`, `deleteProject`.

- [ ] **Step 1: Write failing orchestration tests**

Cover: object write then Project/V0 transaction; DB failure cleans object; restore returns signed URLs; delete removes objects and metadata.

```ts
const snapshot = await service.createProject({ workspaceId: 'w1', name: 'demo', bytes, mimeType: 'image/png' });
expect(snapshot.versions).toHaveLength(1);
expect(snapshot.versions[0].ordinal).toBe(0);
expect(snapshot.project.activeVersionId).toBe(snapshot.versions[0].id);
```

- [ ] **Step 2: Run red test**

Run: `npm test --prefix src/server -- services/ProjectService.test.ts`

Expected: FAIL because service is missing.

- [ ] **Step 3: Implement service with compensation**

`createProject` must write `projects/{projectId}/original/{assetId}`, inspect dimensions with existing `sharp`, create Asset/Project/V0 inside `unitOfWork.run`, and delete the object if the transaction fails.

`deleteProject` must collect storage keys, delete metadata transactionally, delete objects, and return `{ deleted: true, cleanupFailures: string[] }`; failures receive diagnostic IDs and remain retryable.

- [ ] **Step 4: Run focused tests**

Run: `npm test --prefix src/server -- services/ProjectService.test.ts`

Expected: PASS including compensation cases.

- [ ] **Step 5: Commit**

```powershell
git add src/server/services/ProjectService.ts src/server/services/ProjectService.test.ts
git commit -m "feat(lumen-v2): PERSIST-001 project version zero"
```

---

### Task 5: Generation Service and Atomic Success Boundary

**Files:**
- Create: `src/server/services/GenerationService.ts`
- Create: `src/server/services/GenerationService.test.ts`
- Modify: `src/server/infrastructure/executor/index.ts`

**Interfaces:**
- Produces: `createJob`, `executeJob`, `cancelJob`, `retryJob`.

- [ ] **Step 1: Write failing success/failure tests**

```ts
it('creates Asset then Version then marks Job succeeded', async () => {
  const job = await service.createJob(input);
  await service.executeJob(job.id);
  expect(events).toEqual(['asset:create', 'version:create', 'job:succeeded']);
});

it.each(['provider', 'asset', 'version', 'job-save'])('%s failure never exposes a successful Version', async (failure) => {
  adapter.failAt(failure);
  await expect(service.executeJob(job.id)).rejects.toBeDefined();
  expect(await versions.listByProject(project.id)).toHaveLength(1);
  expect((await jobs.get(job.id))?.status).toBe('failed');
});
```

- [ ] **Step 2: Run red test**

Run: `npm test --prefix src/server -- services/GenerationService.test.ts`

Expected: FAIL because GenerationService is missing.

- [ ] **Step 3: Implement create and execute**

`createJob` validates Project/input Version/Recipe ownership, stores `queued`, and calls `executor.enqueue(job.id)` only after persistence succeeds.

`executeJob` transitions through real stages, loads input Asset bytes, delegates to existing ProviderFactory, writes result Asset, then inside one DB unit creates Version, updates Project active pointer and marks Job succeeded. If final DB work fails, delete the result object and mark failed with `SAVE_FAILED`.

- [ ] **Step 4: Implement cancel and retry**

`cancelJob` uses legal transitions and executor best-effort cancellation. `retryJob` creates a new Job with `attempt + 1` and `parentJobId`; it never mutates the old failed Job.

- [ ] **Step 5: Run focused tests**

Run: `npm test --prefix src/server -- services/GenerationService.test.ts`

Expected: PASS for success, provider timeout, quota, network, asset save, Version transaction, cancellation race and retry.

- [ ] **Step 6: Commit**

```powershell
git add src/server/services/GenerationService.ts src/server/services/GenerationService.test.ts src/server/infrastructure/executor/index.ts
git commit -m "feat(lumen-v2): PERSIST-001 recoverable generation service"
```

---

### Task 6: Authenticated Project and Job APIs

**Files:**
- Create: `src/server/routes/projects.ts`
- Create: `src/server/routes/projects.test.ts`
- Create: `src/server/routes/jobs.ts`
- Create: `src/server/routes/jobs.test.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- Produces the endpoints frozen in the design specification.

- [ ] **Step 1: Write failing API tests**

Test authenticated create/get/delete Project, create/get/cancel/retry Job, activate/approve Version, 404 ownership mismatch, 409 illegal state and idempotent duplicate Job creation.

```ts
expect(create.status).toBe(201);
expect(create.body.project.activeVersionId).toBe(create.body.versions[0].id);
expect((await getJob()).body.status).toBe('queued');
expect((await cancelJob()).body.status).toBe('cancelled');
```

- [ ] **Step 2: Run red route tests**

Run: `npm test --prefix src/server -- routes/projects.test.ts routes/jobs.test.ts`

Expected: FAIL with unmounted routes.

- [ ] **Step 3: Implement routes and validation**

Mount under existing `authMiddleware`:

```ts
app.use('/api/projects', authMiddleware, projectsRouter);
app.use('/api/jobs', authMiddleware, jobsRouter);
```

Require `Idempotency-Key` on Job creation; return `{ errorCode, message, diagnosticId }` for domain failures; never return object storage keys or Provider credentials.

- [ ] **Step 4: Run route tests and server typecheck**

Run: `npm test --prefix src/server -- routes/projects.test.ts routes/jobs.test.ts`

Expected: PASS.

Run: `npx tsc --noEmit -p src/server/tsconfig.json`

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add src/server/routes/projects.ts src/server/routes/projects.test.ts src/server/routes/jobs.ts src/server/routes/jobs.test.ts src/server/index.ts
git commit -m "feat(lumen-v2): PERSIST-001 project job APIs"
```

---

### Task 7: Controlled `/api/edit` Compatibility Layer

**Files:**
- Modify: `src/server/routes/edit.ts`
- Create: `src/server/routes/edit.compat.test.ts`

**Interfaces:**
- Consumes: GenerationService when a `projectId` and `inputVersionId` are provided.
- Preserves: existing synchronous response shape for Legacy callers.

- [ ] **Step 1: Write compatibility tests**

Assert old request shape still returns the existing response; V2 request with Project context returns `{ jobId, status: 'queued', deprecatedSyncRoute: true }`; invalid mixed input returns 400.

- [ ] **Step 2: Run red test**

Run: `npm test --prefix src/server -- routes/edit.compat.test.ts`

Expected: FAIL on missing controlled path.

- [ ] **Step 3: Implement the compatibility branch**

Do not duplicate Provider logic. Legacy shape delegates to the existing synchronous handler. Project-aware shape calls `generationService.createJob`. Add response header `Deprecation: true` only for the project-aware compatibility call and document the replacement endpoint `/api/projects/:id/jobs`.

- [ ] **Step 4: Run tests**

Run: `npm test --prefix src/server -- routes/edit.compat.test.ts`

Expected: PASS with both Legacy and V2 paths.

- [ ] **Step 5: Commit**

```powershell
git add src/server/routes/edit.ts src/server/routes/edit.compat.test.ts
git commit -m "feat(lumen-v2): PERSIST-001 controlled edit compatibility"
```

---

### Task 8: Typed Client API and Recoverable Project Hook

**Files:**
- Create: `src/client/src/api/projects.ts`
- Create: `src/client/src/hooks/useProject.ts`
- Create: `src/client/src/hooks/useProject.test.tsx`

**Interfaces:**
- Produces: `useProject(projectId?)` with snapshot, active Version, active Job, upload, generate, cancel, retry, activate, approve, delete and refresh.

- [ ] **Step 1: Write failing hook tests**

Use mocked axios to verify upload creates snapshot, queued Job polling survives rerender, terminal state stops polling, refresh restores active Job, and failed Job does not append a Version.

- [ ] **Step 2: Run red test**

Run: `npm test --prefix src/client -- hooks/useProject.test.tsx`

Expected: FAIL because hook/API client is missing.

- [ ] **Step 3: Implement typed API functions**

```ts
export const createProject = (file: File, name: string) => Promise<ProjectSnapshot>;
export const getProject = (id: string) => Promise<ProjectSnapshot>;
export const createJob = (projectId: string, inputVersionId: string, recipe: EditRecipe, idempotencyKey: string) => Promise<GenerationJob>;
export const getJob = (id: string) => Promise<GenerationJob>;
export const cancelJob = (id: string) => Promise<GenerationJob>;
export const retryJob = (id: string) => Promise<GenerationJob>;
```

- [ ] **Step 4: Implement hook polling**

Poll only non-terminal Jobs; use an abort flag on unmount; refresh Project snapshot after `succeeded`; expose server errorCode/diagnosticId; never synthesize percent complete.

- [ ] **Step 5: Run hook tests**

Run: `npm test --prefix src/client -- hooks/useProject.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/client/src/api/projects.ts src/client/src/hooks/useProject.ts src/client/src/hooks/useProject.test.tsx
git commit -m "feat(lumen-v2): PERSIST-001 recoverable project client"
```

---

### Task 9: Real Version Strip and Job Status UI

**Files:**
- Create: `src/client/src/components/v2/VersionStrip.tsx`
- Create: `src/client/src/components/v2/VersionStrip.test.tsx`
- Create: `src/client/src/components/v2/JobStatusPanel.tsx`
- Create: `src/client/src/components/v2/JobStatusPanel.test.tsx`
- Modify: `src/client/src/AppV2.tsx`
- Delete: `src/client/src/components/v2/VersionStripPlaceholder.tsx`

**Interfaces:**
- Consumes: `useProject` snapshot and actions.

- [ ] **Step 1: Write failing component tests**

VersionStrip: render V0/V1 with real signed URLs and ordinals; viewing does not activate; activate and approve require explicit clicks. JobStatusPanel: render real status label, cancel only for cancellable states, retry only for retryable failed Jobs, no percentage text.

- [ ] **Step 2: Run red tests**

Run: `npm test --prefix src/client -- components/v2/VersionStrip.test.tsx components/v2/JobStatusPanel.test.tsx`

Expected: FAIL because components are missing.

- [ ] **Step 3: Implement components**

Status labels must map exactly: queued=排队中, uploading=上传中, analyzing=分析中, generating=生成中, postprocessing=后处理中, saving=保存中, succeeded=已完成, failed=失败, cancelled=已取消.

- [ ] **Step 4: Wire AppV2**

Replace in-memory long-term truth with `useProject`; upload creates Project; generate creates Job from active Version + current Recipe; ResultViewer displays the viewed Version URL; VersionStrip replaces placeholder; JobStatusPanel appears for active Job.

- [ ] **Step 5: Run component and existing FLOW tests**

Run: `npm test --prefix src/client`

Expected: all tests pass; no existing single-CTA regression.

- [ ] **Step 6: Commit**

```powershell
git add src/client/src/AppV2.tsx src/client/src/components/v2/VersionStrip.tsx src/client/src/components/v2/VersionStrip.test.tsx src/client/src/components/v2/JobStatusPanel.tsx src/client/src/components/v2/JobStatusPanel.test.tsx
git rm src/client/src/components/v2/VersionStripPlaceholder.tsx
git commit -m "feat(lumen-v2): PERSIST-001 version and job UI"
```

---

### Task 10: Legacy History Backup and Explicit Import

**Files:**
- Create: `src/client/src/components/v2/LegacyHistoryImport.tsx`
- Create: `src/client/src/components/v2/LegacyHistoryImport.test.tsx`
- Create: `src/client/src/utils/legacyHistory.ts`
- Create: `src/client/src/utils/legacyHistory.test.ts`
- Modify: `src/client/src/AppV2.tsx`

**Interfaces:**
- Produces: `inspectLegacyHistory`, `exportLegacyBackup`, `importRecoverableEntries`.

- [ ] **Step 1: Write failing migration tests**

Assert base64 entries are recoverable, expired/unfetchable URLs are rejected, original JSON backup is preserved, import requires explicit confirmation, and failures do not remove localStorage.

- [ ] **Step 2: Run red tests**

Run: `npm test --prefix src/client -- utils/legacyHistory.test.ts components/v2/LegacyHistoryImport.test.tsx`

Expected: FAIL because migration utilities are missing.

- [ ] **Step 3: Implement inspection and backup**

Return per entry `{ id, recoverable, reason }`; download `lumen-edit-history-backup-<ISO>.json`; never mutate `edit_history` during inspection.

- [ ] **Step 4: Implement explicit import UI**

Show counts and reasons; require checkbox plus confirmation button; upload recoverable image bytes through Project/Asset APIs; retain backup and rejected entries.

- [ ] **Step 5: Run tests**

Run: `npm test --prefix src/client -- utils/legacyHistory.test.ts components/v2/LegacyHistoryImport.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/client/src/components/v2/LegacyHistoryImport.tsx src/client/src/components/v2/LegacyHistoryImport.test.tsx src/client/src/utils/legacyHistory.ts src/client/src/utils/legacyHistory.test.ts src/client/src/AppV2.tsx
git commit -m "feat(lumen-v2): PERSIST-001 explicit history import"
```

---

### Task 11: End-to-End Failure Matrix and Deletion Proof

**Files:**
- Create: `src/server/persist.e2e.test.ts`
- Create: `src/client/src/AppV2.persist.test.tsx`

**Interfaces:**
- Verifies the entire PERSIST-001 closure.

- [ ] **Step 1: Add server E2E cases**

Use synthetic PNG bytes. Test upload/V0, queued Job, success/V1, refresh, approve, provider timeout, quota, network, object save, DB save, cancellation, retry, idempotent duplicate, and complete deletion.

- [ ] **Step 2: Add client E2E cases**

Mock HTTP at API boundaries only. Test refresh recovery, real status labels, explicit activate/approve, failure not adding a Version, cancel/retry actions, and no percentage text.

- [ ] **Step 3: Run E2E tests**

Run: `npm test --prefix src/server -- persist.e2e.test.ts`

Expected: PASS.

Run: `npm test --prefix src/client -- AppV2.persist.test.tsx`

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add src/server/persist.e2e.test.ts src/client/src/AppV2.persist.test.tsx
git commit -m "test(lumen-v2): PERSIST-001 failure recovery matrix"
```

---

### Task 12: Evidence, Gates and Handoff

> Ordering gate: do not start Task 12 until `INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 5—7 pass. Task 12 captures core PERSIST and internal-security evidence in one acceptance packet.

**Files:**
- Create: `docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`
- Create: `docs/lumen-v2/evidence/PERSIST-001/`
- Modify: `docs/lumen-v2/state/STATE.json`
- Modify: `docs/lumen-v2/state/PROJECT-MEMORY.md`
- Modify: `docs/lumen-v2/state/DECISION-LOG.md`
- Modify: `docs/lumen-v2/state/CHANGELOG.md`
- Modify: `docs/lumen-v2/state/SESSION-HANDOFF.md`

- [ ] **Step 1: Capture synthetic evidence**

Capture upload/V0, generating, V1 succeeded, refresh recovery, compare, approve, failed Job without Version, retry, cancel and delete. Record object/database snapshots with identifiers redacted.

Also capture deployed missing-secret startup failure, login throttle, rejected CORS origin, malformed/oversized/MIME-mismatched/over-pixel image rejection, minimal health output, sanitized provider responses, and redacted diagnostic logs. Evidence must contain no secret, base64 payload, raw IP, connection string, or full Provider error.

- [ ] **Step 2: Run all gates**

```powershell
npm.cmd run lint --prefix src/client
npx.cmd tsc --noEmit -p src/client/tsconfig.json
npm.cmd test --prefix src/client
npx.cmd tsc --noEmit -p src/server/tsconfig.json
npm.cmd test --prefix src/server
npm.cmd test
npm.cmd run build
node.exe scripts/check-lumen-collab.mjs
```

Expected: every command exits 0; report exact test counts.

- [ ] **Step 3: Verify safety and scope**

Run: `git diff --check`

Expected: no PERSIST-related whitespace errors; unrelated existing errors must be identified by exact file and left untouched.

Run:

```powershell
$persistBase = (Get-Content -Raw -Encoding utf8 docs/lumen-v2/evidence/PERSIST-001/base-commit.txt).Trim()
git diff --name-only "$persistBase..HEAD"
```

Expected: only PERSIST-001 production, test, dependency, evidence and state files.

- [ ] **Step 4: Update state for GPT acceptance**

Set `status=awaiting_gpt_acceptance`, `nextActor=gpt`, `latestTraeReport=docs/lumen-v2/reports/PERSIST-001-TRAE-REPORT.md`; do not archive or activate ROUTING.

- [ ] **Step 5: Final commit and push**

```powershell
git add docs/lumen-v2 src/client src/server src/shared
git commit -m "feat(lumen-v2): PERSIST-001 implementation"
git push -u origin lumen/persist-001-trae
```

Expected: pushed branch and commit SHA recorded in the Trae report.
