/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R4: Storage fault injection tests.
 *
 * Workstream G (P1-02): Verifies that the ObjectStore methods (put, delete,
 * getSignedUrl, exists) handle CloudBase Storage SDK failures correctly:
 *
 *  - put: upload failure, metadata failure with/without compensation success
 *  - delete: request throws, partial failure (non-zero status code),
 *    metadata delete failure after remote success
 *  - getSignedUrl: non-zero status code from SDK
 *  - exists: three-state distinction (metadata missing, remote missing,
 *    both present)
 *
 * AC coverage: AC-09 through AC-21 (Storage/metadata consistency).
 *
 * Mock fault injection knobs (from cloudbase.nosql.mock.ts):
 *  - state.uploadShouldFail: uploadFile() throws
 *  - state.saveMetadataShouldFail: set() on object_metadata throws
 *  - state.deleteMetadataShouldFail: remove() on object_metadata throws
 *  - state.deleteFileStatuses: per-fileID non-zero codes from deleteFile()
 *  - state.getTempFileURLStatuses: per-fileID non-zero codes from getTempFileURL()
 *  - state.remoteObjectMissing: fileIDs flagged as missing in remote Storage
 */

import { describe, it, expect, beforeEach, vi, vi as _vi } from 'vitest';
import type { MockCloudBaseState } from './cloudbase.nosql.mock.js';
import { createMockCloudBaseState, createMockCloudBaseApp } from './cloudbase.nosql.mock.js';

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

// --- Fixtures ---

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

/**
 * Predict the fileID that the mock will generate for a given storage key.
 * The mock uploadFile returns `cloud://${envId}/${storagePrefix}/${key}`.
 */
function predictFileID(key: string): string {
  return `cloud://${OPTIONS.envId}/${OPTIONS.storagePrefix}/${key}`;
}

// --- Tests ---

describe('FIX-R4 Workstream G: Storage fault injection', () => {
  let setup: Awaited<ReturnType<typeof makeReadyDeps>>;
  beforeEach(async () => {
    setup = await makeReadyDeps();
  });

  // --- AC-09: put upload failure ---

  it('AC-09: upload fails -> OBJECT_UPLOAD_FAILED, no metadata, no storage file', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-upload-fail.png';
    const bytes = new Uint8Array([1, 2, 3]);
    state.uploadShouldFail = true;

    await expect(deps.objects.put(key, bytes, 'image/png')).rejects.toThrow(
      /OBJECT_UPLOAD_FAILED/
    );

    // No metadata record should exist
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key) ?? false).toBe(false);

    // No storage file should exist
    const expectedFileID = predictFileID(key);
    expect(state.storage.files.has(expectedFileID)).toBe(false);

    await deps.close();
  });

  // --- AC-10: put metadata failure with successful compensation ---

  it('AC-10: upload succeeds, metadata fails, compensation succeeds -> OBJECT_METADATA_FAILED_CLEANED', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-meta-fail-cleaned.png';
    const bytes = new Uint8Array([10, 20, 30]);
    state.saveMetadataShouldFail = true;

    await expect(deps.objects.put(key, bytes, 'image/png')).rejects.toThrow(
      /OBJECT_METADATA_FAILED_CLEANED/
    );

    // No metadata record (set failed)
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key) ?? false).toBe(false);

    // Compensation delete succeeded — the uploaded file should be gone
    const expectedFileID = predictFileID(key);
    expect(state.storage.files.has(expectedFileID)).toBe(false);

    await deps.close();
  });

  // --- AC-11: put metadata failure with compensation failure ---

  it('AC-11: upload succeeds, metadata fails, compensation fails -> OBJECT_METADATA_AND_COMPENSATION_FAILED with fileID', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-meta-comp-both-fail.png';
    const bytes = new Uint8Array([40, 50]);
    state.saveMetadataShouldFail = true;

    // Make compensation delete fail by setting a non-zero status code
    // for the predicted fileID
    const expectedFileID = predictFileID(key);
    state.deleteFileStatuses[expectedFileID] = 1;

    // Single call — capture the error to verify fileID is included
    let caught: Error | null = null;
    try {
      await deps.objects.put(key, bytes, 'image/png');
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/OBJECT_METADATA_AND_COMPENSATION_FAILED/);
    // The error message must include the fileID for sweeper retry
    expect(caught!.message).toContain(expectedFileID);

    // No metadata record (set failed)
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key) ?? false).toBe(false);

    // Compensation failed — the orphaned file remains in Storage
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    await deps.close();
  });

  // --- AC-12: delete request throws -> metadata preserved ---

  it('AC-12: delete request throws -> metadata preserved, file preserved', async () => {
    const { deps, state, app } = setup;
    const key = 'assets/test-delete-throws.png';
    const bytes = new Uint8Array([60, 70, 80]);

    // Put a file normally
    await deps.objects.put(key, bytes, 'image/png');
    const expectedFileID = predictFileID(key);

    // Make deleteFile throw (simulating a network error)
    vi.spyOn(app, 'deleteFile').mockRejectedValueOnce(
      new Error('NETWORK_ERROR: connection reset')
    );

    await expect(deps.objects.delete(key)).rejects.toThrow(/NETWORK_ERROR/);

    // Metadata must be preserved (not deleted) for retry
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key)).toBe(true);

    // File must still exist (delete didn't succeed)
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    await deps.close();
  });

  // --- AC-13: delete returns non-zero status code -> metadata preserved ---

  it('AC-13: delete API returns non-zero status code -> OBJECT_DELETE_PARTIAL, metadata preserved', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-delete-partial.png';
    const bytes = new Uint8Array([90, 100]);

    // Put a file normally
    await deps.objects.put(key, bytes, 'image/png');
    const expectedFileID = predictFileID(key);

    // Make deleteFile return a non-zero status code for this fileID
    state.deleteFileStatuses[expectedFileID] = -1;

    await expect(deps.objects.delete(key)).rejects.toThrow(/OBJECT_DELETE_PARTIAL/);

    // Metadata must be preserved (not deleted) for retry
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key)).toBe(true);

    // The mock does NOT delete the file when code is non-zero
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    await deps.close();
  });

  // --- AC-14: delete succeeds but metadata delete fails -> metadata preserved ---

  it('AC-14: delete succeeds, metadata delete fails -> metadata preserved for sweeper', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-delete-meta-fail.png';
    const bytes = new Uint8Array([110, 120, 130]);

    // Put a file normally
    await deps.objects.put(key, bytes, 'image/png');
    const expectedFileID = predictFileID(key);

    // Make metadata delete fail AFTER the remote object is deleted
    state.deleteMetadataShouldFail = true;

    await expect(deps.objects.delete(key)).rejects.toThrow(/DELETE_METADATA_FAILED/);

    // Remote object was deleted (deleteFile returned code 0)
    expect(state.storage.files.has(expectedFileID)).toBe(false);

    // Metadata is preserved for sweeper retry
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- AC-15: getSignedUrl non-zero status code -> SIGNED_URL_FAILED ---

  it('AC-15: getSignedUrl returns non-zero status code -> SIGNED_URL_FAILED', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-url-fail.png';
    const bytes = new Uint8Array([140, 150]);

    // Put a file normally
    await deps.objects.put(key, bytes, 'image/png');
    const expectedFileID = predictFileID(key);

    // Make getTempFileURL return a non-zero status code
    state.getTempFileURLStatuses[expectedFileID] = -1;

    await expect(deps.objects.getSignedUrl(key)).rejects.toThrow(/SIGNED_URL_FAILED/);

    await deps.close();
  });

  // --- AC-16: exists() — metadata exists, remote object missing -> false ---

  it('AC-16: metadata exists, remote object missing -> exists() returns false', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-exists-remote-missing.png';
    const bytes = new Uint8Array([160, 170]);

    // Put a file normally
    await deps.objects.put(key, bytes, 'image/png');
    const expectedFileID = predictFileID(key);

    // Mark the remote object as missing (simulating object was deleted
    // out-of-band while metadata remains)
    state.remoteObjectMissing.add(expectedFileID);

    // exists() should return false (metadata exists but remote is gone)
    expect(await deps.objects.exists(key)).toBe(false);

    // Metadata should still be in the database
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key)).toBe(true);

    await deps.close();
  });

  // --- AC-17: exists() — metadata missing, remote object exists -> false ---

  it('AC-17: metadata missing, remote object exists -> exists() returns false', async () => {
    const { deps, state } = setup;
    const key = 'assets/orphan-without-metadata.png';

    // Simulate a remote object that exists without a metadata record
    // (e.g., put failed after upload but before metadata was saved,
    // or a manually uploaded object)
    const expectedFileID = predictFileID(key);
    state.storage.files.set(expectedFileID, {
      content: Buffer.from([180, 190]),
      cloudPath: `${OPTIONS.storagePrefix}/${key}`,
    });

    // exists() should return false because metadata is missing — the
    // adapter cannot resolve a fileID without metadata
    expect(await deps.objects.exists(key)).toBe(false);

    // No metadata record should exist
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key) ?? false).toBe(false);

    await deps.close();
  });

  // --- AC-18: normal lifecycle — put/get/getSignedUrl/delete/exists ---

  it('AC-18: normal fileID path -> put/get/getSignedUrl/exists/delete all work', async () => {
    const { deps, state } = setup;
    const key = 'assets/test-normal-lifecycle.png';
    const bytes = new Uint8Array([200, 210, 220, 230]);

    // put: uploads file + saves metadata
    await deps.objects.put(key, bytes, 'image/png');

    const expectedFileID = predictFileID(key);

    // Metadata record exists
    const metaCollection = state.database.collections.get('prod_object_metadata');
    expect(metaCollection?.docs.has(key)).toBe(true);
    const meta = metaCollection?.docs.get(key) as unknown as { fileID: string };
    expect(meta.fileID).toBe(expectedFileID);

    // Storage file exists
    expect(state.storage.files.has(expectedFileID)).toBe(true);

    // get: resolves fileID -> downloads bytes
    const fetched = await deps.objects.get(key);
    expect(Array.from(fetched)).toEqual([200, 210, 220, 230]);

    // getSignedUrl: resolves fileID -> temp URL
    const url = await deps.objects.getSignedUrl(key);
    expect(url).toContain('mock-temp-url');

    // exists: true (metadata + remote both present)
    expect(await deps.objects.exists(key)).toBe(true);

    // delete: removes file + metadata
    await deps.objects.delete(key);

    // Storage file removed
    expect(state.storage.files.has(expectedFileID)).toBe(false);

    // Metadata removed
    expect(metaCollection?.docs.has(key)).toBe(false);

    // exists: false (metadata gone)
    expect(await deps.objects.exists(key)).toBe(false);

    // get: throws OBJECT_NOT_FOUND (metadata gone)
    await expect(deps.objects.get(key)).rejects.toThrow(/OBJECT_NOT_FOUND/);

    await deps.close();
  });
});
