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
  deleteFile(opts: { fileList: string[] }): Promise<{ fileList: unknown[] }>;
  getTempFileURL(opts: { fileList: string[] }): Promise<{ fileList: Array<{ fileID: string; tempFileURL: string }> }>;
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
}

export function createMockCloudBaseState(envId: string): MockCloudBaseState {
  return {
    database: { collections: new Map() },
    storage: { files: new Map() },
    envId,
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
  txLog: TransactionOp[]
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
          return { data: doc };
        },
        async update(data: Record<string, unknown>) {
          const existing = ensureDoc(state, collectionName, id, txLog);
          if (!existing) return { updated: 0 };
          txLog.push({ collectionName, type: 'update', id, data });
          return { updated: 1 };
        },
        async set(data: Record<string, unknown>) {
          txLog.push({ collectionName, type: 'set', id, data: { ...data, _id: id } });
          return { updated: 1, upserted: [id] };
        },
        async remove() {
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
      const txLog: TransactionOp[] = [];
      const txHandle: MockTransactionHandle = {
        collection(name: string) {
          return createTransactionCollectionHandle(state, name, txLog);
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
        throw e;
      }
    },
    command,
  };

  return {
    database() {
      return databaseHandle;
    },
    async uploadFile(opts: { cloudPath: string; fileContent: Buffer }) {
      const fileID = `cloud://${state.envId}/${opts.cloudPath}`;
      state.storage.files.set(fileID, { content: opts.fileContent, cloudPath: opts.cloudPath });
      return { fileID };
    },
    async downloadFile(opts: { fileID: string }) {
      const file = state.storage.files.get(opts.fileID);
      if (!file) throw new Error(`FILE_NOT_FOUND: ${opts.fileID}`);
      return { fileContent: file.content };
    },
    async deleteFile(opts: { fileList: string[] }) {
      for (const fileID of opts.fileList) {
        state.storage.files.delete(fileID);
      }
      return { fileList: opts.fileList.map(() => ({})) };
    },
    async getTempFileURL(opts: { fileList: string[] }) {
      return {
        fileList: opts.fileList.map((fileID) => ({
          fileID,
          tempFileURL: state.storage.files.has(fileID)
            ? `https://mock-temp-url/${fileID}`
            : '',
        })),
      };
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
