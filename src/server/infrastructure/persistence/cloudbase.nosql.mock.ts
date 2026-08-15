/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2: Mock CloudBase Node SDK.
 *
 * In-memory simulation of the CloudBase document database + storage SDK
 * used by the NoSQL adapter contract tests. This mock is NOT a real
 * CloudBase connection — it models the behaviors the adapter relies on:
 *
 *  - `db.command` returns operator objects (`_.nin`, `_.in`, `_.lte`,
 *    `_.or`, `_.and`, `_.set`, `_.remove`, `_.eq`) that the mock query
 *    engine knows how to evaluate.
 *  - `db.runTransaction(callback)` runs the callback with a transaction
 *    context. Writes inside the transaction are buffered and committed
 *    atomically on callback return; a throw rolls them back.
 *  - `collection().add()` with an explicit `_id` enforces uniqueness
 *    (throws E11000 duplicate key on conflict).
 *  - `collection().where(query).update()` / `.get()` / `.remove()` evaluate
 *    the query against the in-memory documents.
 *  - `app.uploadFile()` returns a synthetic fileID `cloud://env/path`.
 *  - `app.downloadFile()` / `getTempFileURL()` / `deleteFile()` resolve
 *    via the fileID.
 *
 * This mock is intentionally simple — it models only the semantics needed
 * by the adapter contract tests. It is NOT a general-purpose CloudBase
 * emulator.
 */

export interface MockDocument {
  _id: string;
  [key: string]: unknown;
}

export interface MockCollection {
  docs: Map<string, MockDocument>;
}

export interface MockDatabase {
  collections: Map<string, MockCollection>;
}

export interface MockStorage {
  files: Map<string, { content: Buffer; cloudPath: string }>;
}

export interface MockCloudBaseApp {
  database(): MockDatabaseHandle;
  uploadFile(opts: { cloudPath: string; fileContent: Buffer }): Promise<{ fileID: string }>;
  downloadFile(opts: { fileID: string }): Promise<{ fileContent: Buffer }>;
  deleteFile(opts: { fileList: string[] }): Promise<{ fileList: Array<{ fileID: string; code: number; statusMessage?: string }> }>;
  getTempFileURL(opts: { fileList: string[] }): Promise<{ fileList: Array<{ fileID: string; code: number; tempFileURL: string; statusMessage?: string }> }>;
}

export interface MockDatabaseHandle {
  collection(name: string): MockCollectionHandle;
  runTransaction<T>(callback: (tx: MockTransactionHandle) => Promise<T>): Promise<T>;
  command: MockCommand;
}

/**
 * FIX-R3 AC-03: Transaction collection does NOT expose where() or count().
 * Real CloudBase transactions only support doc(id).get/set/update/remove
 * and add(). Calling where() inside a transaction fails at runtime; we
 * narrow the type so it fails at compile time instead.
 */
export interface MockTransactionHandle {
  collection(name: string): MockTransactionCollectionHandle;
  commit(): Promise<void>;
  rollback(reason?: unknown): Promise<void>;
}

export interface MockCollectionHandle {
  add(data: Record<string, unknown>): Promise<{ id: string }>;
  doc(id: string): MockDocHandle;
  where(query: unknown): MockQueryHandle;
  count(): Promise<{ total: number }>;
}

/**
 * FIX-R3 AC-03: Transaction collection — no where(), no count().
 * Only doc(id) operations and add() are supported inside a transaction.
 */
export interface MockTransactionCollectionHandle {
  add(data: Record<string, unknown>): Promise<{ id: string }>;
  doc(id: string): MockTransactionDocHandle;
}

export interface MockDocHandle {
  /**
   * Non-transaction get: returns { data: unknown[] } (array).
   * Real CloudBase doc().get() outside a transaction returns an array
   * in `data` (IGetRes.data: any[]).
   */
  get(): Promise<{ data: unknown[] }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  set(data: Record<string, unknown>): Promise<{ updated: number; upserted: unknown[] }>;
  remove(): Promise<{ deleted: number }>;
}

/**
 * FIX-R3 AC-02: Transaction doc().get() returns { data: unknown | null }
 * (single document, NOT an array). When the document doesn't exist,
 * data is null. This matches real CloudBase transaction behavior where
 * doc(id).get() inside runTransaction returns the document object directly
 * or null, not wrapped in an array.
 */
export interface MockTransactionDocHandle {
  get(): Promise<{ data: unknown | null }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  set(data: Record<string, unknown>): Promise<{ updated: number; upserted: unknown[] }>;
  remove(): Promise<{ deleted: number }>;
}

export interface MockQueryHandle {
  get(): Promise<{ data: unknown[] }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  remove(): Promise<{ deleted: number }>;
  orderBy(field: string, direction: 'asc' | 'desc'): MockQueryHandle;
  limit(n: number): MockQueryHandle;
}

// --- Command operators ----------------------------------------------------
//
// Each command returns a tagged object the mock query engine can inspect.
// This mirrors how CloudBase's real `db.command` works: operators are
// opaque values that only the database engine can interpret.

export interface MockCommand {
  nin(values: unknown[]): { __op: 'nin'; values: unknown[] };
  in(values: unknown[]): { __op: 'in'; values: unknown[] };
  lte(value: unknown): { __op: 'lte'; value: unknown };
  gte(value: unknown): { __op: 'gte'; value: unknown };
  gt(value: unknown): { __op: 'gt'; value: unknown };
  lt(value: unknown): { __op: 'lt'; value: unknown };
  eq(value: unknown): { __op: 'eq'; value: unknown };
  neq(value: unknown): { __op: 'neq'; value: unknown };
  or(conditions: unknown[]): { __op: 'or'; conditions: unknown[] };
  and(conditions: unknown[]): { __op: 'and'; conditions: unknown[] };
  set(value: unknown): { __op: 'set'; value: unknown };
  remove(): { __op: 'remove' };
  exists(exists?: boolean): { __op: 'exists'; exists: boolean };
  push(value: unknown): { __op: 'push'; value: unknown };
  inc(value: number): { __op: 'inc'; value: number };
}

export function createMockCommand(): MockCommand {
  return {
    nin: (values) => ({ __op: 'nin', values }),
    in: (values) => ({ __op: 'in', values }),
    lte: (value) => ({ __op: 'lte', value }),
    gte: (value) => ({ __op: 'gte', value }),
    gt: (value) => ({ __op: 'gt', value }),
    lt: (value) => ({ __op: 'lt', value }),
    eq: (value) => ({ __op: 'eq', value }),
    neq: (value) => ({ __op: 'neq', value }),
    or: (conditions) => ({ __op: 'or', conditions }),
    and: (conditions) => ({ __op: 'and', conditions }),
    set: (value) => ({ __op: 'set', value }),
    remove: () => ({ __op: 'remove' }),
    exists: (exists = true) => ({ __op: 'exists', exists }),
    push: (value) => ({ __op: 'push', value }),
    inc: (value) => ({ __op: 'inc', value }),
  };
}

// --- Query evaluation -----------------------------------------------------

function matchesQuery(doc: MockDocument, query: unknown): boolean {
  if (query === null || query === undefined) return true;
  if (typeof query !== 'object') return false;
  const q = query as Record<string, unknown>;
  // Check for top-level command operators
  if (q.__op === 'and') {
    const conditions = q.conditions as unknown[];
    return conditions.every((c) => matchesQuery(doc, c));
  }
  if (q.__op === 'or') {
    const conditions = q.conditions as unknown[];
    return conditions.some((c) => matchesQuery(doc, c));
  }
  // Plain object: each key must match
  for (const [key, condition] of Object.entries(q)) {
    if (!matchesField(doc[key], condition)) return false;
  }
  return true;
}

function matchesField(value: unknown, condition: unknown): boolean {
  if (condition === null || condition === undefined) {
    return value === null || value === undefined;
  }
  if (typeof condition !== 'object') {
    return value === condition;
  }
  const c = condition as { __op?: string; [k: string]: unknown };
  if (!c.__op) {
    // Plain object condition — deep equality on object fields (rare in our use)
    return JSON.stringify(value) === JSON.stringify(condition);
  }
  switch (c.__op) {
    case 'eq':
      return value === c.value;
    case 'neq':
      return value !== c.value;
    case 'in':
      return Array.isArray(c.values) && c.values.includes(value);
    case 'nin':
      return !Array.isArray(c.values) || !c.values.includes(value);
    case 'lte':
      return compareValues(value, c.value) <= 0;
    case 'gte':
      return compareValues(value, c.value) >= 0;
    case 'lt':
      return compareValues(value, c.value) < 0;
    case 'gt':
      return compareValues(value, c.value) > 0;
    case 'exists':
      return c.exists ? (value !== undefined && value !== null) : (value === undefined || value === null);
    default:
      return false;
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

// --- Update evaluation ----------------------------------------------------

function applyUpdate(doc: MockDocument, update: Record<string, unknown>): MockDocument {
  const updated: MockDocument = { ...doc };
  for (const [key, op] of Object.entries(update)) {
    if (op === null || op === undefined) {
      delete updated[key];
      continue;
    }
    if (typeof op !== 'object') {
      updated[key] = op;
      continue;
    }
    const o = op as { __op?: string; value?: unknown };
    if (!o.__op) {
      updated[key] = op;
      continue;
    }
    switch (o.__op) {
      case 'set':
        updated[key] = o.value;
        break;
      case 'remove':
        delete updated[key];
        break;
      case 'inc':
        updated[key] = (typeof updated[key] === 'number' ? updated[key] : 0) + (o.value as number);
        break;
      case 'push':
        if (!Array.isArray(updated[key])) updated[key] = [];
        (updated[key] as unknown[]).push(o.value);
        break;
      default:
        // Unknown operator — ignore
        break;
    }
  }
  return updated;
}

// --- Mock state -----------------------------------------------------------

export interface MockCloudBaseState {
  database: MockDatabase;
  storage: MockStorage;
  envId: string;
  /**
   * FIX-R4: Incremented every time runTransaction() is called. Tests use this
   * to verify that withCurrentOrNewTransaction reuses the outer transaction
   * instead of opening a nested one (P0-02 regression guard).
   */
  runTransactionCount: number;
  /**
   * FIX-R4: When true, commit() throws COMMIT_FAILED. Tests use this to
   * verify that a commit failure rolls back all buffered writes.
   */
  commitShouldFail: boolean;
  /**
   * FIX-R4: When true, the first commit attempt throws a
   * DATABASE_TRANSACTION_CONFLICT error and runTransaction retries the
   * callback. The second attempt succeeds. Tests use this to verify retry
   * behavior on conflict.
   */
  retryOnConflict: boolean;
  /**
   * FIX-R8-CLOSURE: When true, EVERY commit attempt throws
   * DATABASE_TRANSACTION_CONFLICT. Unlike retryOnConflict (which is
   * consumed after one attempt), persistentConflict is NOT consumed —
   * all MAX_TX_ATTEMPTS attempts fail, and runTransaction throws the
   * conflict error. Tests use this to verify retry exhaustion behavior:
   * errors must propagate and recovery state must not be lost.
   */
  persistentConflict: boolean;
  /**
   * FIX-R4: Storage fault injection — when true, uploadFile() throws.
   */
  uploadShouldFail: boolean;
  /**
   * FIX-R4: When true, set() on object_metadata collections throws. Tests
   * use this to verify that a metadata write failure does not leave an
   * orphaned Storage object.
   */
  saveMetadataShouldFail: boolean;
  /**
   * FIX-R4 Workstream G: When true, remove() on object_metadata collections
   * throws. Tests use this to verify that a metadata delete failure (after
   * remote object was already deleted) preserves metadata for retry/sweeper.
   */
  deleteMetadataShouldFail: boolean;
  /**
   * FIX-R4: Per-fileID status codes for deleteFile(). Non-zero = failure
   * (the mock throws for that fileID).
   */
  deleteFileStatuses: Record<string, number>;
  /**
   * FIX-R4: Per-fileID status codes for getTempFileURL(). Non-zero = failure
   * (the mock throws for that fileID).
   */
  getTempFileURLStatuses: Record<string, number>;
  /**
   * FIX-R4: fileIDs that don't exist in remote Storage. downloadFile()
   * throws FILE_NOT_FOUND for these; getTempFileURL() returns an empty URL.
   * Used for exists() and error-path testing.
   */
  remoteObjectMissing: Set<string>;
  /**
   * FIX-R5: When true, transactions track document reads and check for
   * conflicts on commit (optimistic concurrency control). If a document
   * read during the transaction has been modified in committed state by
   * another transaction, the commit throws DATABASE_TRANSACTION_CONFLICT.
   * Used by T1 deterministic interleaving test.
   */
  occReadTracking: boolean;
  /**
   * FIX-R5: Optional async hook called by the mock just before applying
   * the transaction's write log on commit. Tests use this to inject
   * committed-state changes (e.g., a tombstone from Phase A) between
   * a child transaction's read and its commit, simulating concurrent
   * interleaving without real threads.
   */
  preCommitHook?: () => Promise<void>;
}

export function createMockCloudBaseState(envId: string): MockCloudBaseState {
  return {
    database: { collections: new Map() },
    storage: { files: new Map() },
    envId,
    runTransactionCount: 0,
    commitShouldFail: false,
    retryOnConflict: false,
    persistentConflict: false,
    uploadShouldFail: false,
    saveMetadataShouldFail: false,
    deleteMetadataShouldFail: false,
    deleteFileStatuses: {},
    getTempFileURLStatuses: {},
    remoteObjectMissing: new Set(),
    occReadTracking: false,
    preCommitHook: undefined,
  };
}

function getCollection(state: MockCloudBaseState, name: string): MockCollection {
  let c = state.database.collections.get(name);
  if (!c) {
    c = { docs: new Map() };
    state.database.collections.set(name, c);
  }
  return c;
}

/**
 * FIX-R4: Check if a collection name corresponds to object_metadata.
 * Collection names are namespace-prefixed (e.g. `prod_object_metadata`).
 */
function isMetadataCollection(collectionName: string): boolean {
  return collectionName.includes('object_metadata');
}

// --- Transaction write log ------------------------------------------------
//
// During a transaction, writes are buffered in a per-transaction log.
// On commit, the log is applied atomically. On rollback, the log is
// discarded. Reads inside a transaction see the buffered writes.

interface TransactionOp {
  collectionName: string;
  type: 'add' | 'update' | 'remove' | 'set';
  id?: string;
  data?: Record<string, unknown>;
}

// --- Mock handles ---------------------------------------------------------

/**
 * Resolve a document by id, applying transaction log overlay.
 * Shared by both non-transaction and transaction collection handles.
 */
function ensureDoc(
  state: MockCloudBaseState,
  collectionName: string,
  id: string,
  txLog?: TransactionOp[]
): MockDocument | null {
  if (txLog) {
    for (let i = txLog.length - 1; i >= 0; i--) {
      const op = txLog[i];
      if (op.collectionName === collectionName && op.id === id) {
        if (op.type === 'remove') return null;
        if (op.type === 'add' || op.type === 'set') {
          return { ...(op.data as MockDocument) };
        }
        if (op.type === 'update') {
          const coll = getCollection(state, collectionName);
          const existing = coll.docs.get(id);
          if (existing) return applyUpdate(existing, op.data as Record<string, unknown>);
          return null;
        }
      }
    }
  }
  const coll = getCollection(state, collectionName);
  const doc = coll.docs.get(id);
  return doc ? { ...doc } : null;
}

function createCollectionHandle(
  state: MockCloudBaseState,
  collectionName: string,
  txLog?: TransactionOp[]
): MockCollectionHandle {

  return {
    async add(data: Record<string, unknown>): Promise<{ id: string }> {
      const id = (data._id as string) || generateId();
      if (txLog) {
        // Check if already exists in log or in committed state
        const existing = ensureDoc(state, collectionName, id, txLog);
        if (existing) {
          const err = new Error('E11000 duplicate key error');
          throw err;
        }
        txLog.push({ collectionName, type: 'add', id, data: { ...data, _id: id } });
        return { id };
      }
      const coll = getCollection(state, collectionName);
      if (coll.docs.has(id)) {
        throw new Error('E11000 duplicate key error');
      }
      coll.docs.set(id, { ...data, _id: id } as MockDocument);
      return { id };
    },

    doc(id: string): MockDocHandle {
      return {
        async get() {
          const doc = ensureDoc(state, collectionName, id, txLog);
          return { data: doc ? [doc] : [] };
        },
        async update(data: Record<string, unknown>) {
          if (txLog) {
            const existing = ensureDoc(state, collectionName, id, txLog);
            if (!existing) return { updated: 0 };
            txLog.push({ collectionName, type: 'update', id, data });
            return { updated: 1 };
          }
          const coll = getCollection(state, collectionName);
          const existing = coll.docs.get(id);
          if (!existing) return { updated: 0 };
          coll.docs.set(id, applyUpdate(existing, data));
          return { updated: 1 };
        },
        async set(data: Record<string, unknown>) {
          // FIX-R4: saveMetadataShouldFail fault injection
          if (state.saveMetadataShouldFail && isMetadataCollection(collectionName)) {
            throw new Error('SAVE_METADATA_FAILED: injected by mock');
          }
          if (txLog) {
            txLog.push({ collectionName, type: 'set', id, data: { ...data, _id: id } });
            return { updated: 1, upserted: [id] };
          }
          const coll = getCollection(state, collectionName);
          const existed = coll.docs.has(id);
          coll.docs.set(id, { ...data, _id: id } as MockDocument);
          return { updated: existed ? 1 : 0, upserted: existed ? [] : [id] };
        },
        async remove() {
          // FIX-R4 Workstream G: deleteMetadataShouldFail fault injection
          if (state.deleteMetadataShouldFail && isMetadataCollection(collectionName)) {
            throw new Error('DELETE_METADATA_FAILED: injected by mock');
          }
          if (txLog) {
            const existing = ensureDoc(state, collectionName, id, txLog);
            if (!existing) return { deleted: 0 };
            txLog.push({ collectionName, type: 'remove', id });
            return { deleted: 1 };
          }
          const coll = getCollection(state, collectionName);
          const existed = coll.docs.delete(id);
          return { deleted: existed ? 1 : 0 };
        },
      };
    },

    where(query: unknown): MockQueryHandle {
      let results: MockDocument[] = [];
      const collectResults = () => {
        const coll = getCollection(state, collectionName);
        results = [];
        for (const doc of coll.docs.values()) {
          // Apply transaction log overlay for reads
          if (txLog) {
            let overlay: MockDocument | null = { ...doc };
            for (const op of txLog) {
              if (op.collectionName !== collectionName) continue;
              if (op.id !== doc._id) continue;
              if (op.type === 'remove') {
                overlay = null;
                break;
              }
              if (op.type === 'update') {
                overlay = applyUpdate(overlay!, op.data as Record<string, unknown>);
              }
              if (op.type === 'set') {
                overlay = { ...(op.data as MockDocument) };
              }
            }
            if (overlay && matchesQuery(overlay, query)) {
              results.push(overlay);
            }
          } else {
            if (matchesQuery(doc, query)) {
              results.push({ ...doc });
            }
          }
        }
      };
      let orderedResults: MockDocument[] | null = null;
      let limitN: number | null = null;
      const applyModifiers = () => {
        let r = [...results];
        if (orderedResults) r = orderedResults;
        if (limitN !== null) r = r.slice(0, limitN);
        return r;
      };
      return {
        async get() {
          collectResults();
          const finalResults = applyModifiers();
          return { data: finalResults };
        },
        async update(data: Record<string, unknown>) {
          if (txLog) {
            // Transaction-aware update: read + buffer update
            collectResults();
            let count = 0;
            for (const doc of results) {
              txLog.push({
                collectionName,
                type: 'update',
                id: doc._id,
                data,
              });
              count++;
            }
            return { updated: count };
          }
          collectResults();
          const coll = getCollection(state, collectionName);
          let count = 0;
          for (const doc of results) {
            const existing = coll.docs.get(doc._id);
            if (existing) {
              coll.docs.set(doc._id, applyUpdate(existing, data));
              count++;
            }
          }
          return { updated: count };
        },
        async remove() {
          if (txLog) {
            collectResults();
            let count = 0;
            for (const doc of results) {
              txLog.push({ collectionName, type: 'remove', id: doc._id });
              count++;
            }
            return { deleted: count };
          }
          collectResults();
          const coll = getCollection(state, collectionName);
          let count = 0;
          for (const doc of results) {
            if (coll.docs.delete(doc._id)) count++;
          }
          return { deleted: count };
        },
        orderBy(field: string, direction: 'asc' | 'desc') {
          collectResults();
          results.sort((a, b) => {
            const av = a[field];
            const bv = b[field];
            const cmp = compareValues(av, bv);
            return direction === 'asc' ? cmp : -cmp;
          });
          orderedResults = [...results];
          return this;
        },
        limit(n: number) {
          limitN = n;
          return this;
        },
      };
    },

    async count() {
      const coll = getCollection(state, collectionName);
      return { total: coll.docs.size };
    },
  };
}

/**
 * FIX-R3 AC-02/AC-03: Transaction collection handle.
 *
 * Real CloudBase transactions differ from non-transaction collection
 * access in two critical ways:
 *  1. `where()` and `count()` are NOT supported — only `doc(id)` and
 *     `add()` work inside `runTransaction`. We omit them from the type
 *     so TypeScript rejects transaction-code that tries to call where().
 *  2. `doc(id).get()` returns `{ data: T | null }` (single document or
 *     null when not found), NOT `{ data: T[] }` (array). The non-transaction
 *     `doc(id).get()` returns an array per IGetRes.
 */
function createTransactionCollectionHandle(
  state: MockCloudBaseState,
  collectionName: string,
  txLog: TransactionOp[],
  readSet?: Map<string, { collectionName: string; id: string; snapshot: MockDocument | null }>
): MockTransactionCollectionHandle {
  return {
    async add(data: Record<string, unknown>): Promise<{ id: string }> {
      const id = (data._id as string) || generateId();
      const existing = ensureDoc(state, collectionName, id, txLog);
      if (existing) {
        throw new Error('E11000 duplicate key error');
      }
      txLog.push({ collectionName, type: 'add', id, data: { ...data, _id: id } });
      return { id };
    },

    doc(id: string): MockTransactionDocHandle {
      return {
        /**
         * AC-02: Returns { data: unknown | null } — single document.
         * This matches real CloudBase transaction behavior where
         * doc(id).get() inside runTransaction returns the document
         * object directly (or null if not found), not wrapped in
         * an array like the non-transaction IGetRes.
         */
        async get() {
          const doc = ensureDoc(state, collectionName, id, txLog);
          // FIX-R5: OCC read tracking — record the committed-state
          // snapshot (NOT the txLog overlay) so commit can detect if
          // another transaction modified this document.
          if (readSet && state.occReadTracking) {
            const committedDoc = getCollection(state, collectionName).docs.get(id) ?? null;
            readSet.set(`${collectionName}:${id}`, {
              collectionName,
              id,
              snapshot: committedDoc ? { ...committedDoc } : null,
            });
          }
          return { data: doc };
        },
        async update(data: Record<string, unknown>) {
          const existing = ensureDoc(state, collectionName, id, txLog);
          if (!existing) return { updated: 0 };
          txLog.push({ collectionName, type: 'update', id, data });
          return { updated: 1 };
        },
        async set(data: Record<string, unknown>) {
          // FIX-R4: saveMetadataShouldFail fault injection (transaction path)
          if (state.saveMetadataShouldFail && isMetadataCollection(collectionName)) {
            throw new Error('SAVE_METADATA_FAILED: injected by mock (tx)');
          }
          txLog.push({ collectionName, type: 'set', id, data: { ...data, _id: id } });
          return { updated: 1, upserted: [id] };
        },
        async remove() {
          // FIX-R4 Workstream G: deleteMetadataShouldFail fault injection (tx path)
          if (state.deleteMetadataShouldFail && isMetadataCollection(collectionName)) {
            throw new Error('DELETE_METADATA_FAILED: injected by mock (tx)');
          }
          const existing = ensureDoc(state, collectionName, id, txLog);
          if (!existing) return { deleted: 0 };
          txLog.push({ collectionName, type: 'remove', id });
          return { deleted: 1 };
        },
      };
    },
  };
}

function generateId(): string {
  return `mock-${Math.random().toString(36).slice(2, 12)}`;
}

// --- Mock app factory -----------------------------------------------------

export function createMockCloudBaseApp(state: MockCloudBaseState): MockCloudBaseApp {
  const command = createMockCommand();

  const databaseHandle: MockDatabaseHandle = {
    collection(name: string) {
      return createCollectionHandle(state, name);
    },
    async runTransaction<T>(callback: (tx: MockTransactionHandle) => Promise<T>): Promise<T> {
      // FIX-R4: Increment the call counter so tests can assert that
      // withCurrentOrNewTransaction reuses the outer transaction instead
      // of opening a nested one (P0-02 regression guard).
      state.runTransactionCount++;
      // FIX-R4: Simulate the real SDK's internal retry on conflict.
      // When retryOnConflict is true, the first commit throws a
      // DATABASE_TRANSACTION_CONFLICT error; the mock retries the
      // callback internally and the second attempt succeeds. The flag
      // is consumed after the first attempt so subsequent transactions
      // are unaffected.
      const MAX_TX_ATTEMPTS = 3;
      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
        const txLog: TransactionOp[] = [];
        // FIX-R5: OCC read tracking — records documents read during this
        // transaction so commit can detect conflicts.
        const readSet = new Map<string, { collectionName: string; id: string; snapshot: MockDocument | null }>();
        const txHandle: MockTransactionHandle = {
          collection(name: string) {
            return createTransactionCollectionHandle(state, name, txLog, readSet);
          },
          async commit() {
            // FIX-R3 AC-05: CloudBase single-transaction limit is 100 doc
            // operations. Fail closed — do NOT partially apply a txLog that
            // exceeds the limit.
            const CLOUDBASE_TX_OP_LIMIT = 100;
            if (txLog.length > CLOUDBASE_TX_OP_LIMIT) {
              throw new Error(
                `CLOUDBASE_TX_LIMIT_EXCEEDED: transaction has ${txLog.length} operations, ` +
                `limit is ${CLOUDBASE_TX_OP_LIMIT}. Project deletion must fail closed.`
              );
            }
            // NOSQL-R2-08 scenario 3: Optimistic concurrency control.
            // Before applying the txLog, check if any 'add' operation's _id
            // already exists in the committed state (meaning another
            // transaction committed the same key first). If so, throw E11000
            // so the caller's catch block can retry and fetch the winner.
            for (const op of txLog) {
              if (op.type === 'add') {
                const coll = getCollection(state, op.collectionName);
                if (coll.docs.has(op.id!)) {
                  throw new Error('E11000 duplicate key error');
                }
              }
            }
            // FIX-R4: commitShouldFail — always throw, no retry. Tests use
            // this to verify that a commit failure rolls back all buffered
            // writes without partially applying them.
            if (state.commitShouldFail) {
              throw new Error('COMMIT_FAILED: injected by mock');
            }
            // FIX-R4: retryOnConflict — first commit attempt throws a
            // conflict error. The flag is consumed so the retry succeeds.
            if (state.retryOnConflict) {
              state.retryOnConflict = false;
              throw new Error('DATABASE_TRANSACTION_CONFLICT: injected by mock');
            }
            // FIX-R8-CLOSURE: persistentConflict — EVERY commit attempt
            // throws a conflict error. Unlike retryOnConflict, this flag
            // is NOT consumed. All MAX_TX_ATTEMPTS attempts fail, and
            // runTransaction exits the loop and throws the last conflict
            // error. Tests use this to verify retry exhaustion behavior.
            if (state.persistentConflict) {
              throw new Error('DATABASE_TRANSACTION_CONFLICT: persistent (injected by mock)');
            }
            // FIX-R5: preCommitHook — allows tests to inject committed-
            // state changes between a transaction's reads and its commit.
            // This simulates concurrent interleaving without real threads.
            if (state.preCommitHook) {
              await state.preCommitHook();
              state.preCommitHook = undefined; // consume the hook
            }
            // FIX-R5: OCC conflict detection — if any document read
            // during this transaction has been modified in committed
            // state (by the preCommitHook or another committed
            // transaction), throw DATABASE_TRANSACTION_CONFLICT.
            if (state.occReadTracking) {
              for (const [key, entry] of readSet) {
                const coll = getCollection(state, entry.collectionName);
                const currentDoc = coll.docs.get(entry.id) ?? null;
                const snapshotJson = entry.snapshot ? JSON.stringify(entry.snapshot) : 'null';
                const currentJson = currentDoc ? JSON.stringify(currentDoc) : 'null';
                if (snapshotJson !== currentJson) {
                  throw new Error(
                    `DATABASE_TRANSACTION_CONFLICT: document ${key} was modified ` +
                    `by another transaction after this transaction read it. ` +
                    `Snapshot: ${snapshotJson.slice(0, 100)}, Current: ${currentJson.slice(0, 100)}`
                  );
                }
              }
            }
            // Apply txLog to committed state
            for (const op of txLog) {
              const coll = getCollection(state, op.collectionName);
              if (op.type === 'add' || op.type === 'set') {
                coll.docs.set(op.id!, { ...(op.data as MockDocument), _id: op.id! });
              } else if (op.type === 'update') {
                const existing = coll.docs.get(op.id!);
                if (existing) {
                  coll.docs.set(op.id!, applyUpdate(existing, op.data as Record<string, unknown>));
                }
              } else if (op.type === 'remove') {
                coll.docs.delete(op.id!);
              }
            }
          },
          async rollback() {
            txLog.length = 0;
          },
        };
        try {
          const result = await callback(txHandle);
          await txHandle.commit();
          return result;
        } catch (e) {
          await txHandle.rollback();
          // Only retry on DATABASE_TRANSACTION_CONFLICT; re-throw all
          // other errors (E11000, COMMIT_FAILED, CLOUDBASE_TX_LIMIT_EXCEEDED,
          // SAVE_METADATA_FAILED, etc.) immediately.
          if (
            e instanceof Error &&
            e.message.includes('DATABASE_TRANSACTION_CONFLICT') &&
            attempt < MAX_TX_ATTEMPTS
          ) {
            lastError = e;
            continue;
          }
          throw e;
        }
      }
      // Unreachable — the loop either returns a result or throws on the
      // first non-retryable error. Guard for type safety.
      throw lastError ?? new Error('RUN_TRANSACTION_EXHAUSTED: unreachable');
    },
    command,
  };

  return {
    database() {
      return databaseHandle;
    },
    async uploadFile(opts: { cloudPath: string; fileContent: Buffer }) {
      // FIX-R4: uploadShouldFail fault injection — tests use this to verify
      // that a failed upload does not leave an orphaned metadata record.
      if (state.uploadShouldFail) {
        throw new Error('UPLOAD_FAILED: injected by mock');
      }
      const fileID = `cloud://${state.envId}/${opts.cloudPath}`;
      state.storage.files.set(fileID, { content: opts.fileContent, cloudPath: opts.cloudPath });
      return { fileID };
    },
    async downloadFile(opts: { fileID: string }) {
      // FIX-R4: remoteObjectMissing — fileIDs flagged as missing throw
      // FILE_NOT_FOUND even if they exist in the local mock map. Used for
      // exists() and error-path testing.
      if (state.remoteObjectMissing.has(opts.fileID)) {
        throw new Error(`FILE_NOT_FOUND: ${opts.fileID}`);
      }
      const file = state.storage.files.get(opts.fileID);
      if (!file) throw new Error(`FILE_NOT_FOUND: ${opts.fileID}`);
      return { fileContent: file.content };
    },
    async deleteFile(opts: { fileList: string[] }) {
      // FIX-R4 Workstream G: Return per-fileID status codes instead of
      // throwing. Real CloudBase deleteFile returns { fileList: [{ fileID,
      // code, statusMessage }] } where code 0 = SUCCESS. Non-zero codes
      // indicate failure; the object is NOT deleted in that case.
      const fileList = opts.fileList.map((fileID) => {
        const code = state.deleteFileStatuses[fileID] ?? 0;
        if (code === 0) {
          state.storage.files.delete(fileID);
          return { fileID, code: 0, statusMessage: 'SUCCESS' };
        }
        return { fileID, code, statusMessage: 'DELETE_FAILED' };
      });
      return { fileList };
    },
    async getTempFileURL(opts: { fileList: string[] }) {
      // FIX-R4 Workstream G: Return per-fileID status codes instead of
      // throwing. Real CloudBase getTempFileURL returns { fileList: [{
      // fileID, code, tempFileURL, statusMessage }] }.
      const fileList = opts.fileList.map((fileID) => {
        const code = state.getTempFileURLStatuses[fileID] ?? 0;
        if (code !== 0) {
          return {
            fileID,
            code,
            tempFileURL: '',
            statusMessage: 'GET_URL_FAILED',
          };
        }
        // remoteObjectMissing returns an empty URL (simulating a missing
        // remote object) with code 0 — the URL fetch "succeeded" but the
        // object is gone.
        const tempFileURL =
          state.remoteObjectMissing.has(fileID) || !state.storage.files.has(fileID)
            ? ''
            : `https://mock-temp-url/${fileID}`;
        return { fileID, code: 0, tempFileURL, statusMessage: 'SUCCESS' };
      });
      return { fileList };
    },
  };
}

/**
 * Install the mock CloudBase SDK into the module cache so that
 * `await import('@cloudbase/node-sdk')` returns the mock.
 *
 * Call `restoreCloudBaseModule()` in afterEach to undo.
 */
export function installMockCloudBaseModule(state: MockCloudBaseState) {
  const mockApp = createMockCloudBaseApp(state);
  const mockModule = {
    init: () => mockApp,
    default: { init: () => mockApp },
  };
  // vitest vi.mock is hoisted; for runtime we override the require cache.
  // This helper returns the mock so tests can wire it via vi.mock directly.
  return { mockApp, mockModule };
}

/**
 * Direct injection helper: bypasses `ensureReady()`'s `import('@cloudbase/node-sdk')`
 * call by pre-populating the adapter. Used in tests that want to exercise the
 * adapter's real logic against the mock SDK without going through tcb.init().
 */
export function createMockAppAndCommand(state: MockCloudBaseState) {
  return createMockCloudBaseApp(state);
}
