/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R4 (P2-01): API surface smoke test.
 *
 * SCOPE — what these tests verify:
 *   - The installed @cloudbase/node-sdk package exposes the API SURFACE
 *     (method existence) our NoSQL adapter relies on.
 *   - Source-code contract facts about transactionId propagation, verified
 *     by reading the SDK's TypeScript source files (no runtime calls).
 *
 * SCOPE — what these tests do NOT verify:
 *   - Transaction behaviour (commit / rollback / retry semantics) — that
 *     requires real CloudBase server-side execution.
 *   - Retry semantics under DATABASE_TRANSACTION_CONFLICT — source only.
 *   - The exact return shape of doc().get() / collection().add() — those
 *     are covered by the mock-based behaviour tests.
 *
 * Real CloudBase server-side behaviour remains UNVERIFIED_PENDING_PREVIEW.
 * When a Preview environment with live credentials becomes available, a
 * separate integration test suite should be added.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Import the REAL SDK — no vi.mock here. This file must NOT mock
// @cloudbase/node-sdk.
import tcb from '@cloudbase/node-sdk';

// --- SDK source file paths (for source-code contract inspection) ------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sdkSrcRoot = path.resolve(
  __dirname,
  '../../node_modules/@cloudbase/database/src'
);
const transactionSrcPath = path.join(sdkSrcRoot, 'transaction', 'index.ts');
const collectionSrcPath = path.join(sdkSrcRoot, 'collection.ts');
const querySrcPath = path.join(sdkSrcRoot, 'query.ts');
const documentSrcPath = path.join(sdkSrcRoot, 'document.ts');
const codeSrcPath = path.join(sdkSrcRoot, 'const', 'code.ts');

/**
 * Read an SDK source file as UTF-8 text. Throws vitest's assertion-style
 * error if the file is missing so the test fails loudly instead of silently
 * skipping.
 */
function readSdkSource(filePath: string, label: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `SDK source file not found for ${label}: ${filePath}. ` +
        'The @cloudbase/database package layout may have changed.'
    );
  }
  return fs.readFileSync(filePath, 'utf-8');
}

describe('FIX-R4 API surface smoke: @cloudbase/node-sdk installed version', () => {
  it('init() returns an app object with expected method names (API surface only)', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    expect(app).toBeDefined();
    expect(typeof app.database).toBe('function');
    expect(typeof app.uploadFile).toBe('function');
    expect(typeof app.downloadFile).toBe('function');
    expect(typeof app.deleteFile).toBe('function');
    expect(typeof app.getTempFileURL).toBe('function');
  });

  it('database() returns an object with expected method names (API surface only)', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    expect(db).toBeDefined();
    expect(typeof db.runTransaction).toBe('function');
    expect(typeof db.collection).toBe('function');
    expect(db.command).toBeDefined();
  });

  it('db.command exposes all operators the adapter uses (API surface only)', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    const cmd = db.command;
    expect(cmd).toBeDefined();

    // Query operators
    expect(typeof cmd.eq).toBe('function');
    expect(typeof cmd.neq).toBe('function');
    expect(typeof cmd.lt).toBe('function');
    expect(typeof cmd.lte).toBe('function');
    expect(typeof cmd.gt).toBe('function');
    expect(typeof cmd.gte).toBe('function');
    expect(typeof cmd.in).toBe('function');
    expect(typeof cmd.nin).toBe('function');
    expect(typeof cmd.exists).toBe('function');

    // Logic operators
    expect(typeof cmd.and).toBe('function');
    expect(typeof cmd.or).toBe('function');

    // Update operators
    expect(typeof cmd.set).toBe('function');
    expect(typeof cmd.remove).toBe('function');
    expect(typeof cmd.inc).toBe('function');
    expect(typeof cmd.push).toBe('function');
  });

  it('collection() returns an object with expected method names (API surface only)', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    // collection() is synchronous — no network call
    const coll = db.collection('test_collection');
    expect(coll).toBeDefined();
    expect(typeof coll.add).toBe('function');
    expect(typeof coll.doc).toBe('function');
    expect(typeof coll.where).toBe('function');
    expect(typeof coll.count).toBe('function');
  });

  it('doc() returns an object with expected method names (API surface only)', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    const coll = db.collection('test_collection');
    // doc() is synchronous — no network call
    const doc = coll.doc('test-id');
    expect(doc).toBeDefined();
    expect(typeof doc.get).toBe('function');
    expect(typeof doc.update).toBe('function');
    expect(typeof doc.set).toBe('function');
    expect(typeof doc.remove).toBe('function');
  });

  it('where() returns an object with expected method names (API surface only)', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    const coll = db.collection('test_collection');
    // where() is synchronous — no network call
    const query = coll.where({ test: 1 });
    expect(query).toBeDefined();
    expect(typeof query.get).toBe('function');
    expect(typeof query.update).toBe('function');
    expect(typeof query.remove).toBe('function');
    expect(typeof query.orderBy).toBe('function');
    expect(typeof query.limit).toBe('function');
  });

  it('runTransaction.length >= 1 — callback parameter is required (API surface only)', () => {
    // This test verifies at runtime that runTransaction is callable and that
    // the callback parameter is required (length >= 1). The optional `times`
    // parameter has a default value so it does not count toward .length.
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    expect(db.runTransaction.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Source-code contract inspection (FIX-R4 P2-01)
  //
  // These tests read the installed SDK's TypeScript source files and verify
  // structural facts about transactionId propagation. They do NOT make
  // network calls — they are "source code contract" tests.
  //
  // Real CloudBase server-side transaction behaviour remains
  // UNVERIFIED_PENDING_PREVIEW.
  // -------------------------------------------------------------------------

  it('SDK source: runTransaction accepts callback + optional times param (default 3)', () => {
    const source = readSdkSource(transactionSrcPath, 'transaction/index.ts');
    // The function signature should have `times` with a default value of 3.
    expect(source, 'transaction source should declare runTransaction').toMatch(/runTransaction\s*\(/);
    expect(source).toMatch(/times\s*:\s*number\s*=\s*3/);
    // .length counts params before the first default, so with
    // (callback, times=3) the length should be 1.
    expect(source).toMatch(/callback\s*:/);
  });

  it('SDK source: DATABASE_TRANSACTION_CONFLICT is the retry error code', () => {
    const codeSource = readSdkSource(codeSrcPath, 'const/code.ts');
    expect(codeSource).toMatch(/DATABASE_TRANSACTION_CONFLICT/);
    expect(codeSource).toMatch(/database transaction conflict/);

    // The transaction source should reference this error code for retry.
    const txSource = readSdkSource(transactionSrcPath, 'transaction/index.ts');
    expect(txSource).toMatch(/DATABASE_TRANSACTION_CONFLICT/);
    // Retry decrements times and re-invokes runTransaction.
    expect(txSource).toMatch(/--times/);
  });

  it('SDK source: Transaction.collection() passes transactionId to CollectionReference', () => {
    const source = readSdkSource(transactionSrcPath, 'transaction/index.ts');
    // Transaction.collection() should construct a CollectionReference
    // passing this._id (the transactionId) as the 4th argument.
    expect(source).toMatch(/new CollectionReference\(/);
    expect(source).toMatch(/this\._id/);
  });

  it('SDK source: CollectionReference constructor accepts transactionId parameter', () => {
    const source = readSdkSource(collectionSrcPath, 'collection.ts');
    // The constructor should accept transactionId as a parameter.
    expect(source).toMatch(/transactionId\??:\s*string/);
    // And store it on _transactionId.
    expect(source).toMatch(/this\._transactionId\s*=\s*transactionId/);
  });

  it('SDK source: CollectionReference.doc() passes _transactionId to DocumentReference', () => {
    const source = readSdkSource(collectionSrcPath, 'collection.ts');
    // doc() should pass this._transactionId to the DocumentReference.
    const docMethodMatch = source.match(
      /doc\(docID[^)]*\)[^{]*\{([\s\S]*?)\n  \}/
    );
    expect(docMethodMatch, 'CollectionReference.doc() method not found').not.toBeNull();
    expect(docMethodMatch![1]).toMatch(/this\._transactionId/);
  });

  it('SDK source: DocumentReference.update() DOES carry transactionId (doc().update path)', () => {
    const source = readSdkSource(documentSrcPath, 'document.ts');
    // Find the update method body in DocumentReference.
    const updateMatch = source.match(
      /async update\(data: Object\): Promise<any> \{([\s\S]*?)\n  \}/
    );
    expect(
      updateMatch,
      'DocumentReference.update() method not found in document.ts'
    ).not.toBeNull();
    const updateBody = updateMatch![1];
    // The param construction should include transactionId.
    expect(
      updateBody,
      'DocumentReference.update() must carry transactionId for transactional doc updates'
    ).toContain('transactionId');
  });

  it('SDK source: Query.update() (where().update path) does NOT carry transactionId — confirms the leak bug', () => {
    const source = readSdkSource(querySrcPath, 'query.ts');
    // Find the update method body in the Query class.
    // The Query class update method is: public async update(data: Object)
    const updateMatch = source.match(
      /public async update\(data: Object\): Promise<any> \{([\s\S]*?)\n  \}/
    );
    expect(
      updateMatch,
      'Query.update() method (where().update path) not found in query.ts'
    ).not.toBeNull();
    const updateBody = updateMatch![1];
    // The where().update() path must NOT set transactionId on the param.
    // This is the SDK-level bug that our adapter must work around by
    // avoiding where().update() inside transactions.
    expect(
      updateBody,
      'Query.update() (where().update path) must NOT carry transactionId — ' +
        'this is the known SDK leak bug. If this fails, the SDK may have ' +
        'been fixed; re-evaluate the adapter workaround.'
    ).not.toContain('transactionId');
  });

  it('SDK source: Query.where() does propagate _transactionId to the new Query', () => {
    const source = readSdkSource(querySrcPath, 'query.ts');
    // where() should pass this._transactionId to the new Query.
    const whereMatch = source.match(
      /public where\(query: object\)[^{]*\{([\s\S]*?)\n  \}/
    );
    expect(whereMatch, 'Query.where() method not found').not.toBeNull();
    expect(whereMatch![1]).toMatch(/this\._transactionId/);
  });
});
