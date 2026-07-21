/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R3: SDK contract test.
 *
 * Verifies that the installed @cloudbase/node-sdk package exposes the API
 * surface our NoSQL adapter relies on. This test does NOT require credentials
 * and does NOT make any network calls — it only inspects the SDK's shape.
 *
 * If this test fails, it means the installed SDK version has changed its API
 * in a way that breaks our adapter. The adapter types
 * (TransactionCollectionRef, DatabaseCollectionRef, etc.) must be re-validated
 * against the real SDK types.
 */

import { describe, it, expect } from 'vitest';

// Import the REAL SDK — no vi.mock here. This file must NOT mock
// @cloudbase/node-sdk.
import tcb from '@cloudbase/node-sdk';

describe('FIX-R3 SDK contract: @cloudbase/node-sdk installed version', () => {
  it('init() returns a CloudBase app without network calls', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    expect(app).toBeDefined();
    expect(typeof app.database).toBe('function');
    expect(typeof app.uploadFile).toBe('function');
    expect(typeof app.downloadFile).toBe('function');
    expect(typeof app.deleteFile).toBe('function');
    expect(typeof app.getTempFileURL).toBe('function');
  });

  it('database() returns a Db with command, runTransaction, collection', () => {
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    expect(db).toBeDefined();
    expect(typeof db.runTransaction).toBe('function');
    expect(typeof db.collection).toBe('function');
    expect(db.command).toBeDefined();
  });

  it('db.command exposes all operators the adapter uses', () => {
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

  it('collection() returns a CollectionReference with add, doc, where, count', () => {
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

  it('doc() returns a DocumentReference with get, update, set, remove', () => {
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

  it('where() returns a Query with get, update, remove, orderBy, limit', () => {
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

  it('runTransaction accepts a callback parameter (verified at type level)', () => {
    // This test verifies at runtime that runTransaction is callable.
    // We do NOT actually invoke it (that would require network + credentials).
    // The type-level contract is enforced by cloudbase.nosql.ts compiling
    // against the real SDK types.
    const app = tcb.init({ env: 'test-env', accessKey: 'test-key' });
    const db = app.database();
    expect(db.runTransaction.length).toBeGreaterThanOrEqual(1);
  });
});
