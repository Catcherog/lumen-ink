/**
 * PERSIST-001 GenerationService — atomic success boundary.
 *
 * Orchestrates the full GenerationJob lifecycle:
 *  - `createJob`: validate ownership, atomically create-or-return by
 *    `(projectId, idempotencyKey)`, enqueue only after persistence succeeds.
 *  - `executeJob`: claim a lease, transition through real stages, load
 *    input bytes, delegate to a Provider, write result Asset+Version in one
 *    DB unit, conditionally mark the Job succeeded for the current lease
 *    holder. If the lease is lost or final DB work fails, delete the
 *    uncommitted result object — an expired worker must not publish success.
 *  - `cancelJob`: legal transition + executor best-effort cancel.
 *  - `retryJob`: create a new Job with attempt+1 and parentJobId; never
 *    mutate the old failed Job.
 *
 * Atomic success boundary (per PERSIST-001 Task 5):
 *  1. Provider call produces result bytes.
 *  2. Result bytes are uploaded to ObjectStore.
 *  3. Inside ONE UnitOfWork.run:
 *     - create result Asset
 *     - create result Version (idempotent)
 *     - update Project.activeVersionId
 *  4. After the UoW commits, conditionally transition the Job to
 *     `succeeded` via `updateIfClaimed` — if the lease was taken over by
 *     another worker, this returns null and the result bytes are deleted
 *     as compensation.
 *
 * Error classification (D-040 stable codes):
 *  - Provider timeout → PROVIDER_TIMEOUT (retryable)
 *  - Provider quota → PROVIDER_QUOTA (retryable)
 *  - Provider network → PROVIDER_NETWORK (retryable)
 *  - Save failure → SAVE_FAILED (retryable)
 *  - Recipe/Validation → INVALID_RECIPE (permanent)
 */

import type {
  PersistenceDependencies,
  GenerationJob,
  Project,
  Version,
  Asset,
  GenerationJobStatus,
} from '../domain/persistence.js';
import type { JobExecutor } from '../domain/persistence.js';
import type { DomainErrorCode } from '../domain/errors.js';
import {
  transitionJob,
  canTransition,
  canRetryJob,
  isActiveJobStatus,
} from '../domain/jobState.js';
import { DomainError } from '../domain/errors.js';

export interface CreateJobInput {
  projectId: string;
  prompt: string;
  /** Optional input version whose asset is the source image. */
  inputVersionId?: string;
  /** Optional reference image asset IDs (for color tasks). */
  referenceAssetIds?: string[];
  /** Provider ID to use; defaults to the project's last-used provider. */
  providerId?: string;
  /** Model ID to use. */
  model?: string;
  /** Output size hint. */
  outputSize?: '1k' | '2k' | '4k';
  /** Idempotency key; same key returns the original Job. */
  idempotencyKey?: string;
  /** Recipe JSON (stored on the Job for audit). */
  recipe?: unknown;
}

export interface ExecuteJobOptions {
  /**
   * Provider factory function. Receives the Job plus the frozen input
   * bytes (loaded from `Job.inputVersionId`'s Asset via `ObjectStore.get`)
   * so the Provider always sees the exact input that was captured at Job
   * creation time — never the live `project.activeVersionId`.
   */
  providerFactory?: (
    job: GenerationJob,
    input: { bytes: Uint8Array; mimeType: string }
  ) => Promise<{
    bytes: Uint8Array;
    mimeType: string;
  }>;
  /** Lease duration in seconds. Default 60. */
  leaseSeconds?: number;
  /** Heartbeat interval in seconds. Default = leaseSeconds / 2. */
  heartbeatSeconds?: number;
  /** Worker ID for lease claims. */
  workerId?: string;
}

export interface RetryJobResult {
  job: GenerationJob;
  parentJob: GenerationJob;
}

const DEFAULT_LEASE_SECONDS = 60;

function generateId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `tok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function leaseExpiry(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Classify a Provider error into a stable DomainErrorCode.
 * Returns null if the error is already a DomainError.
 */
function classifyProviderError(err: unknown): { code: DomainErrorCode; message: string } {
  if (err instanceof DomainError) {
    return { code: err.code, message: err.message };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { code: 'PROVIDER_TIMEOUT', message: `PROVIDER_TIMEOUT: ${msg}` };
  }
  if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('429')) {
    return { code: 'PROVIDER_QUOTA', message: `PROVIDER_QUOTA: ${msg}` };
  }
  if (lower.includes('network') || lower.includes('econnreset') || lower.includes('fetch failed')) {
    return { code: 'PROVIDER_NETWORK', message: `PROVIDER_NETWORK: ${msg}` };
  }
  // Unknown provider errors are treated as network (retryable) by default.
  return { code: 'PROVIDER_NETWORK', message: `PROVIDER_NETWORK: ${msg}` };
}

export class GenerationService {
  constructor(
    private readonly deps: PersistenceDependencies,
    private readonly executor: JobExecutor
  ) {}

  /**
   * Read-only fetch for a Job by id. Returns null when not found so route
   * handlers can produce a 404 with a stable errorCode.
   */
  async getJob(jobId: string): Promise<GenerationJob | null> {
    return this.deps.jobs.get(jobId);
  }

  /**
   * Read-only fetch for all active Jobs of a Project. Used by the
   * `/api/projects/:id/jobs` listing endpoint so the UI can show an
   * in-flight Job indicator.
   */
  async listJobsByProject(projectId: string): Promise<GenerationJob[]> {
    return this.deps.jobs.listActiveByProject(projectId);
  }

  /**
   * Create a Job with idempotent semantics. A duplicate (projectId,
   * idempotencyKey) returns the original Job without enqueuing twice.
   */
  async createJob(input: CreateJobInput): Promise<GenerationJob> {
    // Validate Project existence.
    const project = await this.deps.projects.get(input.projectId);
    if (!project) {
      throw new DomainError({
        code: 'PROJECT_NOT_FOUND',
        message: `PROJECT_NOT_FOUND: ${input.projectId}`,
      });
    }

    // Validate input Version ownership (if provided).
    let inputVersion: Version | undefined;
    if (input.inputVersionId) {
      const versions = await this.deps.versions.listByProject(input.projectId);
      inputVersion = versions.find((v) => v.id === input.inputVersionId);
      if (!inputVersion) {
        throw new DomainError({
          code: 'VERSION_NOT_FOUND',
          message: `VERSION_NOT_FOUND: ${input.inputVersionId} 不属于项目 ${input.projectId}`,
        });
      }
    }

    const now = nowIso();
    const jobId = generateId('job');
    const job: GenerationJob = {
      id: jobId,
      projectId: input.projectId,
      prompt: input.prompt,
      status: 'queued',
      providerId: input.providerId,
      model: input.model,
      inputVersionId: inputVersion?.id ?? project.activeVersionId,
      idempotencyKey: input.idempotencyKey,
      attempt: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Atomically create-or-return.
    let created: { job: GenerationJob; created: boolean };
    try {
      created = await this.deps.jobs.createIdempotent(job);
    } catch (err) {
      throw new DomainError({
        code: 'SAVE_FAILED',
        message: `SAVE_FAILED: ${err instanceof Error ? err.message : String(err)}`,
        cause: err,
      });
    }

    // Enqueue only if newly created.
    if (created.created) {
      try {
        await this.executor.enqueue(created.job.id);
      } catch (err) {
        // Enqueue failure does NOT roll back the Job creation — the Job
        // remains queued and a sweeper can pick it up. Log and continue.
        console.warn(
          `[GenerationService.createJob] enqueue failed for job ${created.job.id}`,
          err
        );
      }
    }

    return created.job;
  }

  /**
   * Execute a Job through the full lifecycle with lease-based safety.
   *
   * Steps:
   *  1. Atomically claim a lease (fail if another worker holds it).
   *  2. Transition queued → uploading → analyzing → generating →
   *     postprocessing → saving → succeeded.
   *  3. Load input Asset bytes.
   *  4. Call Provider to produce result bytes.
   *  5. Upload result bytes to ObjectStore.
   *  6. Inside ONE UnitOfWork.run:
   *     - create result Asset
   *     - create result Version (idempotent)
   *     - update Project.activeVersionId
   *  7. Conditionally mark Job succeeded via updateIfClaimed. If the lease
   *     was lost, delete the uncommitted result object.
   */
  async executeJob(
    jobId: string,
    options: ExecuteJobOptions = {}
  ): Promise<GenerationJob> {
    const leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
    const heartbeatSeconds = options.heartbeatSeconds ?? Math.floor(leaseSeconds / 2);
    const workerId = options.workerId ?? generateId('worker');
    const leaseToken = generateToken();

    // Load the Job.
    const job = await this.deps.jobs.get(jobId);
    if (!job) {
      throw new DomainError({
        code: 'JOB_NOT_FOUND',
        message: `JOB_NOT_FOUND: ${jobId}`,
      });
    }
    if (!isActiveJobStatus(job.status)) {
      throw new DomainError({
        code: 'ILLEGAL_JOB_TRANSITION',
        message: `ILLEGAL_JOB_TRANSITION: 任务 ${jobId} 处于终态 ${job.status}，无法执行`,
      });
    }

    // Step 1: claim lease.
    const claimed = await this.deps.jobs.claim(jobId, {
      workerId,
      leaseToken,
      leaseExpiresAt: leaseExpiry(leaseSeconds),
      now: nowIso(),
    });
    if (!claimed) {
      throw new DomainError({
        code: 'JOB_NOT_CLAIMED_BY_CALLER',
        message: `JOB_NOT_CLAIMED_BY_CALLER: 任务 ${jobId} 已被其他 worker 持有`,
      });
    }

    // Helper: transition + heartbeat.
    const advance = async (to: GenerationJobStatus): Promise<void> => {
      // Heartbeat before transition.
      await this.deps.jobs.heartbeat(jobId, {
        leaseToken,
        leaseExpiresAt: leaseExpiry(leaseSeconds),
        now: nowIso(),
      });
      const updated = await this.deps.jobs.updateIfClaimed(jobId, leaseToken, {
        status: to,
        updatedAt: nowIso(),
      });
      if (!updated) {
        throw new DomainError({
          code: 'JOB_LEASE_EXPIRED',
          message: `JOB_LEASE_EXPIRED: 任务 ${jobId} 的租约已丢失 (transition → ${to})`,
        });
      }
    };

    const failWith = async (code: DomainErrorCode, message: string, cause?: unknown): Promise<never> => {
      try {
        await this.deps.jobs.updateIfClaimed(jobId, leaseToken, {
          status: 'failed',
          errorCode: code,
          error: message,
          updatedAt: nowIso(),
        });
      } catch {
        // Best-effort; the failure is recorded via the throw below.
      }
      throw new DomainError({ code, message, cause });
    };

    try {
      // Step 2: transition to uploading.
      await advance('uploading');

      // Step 3 (P0-04): resolve the FROZEN input version + asset from
      // `job.inputVersionId`. The Provider MUST receive the bytes that were
      // captured at Job creation time — never the live
      // `project.activeVersionId`, which may have moved forward by the time
      // the worker executes the Job.
      if (!job.inputVersionId) {
        return await failWith(
          'INVALID_RECIPE',
          `INVALID_RECIPE: 任务 ${jobId} 缺少 inputVersionId`
        );
      }
      const inputVersion = await this.deps.versions.get(job.inputVersionId);
      if (!inputVersion) {
        return await failWith(
          'VERSION_NOT_FOUND',
          `VERSION_NOT_FOUND: 冻结输入版本 ${job.inputVersionId} 不存在`
        );
      }
      if (inputVersion.projectId !== job.projectId) {
        return await failWith(
          'VERSION_NOT_FOUND',
          `VERSION_NOT_FOUND: 冻结输入版本 ${job.inputVersionId} 不属于项目 ${job.projectId}`
        );
      }
      const inputAsset = await this.deps.assets.get(inputVersion.assetId);
      if (!inputAsset) {
        return await failWith(
          'ASSET_NOT_FOUND',
          `ASSET_NOT_FOUND: 输入资产 ${inputVersion.assetId} 不存在`
        );
      }

      // Load the frozen input bytes via `ObjectStore.get()` so the
      // Provider factory receives a byte-identical input regardless of any
      // concurrent project activeVersionId change.
      let inputBytes: Uint8Array;
      try {
        inputBytes = await this.deps.objects.get(inputAsset.storageKey);
      } catch (err) {
        return await failWith(
          'ASSET_NOT_FOUND',
          `ASSET_NOT_FOUND: 输入对象 ${inputAsset.storageKey} 读取失败 ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }

      // Step 4: transition to analyzing.
      await advance('analyzing');

      // Step 5: transition to generating + call Provider.
      await advance('generating');

      if (!options.providerFactory) {
        return await failWith(
          'INVALID_RECIPE',
          'INVALID_RECIPE: 未提供 providerFactory，无法执行生成'
        );
      }

      let resultBytes: Uint8Array;
      let resultMimeType: string;
      try {
        const result = await options.providerFactory(job, {
          bytes: inputBytes,
          mimeType: inputAsset.mimeType,
        });
        resultBytes = result.bytes;
        resultMimeType = result.mimeType;
      } catch (err) {
        const classified = classifyProviderError(err);
        return await failWith(classified.code, classified.message, err);
      }

      // Step 6: transition to postprocessing.
      await advance('postprocessing');

      // Step 7: upload result bytes to ObjectStore.
      const resultAssetId = generateId('asset');
      const resultVersionId = generateId('ver');
      const resultStorageKey = `projects/${job.projectId}/generated/${resultAssetId}.bin`;
      const resultNow = nowIso();
      try {
        await this.deps.objects.put(resultStorageKey, Buffer.from(resultBytes), resultMimeType);
      } catch (err) {
        return await failWith(
          'SAVE_FAILED',
          `SAVE_FAILED: 上传结果对象失败 ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }

      // Step 8: transition to saving.
      await advance('saving');

      // Step 9 (P0-02): inside ONE UnitOfWork, create Asset + Version +
      // update Project AND conditionally transition the Job to `succeeded`
      // via `updateIfClaimed` IN THE SAME TRANSACTION. If the conditional
      // Job update fails (lease lost), the UoW rolls back the Asset/Version/
      // Project writes so no metadata leak survives. Compensation for the
      // already-uploaded result object still runs after the rollback.
      const resultAsset: Asset = {
        id: resultAssetId,
        projectId: job.projectId,
        storageKey: resultStorageKey,
        mimeType: resultMimeType,
        sizeBytes: resultBytes.byteLength,
        createdAt: resultNow,
      };
      const existingVersions = await this.deps.versions.listByProject(job.projectId);
      const resultVersion: Version = {
        id: resultVersionId,
        projectId: job.projectId,
        assetId: resultAssetId,
        label: `v${existingVersions.length}`,
        createdAt: resultNow,
      };

      let succeeded: GenerationJob | null = null;
      try {
        succeeded = await this.deps.unitOfWork.run(async () => {
          await this.deps.assets.create(resultAsset);
          await this.deps.versions.createIdempotent(
            job.projectId,
            `job_${jobId}`,
            resultVersion
          );
          await this.deps.projects.updatePointers(job.projectId, {
            activeVersionId: resultVersionId,
          });
          // Final lease-conditional transition INSIDE the UoW. If this
          // returns null, the UoW throws and Asset/Version/Project are
          // rolled back atomically. The result object is then compensated
          // by the outer catch.
          const updated = await this.deps.jobs.updateIfClaimed(jobId, leaseToken, {
            status: 'succeeded',
            resultVersionId,
            updatedAt: nowIso(),
          });
          if (!updated) {
            throw new DomainError({
              code: 'JOB_LEASE_EXPIRED',
              message: `JOB_LEASE_EXPIRED: 任务 ${jobId} 的租约在最终提交时丢失，结果已回滚`,
            });
          }
          return updated;
        });
      } catch (err) {
        // Compensation: delete the uncommitted result object.
        try {
          await this.deps.objects.delete(resultStorageKey);
        } catch {
          // Swallow compensation failures; orphaned bytes are retryable.
        }
        if (err instanceof DomainError && err.code === 'JOB_LEASE_EXPIRED') {
          throw err;
        }
        return await failWith(
          'SAVE_FAILED',
          `SAVE_FAILED: 结果持久化失败 ${err instanceof Error ? err.message : String(err)}`,
          err
        );
      }

      return succeeded;
    } catch (err) {
      // If the lease expired mid-flight, try to mark the Job as failed via
      // the lease-aware update. If another worker already took over, this
      // returns null and the sweeper will handle the orphaned job. We must
      // NOT use unconditional `update` — it could overwrite another worker's
      // success or in-flight state.
      if (err instanceof DomainError && err.code === 'JOB_LEASE_EXPIRED') {
        try {
          await this.deps.jobs.updateIfClaimed(jobId, leaseToken, {
            status: 'failed',
            errorCode: 'JOB_LEASE_EXPIRED',
            error: err.message,
            updatedAt: nowIso(),
          });
        } catch {
          // Swallow — the error is already propagated via the throw.
        }
      }
      throw err;
    }
  }

  /**
   * Cancel a queued/active Job. Uses legal state transitions and asks the
   * executor for best-effort cancellation of any in-flight work.
   *
   * PERSIST001-P0-03: cancel atomically terminates publication rights by
   * using `updateIfActive` (which revokes the lease AND transitions to
   * `cancelled` in a single conditional write). A worker that still holds
   * the old lease token cannot subsequently `heartbeat`, `updateIfClaimed`,
   * or `claim` because the Job is now in a terminal state.
   *
   * Returns the cancelled Job. Throws ILLEGAL_JOB_TRANSITION if the Job
   * already reached a terminal state (succeeded/failed/cancelled).
   */
  async cancelJob(jobId: string): Promise<GenerationJob> {
    const job = await this.deps.jobs.get(jobId);
    if (!job) {
      throw new DomainError({
        code: 'JOB_NOT_FOUND',
        message: `JOB_NOT_FOUND: ${jobId}`,
      });
    }
    if (!canTransition(job.status, 'cancelled')) {
      throw new DomainError({
        code: 'ILLEGAL_JOB_TRANSITION',
        message: `ILLEGAL_JOB_TRANSITION: 任务 ${jobId} 状态 ${job.status} 不可取消`,
      });
    }

    // Ask the executor to cancel in-flight work (best-effort).
    try {
      await this.executor.cancel(jobId);
    } catch {
      // Swallow — cancellation is best-effort.
    }

    // P0-03: use `updateIfActive` so the cancel AND lease revocation happen
    // atomically. If the Job transitioned to a terminal state between the
    // read above and this write (race with another worker), the conditional
    // write returns null and we surface ILLEGAL_JOB_TRANSITION to the caller.
    const now = nowIso();
    const cancelled = await this.deps.jobs.updateIfActive(jobId, {
      status: 'cancelled',
      // Revoke the lease: clear token/expiry/worker so even a stale caller
      // holding the old token cannot advance the now-terminal Job.
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      workerId: undefined,
      updatedAt: now,
    });

    if (!cancelled) {
      // The Job reached a terminal state between our read and the
      // conditional write. Re-read to give a precise error.
      const current = await this.deps.jobs.get(jobId);
      throw new DomainError({
        code: 'ILLEGAL_JOB_TRANSITION',
        message: `ILLEGAL_JOB_TRANSITION: 任务 ${jobId} 状态 ${current?.status ?? '?'} 不可取消（条件写入返回 null）`,
      });
    }

    return cancelled;
  }

  /**
   * Retry a failed Job by creating a NEW Job with attempt+1 and parentJobId.
   * Never mutates the old failed Job.
   */
  async retryJob(jobId: string): Promise<RetryJobResult> {
    const parentJob = await this.deps.jobs.get(jobId);
    if (!parentJob) {
      throw new DomainError({
        code: 'JOB_NOT_FOUND',
        message: `JOB_NOT_FOUND: ${jobId}`,
      });
    }
    if (!canRetryJob(parentJob)) {
      throw new DomainError({
        code: 'JOB_NOT_RETRYABLE',
        message: `JOB_NOT_RETRYABLE: 任务 ${jobId} 状态 ${parentJob.status} 错误码 ${parentJob.errorCode ?? 'none'} 不可重试`,
      });
    }

    const now = nowIso();
    const newJobId = generateId('job');
    const newJob: GenerationJob = {
      id: newJobId,
      projectId: parentJob.projectId,
      prompt: parentJob.prompt,
      status: 'queued',
      providerId: parentJob.providerId,
      model: parentJob.model,
      inputVersionId: parentJob.inputVersionId,
      idempotencyKey: `retry_${newJobId}`,
      attempt: (parentJob.attempt ?? 1) + 1,
      parentJobId: parentJob.id,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.deps.jobs.createIdempotent(newJob);
    if (created.created) {
      try {
        await this.executor.enqueue(created.job.id);
      } catch (err) {
        console.warn(
          `[GenerationService.retryJob] enqueue failed for job ${created.job.id}`,
          err
        );
      }
    }

    return { job: created.job, parentJob };
  }
}
