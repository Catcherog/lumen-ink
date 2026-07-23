/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R9 C-01: Storage SDK contract tests.
 *
 * Verifies that the adapter correctly handles real @cloudbase/node-sdk
 * Storage response shapes — string code "SUCCESS" (NOT numeric 0), matching
 * fileID, empty fileList, mismatched fileID, and string failure codes.
 *
 * These tests are NO-NETWORK: they use the mock (which now matches the real
 * SDK contract) to inject specific response shapes and verify adapter behavior.
 *
 * GPT verdict required coverage:
 *  - {code: "SUCCESS", fileID, tempFileURL} for getTempFileURL
 *  - {code: "SUCCESS", fileID} for deleteFile
 *  - Empty fileList
 *  - Mismatched fileID
 *  - String failure code
 *  - Project create committed → signed URL failure → return/compensation
 */

import { describe, it, expect, beforeEach, vi, vi as _vi } from 'vitest';
import sharp from 'sharp';
import type { MockCloudBaseState } from './cloudbase.nosql.mock.js';
import { createMockCloudBaseState, createMockCloudBaseApp } from './cloudbase.nosql.mock.js';
import { ProjectService } from '../../services/ProjectService.js';
import type { JobExecutor } from '../../domain/persistence.js';

const mockContainer = _vi.hoisted(() => ({
  state: null as MockCloudBaseState | null,
  app: null as ReturnType<typeof createMockCloudBaseApp> | null,
}));

vi.mock('@cloudbase/node-sdk', () => ({
  init: () => mockContainer.app,
  default: { init: () => mockContainer.app },
}));

import {
  createCloudBaseNoSqlPersistence,
  type CloudBaseNoSqlOptions,
} from './cloudbase.nosql.js';

const OPTIONS: CloudBaseNoSqlOptions = {
  envId: 'test-env',
  apiKey: 'test-key',
  dataNamespace: 'prod',
  storagePrefix: 'prod',
};

async function makeReadyDeps() {
  const state = createMockCloudBaseState(OPTIONS.envId);
  const app = createMockCloudBaseApp(state);
  mockContainer.state = state;
  mockContainer.app = app;
  const deps = createCloudBaseNoSqlPersistence(OPTIONS);
  await deps.ensureReady();
  return { deps, state, app };
}

function predictFileID(key: string): string {
  return `cloud://${OPTIONS.envId}/${OPTIONS.storagePrefix}/${key}`;
}

async function makeRealPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

// Minimal executor stub for ProjectService
const dummyExecutor: JobExecutor = {
  enqueue: vi.fn(),
  cancel: vi.fn(),
};

describe('FIX-R9 C-01: Storage SDK string-code contract', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // --- Success: getTempFileURL returns {code: "SUCCESS", fileID, tempFileURL} ---

  it('getSignedUrl succeeds when SDK returns code="SUCCESS" with matching fileID', async () => {
    const { deps } = setup;
    const key = 'assets/contract-url-success.png';
    await deps.objects.put(key, new Uint8Array([1, 2]), 'image/png');

    const url = await deps.objects.getSignedUrl(key);
    expect(url).toContain('mock-temp-url');
    expect(url.length).toBeGreaterThan(0);

    await deps.close();
  });

  // --- Success: deleteFile returns {code: "SUCCESS", fileID} ---

  it('delete succeeds when SDK returns code="SUCCESS" with matching fileID', async () => {
    const { deps, state } = setup;
    const key = 'assets/contract-delete-success.png';
    await deps.objects.put(key, new Uint8Array([3, 4]), 'image/png');
    const expectedFileID = predictFileID(key);

    // Object exists before delete
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    await deps.objects.delete(key);

    // Object gone after delete
    expect(state.storage.files.has(expectedFileID)).toBe(false);

    // Metadata also removed
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(false);

    await deps.close();
  });

  // --- Empty fileList from deleteFile ---

  it('delete throws OBJECT_DELETE_PARTIAL when SDK returns empty fileList', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/contract-delete-empty.png';
    await deps.objects.put(key, new Uint8Array([5, 6]), 'image/png');

    // Override deleteFile to return empty fileList
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({ fileList: [] });

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata must be preserved (not deleted) for retry
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- Empty fileList from getTempFileURL ---

  it('getSignedUrl throws when SDK returns empty fileList (no matching result)', async () => {
    const { deps, app } = setup;
    const key = 'assets/contract-url-empty.png';
    await deps.objects.put(key, new Uint8Array([7, 8]), 'image/png');

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce({ fileList: [] });

    // No matching result → adapter rejects (OBJECT_NOT_FOUND: no matching result)
    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow();

    await deps.close();
  });

  // --- Mismatched fileID from deleteFile ---

  it('delete throws OBJECT_DELETE_PARTIAL when SDK returns mismatched fileID', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/contract-delete-mismatch.png';
    await deps.objects.put(key, new Uint8Array([9, 10]), 'image/png');

    // SDK returns a result for a DIFFERENT fileID
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      fileList: [{ fileID: 'cloud://other-env/other-prefix/wrong.png', code: 'SUCCESS' }],
    });

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- Mismatched fileID from getTempFileURL ---

  it('getSignedUrl throws when SDK returns mismatched fileID (no matching result)', async () => {
    const { deps, app } = setup;
    const key = 'assets/contract-url-mismatch.png';
    await deps.objects.put(key, new Uint8Array([11, 12]), 'image/png');

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce({
      fileList: [
        {
          fileID: 'cloud://other-env/other-prefix/wrong.png',
          code: 'SUCCESS',
          tempFileURL: 'http://wrong-url',
        },
      ],
    });

    // No matching fileID → adapter rejects (OBJECT_NOT_FOUND: no matching result)
    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow();

    await deps.close();
  });

  // --- String failure code from deleteFile ---

  it('delete throws OBJECT_DELETE_PARTIAL when SDK returns string failure code, metadata preserved', async () => {
    const { deps, state } = setup;
    const key = 'assets/contract-delete-strfail.png';
    await deps.objects.put(key, new Uint8Array([13, 14]), 'image/png');
    const expectedFileID = predictFileID(key);

    // Set a non-SUCCESS string code
    state.deleteFileStatuses[expectedFileID] = 'DELETE_FAILED';

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata preserved for retry
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    // File still exists (mock doesn't delete on non-SUCCESS)
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    await deps.close();
  });

  // --- String failure code from getTempFileURL ---

  it('getSignedUrl throws SIGNED_URL_FAILED when SDK returns string failure code', async () => {
    const { deps, state } = setup;
    const key = 'assets/contract-url-strfail.png';
    await deps.objects.put(key, new Uint8Array([15, 16]), 'image/png');
    const expectedFileID = predictFileID(key);

    state.getTempFileURLStatuses[expectedFileID] = 'GET_URL_FAILED';

    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow(/SIGNED_URL_FAILED/);

    await deps.close();
  });

  // --- Compensation delete in put() uses string "SUCCESS" contract ---

  it('put compensation delete uses string SUCCESS contract: failure preserves orphaned file', async () => {
    const { deps, state } = setup;
    const key = 'assets/contract-put-compfail.png';
    const expectedFileID = predictFileID(key);

    // Make metadata save fail AND compensation delete fail
    state.saveMetadataShouldFail = true;
    state.deleteFileStatuses[expectedFileID] = 'DELETE_FAILED';

    let caught: Error | null = null;
    try {
      await deps.objects.put(key, new Uint8Array([17, 18]), 'image/png');
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/OBJECT_METADATA_AND_COMPENSATION_FAILED/);
    expect(caught!.message).toContain(expectedFileID);

    // Orphaned file remains (compensation failed)
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    await deps.close();
  });

  // --- Project create committed → signed URL failure → error returned, project persisted ---

  it('createProject: signed URL failure after commit returns error but project is persisted', async () => {
    const { deps, state, app } = setup;
    const service = new ProjectService(deps, dummyExecutor);

    // Override getTempFileURL to return matching fileID with failure code.
    // This simulates the C-01 bug scenario: signed URL "fails" even
    // though the project is already committed. We return the requested
    // fileID (so the adapter finds a match) but with code != "SUCCESS".
    vi.spyOn(app, 'getTempFileURL').mockImplementation(async (opts) => {
      return {
        fileList: opts.fileList.map((fileID) => ({
          fileID,
          code: 'GET_URL_FAILED',
          tempFileURL: '',
          statusMessage: 'GET_URL_FAILED',
        })),
      };
    });

    let caught: Error | null = null;
    try {
      const bytes = await makeRealPng(32, 32);
      await service.createProject({
        workspaceId: 'w1',
        name: 'test-signed-url-fail',
        bytes,
        mimeType: 'image/png',
      });
    } catch (e) {
      caught = e as Error;
    }

    // The caller sees an error (signed URL failed)
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/SIGNED_URL_FAILED/);

    // BUT the project, asset, and version are already persisted in the DB
    // (the DB transaction committed before getSignedUrl was called).
    const projectsColl = state.database.collections.get('prod_projects');
    expect(projectsColl?.docs.size).toBeGreaterThan(0);

    const assetsColl = state.database.collections.get('prod_assets');
    expect(assetsColl?.docs.size).toBeGreaterThan(0);

    const versionsColl = state.database.collections.get('prod_versions');
    expect(versionsColl?.docs.size).toBeGreaterThan(0);

    // The uploaded object also exists in Storage
    expect(state.storage.files.size).toBeGreaterThan(0);

    await deps.close();
  });
});

describe('FIX-R9 M-01: ledgerUpdateFailed signal', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  it('removeCleanupKeys failure sets ledgerUpdateFailed=true (not silently swallowed)', async () => {
    const { deps, state } = setup;
    const service = new ProjectService(deps, dummyExecutor);

    await deps.projects.create({
      id: 'p1',
      name: 'test-ledger-fail',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeVersionId: 'v1',
    });
    await deps.objects.put('key-0', new Uint8Array([0]), 'image/png');
    await deps.assets.create({
      id: 'a0',
      projectId: 'p1',
      storageKey: 'key-0',
      mimeType: 'image/png',
      sizeBytes: 1,
      createdAt: new Date().toISOString(),
    });

    // Inject fault on removeCleanupKeys
    const repo = deps.projects as typeof deps.projects & {
      removeCleanupKeys(id: string, removedKeys: string[]): Promise<string[]>;
    };
    vi.spyOn(repo, 'removeCleanupKeys').mockRejectedValueOnce(
      new Error('LEDGER_TX_FAILED: simulated')
    );

    const result = await service.deleteProject('p1');

    // M-01: deleted=true (metadata + storage cleaned), but ledgerUpdateFailed=true
    expect(result.deleted).toBe(true);
    expect(result.cleanupFailures).toHaveLength(0);
    expect(result.ledgerUpdateFailed).toBe(true);

    // Ledger still contains the key (removeCleanupKeys failed)
    const cleanupColl = state.database.collections.get('prod_project_cleanup_keys');
    expect(cleanupColl?.docs.has('p1')).toBe(true);

    await deps.close();
  });

  it('removeCleanupKeys success sets ledgerUpdateFailed=false', async () => {
    const { deps, state } = setup;
    const service = new ProjectService(deps, dummyExecutor);

    await deps.projects.create({
      id: 'p2',
      name: 'test-ledger-ok',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeVersionId: 'v2',
    });
    await deps.objects.put('key-1', new Uint8Array([1]), 'image/png');
    await deps.assets.create({
      id: 'a1',
      projectId: 'p2',
      storageKey: 'key-1',
      mimeType: 'image/png',
      sizeBytes: 1,
      createdAt: new Date().toISOString(),
    });

    const result = await service.deleteProject('p2');

    expect(result.deleted).toBe(true);
    expect(result.cleanupFailures).toHaveLength(0);
    expect(result.ledgerUpdateFailed).toBe(false);

    // Ledger cleaned
    const cleanupColl = state.database.collections.get('prod_project_cleanup_keys');
    expect(cleanupColl?.docs.has('p2')).toBe(false);

    await deps.close();
  });
});

/**
 * RF-R9-02: SDK top-level failure contract tests (fail-closed).
 *
 * GPT verdict (FIX_REQUIRED) required:
 *  "为 getTempFileURL() 和 deleteFile() 增加实际 SDK 类型允许的顶层错误响应测试，
 *   至少证明：
 *   - 顶层失败时绝不视为成功；
 *   - 不删除 metadata；
 *   - 不删除 cleanup ledger；
 *   - 返回或抛出稳定的领域错误；
 *   - message 不影响 fail-closed 行为。"
 *
 * Background: @cloudbase/node-sdk@3.18.3 src/storage/index.ts (lines 163-174,
 * 231-239) returns raw `res` (with top-level `code`/`message`, NO `fileList`)
 * when the backend API returns an error — even though TypeScript types declare
 * `fileList` as required. The adapter MUST detect this shape and fail closed
 * with a stable domain error (STORAGE_TOPLEVEL_ERROR) instead of throwing
 * `TypeError: Cannot read properties of undefined (reading 'find')`.
 *
 * Test technique: `as never` is used to inject the runtime top-level error
 * shape that TypeScript types don't capture. This is intentional — we are
 * testing a real SDK runtime contract that the type declarations miss.
 */
describe('FIX-R9 RF-R9-02: SDK top-level failure contract (fail-closed)', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // --- delete(): top-level failure from deleteFile (STORAGE_REQUEST_FAIL) ---

  it('delete throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level failure (STORAGE_REQUEST_FAIL), metadata preserved', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/toplevel-delete-fail.png';
    await deps.objects.put(key, new Uint8Array([1, 2]), 'image/png');

    // SDK runtime top-level error shape: { code, message } with NO fileList.
    // This is what the real SDK returns when the backend API fails.
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'backend API error',
    } as never);

    // Must throw a stable domain error (NOT a TypeError from undefined.fileList)
    await expect(deps.objects.delete(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    // Metadata MUST be preserved (not deleted) for retry
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- delete(): top-level failure with different code (SYS_ERR) ---

  it('delete throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level failure (SYS_ERR), different code still fails closed', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/toplevel-delete-syserr.png';
    await deps.objects.put(key, new Uint8Array([3, 4]), 'image/png');

    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      code: 'SYS_ERR',
      message: 'internal service error',
    } as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- delete(): message content does not affect fail-closed behavior ---

  it('delete top-level failure with different message still fails closed (message does not affect fail-closed)', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/toplevel-delete-msg2.png';
    await deps.objects.put(key, new Uint8Array([5, 6]), 'image/png');

    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'completely different error message text',
    } as never);

    // Different message, same fail-closed behavior
    await expect(deps.objects.delete(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- getSignedUrl(): top-level failure from getTempFileURL ---

  it('getSignedUrl throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level failure, metadata preserved', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/toplevel-url-fail.png';
    await deps.objects.put(key, new Uint8Array([7, 8]), 'image/png');

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'backend API error',
    } as never);

    // Must throw a stable domain error (NOT TypeError from undefined.fileList)
    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- getSignedUrl(): message content does not affect fail-closed behavior ---

  it('getSignedUrl top-level failure with different message still fails closed (message does not affect fail-closed)', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/toplevel-url-msg2.png';
    await deps.objects.put(key, new Uint8Array([9, 10]), 'image/png');

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce({
      code: 'SYS_ERR',
      message: 'different message for getTempFileURL',
    } as never);

    // Different code + message, same fail-closed behavior
    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- put() compensation delete: top-level failure preserves orphaned file ---

  it('put compensation delete: top-level failure from deleteFile preserves orphaned file', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/toplevel-put-compfail.png';
    const expectedFileID = predictFileID(key);

    // Make metadata save fail (triggers compensation delete path)
    state.saveMetadataShouldFail = true;

    // Compensation delete returns top-level failure (NO fileList)
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'backend API error during compensation',
    } as never);

    let caught: Error | null = null;
    try {
      await deps.objects.put(key, new Uint8Array([11, 12]), 'image/png');
    } catch (e) {
      caught = e as Error;
    }

    // Must throw OBJECT_METADATA_AND_COMPENSATION_FAILED (stable domain error)
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/OBJECT_METADATA_AND_COMPENSATION_FAILED/);
    expect(caught!.message).toContain(expectedFileID);

    // Orphaned file remains in Storage (compensation failed due to top-level error)
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    await deps.close();
  });

  // --- exists(): top-level failure returns false (fail-closed, no throw) ---

  it('exists returns false when SDK returns top-level failure (fail-closed, no throw, metadata preserved)', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/toplevel-exists-fail.png';
    await deps.objects.put(key, new Uint8Array([13, 14]), 'image/png');

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'backend API error',
    } as never);

    // exists() must return false (fail-closed) — NOT throw TypeError
    const result = await deps.objects.exists(key);
    expect(result).toBe(false);

    // Metadata MUST be preserved (not deleted)
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- deleteProject: top-level failure does NOT remove cleanup ledger ---

  it('deleteProject: top-level failure on object delete does NOT remove cleanup ledger', async () => {
    const { deps, app, state } = setup;
    const service = new ProjectService(deps, dummyExecutor);

    // Setup: project + asset + object
    await deps.projects.create({
      id: 'p-toplevel',
      name: 'test-toplevel-ledger',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeVersionId: 'v-toplevel',
    });
    await deps.objects.put('key-toplevel', new Uint8Array([15]), 'image/png');
    await deps.assets.create({
      id: 'a-toplevel',
      projectId: 'p-toplevel',
      storageKey: 'key-toplevel',
      mimeType: 'image/png',
      sizeBytes: 1,
      createdAt: new Date().toISOString(),
    });

    // Inject top-level failure on deleteFile for the asset's storageKey
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'backend API error during project delete',
    } as never);

    const result = await service.deleteProject('p-toplevel');

    // Project metadata is deleted (DB transaction succeeds)
    expect(result.deleted).toBe(true);

    // The failed key MUST be in cleanupFailures (NOT in completedKeys)
    expect(result.cleanupFailures).toContain('key-toplevel');

    // Cleanup ledger MUST still contain the key (NOT removed)
    const cleanupColl = state.database.collections.get('prod_project_cleanup_keys');
    expect(cleanupColl?.docs.has('p-toplevel')).toBe(true);
    const ledgerDoc = cleanupColl?.docs.get('p-toplevel') as { keys?: string[] } | undefined;
    expect(ledgerDoc?.keys).toContain('key-toplevel');

    // Object metadata MUST also be preserved (not deleted, since remote delete failed)
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has('key-toplevel')).toBe(true);

    await deps.close();
  });
});

/**
 * FIX-R10 RF-R10-01 (R9-STORAGE-01): Remove statusMessage free-text判定.
 *
 * GPT verdict (FIX_REQUIRED):
 *  "objects.delete() 仍通过未类型化 statusMessage 文本识别 'not found'，
 *   可能将任意非 SUCCESS 失败转为成功，随后删除 metadata。
 *   Required Fix: 仅接受 SDK 文档化、稳定的 per-item not-found code；
 *   无法权威确认 absent 时必须保留 metadata 和 ledger。
 *   不要以自由文本决定清理所有权。"
 *
 * SDK contract (@cloudbase/node-sdk@3.18.3 types/index.d.ts):
 *   interface IDeleteFileResult { fileList: Array<{ code: string; fileID: string }> }
 *
 * The per-item type declares ONLY { code, fileID } — NO statusMessage.
 * There is NO documented per-item "not-found" code. Therefore the adapter
 * MUST NOT use free-text statusMessage to infer "not found". Any code !==
 * 'SUCCESS' MUST be treated as failure (preserve metadata + ledger).
 */
describe('FIX-R10 RF-R10-01 (R9-STORAGE-01): no free-text statusMessage判定', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // --- delete: non-SUCCESS code with "not found" statusMessage MUST fail ---

  it('delete throws OBJECT_DELETE_PARTIAL when non-SUCCESS code has "not found" statusMessage (no free-text success)', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-storage-notfound.png';
    await deps.objects.put(key, new Uint8Array([1]), 'image/png');

    // SDK returns matching fileID, non-SUCCESS code, with statusMessage
    // containing "not found". OLD code treated this as idempotent success.
    // R10: MUST throw OBJECT_DELETE_PARTIAL (preserve metadata + ledger).
    const expectedFileID = predictFileID(key);
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      fileList: [{ fileID: expectedFileID, code: 'DELETE_FAILED', statusMessage: 'not found' }],
    } as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata MUST be preserved (not deleted)
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  it('delete throws OBJECT_DELETE_PARTIAL when non-SUCCESS code has "no such file" statusMessage', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-storage-nosuch.png';
    await deps.objects.put(key, new Uint8Array([2]), 'image/png');

    const expectedFileID = predictFileID(key);
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      fileList: [{ fileID: expectedFileID, code: 'NOT_FOUND', statusMessage: 'no such file or directory' }],
    } as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  it('delete throws OBJECT_DELETE_PARTIAL when non-SUCCESS code has arbitrary statusMessage', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-storage-arbitrary.png';
    await deps.objects.put(key, new Uint8Array([3]), 'image/png');

    const expectedFileID = predictFileID(key);
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      fileList: [{ fileID: expectedFileID, code: 'PERMISSION_DENIED', statusMessage: 'access denied' }],
    } as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- delete: non-SUCCESS code with NO statusMessage MUST fail ---

  it('delete throws OBJECT_DELETE_PARTIAL when non-SUCCESS code has no statusMessage', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-storage-nomsg.png';
    await deps.objects.put(key, new Uint8Array([4]), 'image/png');

    const expectedFileID = predictFileID(key);
    // SDK type declares only { code, fileID } — statusMessage may be absent
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      fileList: [{ fileID: expectedFileID, code: 'UNKNOWN_FAILURE' }],
    } as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });
});

/**
 * FIX-R10 RF-R10-02 (R9-TOPLEVEL-01): Strict isSdkTopLevelError parser.
 *
 * GPT verdict (FIX_REQUIRED):
 *  "isSdkTopLevelError() 只检查'非 null 对象且 fileList 不是数组'：
 *   缺失 fileList：覆盖。非数组 fileList：覆盖。
 *   null、primitive：未覆盖，后续可能出现 TypeError。
 *   同时含顶层失败 code 和有效 fileList：会进入成功分支，顶层失败可能被忽略。
 *   Required Fix: 改为严格解析器：只有非 null object、无顶层失败 code、
 *   且 fileList 为数组时才进入 per-item 成功判定；其余统一抛稳定 STORAGE_TOPLEVEL_ERROR。"
 *
 * Strict parser contract:
 *  - null → STORAGE_TOPLEVEL_ERROR (not TypeError)
 *  - primitive (string/number/boolean) → STORAGE_TOPLEVEL_ERROR
 *  - object with top-level `code` + valid fileList → STORAGE_TOPLEVEL_ERROR
 *    (top-level failure code means backend API failed, even if fileList present)
 *  - object with valid fileList, no top-level code → per-item success path
 *  - object with fileList not an array → STORAGE_TOPLEVEL_ERROR
 */
describe('FIX-R10 RF-R10-02 (R9-TOPLEVEL-01): strict top-level error parser', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // --- delete: null response ---

  it('delete throws STORAGE_TOPLEVEL_ERROR when SDK returns null (no TypeError)', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-toplevel-null.png';
    await deps.objects.put(key, new Uint8Array([1]), 'image/png');

    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce(null as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- delete: primitive response (string) ---

  it('delete throws STORAGE_TOPLEVEL_ERROR when SDK returns string primitive', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-toplevel-string.png';
    await deps.objects.put(key, new Uint8Array([2]), 'image/png');

    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce('unexpected string' as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- delete: primitive response (number) ---

  it('delete throws STORAGE_TOPLEVEL_ERROR when SDK returns number primitive', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-toplevel-number.png';
    await deps.objects.put(key, new Uint8Array([3]), 'image/png');

    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce(0 as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- delete: mixed shape (top-level failure code + valid fileList) ---

  it('delete throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level code + valid fileList (mixed shape)', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-toplevel-mixed.png';
    await deps.objects.put(key, new Uint8Array([4]), 'image/png');
    const expectedFileID = predictFileID(key);

    // Mixed shape: top-level failure code BUT fileList present with SUCCESS item.
    // OLD code entered per-item success path (ignored top-level failure).
    // R10: MUST throw STORAGE_TOPLEVEL_ERROR (top-level code = backend failure).
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'backend API error',
      fileList: [{ fileID: expectedFileID, code: 'SUCCESS' }],
    } as never);

    await expect(deps.objects.delete(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- getSignedUrl: null response ---

  it('getSignedUrl throws STORAGE_TOPLEVEL_ERROR when SDK returns null', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-toplevel-url-null.png';
    await deps.objects.put(key, new Uint8Array([5]), 'image/png');

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce(null as never);

    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- getSignedUrl: mixed shape (top-level code + valid fileList) ---

  it('getSignedUrl throws STORAGE_TOPLEVEL_ERROR when SDK returns top-level code + valid fileList', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-toplevel-url-mixed.png';
    await deps.objects.put(key, new Uint8Array([6]), 'image/png');
    const expectedFileID = predictFileID(key);

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce({
      code: 'SYS_ERR',
      message: 'internal error',
      fileList: [{ fileID: expectedFileID, code: 'SUCCESS', tempFileURL: 'http://should-not-be-used' }],
    } as never);

    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow(/STORAGE_TOPLEVEL_ERROR/);

    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- exists: null response returns false (fail-closed, no throw) ---

  it('exists returns false when SDK returns null (fail-closed, no TypeError)', async () => {
    const { deps, app, state } = setup;
    const key = 'assets/r10-toplevel-exists-null.png';
    await deps.objects.put(key, new Uint8Array([7]), 'image/png');

    vi.spyOn(app, 'getTempFileURL').mockResolvedValueOnce(null as never);

    const result = await deps.objects.exists(key);
    expect(result).toBe(false);

    // Metadata preserved
    const metaColl = state.database.collections.get('prod_object_metadata');
    expect(metaColl?.docs.has(key)).toBe(true);

    await deps.close();
  });
});

/**
 * FIX-R10 RF-R10-03 (R9-METADATA-01): Concurrent markUnresolvedMetadata safety.
 *
 * GPT verdict (FIX_REQUIRED):
 *  "markUnresolvedMetadata() 是明确的非事务 read-modify-write：
 *   read existing → Set merge → doc.set({keys})。
 *   并发 A/B 可读取同一旧版本，后提交者覆盖先提交者新增的 keys。
 *   Required Fix: 使用 CloudBase transaction/OCC 对 unresolved 文档执行
 *   read-union-write，并加入确定性交错测试；或使用经验证的原子集合更新
 *   并保证去重。"
 *
 * The fix converts markUnresolvedMetadata to use runTransaction (same pattern
 * as removeCleanupKeys FIX-R8 AC-02). OCC retry ensures the second worker
 * re-reads the merged state and does not overwrite the first worker's keys.
 *
 * Deterministic interleaving is simulated via the mock's occReadTracking +
 * preCommitHook (no real threads needed).
 */

/**
 * Ensure a collection exists in the mock database state. The mock creates
 * collections lazily on first access; tests that manually insert docs into
 * a collection the adapter hasn't touched yet must call this first.
 */
function ensureCollectionR10(
  state: MockCloudBaseState,
  name: string
): { docs: Map<string, unknown> } {
  if (!state.database.collections.has(name)) {
    state.database.collections.set(name, { docs: new Map() });
  }
  return state.database.collections.get(name)! as { docs: Map<string, unknown> };
}

describe('FIX-R10 RF-R10-03 (R9-METADATA-01): concurrent markUnresolvedMetadata atomicity', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // --- Concurrent interleaving: Worker B does NOT lose Worker A's keys ---

  it('concurrent markUnresolvedMetadata: second worker does NOT overwrite first worker’s keys (OCC retry re-merges)', async () => {
    const { deps, state } = setup;
    await deps.projects.create({
      id: 'p1',
      name: 'test-concurrent-unresolved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Enable OCC so the unresolved doc read is tracked and conflict-detected.
    state.occReadTracking = true;

    // preCommitHook: simulate Worker A having committed
    // { entries: [{ storageKey: 'key-A', fileID: null, recordedAt }] }
    // just before Worker B (the call under test) commits. Worker B read
    // null (stale), computed entries=[{storageKey:'key-B',...}], but OCC
    // will detect the doc changed and retry. On retry, Worker B re-reads
    // Worker A's entries, merges → [key-A, key-B].
    state.preCommitHook = async () => {
      const unresolvedColl = ensureCollectionR10(state, 'prod_project_unresolved_metadata');
      unresolvedColl.docs.set('p1', {
        _id: 'p1',
        entries: [{ storageKey: 'key-A', fileID: null, recordedAt: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
      });
    };

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
    };

    // Worker B marks key-B. With the OLD non-transactional code, preCommitHook
    // never fires (no runTransaction), so the result is { entries: [key-B] }
    // (key-A lost). With the NEW transactional code, OCC retries and merges.
    await repo.markUnresolvedMetadata('p1', [{ storageKey: 'key-B', fileID: null }]);

    // Both keys MUST be present (no lost update).
    const unresolvedColl = state.database.collections.get('prod_project_unresolved_metadata');
    expect(unresolvedColl?.docs.has('p1')).toBe(true);
    const unresolvedDoc = unresolvedColl?.docs.get('p1') as unknown as {
      entries: Array<{ storageKey: string; fileID: string | null; recordedAt: string }>;
    };
    expect(unresolvedDoc.entries.map((e) => e.storageKey).sort()).toEqual(['key-A', 'key-B']);

    await deps.close();
  });

  // --- Concurrent interleaving: both workers add to existing keys ---

  it('concurrent markUnresolvedMetadata: both workers append to pre-existing keys (no overwrite)', async () => {
    const { deps, state } = setup;
    await deps.projects.create({
      id: 'p2',
      name: 'test-concurrent-unresolved-existing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Pre-populate the unresolved doc with an existing entry.
    const unresolvedColl = ensureCollectionR10(state, 'prod_project_unresolved_metadata');
    unresolvedColl.docs.set('p2', {
      _id: 'p2',
      entries: [{ storageKey: 'key-existing', fileID: null, recordedAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
    });

    state.occReadTracking = true;

    // preCommitHook: simulate Worker A committing
    // { entries: [key-existing, key-A] } just before Worker B commits.
    // Worker B read the stale { entries: [key-existing] }, computed
    // [key-existing, key-B], but OCC detects the doc changed and retries.
    // On retry, Worker B re-reads [key-existing, key-A], merges → all three.
    state.preCommitHook = async () => {
      const now = new Date().toISOString();
      unresolvedColl.docs.set('p2', {
        _id: 'p2',
        entries: [
          { storageKey: 'key-existing', fileID: null, recordedAt: now },
          { storageKey: 'key-A', fileID: null, recordedAt: now },
        ],
        createdAt: now,
      });
    };

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
    };

    await repo.markUnresolvedMetadata('p2', [{ storageKey: 'key-B', fileID: null }]);

    const doc = unresolvedColl.docs.get('p2') as unknown as {
      entries: Array<{ storageKey: string; fileID: string | null; recordedAt: string }>;
    };
    // All three keys must be present: existing + key-A (Worker A) + key-B (Worker B)
    expect(doc.entries.map((e) => e.storageKey).sort()).toEqual(['key-A', 'key-B', 'key-existing']);

    await deps.close();
  });

  // --- Transaction usage: runTransactionCount increments ---

  it('markUnresolvedMetadata uses runTransaction (runTransactionCount increments)', async () => {
    const { deps, state } = setup;
    await deps.projects.create({
      id: 'p3',
      name: 'test-tx-count',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const before = state.runTransactionCount;

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
    };
    await repo.markUnresolvedMetadata('p3', [{ storageKey: 'key-1', fileID: null }]);

    // The method MUST use runTransaction (at least one transaction opened).
    expect(state.runTransactionCount).toBeGreaterThan(before);

    await deps.close();
  });

  // --- Sequential calls accumulate keys (regression guard) ---

  it('sequential markUnresolvedMetadata: accumulates keys across calls (no regression)', async () => {
    const { deps, state } = setup;
    await deps.projects.create({
      id: 'p4',
      name: 'test-sequential',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
    };
    await repo.markUnresolvedMetadata('p4', [{ storageKey: 'key-1', fileID: null }]);
    await repo.markUnresolvedMetadata('p4', [
      { storageKey: 'key-2', fileID: null },
      { storageKey: 'key-3', fileID: null },
    ]);

    const unresolvedColl = state.database.collections.get('prod_project_unresolved_metadata');
    expect(unresolvedColl?.docs.has('p4')).toBe(true);
    const doc = unresolvedColl?.docs.get('p4') as unknown as {
      entries: Array<{ storageKey: string; fileID: string | null; recordedAt: string }>;
    };
    expect(doc.entries.map((e) => e.storageKey).sort()).toEqual(['key-1', 'key-2', 'key-3']);

    await deps.close();
  });

  // --- Empty keys short-circuit: no-op, no transaction ---

  it('markUnresolvedMetadata with empty keys is a no-op (no write, no transaction)', async () => {
    const { deps, state } = setup;
    await deps.projects.create({
      id: 'p5',
      name: 'test-empty-keys',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const before = state.runTransactionCount;

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
    };
    await repo.markUnresolvedMetadata('p5', []);

    // No transaction opened (short-circuit on empty entries).
    expect(state.runTransactionCount).toBe(before);

    // No unresolved doc created (collection may not even exist).
    const unresolvedColl = state.database.collections.get('prod_project_unresolved_metadata');
    expect(unresolvedColl?.docs.has('p5') ?? false).toBe(false);

    await deps.close();
  });

  // --- Duplicate keys are deduplicated ---

  it('markUnresolvedMetadata deduplicates keys (no duplicate entries)', async () => {
    const { deps, state } = setup;
    await deps.projects.create({
      id: 'p6',
      name: 'test-dedup',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
    };
    await repo.markUnresolvedMetadata('p6', [
      { storageKey: 'key-1', fileID: null },
      { storageKey: 'key-1', fileID: null },
      { storageKey: 'key-2', fileID: null },
    ]);
    await repo.markUnresolvedMetadata('p6', [
      { storageKey: 'key-2', fileID: null },
      { storageKey: 'key-3', fileID: null },
    ]);

    const unresolvedColl = state.database.collections.get('prod_project_unresolved_metadata');
    const doc = unresolvedColl?.docs.get('p6') as unknown as {
      entries: Array<{ storageKey: string; fileID: string | null; recordedAt: string }>;
    };
    expect(doc.entries.map((e) => e.storageKey).sort()).toEqual(['key-1', 'key-2', 'key-3']);

    await deps.close();
  });
});

/**
 * FIX-R10 RF-R10-04 (R9-METADATA-02 / AC-07): Durable reconciliation —
 * fileID persistence, reader, and replayer.
 *
 * GPT verdict (FIX_REQUIRED):
 *  "R9-METADATA-02 Required Fix: METADATA_MISSING 持久化必须包含 fileID（或
 *   明确标记为 unrecoverable）、storageKey、时间戳；必须提供 durable
 *   reader 和 replayer 接口证明 AC-07 可执行所有权恢复（即使
 *   object_metadata 丢失，仍可通过 fileID 直接调用 COS API 删除远端对象）。"
 *
 * These tests verify the adapter-level reader (getUnresolvedMetadata) and
 * replayer (replayUnresolvedMetadata) that constitute the "executable
 * ownership recovery" required by AC-07. The replayer bypasses
 * object_metadata lookup and deletes remote objects by fileID directly.
 */
describe('FIX-R10 RF-R10-04 (R9-METADATA-02/AC-07): durable reconciliation reader & replayer', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // --- Reader: returns empty when no record exists ---

  it('getUnresolvedMetadata returns empty array when no record exists', async () => {
    const { deps } = setup;
    const repo = deps.projects as typeof deps.projects & {
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };
    const entries = await repo.getUnresolvedMetadata('no-such-project');
    expect(entries).toEqual([]);
    await deps.close();
  });

  // --- Reader: returns entries after markUnresolvedMetadata ---

  it('getUnresolvedMetadata returns entries after markUnresolvedMetadata', async () => {
    const { deps } = setup;
    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };
    await repo.markUnresolvedMetadata('p-read-1', [
      { storageKey: 'key-A', fileID: 'cloud://test-env/prod/key-A' },
      { storageKey: 'key-B', fileID: null },
    ]);
    const entries = await repo.getUnresolvedMetadata('p-read-1');
    expect(entries).toHaveLength(2);
    const byKey = new Map(entries.map((e) => [e.storageKey, e]));
    expect(byKey.get('key-A')?.fileID).toBe('cloud://test-env/prod/key-A');
    expect(byKey.get('key-B')?.fileID).toBeNull();
    // Each entry has a recordedAt timestamp.
    for (const e of entries) {
      expect(typeof e.recordedAt).toBe('string');
      expect(e.recordedAt.length).toBeGreaterThan(0);
    }
    await deps.close();
  });

  // --- Replayer: succeeds by fileID, removes entry from record ---

  it('replayUnresolvedMetadata succeeds by fileID, removes entry from record', async () => {
    const { deps, state } = setup;
    // Put a real object so the fileID exists in storage.
    const key = 'assets/replay-success.png';
    await deps.objects.put(key, new Uint8Array([1, 2, 3]), 'image/png');
    const fileID = predictFileID(key);
    expect(state.storage.files.has(fileID)).toBe(true);

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      replayUnresolvedMetadata(id: string): Promise<{
        replayed: number;
        succeeded: string[];
        failed: Array<{ storageKey: string; error: string }>;
      }>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };

    // Persist the entry with a known fileID (simulating: fileID was
    // captured before metadata was lost).
    await repo.markUnresolvedMetadata('p-replay-1', [{ storageKey: key, fileID }]);

    const result = await repo.replayUnresolvedMetadata('p-replay-1');
    expect(result.replayed).toBe(1);
    expect(result.succeeded).toEqual([key]);
    expect(result.failed).toEqual([]);

    // Remote object was deleted by fileID.
    expect(state.storage.files.has(fileID)).toBe(false);

    // Entry was removed from the unresolved record (doc deleted when empty).
    const remaining = await repo.getUnresolvedMetadata('p-replay-1');
    expect(remaining).toEqual([]);

    await deps.close();
  });

  // --- Replayer: reports FILEID_MISSING for null fileID entries ---

  it('replayUnresolvedMetadata reports FILEID_MISSING for null fileID entries', async () => {
    const { deps } = setup;
    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      replayUnresolvedMetadata(id: string): Promise<{
        replayed: number;
        succeeded: string[];
        failed: Array<{ storageKey: string; error: string }>;
      }>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };

    // Persist an entry with null fileID (unrecoverable: metadata was
    // already gone when fileID was captured).
    await repo.markUnresolvedMetadata('p-replay-2', [{ storageKey: 'key-null', fileID: null }]);

    const result = await repo.replayUnresolvedMetadata('p-replay-2');
    expect(result.replayed).toBe(1);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].storageKey).toBe('key-null');
    expect(result.failed[0].error).toContain('FILEID_MISSING');

    // Entry remains in the record (not removed on failure).
    const remaining = await repo.getUnresolvedMetadata('p-replay-2');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].storageKey).toBe('key-null');

    await deps.close();
  });

  // --- Replayer: removes doc when all entries succeed ---

  it('replayUnresolvedMetadata removes doc when all entries succeed', async () => {
    const { deps, state } = setup;
    const key1 = 'assets/replay-all-1.png';
    const key2 = 'assets/replay-all-2.png';
    await deps.objects.put(key1, new Uint8Array([1]), 'image/png');
    await deps.objects.put(key2, new Uint8Array([2]), 'image/png');
    const fileID1 = predictFileID(key1);
    const fileID2 = predictFileID(key2);

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      replayUnresolvedMetadata(id: string): Promise<{
        replayed: number;
        succeeded: string[];
        failed: Array<{ storageKey: string; error: string }>;
      }>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };

    await repo.markUnresolvedMetadata('p-replay-3', [
      { storageKey: key1, fileID: fileID1 },
      { storageKey: key2, fileID: fileID2 },
    ]);

    const result = await repo.replayUnresolvedMetadata('p-replay-3');
    expect(result.replayed).toBe(2);
    expect(result.succeeded.sort()).toEqual([key1, key2]);
    expect(result.failed).toEqual([]);

    expect(state.storage.files.has(fileID1)).toBe(false);
    expect(state.storage.files.has(fileID2)).toBe(false);

    // Doc was fully removed (no remaining entries).
    const remaining = await repo.getUnresolvedMetadata('p-replay-3');
    expect(remaining).toEqual([]);

    await deps.close();
  });

  // --- Replayer: returns empty result when no record exists ---

  it('replayUnresolvedMetadata returns empty result when no record exists', async () => {
    const { deps } = setup;
    const repo = deps.projects as typeof deps.projects & {
      replayUnresolvedMetadata(id: string): Promise<{
        replayed: number;
        succeeded: string[];
        failed: Array<{ storageKey: string; error: string }>;
      }>;
    };
    const result = await repo.replayUnresolvedMetadata('no-such-project');
    expect(result).toEqual({ replayed: 0, succeeded: [], failed: [] });
    await deps.close();
  });

  // --- markUnresolvedMetadata upgrades null fileID to non-null on subsequent call ---

  it('markUnresolvedMetadata upgrades null fileID to non-null on subsequent call', async () => {
    const { deps } = setup;
    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };

    // First call: fileID is null (metadata was gone at capture time).
    await repo.markUnresolvedMetadata('p-upgrade', [{ storageKey: 'key-up', fileID: null }]);
    let entries = await repo.getUnresolvedMetadata('p-upgrade');
    expect(entries[0].fileID).toBeNull();

    // Second call: fileID is now known (e.g. recovered from a backup log).
    await repo.markUnresolvedMetadata('p-upgrade', [{ storageKey: 'key-up', fileID: 'cloud://test-env/prod/key-up' }]);
    entries = await repo.getUnresolvedMetadata('p-upgrade');
    expect(entries).toHaveLength(1);
    expect(entries[0].storageKey).toBe('key-up');
    expect(entries[0].fileID).toBe('cloud://test-env/prod/key-up');

    await deps.close();
  });

  // --- Replayer: reports failure when SDK returns non-SUCCESS code ---

  it('replayUnresolvedMetadata reports failure when SDK returns non-SUCCESS code', async () => {
    const { deps, state } = setup;
    const key = 'assets/replay-fail.png';
    await deps.objects.put(key, new Uint8Array([1]), 'image/png');
    const fileID = predictFileID(key);

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      replayUnresolvedMetadata(id: string): Promise<{
        replayed: number;
        succeeded: string[];
        failed: Array<{ storageKey: string; error: string }>;
      }>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };

    await repo.markUnresolvedMetadata('p-replay-4', [{ storageKey: key, fileID }]);

    // Force the SDK deleteFile to return a non-SUCCESS code.
    state.deleteFileStatuses[fileID] = 'DELETE_FAILED';

    const result = await repo.replayUnresolvedMetadata('p-replay-4');
    expect(result.replayed).toBe(1);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].storageKey).toBe(key);
    expect(result.failed[0].error).toContain('OBJECT_DELETE_PARTIAL');

    // Entry remains (not removed on failure).
    const remaining = await repo.getUnresolvedMetadata('p-replay-4');
    expect(remaining).toHaveLength(1);

    await deps.close();
  });

  // --- Replayer: reports STORAGE_TOPLEVEL_ERROR on top-level failure ---

  it('replayUnresolvedMetadata reports STORAGE_TOPLEVEL_ERROR on top-level SDK failure', async () => {
    const { deps, app } = setup;
    const key = 'assets/replay-toplevel.png';
    await deps.objects.put(key, new Uint8Array([1]), 'image/png');
    const fileID = predictFileID(key);

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      replayUnresolvedMetadata(id: string): Promise<{
        replayed: number;
        succeeded: string[];
        failed: Array<{ storageKey: string; error: string }>;
      }>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };

    await repo.markUnresolvedMetadata('p-replay-5', [{ storageKey: key, fileID }]);

    // Force the SDK deleteFile to return a top-level error (no fileList).
    // Cast as never: the typed return shape only models the success case
    // ({ fileList: [...] }); runtime top-level errors arrive as arbitrary
    // objects and the adapter must reject them via isSdkTopLevelError().
    vi.spyOn(app, 'deleteFile').mockResolvedValueOnce({
      code: 'STORAGE_REQUEST_FAIL',
      message: 'backend API error',
    } as never);

    const result = await repo.replayUnresolvedMetadata('p-replay-5');
    expect(result.replayed).toBe(1);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].storageKey).toBe(key);
    expect(result.failed[0].error).toContain('STORAGE_TOPLEVEL_ERROR');

    await deps.close();
  });

  // --- Replayer: partial success removes only succeeded entries ---

  it('replayUnresolvedMetadata partial success removes only succeeded entries', async () => {
    const { deps, state } = setup;
    const keyOk = 'assets/replay-partial-ok.png';
    const keyFail = 'assets/replay-partial-fail.png';
    await deps.objects.put(keyOk, new Uint8Array([1]), 'image/png');
    await deps.objects.put(keyFail, new Uint8Array([2]), 'image/png');
    const fileIDOk = predictFileID(keyOk);
    const fileIDFail = predictFileID(keyFail);

    const repo = deps.projects as typeof deps.projects & {
      markUnresolvedMetadata(
        id: string,
        entries: Array<{ storageKey: string; fileID: string | null }>
      ): Promise<void>;
      replayUnresolvedMetadata(id: string): Promise<{
        replayed: number;
        succeeded: string[];
        failed: Array<{ storageKey: string; error: string }>;
      }>;
      getUnresolvedMetadata(id: string): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    };

    await repo.markUnresolvedMetadata('p-replay-6', [
      { storageKey: keyOk, fileID: fileIDOk },
      { storageKey: keyFail, fileID: fileIDFail },
    ]);

    // Force the second fileID to fail.
    state.deleteFileStatuses[fileIDFail] = 'DELETE_FAILED';

    const result = await repo.replayUnresolvedMetadata('p-replay-6');
    expect(result.replayed).toBe(2);
    expect(result.succeeded).toEqual([keyOk]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].storageKey).toBe(keyFail);

    // Only the failed entry remains.
    const remaining = await repo.getUnresolvedMetadata('p-replay-6');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].storageKey).toBe(keyFail);

    await deps.close();
  });
});
