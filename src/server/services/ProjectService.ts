/**
 * PERSIST-001 ProjectService.
 *
 * Orchestrates Project upload, V0 creation, snapshot restoration, version
 * pointer updates, and cascade deletion across the frozen
 * `PersistenceDependencies` surface.
 *
 * Atomic success boundary (per PERSIST-001 Task 4):
 *  - `createProject` uploads the original asset bytes to the ObjectStore
 *    BEFORE the DB transaction. If the transaction fails, the uploaded
 *    object is deleted as compensation so no orphaned bytes remain.
 *  - `deleteProject` deletes metadata transactionally first, then collects
 *    and deletes object bytes. Object deletion failures are recorded in
 *    `cleanupFailures` (with diagnostic IDs) but do NOT roll back the
 *    metadata deletion — the metadata is already gone, and the orphaned
 *    bytes remain retryable by a future sweeper.
 *
 * Conforms to D-034 internal security floor (Task 6): every upload passes
 * through `validateImageBytes` which decodes with sharp and rejects MIME
 * spoofing, decompression bombs, oversized payloads, malformed/truncated
 * bytes, and unsupported formats.
 */

import type {
  PersistenceDependencies,
  ProjectRepository,
  Project,
  Asset,
  Version,
} from '../domain/persistence.js';
import type { JobExecutor } from '../domain/persistence.js';
import { DomainError } from '../domain/errors.js';
import { validateImageBytes } from '../security/imageValidation.js';

export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  bytes: Uint8Array | Buffer;
  mimeType: string;
  /**
   * Test-only override to force a project id collision. Production callers
   * must NOT set this field. Used by the compensation test to force a DB
   * failure after the object upload succeeds.
   */
  __testForceProjectId?: string;
}

export interface ProjectSnapshot {
  project: Project;
  assets: Asset[];
  versions: Version[];
  activeVersion?: Version;
  approvedVersion?: Version;
  /** Signed URLs keyed by storageKey (caller can map asset → URL). */
  signedUrls: Record<string, string>;
}

export interface DeleteProjectResult {
  deleted: true;
  /** Storage keys whose object deletion failed; metadata is already gone. */
  cleanupFailures: string[];
  /**
   * FIX-R9 H-01: Storage keys where objects.delete() threw METADATA_MISSING
   * (metadata gone, fileID unrecoverable, remote state unknown). These keys
   * are persisted to project_unresolved_metadata for operational review and
   * are NOT removed from the cleanup ledger. They cannot be retried via the
   * normal sweeper (no fileID).
   */
  unresolvedMetadataMissing: string[];
  /**
   * FIX-R9 M-01: True when removeCleanupKeys() failed. The cleanup ledger
   * may still contain already-deleted keys; the caller should signal
   * retry-required to the client or schedule a ledger reconciliation.
   */
  ledgerUpdateFailed: boolean;
}

function generateId(prefix: string): string {
  // Use crypto.randomUUID when available (Node 19+); fall back to a
  // timestamp+random form for older runtimes.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class ProjectService {
  constructor(
    private readonly deps: PersistenceDependencies,
    private readonly executor: JobExecutor
  ) {}

  /**
   * Create a Project with its V0 original asset in a single atomic success
   * boundary. If the DB transaction fails, the uploaded object is deleted
   * as compensation.
   */
  async createProject(input: CreateProjectInput): Promise<ProjectSnapshot> {
    // Validate input.
    if (!input.bytes || input.bytes.byteLength === 0) {
      throw new DomainError({
        code: 'UPLOAD_INVALID',
        message: 'UPLOAD_INVALID: 上传数据为空',
      });
    }

    // D-034 Task 6: full decode + size/pixel guard via validateImageBytes.
    // This subsumes the MIME allowlist, sharp metadata check, and dimension
    // inspection in one security-bounded call. Throws INVALID_IMAGE_* codes.
    let validated: { bytes: Uint8Array; mimeType: string; width: number; height: number; sizeBytes: number };
    try {
      validated = await validateImageBytes(input.bytes, input.mimeType);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'INVALID_IMAGE_MALFORMED';
      // Map INVALID_IMAGE_TOO_LARGE → UPLOAD_TOO_LARGE, others → UPLOAD_DECODE_FAILED
      // so existing DomainError routes can handle them consistently.
      if (code === 'INVALID_IMAGE_TOO_LARGE') {
        throw new DomainError({
          code: 'UPLOAD_TOO_LARGE',
          message: `UPLOAD_TOO_LARGE: 图片体积超过 20 MiB 限制`,
          cause: code,
        });
      }
      if (code === 'INVALID_IMAGE_TOO_MANY_PIXELS') {
        throw new DomainError({
          code: 'UPLOAD_PIXEL_LIMIT',
          message: `UPLOAD_PIXEL_LIMIT: 图片像素数超过 40,000,000 限制`,
          cause: code,
        });
      }
      if (code === 'INVALID_IMAGE_UNSUPPORTED_FORMAT') {
        throw new DomainError({
          code: 'UPLOAD_INVALID',
          message: `UPLOAD_INVALID: 不支持的图片格式 ${input.mimeType}`,
          cause: code,
        });
      }
      throw new DomainError({
        code: 'UPLOAD_DECODE_FAILED',
        message: `UPLOAD_DECODE_FAILED: 无法解码图像 (${code})`,
        cause: code,
      });
    }

    // Use the re-encoded (sanitized) bytes for storage — sharp may rotate
    // or normalize the image, and the validated bytes are guaranteed decodable.
    const storageBytes = Buffer.from(validated.bytes);

    // Allocate IDs.
    const projectId = input.__testForceProjectId ?? generateId('proj');
    const assetId = generateId('asset');
    const versionId = generateId('ver');
    const storageKey = `projects/${projectId}/original/${assetId}.bin`;
    const now = nowIso();

    const project: Project = {
      id: projectId,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      activeVersionId: versionId,
    };
    const asset: Asset = {
      id: assetId,
      projectId,
      storageKey,
      mimeType: validated.mimeType,
      sizeBytes: storageBytes.length,
      createdAt: now,
    };
    const version: Version = {
      id: versionId,
      projectId,
      assetId,
      label: 'v0',
      createdAt: now,
    };

    // Step 1: upload object bytes FIRST so the DB transaction can reference
    // a storage key that already exists.
    await this.deps.objects.put(storageKey, storageBytes, validated.mimeType);

    // Step 2: DB transaction. On failure, compensate by deleting the
    // uploaded object.
    try {
      await this.deps.unitOfWork.run(async () => {
        await this.deps.projects.create(project);
        await this.deps.assets.create(asset);
        await this.deps.versions.create(version);
      });
    } catch (err) {
      // Compensation: best-effort delete the orphaned object.
      try {
        await this.deps.objects.delete(storageKey);
      } catch {
        // Swallow compensation failures; the caller receives the original
        // DB error. A future sweeper can clean up orphaned bytes.
      }
      if (err instanceof DomainError) throw err;
      // Wrap unexpected errors with a stable code.
      throw new DomainError({
        code: 'SAVE_FAILED',
        message: `SAVE_FAILED: ${err instanceof Error ? err.message : String(err)}`,
        cause: err,
      });
    }

    // Build the snapshot to return.
    const signedUrl = await this.deps.objects.getSignedUrl(storageKey);
    return {
      project,
      assets: [asset],
      versions: [version],
      activeVersion: version,
      signedUrls: { [storageKey]: signedUrl },
    };
  }

  /**
   * Restore a ProjectSnapshot including signed URLs for all assets.
   */
  async getProjectSnapshot(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.deps.projects.get(projectId);
    if (!project) {
      throw new DomainError({
        code: 'PROJECT_NOT_FOUND',
        message: `PROJECT_NOT_FOUND: ${projectId}`,
      });
    }
    const [assets, versions] = await Promise.all([
      this.deps.assets.listByProject(projectId),
      this.deps.versions.listByProject(projectId),
    ]);

    // Pre-fetch signed URLs for every asset.
    const signedUrls: Record<string, string> = {};
    await Promise.all(
      assets.map(async (a) => {
        signedUrls[a.storageKey] = await this.deps.objects.getSignedUrl(a.storageKey);
      })
    );

    const activeVersion = project.activeVersionId
      ? versions.find((v) => v.id === project.activeVersionId)
      : undefined;
    const approvedVersion = project.approvedVersionId
      ? versions.find((v) => v.id === project.approvedVersionId)
      : undefined;

    return {
      project,
      assets,
      versions,
      activeVersion,
      approvedVersion,
      signedUrls,
    };
  }

  /**
   * Set the active version pointer. The version must belong to the project.
   */
  async activateVersion(projectId: string, versionId: string): Promise<Project> {
    const project = await this.deps.projects.get(projectId);
    if (!project) {
      throw new DomainError({
        code: 'PROJECT_NOT_FOUND',
        message: `PROJECT_NOT_FOUND: ${projectId}`,
      });
    }
    const versions = await this.deps.versions.listByProject(projectId);
    const found = versions.find((v) => v.id === versionId);
    if (!found) {
      throw new DomainError({
        code: 'VERSION_NOT_FOUND',
        message: `VERSION_NOT_FOUND: ${versionId} 不属于项目 ${projectId}`,
      });
    }
    return this.deps.projects.updatePointers(projectId, { activeVersionId: versionId });
  }

  /**
   * Set the approved version pointer. The version must belong to the project.
   */
  async approveVersion(projectId: string, versionId: string): Promise<Project> {
    const project = await this.deps.projects.get(projectId);
    if (!project) {
      throw new DomainError({
        code: 'PROJECT_NOT_FOUND',
        message: `PROJECT_NOT_FOUND: ${projectId}`,
      });
    }
    const versions = await this.deps.versions.listByProject(projectId);
    const found = versions.find((v) => v.id === versionId);
    if (!found) {
      throw new DomainError({
        code: 'VERSION_NOT_FOUND',
        message: `VERSION_NOT_FOUND: ${versionId} 不属于项目 ${projectId}`,
      });
    }
    return this.deps.projects.updatePointers(projectId, { approvedVersionId: versionId });
  }

  /**
   * Delete a project and all its child entities + object bytes.
   *
   * FIX-R6: Two-phase deletion with stable storage-key snapshot AND
   * crash-safe cleanup ledger lifecycle.
   *
   * For adapters that support cleanup keys (CloudBase NoSQL):
   *   1. deleteCascade does Phase A (independent tombstone commit) +
   *      Phase B (stable snapshot, metadata deletion, cleanup keys persist).
   *   2. ProjectService reads cleanup keys from Phase B — it does NOT
   *      independently pre-fetch storage keys (P1-03 fix).
   *   3. Storage cleanup happens AFTER metadata deletion.
   *   4. FIX-R6 (AC-R6-01): The cleanup ledger is NOT deleted until ALL
   *      Storage objects are successfully removed. The ledger is updated
   *      via removeCleanupKeys() after each successful delete, so failed
   *      keys persist for sweeper recovery.
   *   5. FIX-R6 (AC-R6-03): "Object already gone" (OBJECT_NOT_FOUND) is
   *      treated as idempotent success so the crash window between object
   *      delete and ledger update is safe to retry.
   *
   * For legacy adapters (PostgreSQL, etc.) without cleanup keys:
   *   Falls back to the old behavior: read assets before deletion inside
   *   unitOfWork.run(), then delete.
   *
   * The tombstone barrier (assertProjectWritable) prevents concurrent
   * child creates from producing orphans during the delete.
   */
  async deleteProject(projectId: string): Promise<DeleteProjectResult> {
    // Check if the adapter supports cleanup keys (duck-typed; not in
    // the frozen PersistenceDependencies interface).
    const repo = this.deps.projects as ProjectRepository & {
      getCleanupKeys?(id: string): Promise<string[]>;
      removeCleanupKeys?(id: string, removedKeys: string[]): Promise<string[]>;
      deleteCleanupKeys?(id: string): Promise<void>;
      markUnresolvedMetadata?(id: string, keys: string[]): Promise<void>;
    };

    let storageKeys: string[] = [];

    if (typeof repo.getCleanupKeys === 'function') {
      // FIX-R5: Two-phase deletion path (CloudBase NoSQL).
      // deleteCascade persists project_cleanup_keys with the stable
      // storage-key snapshot taken AFTER the tombstone barrier commits.
      await this.deps.projects.deleteCascade(projectId);
      storageKeys = await repo.getCleanupKeys!(projectId);
      // FIX-R6 (AC-R6-01): Do NOT delete the ledger here. It must
      // survive until Storage cleanup completes so failed keys can be
      // replayed by the sweeper.
    } else {
      // Legacy path (PostgreSQL or other adapters without cleanup keys):
      // Read assets before deletion, then delete inside unitOfWork.
      await this.deps.unitOfWork.run(async () => {
        const assets = await this.deps.assets.listByProject(projectId);
        storageKeys = assets.map((a) => a.storageKey);
        await this.deps.projects.deleteCascade(projectId);
      });
    }

    // Best-effort delete objects. Record failures with diagnostic IDs.
    // FIX-R6 (AC-R6-02/03): Successfully-deleted keys are tracked and
    // removed from the ledger afterward. "Object already gone"
    // (OBJECT_NOT_FOUND) is treated as idempotent success so a crash
    // between object-delete and ledger-update is safe to retry.
    //
    // FIX-R8 AC-03: METADATA_MISSING is treated as probable success for
    // crash-window recovery (metadata was likely deleted by a previous
    // successful objects.delete() call), but is explicitly logged as
    // "remote deletion NOT confirmed" to distinguish it from OBJECT_NOT_FOUND
    // (which IS confirmed remote deletion via SDK status code).
    const cleanupFailures: string[] = [];
    const completedKeys: string[] = [];
    // FIX-R9 H-01: METADATA_MISSING keys must NOT be added to completedKeys.
    // They are persisted to project_unresolved_metadata for operational
    // review and remain in the cleanup ledger (not removed).
    const unresolvedMetadataMissing: string[] = [];
    for (const key of storageKeys) {
      try {
        await this.deps.objects.delete(key);
        completedKeys.push(key);
      } catch (err) {
        const msg = (err as Error).message ?? '';
        // Crash-window idempotency (AC-R6-03): object/metadata already
        // gone → treat as success. This covers the case where a previous
        // delete attempt cleaned the object but crashed before updating
        // the ledger.
        if (msg.includes('OBJECT_NOT_FOUND')) {
          completedKeys.push(key);
          continue;
        }
        // FIX-R9 H-01: METADATA_MISSING — metadata is gone, fileID is
        // unrecoverable, remote deletion NOT confirmed. These keys CANNOT
        // be retried (no fileID). They must NOT be added to completedKeys
        // (which would remove them from the ledger). Instead, persist them
        // to project_unresolved_metadata for durable operational review.
        if (msg.includes('METADATA_MISSING')) {
          console.warn(
            `[ProjectService.deleteProject] METADATA_MISSING key=${key}: remote deletion NOT confirmed, persisting to unresolved record for operational review`
          );
          unresolvedMetadataMissing.push(key);
          continue;
        }
        const diagnosticId = generateDiagnosticId();
        console.warn(
          `[ProjectService.deleteProject] cleanup failure diagnosticId=${diagnosticId} key=${key}`,
          err
        );
        cleanupFailures.push(key);
      }
    }

    // FIX-R9 H-01: Persist unresolved metadata-missing keys to a durable
    // record. Duck-typed — only CloudBase adapter implements this method.
    if (
      unresolvedMetadataMissing.length > 0 &&
      typeof repo.markUnresolvedMetadata === 'function'
    ) {
      try {
        await repo.markUnresolvedMetadata(projectId, unresolvedMetadataMissing);
      } catch (err) {
        // Best-effort persistence — log but do not fail the delete. The
        // keys remain in cleanupFailures-equivalent state (still in ledger).
        console.warn(
          `[ProjectService.deleteProject] markUnresolvedMetadata failed for ${projectId}`,
          err
        );
      }
    }

    // FIX-R6 (AC-R6-01/02): Update the cleanup ledger AFTER Storage
    // cleanup attempts. Successfully-deleted keys are removed; failed
    // keys remain for sweeper recovery. When the ledger becomes empty,
    // the adapter deletes the doc.
    //
    // FIX-R9 M-01: If removeCleanupKeys fails, set ledgerUpdateFailed=true
    // so the caller knows the ledger may contain stale already-deleted keys
    // and can signal retry-required. Do NOT silently swallow the failure.
    let ledgerUpdateFailed = false;
    if (typeof repo.removeCleanupKeys === 'function') {
      try {
        await repo.removeCleanupKeys!(projectId, completedKeys);
      } catch (err) {
        // Ledger update failed — but Storage cleanup already happened.
        // The ledger may still contain already-deleted keys, which the
        // sweeper will treat as idempotent success (OBJECT_NOT_FOUND).
        // We don't fail the deleteProject call — metadata is gone and
        // Storage is cleaned — but we signal ledgerUpdateFailed so the
        // caller can schedule reconciliation.
        ledgerUpdateFailed = true;
        console.warn(
          `[ProjectService.deleteProject] removeCleanupKeys failed for ${projectId} (ledgerUpdateFailed=true)`,
          err
        );
      }
    } else if (
      typeof repo.deleteCleanupKeys === 'function' &&
      cleanupFailures.length === 0
    ) {
      // Legacy fallback (adapters with deleteCleanupKeys but without
      // removeCleanupKeys): only delete the ledger when ALL Storage
      // objects were successfully cleaned. On partial failure the ledger
      // remains for manual/sweeper recovery.
      try {
        await repo.deleteCleanupKeys!(projectId);
      } catch {
        ledgerUpdateFailed = true;
      }
    }

    return { deleted: true, cleanupFailures, unresolvedMetadataMissing, ledgerUpdateFailed };
  }
}

function generateDiagnosticId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback (matches DomainError.generateDiagnosticId).
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
