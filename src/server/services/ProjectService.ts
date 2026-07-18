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
   * Metadata deletion is transactional. Object deletion is best-effort:
   * any failure is recorded in `cleanupFailures` but does NOT roll back
   * the metadata deletion. A future sweeper can retry the orphaned bytes.
   */
  async deleteProject(projectId: string): Promise<DeleteProjectResult> {
    // Collect asset storage keys BEFORE deleting metadata.
    const assets = await this.deps.assets.listByProject(projectId);
    const storageKeys = assets.map((a) => a.storageKey);

    // Delete metadata transactionally (ProjectRepository.deleteCascade
    // already removes project + assets + versions + jobs atomically).
    await this.deps.unitOfWork.run(async () => {
      await this.deps.projects.deleteCascade(projectId);
    });

    // Best-effort delete objects. Record failures with diagnostic IDs.
    const cleanupFailures: string[] = [];
    for (const key of storageKeys) {
      try {
        await this.deps.objects.delete(key);
      } catch (err) {
        const diagnosticId = generateDiagnosticId();
        console.warn(
          `[ProjectService.deleteProject] cleanup failure diagnosticId=${diagnosticId} key=${key}`,
          err
        );
        cleanupFailures.push(key);
      }
    }

    return { deleted: true, cleanupFailures };
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
