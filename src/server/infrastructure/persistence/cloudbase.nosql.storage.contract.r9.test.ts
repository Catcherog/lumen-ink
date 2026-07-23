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
