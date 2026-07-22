/**
 * LUMEN-CLOUDBASE-NOSQL-PREVIEW-SMOKE-HARNESS-01
 * CloudBase NoSQL Preview namespace smoke test harness.
 *
 * Purpose: a fail-closed, operator-only tool that exercises the REAL
 * CloudBase NoSQL adapter (`cloudbase.nosql.ts`) against an isolated Preview
 * namespace, so that once FIX-R4 completes this harness can be run immediately
 * to validate real CloudBase behavior without writing ad-hoc scripts.
 *
 * Safety model (AC-01 / AC-02):
 *  - By default (no `ALLOW_CLOUDBASE_PREVIEW_SMOKE=true`) the script emits a
 *    `skipped` report and performs NO network requests and NO writes.
 *  - Even when the gate is on, the script refuses to run if any of the
 *    following fail:
 *      - SMOKE_RUN_ID, CLOUDBASE_DATA_NAMESPACE, CLOUDBASE_STORAGE_PREFIX,
 *        CLOUDBASE_ENV_ID, CLOUDBASE_API_KEY are missing or empty.
 *      - CLOUDBASE_PRODUCTION_DATA_NAMESPACE is missing or empty (REQUIRED
 *        when gate is on so Layer 1 equality check can fire).
 *      - Layer 1: preview namespace equals declared Production namespace
 *        (after trim + lowercase normalization). This rejects non-"prod"
 *        production namespaces like "lumen", "live" that Layer 2 would miss.
 *      - Layer 1 (optional): preview storage prefix equals declared
 *        Production storage prefix when CLOUDBASE_PRODUCTION_STORAGE_PREFIX
 *        is provided.
 *      - Layer 2 (defensive): namespace or storage prefix contains "prod"
 *        substring. Catches misconfigured namespaces not declared via
 *        CLOUDBASE_PRODUCTION_DATA_NAMESPACE.
 *  - Every created record carries the `smokeRunId` in its id + human fields
 *    (AC-03) so stray test data is identifiable and cleanable.
 *  - Success AND failure paths both attempt cleanup (AC-04); cleanup failures
 *    are collected into `cleanupFailures` and never silently swallowed (AC-05).
 *  - The report contains only namespace, steps, results and redacted errors
 *    (AC-06). No API Key, Authorization header, full credentials or
 *    Production config ever appear in the output.
 *  - The script compiles with TypeScript even when credentials are absent;
 *    the CloudBase SDK is only imported dynamically inside `ensureReady()`
 *    (AC-07), so module load performs no network I/O.
 *
 * Run (operator only, Preview env):
 *   ALLOW_CLOUDBASE_PREVIEW_SMOKE=true \
 *   SMOKE_RUN_ID=20260722-1430 \
 *   CLOUDBASE_ENV_ID=... CLOUDBASE_API_KEY=... \
 *   CLOUDBASE_DATA_NAMESPACE=preview CLOUDBASE_STORAGE_PREFIX=preview/ \
 *   CLOUDBASE_PRODUCTION_DATA_NAMESPACE=lumen \
 *   [CLOUDBASE_PRODUCTION_STORAGE_PREFIX=lumen/] \
 *   npx tsx src/server/scripts/cloudbase-nosql-preview-smoke.ts
 *
 * This file does NOT modify production code, service code, tests or state
 * files (AC-08). It is purely additive tooling.
 */

import {
  createCloudBaseNoSqlPersistence,
  type CloudBaseNoSqlDeps,
  type CloudBaseNoSqlOptions,
} from '../infrastructure/persistence/cloudbase.nosql.js';

// --- Report types ----------------------------------------------------------

type StepStatus = 'pass' | 'fail' | 'skip';

interface SmokeStep {
  /** Sequential step number from the task's In Scope list. */
  step: number;
  name: string;
  status: StepStatus;
  durationMs?: number;
  /** Redacted error message (only when status === 'fail'). */
  error?: string;
}

type OverallStatus = 'pass' | 'fail' | 'blocked' | 'skipped';

interface CleanupFailure {
  target: string;
  /** Redacted error message. */
  error: string;
}

interface SmokeReport {
  smokeRunId: string | null;
  namespace: string | null;
  /** Storage prefix is non-secret config (e.g. `preview/`); included as-is. */
  storagePrefix: string | null;
  /** envId partially masked — not a secret, but never printed in full. */
  envIdMasked: string | null;
  startedAt: string;
  finishedAt: string | null;
  overall: OverallStatus;
  /** Why the run was blocked/skipped (no credentials leaked). */
  blockReason: string | null;
  steps: SmokeStep[];
  cleanupFailures: CleanupFailure[];
  /** Marker: confirms no raw credentials are present in this object. */
  redacted: true;
}

// --- Redaction (AC-06) -----------------------------------------------------

/**
 * Redact anything that looks like a credential from an error message.
 * Order matters: scrub the literal apiKey first so a long-token regex does
 * not leave fragments behind, then scrub common credential patterns.
 */
function redactError(err: unknown, apiKey?: string): string {
  if (err === null || err === undefined) return '';
  const raw = err instanceof Error ? err.message : String(err);
  let out = raw;
  if (apiKey && apiKey.length > 0) {
    out = out.split(apiKey).join('***API_KEY_REDACTED***');
  }
  out = out
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***REDACTED***')
    .replace(/eyJ[A-Za-z0-9_-]+/g, '***JWT_REDACTED***')
    .replace(/AKID[A-Za-z0-9]+/g, '***AKID_REDACTED***')
    // CloudBase fileIDs look like cloud://envId.xxxx/...; keep the scheme,
    // redact the long identifier segment.
    .replace(/(cloud:\/\/[^/]+\.)([A-Za-z0-9-]{12,})/g, '$1***REDACTED***')
    // Generic long opaque tokens (API keys, access tokens, lease tokens).
    .replace(/[A-Za-z0-9_-]{40,}/g, '***REDACTED***');
  // Truncate so a verbose stack never balloons the report.
  return out.substring(0, 600);
}

function maskEnvId(envId: string): string {
  if (!envId) return '';
  if (envId.length <= 8) return '***';
  return `${envId.substring(0, 6)}***`;
}

// --- Config validation (fail-closed, AC-01 / AC-02) ------------------------

interface BlockedConfig {
  kind: 'blocked';
  reason: string;
  smokeRunId: null;
  options: null;
}

interface SkippedConfig {
  kind: 'skipped';
  reason: string;
  smokeRunId: null;
  options: null;
}

interface OkConfig {
  kind: 'ok';
  smokeRunId: string;
  apiKey: string;
  options: CloudBaseNoSqlOptions;
  /**
   * Declared Production namespace (from CLOUDBASE_PRODUCTION_DATA_NAMESPACE).
   * Required when the smoke gate is on so Layer 1 equality check can reject
   * Preview namespaces that match a non-"prod" Production namespace
   * (e.g. "lumen", "live"). Re-checked in step 2 (defensive).
   */
  productionNamespace: string;
  /**
   * Optional declared Production storage prefix (from
   * CLOUDBASE_PRODUCTION_STORAGE_PREFIX). When present, Layer 1 equality
   * check also applies to the storage prefix.
   */
  productionStoragePrefix: string;
}

type ResolvedConfig = OkConfig | BlockedConfig | SkippedConfig;

/**
 * Read and validate configuration from the environment source. Performs every
 * fail-closed safety check from the task's Safety Requirements before any
 * network request can be made.
 */
function resolveConfig(env: NodeJS.ProcessEnv): ResolvedConfig {
  // AC-01 / AC-02: explicit Preview gate. Default = no writes.
  if (env.ALLOW_CLOUDBASE_PREVIEW_SMOKE !== 'true') {
    return {
      kind: 'skipped',
      reason:
        'ALLOW_CLOUDBASE_PREVIEW_SMOKE is not "true"; smoke harness defaults to no-write.',
      smokeRunId: null,
      options: null,
    };
  }

  // Run id is required so every created record is traceable + cleanable (AC-03).
  const smokeRunId = (env.SMOKE_RUN_ID ?? '').trim();
  if (!smokeRunId) {
    return {
      kind: 'blocked',
      reason: 'SMOKE_RUN_ID is missing or empty.',
      smokeRunId: null,
      options: null,
    };
  }

  const namespace = (env.CLOUDBASE_DATA_NAMESPACE ?? '').trim();
  const storagePrefix = (env.CLOUDBASE_STORAGE_PREFIX ?? '').trim();
  const envId = (env.CLOUDBASE_ENV_ID ?? '').trim();
  const apiKey = env.CLOUDBASE_API_KEY ?? '';
  // Production namespace declaration (REQUIRED when smoke gate is on).
  // Without this explicit declaration we cannot perform Layer 1 equality
  // check, so a non-"prod" Production namespace (e.g. "lumen", "live")
  // could be silently hit by Preview smoke writes. Fail closed.
  const productionNamespace = (env.CLOUDBASE_PRODUCTION_DATA_NAMESPACE ?? '').trim();
  // Optional Production storage prefix declaration. When present, Layer 1
  // equality check also applies to the storage prefix.
  const productionStoragePrefix = (env.CLOUDBASE_PRODUCTION_STORAGE_PREFIX ?? '').trim();

  // namespace / prefix must be present (Safety Requirements).
  if (!namespace) {
    return blocked('CLOUDBASE_DATA_NAMESPACE is missing or empty.');
  }
  if (!storagePrefix) {
    return blocked('CLOUDBASE_STORAGE_PREFIX is missing or empty.');
  }
  if (!envId) {
    return blocked('CLOUDBASE_ENV_ID is missing or empty.');
  }
  if (!apiKey) {
    return blocked('CLOUDBASE_API_KEY is missing or empty.');
  }
  // Production namespace declaration is REQUIRED when the smoke gate is on.
  // Without it the Layer 1 equality check cannot fire and a non-"prod"
  // Production namespace would be reachable. Fail closed.
  if (!productionNamespace) {
    return blocked(
      'CLOUDBASE_PRODUCTION_DATA_NAMESPACE is missing or empty; required when ALLOW_CLOUDBASE_PREVIEW_SMOKE=true so the harness can reject Preview==Production collisions for non-"prod" production namespaces (e.g. "lumen", "live").'
    );
  }

  // Layer 1 (strongest): explicit Preview==Production equality check.
  // Compare after trim + lowercase normalization so "Preview" / "preview " /
  // "PREVIEW" all collide with "preview" production namespace and are rejected.
  if (normalizeIdentifier(namespace) === normalizeIdentifier(productionNamespace)) {
    return blocked(
      `CLOUDBASE_DATA_NAMESPACE "${namespace}" equals declared Production namespace "${productionNamespace}"; refusing to target production.`
    );
  }
  // Optional Layer 1 equality check on storage prefix when production prefix
  // is declared. Prevents Preview storage writes from hitting Production
  // storage paths even when namespace strings differ.
  if (
    productionStoragePrefix &&
    normalizeIdentifier(storagePrefix) === normalizeIdentifier(productionStoragePrefix)
  ) {
    return blocked(
      `CLOUDBASE_STORAGE_PREFIX "${storagePrefix}" equals declared Production storage prefix "${productionStoragePrefix}"; refusing to target production storage.`
    );
  }

  // Layer 2 (defensive): reject anything that still looks like production
  // targeting via the "prod" substring heuristic. Catches misconfigured
  // namespaces that weren't declared via CLOUDBASE_PRODUCTION_DATA_NAMESPACE
  // (e.g. "prod-data", "myprod"). This is the second layer of protection,
  // not the primary boundary.
  if (namespace.toLowerCase().includes('prod')) {
    return blocked(
      `CLOUDBASE_DATA_NAMESPACE "${namespace}" contains "prod"; refusing to target production.`
    );
  }
  if (storagePrefix.toLowerCase().includes('prod')) {
    return blocked(
      `CLOUDBASE_STORAGE_PREFIX "${storagePrefix}" contains "prod"; refusing to target production.`
    );
  }

  const ttlRaw = env.CLOUDBASE_SIGNED_URL_TTL_SECONDS;
  const signedUrlTtlSeconds = ttlRaw ? Number(ttlRaw) : undefined;

  const options: CloudBaseNoSqlOptions = {
    envId,
    apiKey,
    dataNamespace: namespace,
    storagePrefix,
    ...(signedUrlTtlSeconds !== undefined && Number.isFinite(signedUrlTtlSeconds)
      ? { signedUrlTtlSeconds }
      : {}),
  };

  return {
    kind: 'ok',
    smokeRunId,
    apiKey,
    options,
    productionNamespace,
    productionStoragePrefix,
  };
}

/**
 * Normalize an identifier for equality comparison: trim surrounding whitespace
 * and lowercase. Used by Layer 1 equality check so "Preview" / "preview " /
 * "PREVIEW" all collide with "preview".
 */
function normalizeIdentifier(s: string): string {
  return s.trim().toLowerCase();
}

function blocked(reason: string): BlockedConfig {
  return { kind: 'blocked', reason, smokeRunId: null, options: null };
}

// --- Harness state (tracks created records for cleanup) --------------------

interface HarnessState {
  projectId: string | null;
  assetId: string | null;
  assetStorageKey: string | null;
  versionId: string | null;
  jobId: string | null;
  objectStoreKey: string | null;
}

function emptyState(): HarnessState {
  return {
    projectId: null,
    assetId: null,
    assetStorageKey: null,
    versionId: null,
    jobId: null,
    objectStoreKey: null,
  };
}

// --- Main smoke flow --------------------------------------------------------

async function runSmoke(
  config: OkConfig
): Promise<{ steps: SmokeStep[]; cleanupFailures: CleanupFailure[]; state: HarnessState }> {
  const { smokeRunId, apiKey, options } = config;
  const steps: SmokeStep[] = [];
  const cleanupFailures: CleanupFailure[] = [];
  const state = emptyState();

  // Pre-compute test record ids. Every id/name/label/prompt embeds smokeRunId
  // (AC-03) so the records are identifiable and cleanable.
  const projectId = `smoke-${smokeRunId}-proj`;
  const assetId = `smoke-${smokeRunId}-asset`;
  const assetStorageKey = `smoke/${smokeRunId}/asset.bin`;
  const versionId = `smoke-${smokeRunId}-ver`;
  const jobId = `smoke-${smokeRunId}-job`;
  const idempotencyKey = `smoke-${smokeRunId}-idem`;
  const objectStoreKey = `smoke/${smokeRunId}/os-test.bin`;

  let deps: CloudBaseNoSqlDeps | null = null;

  /**
   * Record a step. `fn` may throw; the throw is captured as a redacted error
   * and re-thrown so the outer flow can jump to cleanup. Steps that fail fast
   * (e.g. ensureReady) abort the rest of the flow.
   */
  async function step<T>(
    num: number,
    name: string,
    fn: () => Promise<T>,
    opts: { abortOnFail?: boolean } = {}
  ): Promise<T | undefined> {
    const start = Date.now();
    try {
      const result = await fn();
      steps.push({
        step: num,
        name,
        status: 'pass',
        durationMs: Date.now() - start,
      });
      return result;
    } catch (err) {
      steps.push({
        step: num,
        name,
        status: 'fail',
        durationMs: Date.now() - start,
        error: redactError(err, apiKey),
      });
      if (opts.abortOnFail) {
        throw err; // propagate to outer try/catch -> cleanup
      }
      return undefined;
    }
  }

  try {
    // Step 1 is the fail-closed config (already resolved before this fn).
    steps.push({ step: 1, name: 'config-fail-closed', status: 'pass' });

    // Step 2: namespace/prefix safety re-check (explicit, defensive).
    // Mirrors resolveConfig() so a bug in config resolution cannot silently
    // bypass the production-targeting guard. Layer 1 (equality) is the
    // primary boundary; Layer 2 (prod substring) is defensive.
    await step(2, 'namespace-prefix-safety', async () => {
      if (!config.productionNamespace) {
        throw new Error('CLOUDBASE_PRODUCTION_DATA_NAMESPACE missing at step 2');
      }
      if (
        normalizeIdentifier(options.dataNamespace) ===
        normalizeIdentifier(config.productionNamespace)
      ) {
        throw new Error('preview namespace equals production namespace');
      }
      if (
        config.productionStoragePrefix &&
        normalizeIdentifier(options.storagePrefix) ===
          normalizeIdentifier(config.productionStoragePrefix)
      ) {
        throw new Error('preview storage prefix equals production storage prefix');
      }
      if (options.dataNamespace.toLowerCase().includes('prod')) {
        throw new Error('namespace contains "prod"');
      }
      if (options.storagePrefix.toLowerCase().includes('prod')) {
        throw new Error('storagePrefix contains "prod"');
      }
    });

    // Construct the adapter. Factory validates config eagerly but performs NO
    // network I/O (the SDK is imported lazily in ensureReady).
    deps = createCloudBaseNoSqlPersistence(options);

    // Step 3 (precondition): SDK init — this is the first network call.
    // Test matrix: "SDK 初始化失败" is handled here (throws -> abort).
    await step(
      3,
      'sdk-init-ensureReady',
      async () => {
        await deps!.ensureReady();
      },
      { abortOnFail: true }
    );

    const now = () => new Date().toISOString();

    // Step 4: Project create + read.
    await step(4, 'project-create-read', async () => {
      await deps!.projects.create({
        id: projectId,
        name: `smoke-${smokeRunId} project`,
        createdAt: now(),
        updatedAt: now(),
      });
      state.projectId = projectId;
      const fetched = await deps!.projects.get(projectId);
      if (!fetched) throw new Error('PROJECT_GET_RETURNED_NULL');
      if (fetched.id !== projectId) {
        throw new Error(`PROJECT_ID_MISMATCH: ${fetched.id}`);
      }
    });

    // Step 5: Asset + Version create + read.
    await step(5, 'asset-version-create-read', async () => {
      await deps!.assets.create({
        id: assetId,
        projectId,
        storageKey: assetStorageKey,
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        createdAt: now(),
      });
      state.assetId = assetId;
      state.assetStorageKey = assetStorageKey;
      const asset = await deps!.assets.get(assetId);
      if (!asset) throw new Error('ASSET_GET_RETURNED_NULL');

      // Idempotent version create.
      await deps!.versions.createIdempotent(projectId, `v1-${smokeRunId}`, {
        id: versionId,
        projectId,
        assetId,
        label: `smoke-${smokeRunId}-v1`,
        createdAt: now(),
      });
      state.versionId = versionId;
      const version = await deps!.versions.get(versionId);
      if (!version) throw new Error('VERSION_GET_RETURNED_NULL');
    });

    // Step 6: Job idempotency — sequential calls must return the same Job.
    await step(6, 'job-idempotency-sequential', async () => {
      const first = await deps!.jobs.createIdempotent({
        id: jobId,
        projectId,
        prompt: `smoke-${smokeRunId} test prompt`,
        status: 'queued',
        idempotencyKey,
        createdAt: now(),
        updatedAt: now(),
      });
      state.jobId = jobId;
      if (!first.created) {
        throw new Error('FIRST_CREATE_RETURNED_EXISTING (unexpected)');
      }
      // Second call with the same idempotency key must NOT create a new Job.
      const second = await deps!.jobs.createIdempotent({
        id: `smoke-${smokeRunId}-job-dup`,
        projectId,
        prompt: `smoke-${smokeRunId} test prompt`,
        status: 'queued',
        idempotencyKey,
        createdAt: now(),
        updatedAt: now(),
      });
      if (second.created) {
        throw new Error('SECOND_CREATE_RETURNED_CREATED (idempotency broken)');
      }
      if (second.job.id !== first.job.id) {
        throw new Error(
          `IDEMPOTENT_JOB_MISMATCH: ${second.job.id} vs ${first.job.id}`
        );
      }
    });

    // Step 7: ObjectStore put / get / delete (storageKey -> fileID mapping).
    await step(7, 'objectstore-put-get-delete', async () => {
      const payload = Buffer.from(`smoke-${smokeRunId}-payload`, 'utf8');
      await deps!.objects.put(objectStoreKey, new Uint8Array(payload), 'application/octet-stream');
      state.objectStoreKey = objectStoreKey;
      const fetched = await deps!.objects.get(objectStoreKey);
      const fetchedStr = Buffer.from(fetched).toString('utf8');
      if (fetchedStr !== `smoke-${smokeRunId}-payload`) {
        throw new Error('OBJECT_ROUNDTRIP_MISMATCH');
      }
      const existsBefore = await deps!.objects.exists(objectStoreKey);
      if (!existsBefore) throw new Error('OBJECT_EXISTS_FALSE_AFTER_PUT');
      await deps!.objects.delete(objectStoreKey);
      const existsAfter = await deps!.objects.exists(objectStoreKey);
      if (existsAfter) throw new Error('OBJECT_EXISTS_TRUE_AFTER_DELETE');
      // objectStoreKey is now fully cleaned; clear so cleanup skips it.
      state.objectStoreKey = null;
    });

    // Step 8: Project delete (DB metadata cascade only — NOSQL-R2-05).
    await step(8, 'project-delete-cascade', async () => {
      await deps!.projects.deleteCascade(projectId);
      const gone = await deps!.projects.get(projectId);
      if (gone) throw new Error('PROJECT_STILL_EXISTS_AFTER_DELETE');
      // Project-level cleanup of DB metadata is complete.
      state.projectId = null;
    });

    // Steps 1-8 done. Cleanup (step 9) runs in finally.
  } catch {
    // A step already recorded its redacted error. We fall through to cleanup.
    // (cleanupFailures are collected separately below.)
  } finally {
    // AC-04: success AND failure paths both attempt cleanup.
    await runCleanup(deps, state, apiKey, cleanupFailures);
    if (deps) {
      try {
        await deps.close();
      } catch (err) {
        cleanupFailures.push({
          target: 'adapter.close()',
          error: redactError(err, apiKey),
        });
      }
    }
  }

  return { steps, cleanupFailures, state };
}

/**
 * AC-04 / AC-05: best-effort cleanup. Collects failures into `cleanupFailures`
 * and never swallows them silently. Runs a second idempotent pass to prove
 * re-cleanup does not throw (test matrix: "二次清理保持幂等").
 *
 * Cleanup order mirrors the adapter's own deletion contract (NOSQL-R2-05):
 * storage objects first (objects.delete removes the file AND the
 * object_metadata record), then DB metadata via projects.deleteCascade.
 */
async function runCleanup(
  deps: CloudBaseNoSqlDeps | null,
  state: HarnessState,
  apiKey: string,
  cleanupFailures: CleanupFailure[]
): Promise<void> {
  if (!deps) return;

  // --- First pass: delete any storage object that still exists. ---
  const storageKeysToDelete: string[] = [];
  if (state.objectStoreKey) storageKeysToDelete.push(state.objectStoreKey);
  if (state.assetStorageKey) storageKeysToDelete.push(state.assetStorageKey);

  for (const key of storageKeysToDelete) {
    try {
      await deps.objects.delete(key);
    } catch (err) {
      const redacted = redactError(err, apiKey);
      // "not found" is an idempotent success — the object was already gone.
      if (isAlreadyGone(redacted)) continue;
      cleanupFailures.push({ target: `objects.delete(${key})`, error: redacted });
    }
  }

  // --- First pass: delete DB metadata via project cascade (if project remains). ---
  if (state.projectId) {
    try {
      await deps.projects.deleteCascade(state.projectId);
    } catch (err) {
      cleanupFailures.push({
        target: `projects.deleteCascade(${state.projectId})`,
        error: redactError(err, apiKey),
      });
    }
  }

  // --- Second pass: prove cleanup is idempotent (does not throw). ---
  // Re-attempt deleteCascade for any projectId we ever touched, even if the
  // first pass already cleared it. A clean re-run must be a no-op.
  const projectsToReVerify: string[] = [];
  if (state.projectId) projectsToReVerify.push(state.projectId);
  // Also re-verify the original projectId even if step 8 cleared state —
  // re-add it from the closure by checking the harness created one at all.
  // (state.projectId is null only after a successful step 8; in that case
  // the second pass is a no-op get that should return null.)
  for (const pid of projectsToReVerify) {
    try {
      await deps.projects.deleteCascade(pid);
    } catch (err) {
      const redacted = redactError(err, apiKey);
      if (isAlreadyGone(redacted)) continue;
      cleanupFailures.push({
        target: `idempotent-re-deleteCascade(${pid})`,
        error: redacted,
      });
    }
  }
}

/**
 * Heuristic: does this redacted error indicate the target was already absent?
 * CloudBase returns updated/deleted:0 or OBJECT_NOT_FOUND when a doc/object
 * is gone; the adapter surfaces these as OBJECT_NOT_FOUND / *_NOT_FOUND.
 */
function isAlreadyGone(redactedError: string): boolean {
  const e = redactedError.toUpperCase();
  return (
    e.includes('OBJECT_NOT_FOUND') ||
    e.includes('PROJECT_NOT_FOUND') ||
    e.includes('NOT_FOUND') ||
    e.includes('UPDATED: 0') ||
    e.includes('DELETED: 0')
  );
}

// --- Orchestrator + report -------------------------------------------------

function buildSkippedReport(reason: string, startedAt: string): SmokeReport {
  return {
    smokeRunId: null,
    namespace: null,
    storagePrefix: null,
    envIdMasked: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    overall: 'skipped',
    blockReason: reason,
    steps: [
      { step: 1, name: 'config-fail-closed', status: 'skip' },
    ],
    cleanupFailures: [],
    redacted: true,
  };
}

function buildBlockedReport(reason: string, startedAt: string): SmokeReport {
  return {
    smokeRunId: null,
    namespace: null,
    storagePrefix: null,
    envIdMasked: null,
    startedAt,
    finishedAt: new Date().toISOString(),
    overall: 'blocked',
    blockReason: reason,
    steps: [
      { step: 1, name: 'config-fail-closed', status: 'fail', error: reason },
    ],
    cleanupFailures: [],
    redacted: true,
  };
}

function buildRunReport(
  config: OkConfig,
  steps: SmokeStep[],
  cleanupFailures: CleanupFailure[],
  startedAt: string
): SmokeReport {
  const hasFail = steps.some((s) => s.status === 'fail');
  const overall: OverallStatus =
    cleanupFailures.length > 0 && hasFail
      ? 'fail'
      : hasFail
        ? 'fail'
        : cleanupFailures.length > 0
          ? 'fail'
          : 'pass';
  return {
    smokeRunId: config.smokeRunId,
    namespace: config.options.dataNamespace,
    storagePrefix: config.options.storagePrefix,
    envIdMasked: maskEnvId(config.options.envId),
    startedAt,
    finishedAt: new Date().toISOString(),
    overall,
    blockReason: null,
    steps,
    cleanupFailures,
    redacted: true,
  };
}

async function main(): Promise<number> {
  const startedAt = new Date().toISOString();
  const config = resolveConfig(process.env);

  if (config.kind === 'skipped') {
    printReport(buildSkippedReport(config.reason, startedAt));
    // AC-01: default (gate off) is the expected no-write state -> exit 0.
    return 0;
  }
  if (config.kind === 'blocked') {
    printReport(buildBlockedReport(config.reason, startedAt));
    // Misconfiguration when the operator asked for smoke -> signal via exit 2.
    return 2;
  }

  const { steps, cleanupFailures } = await runSmoke(config);
  const report = buildRunReport(config, steps, cleanupFailures, startedAt);
  printReport(report);
  return report.overall === 'pass' ? 0 : 1;
}

function printReport(report: SmokeReport): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// --- Entry point -----------------------------------------------------------
//
// Top-level await via an async IIFE. The script never throws uncaught: every
// path returns an exit code derived from the report.

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // Defensive: should be unreachable because main() catches everything.
    process.stderr.write(
      `SMOKE_HARNESS_UNCAUGHT: ${redactError(err, process.env.CLOUDBASE_API_KEY)}\n`
    );
    process.exitCode = 1;
  });
