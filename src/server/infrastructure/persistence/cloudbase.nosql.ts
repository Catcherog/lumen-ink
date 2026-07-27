/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01 FIX-R2: CloudBase NoSQL adapter.
 *
 * This adapter implements the frozen `PersistenceDependencies` surface using
 * CloudBase's document database (MongoDB-compatible) via `@cloudbase/node-sdk`.
 * It replaces the PostgreSQL adapter (`cloudbase.ts`) for environments where
 * PostgreSQL is not provisioned (RuntimeMode=nosql).
 *
 * FIX-R2 changes (2026-07-21, GPT FIX_REQUIRED round):
 *  - NOSQL-R2-02: All query/update operators use `db.command` (`_.nin`, `_.in`,
 *    `_.lte`, `_.or`, `_.set`, `_.remove`). Raw Mongo operators removed.
 *  - NOSQL-R2-03: `jobs.createIdempotent()` uses `runTransaction` with
 *    deterministic idempotency `_id = projectId__key` to guarantee atomic
 *    Job + idempotency creation. Query scope is `(projectId, key)`.
 *  - NOSQL-R2-04: `objects.put()` saves the `fileID` returned by `uploadFile()`
 *    into a new `object_metadata` collection. Subsequent `get/getSignedUrl/
 *    delete/exists` resolve `storageKey -> fileID` via that collection.
 *  - NOSQL-R2-05: `projects.deleteCascade()` only deletes DB metadata. Storage
 *    cleanup is the responsibility of `ProjectService.deleteProject()` after
 *    the metadata transaction commits.
 *  - NOSQL-R2-06: `CLOUDBASE_DATA_NAMESPACE` prefixes every collection name;
 *    `CLOUDBASE_STORAGE_PREFIX` prefixes every cloudPath. Preview and
 *    Production must configure distinct values; missing -> fail closed.
 *
 * Design:
 *  - Configuration uses CLOUDBASE_ENV_ID + CLOUDBASE_API_KEY (Server API Key)
 *    + CLOUDBASE_DATA_NAMESPACE + CLOUDBASE_STORAGE_PREFIX (both required)
 *  - AsyncLocalStorage propagates the active Transaction to nested repo calls
 *  - ObjectStore uses CloudBase Storage SDK (app.uploadFile/downloadFile/etc)
 *    and persists fileID in `object_metadata` for later resolution
 *  - JobPatch three-state: absent=skip, null=command.remove(), value=command.set()
 *  - Conditional updates use command.nin/lte/or for claim/heartbeat
 *  - Idempotency uses deterministic _id `${projectId}__${key}` for atomic
 *    reservation inside a CloudBase runTransaction
 *
 * The frozen PersistenceDependencies interface is NOT modified.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
// RF-R9-01: Import SDK public types directly so the adapter's Storage
// return types are derived from the installed @cloudbase/node-sdk package
// (not handwritten mirrors that can drift). See IDeleteFileResult /
// IGetFileUrlResult usage in CloudBaseApp interface below.
import type { IDeleteFileResult, IGetFileUrlResult } from '@cloudbase/node-sdk';
import type {
  PersistenceDependencies,
  Project,
  Asset,
  Version,
  GenerationJob,
  GenerationJobStatus,
  JobPatch,
  ProjectRepository,
  AssetRepository,
  VersionRepository,
  JobRepository,
  ObjectStore,
  UnitOfWork,
  AuthThrottleRepository,
  AuthThrottleBucket,
} from '../../domain/persistence.js';

// --- CloudBase Node SDK types (imported dynamically at runtime) -----------
//
// FIX-R3 AC-01/AC-02/AC-03: Split SDK types to reflect real CloudBase
// transaction vs non-transaction contracts.
//
// Real CloudBase behavior (verified against @cloudbase/node-sdk ^3.18.3
// types/db.d.ts + official transaction documentation):
//  - Non-transaction doc(id).get() returns IGetRes { data: any[] } (array)
//  - Transaction doc(id).get() returns { data: T | null } (single doc/null)
//  - Transaction collection does NOT support where() or count() — only
//    doc(id) operations and add() work inside runTransaction

export interface CloudBaseCommand {
  nin(values: unknown[]): unknown;
  in(values: unknown[]): unknown;
  lte(value: unknown): unknown;
  gte(value: unknown): unknown;
  gt(value: unknown): unknown;
  lt(value: unknown): unknown;
  eq(value: unknown): unknown;
  neq(value: unknown): unknown;
  or(conditions: unknown[]): unknown;
  and(conditions: unknown[]): unknown;
  set(value: unknown): unknown;
  remove(): unknown;
  exists(exists?: boolean): unknown;
  push(value: unknown): unknown;
  inc(value: number): unknown;
}

/**
 * AC-03: Transaction collection — no where(), no count().
 * Real CloudBase transactions only support doc(id) and add(). We narrow
 * the type so calling where() inside a transaction fails at compile time.
 */
interface TransactionCollectionRef {
  add(data: Record<string, unknown>): Promise<{ id: string }>;
  doc(id: string): TransactionDocRef;
}

/**
 * Non-transaction collection — supports where(), count(), doc(), add().
 */
interface DatabaseCollectionRef {
  add(data: Record<string, unknown>): Promise<{ id: string }>;
  doc(id: string): DatabaseDocRef;
  where(query: unknown): CloudBaseQuery;
  count(): Promise<{ total: number }>;
}

/**
 * AC-02: Transaction doc().get() returns { data: T | null } (single doc).
 * When the document doesn't exist, data is null — NOT an empty array.
 */
interface TransactionDocRef {
  get(): Promise<{ data: unknown | null }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  set(data: Record<string, unknown>): Promise<{ updated: number; upserted: unknown[] }>;
  remove(): Promise<{ deleted: number }>;
}

/**
 * Non-transaction doc().get() returns { data: unknown[] } (array per IGetRes).
 */
interface DatabaseDocRef {
  get(): Promise<{ data: unknown[] }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  set(data: Record<string, unknown>): Promise<{ updated: number; upserted: unknown[] }>;
  remove(): Promise<{ deleted: number }>;
}

interface CloudBaseQuery {
  get(): Promise<{ data: unknown[] }>;
  update(data: Record<string, unknown>): Promise<{ updated: number }>;
  remove(): Promise<{ deleted: number }>;
  orderBy(field: string, direction: 'asc' | 'desc'): CloudBaseQuery;
  limit(n: number): CloudBaseQuery;
}

interface CloudBaseTransaction {
  collection(name: string): TransactionCollectionRef;
  commit(): Promise<unknown>;
  rollback(reason?: unknown): Promise<unknown>;
}

/**
 * RF-R9-01: Top-level error shape returned by the SDK at runtime when the
 * CloudBase backend API returns an error.
 *
 * Source: @cloudbase/node-sdk@3.18.3 src/storage/index.ts (lines 163-174
 * for deleteFile, 231-239 for getTempFileURL):
 *   .then(res => {
 *     if (res.code) {
 *       return res  // ← raw error with top-level code/message, NO fileList
 *     }
 *     return { fileList: res.data.delete_list, requestId: res.requestId }
 *   })
 *
 * This runtime shape is NOT captured in the SDK's TypeScript type
 * declarations (IDeleteFileResult.fileList / IGetFileUrlResult.fileList
 * are declared as required). The adapter MUST handle this shape to fail
 * closed with a stable domain error instead of throwing
 * `TypeError: Cannot read properties of undefined (reading 'find')`.
 */
interface SdkStorageTopLevelError {
  // RF-R10-02: code/message are optional because the strict parser now
  // also captures null/primitive responses (which have no code/message).
  // Callers MUST use safe access (?? 'UNKNOWN') when reading these fields.
  code?: string;
  message?: string;
  requestId?: string;
}

/**
 * RF-R9-01: Adapter-level return types derived from installed SDK public types.
 *
 * - Success branch: directly uses SDK-exported `IDeleteFileResult` /
 *   `IGetFileUrlResult` (imported at top of file). Not a handwritten mirror
 *   — if the SDK types change, the adapter fails to compile.
 * - Error branch: captures the runtime top-level error shape
 *   (`SdkStorageTopLevelError`) that the SDK returns when the backend API
 *   fails but TypeScript types don't declare.
 */
type DeleteFileReturn = IDeleteFileResult | SdkStorageTopLevelError;
type GetTempFileURLReturn = IGetFileUrlResult | SdkStorageTopLevelError;

interface CloudBaseApp {
  database(): CloudBaseDatabase;
  uploadFile(opts: { cloudPath: string; fileContent: Buffer }): Promise<{ fileID: string }>;
  downloadFile(opts: { fileID: string }): Promise<{ fileContent: Buffer }>;
  // RF-R9-01: SDK-derived return types — success branch uses SDK public
  // types directly (IDeleteFileResult / IGetFileUrlResult); union with
  // SdkStorageTopLevelError captures the runtime gap where the SDK
  // returns raw `res` (top-level code/message, NO fileList) when the
  // backend API fails. The success branch IS the SDK type, not a Pick /
  // mirror, so any drift in @cloudbase/node-sdk types is caught at
  // compile time.
  deleteFile(opts: { fileList: string[] }): Promise<DeleteFileReturn>;
  getTempFileURL(opts: { fileList: string[] }): Promise<GetTempFileURLReturn>;
}

interface CloudBaseDatabase {
  collection(name: string): DatabaseCollectionRef;
  runTransaction<T = unknown>(callback: (tx: CloudBaseTransaction) => Promise<T>, times?: number): Promise<T>;
  command: CloudBaseCommand;
}

/**
 * AC-01: Unify transaction and non-transaction doc().get() return shapes.
 *
 * Real CloudBase:
 *  - Non-transaction doc(id).get() → { data: any[] } (array)
 *  - Transaction doc(id).get() → { data: T | null } (single doc or null)
 *
 * This helper normalizes both to T | null so call sites don't need to
 * know which context they're in. For the array case, it returns the first
 * element (or null if empty). For the single-doc case, it returns the
 * document (or null).
 */
function unwrapDocumentData<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as T) : null;
  }
  return data as T;
}

/**
 * RF-R10-02 (R9-TOPLEVEL-01): Strict type guard for SDK runtime responses.
 *
 * GPT FIX_REQUIRED verdict: the old guard only checked "non-null object with
 * non-array fileList" — it let null/primitive fall through to per-item success
 * path (causing TypeError) and let mixed shapes (top-level code + valid
 * fileList) enter the success branch (ignoring backend API failure).
 *
 * SDK success types (IDeleteFileResult/IGetFileUrlResult) extend IBaseResult
 * which declares ONLY `requestId?` — NO top-level `code` field. The runtime
 * top-level error shape is `{ code, message, requestId? }` with NO fileList,
 * OR a mixed shape `{ code, message, fileList }` where the top-level code
 * indicates backend API failure (the fileList in a mixed shape is NOT
 * authoritative — it may be stale/partial from the failed API call).
 *
 * Strict rules:
 *   1. null/primitive → top-level error (avoid TypeError)
 *   2. non-object → top-level error
 *   3. top-level `code` present → top-level error (backend API failure,
 *      even if fileList is also present — mixed shape)
 *   4. fileList not an array → top-level error
 *   5. otherwise (non-null object, no top-level code, fileList is array)
 *      → per-item success path
 *
 * Callers MUST use safe access (?? 'UNKNOWN') when reading code/message
 * because null/primitive responses have no such fields.
 */
function isSdkTopLevelError(res: unknown): res is SdkStorageTopLevelError {
  if (res === null || typeof res !== 'object') {
    return true; // null/primitive → top-level error (avoid TypeError)
  }
  const obj = res as { code?: unknown; fileList?: unknown };
  if ('code' in obj) {
    return true; // top-level code = backend API failure (even with fileList)
  }
  if (!Array.isArray(obj.fileList)) {
    return true; // no valid fileList → cannot enter per-item success path
  }
  return false; // non-null object, no top-level code, fileList is array → success
}

/**
 * RF-R10-02: Safely describe a top-level error response for logging.
 *
 * The type predicate `isSdkTopLevelError` narrows to `SdkStorageTopLevelError`
 * but at runtime the value may be null/primitive (which have no code/message).
 * This helper extracts a human-readable description without throwing.
 */
function describeTopLevelError(res: unknown): string {
  if (res === null) return 'code=UNKNOWN msg=null response';
  if (typeof res !== 'object') return `code=UNKNOWN msg=${String(res)}`;
  const obj = res as { code?: string; message?: string };
  return `code=${obj.code ?? 'UNKNOWN'} msg=${obj.message ?? 'no message'}`;
}

/**
 * CloudBase single-transaction operation limit.
 * Real CloudBase enforces a maximum of 100 doc operations per transaction.
 * Project deletion that exceeds this limit MUST fail closed (AC-05).
 */
const CLOUDBASE_TX_OP_LIMIT = 100;

const TERMINAL_JOB_STATUSES: GenerationJobStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
];

function isTerminalStatus(status: GenerationJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

const ACTIVE_JOB_STATUSES: GenerationJobStatus[] = [
  'queued',
  'uploading',
  'analyzing',
  'generating',
  'postprocessing',
  'saving',
];

// --- Configuration (NOSQL-R2-06: namespace + storage prefix required) ----

export interface CloudBaseNoSqlOptions {
  /** CloudBase environment ID (e.g. zeh-d7glqc07me2155c61). */
  envId: string;
  /** CloudBase Server API Key (JWT). Used as accessKey in tcb.init(). */
  apiKey: string;
  /**
   * NOSQL-R2-06: Data namespace used to prefix every collection name.
   * Production and Preview MUST use distinct values (e.g. 'prod', 'preview').
   * Empty/missing -> fail closed in validateCloudBaseNoSqlConfig.
   */
  dataNamespace: string;
  /**
   * NOSQL-R2-06: Storage prefix applied to every cloudPath.
   * Production and Preview MUST use distinct values (e.g. 'prod', 'preview').
   * Empty/missing -> fail closed in validateCloudBaseNoSqlConfig.
   */
  storagePrefix: string;
  /** Optional: signed URL TTL in seconds (default 900 = 15 min). */
  signedUrlTtlSeconds?: number;
}

export interface CloudBaseNoSqlDeps extends PersistenceDependencies {
  __brand: 'cloudbase_nosql';
  ensureReady(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Validate NoSQL configuration. Throws CLOUDBASE_CONFIG_REQUIRED if any
 * required field is missing or empty.
 *
 * NOSQL-R2-06: dataNamespace and storagePrefix are REQUIRED. This enforces
 * Preview / Production isolation — an unset namespace would default to
 * sharing Production data, which is forbidden.
 */
export function validateCloudBaseNoSqlConfig(
  options: Partial<CloudBaseNoSqlOptions>
): asserts options is CloudBaseNoSqlOptions {
  const missing: string[] = [];
  if (!options.envId) missing.push('CLOUDBASE_ENV_ID');
  if (!options.apiKey) missing.push('CLOUDBASE_API_KEY');
  if (!options.dataNamespace) missing.push('CLOUDBASE_DATA_NAMESPACE');
  if (!options.storagePrefix) missing.push('CLOUDBASE_STORAGE_PREFIX');
  if (missing.length > 0) {
    throw new Error(
      `CLOUDBASE_CONFIG_REQUIRED: missing required env vars: ${missing.join(', ')}`
    );
  }
}

// --- Collection names (NOSQL-R2-06: namespace-prefixed) -------------------

/**
 * Build the collection name map. Every collection is prefixed with
 * `${dataNamespace}_` so Preview and Production data cannot collide even
 * if they share the same CloudBase env.
 *
 * `object_metadata` is new in FIX-R2 (NOSQL-R2-04): it stores the
 * storageKey -> fileID mapping returned by CloudBase uploadFile().
 */
function makeCollections(namespace: string): Record<string, string> {
  const prefix = `${namespace}_`;
  return {
    projects: `${prefix}projects`,
    assets: `${prefix}assets`,
    versions: `${prefix}versions`,
    versionIdempotency: `${prefix}version_idempotency`,
    jobs: `${prefix}generation_jobs`,
    jobIdempotency: `${prefix}job_idempotency`,
    authThrottle: `${prefix}auth_throttle`,
    objectMetadata: `${prefix}object_metadata`,
    // FIX-R4 Workstream E: Tombstone barrier for safe project deletion.
    // A tombstone doc { _id: projectId, status: 'deleting', startedAt } is
    // written inside the delete transaction so concurrent child creates
    // (assets/versions/jobs) see it and fail with PROJECT_DELETING.
    projectTombstones: `${prefix}project_tombstones`,
    // FIX-R4 Workstream E: Cleanup keys record for post-commit Storage
    // cleanup. deleteCascade writes { _id: projectId, keys: [...] } inside
    // the transaction so a future sweeper can retry orphaned bytes if the
    // process crashes between metadata commit and object deletion.
    projectCleanupKeys: `${prefix}project_cleanup_keys`,
    // FIX-R9 H-01: Unresolved metadata-missing record. When objects.delete()
    // throws METADATA_MISSING (metadata gone, fileID unrecoverable, remote
    // state unknown), the key is written here for durable operational review.
    // These keys CANNOT be retried via the normal sweeper (no fileID), so
    // they must NOT be added to completedKeys or removed from the cleanup
    // ledger. This record preserves them for manual/COS-API reconciliation.
    projectUnresolvedMetadata: `${prefix}project_unresolved_metadata`,
  };
}

// --- JobPatch three-state builder (NOSQL-R2-02: uses db.command) ---------
//
// CloudBase `update()` accepts field-level command operators:
//   { field1: _.set(value), field2: _.remove() }
//
// Three-state semantics:
//  - field ABSENT from patch -> not included (preserve existing)
//  - field PRESENT with null  -> command.remove() (write null / remove field)
//  - field PRESENT with value -> command.set(value) (write new value)

export function buildUpdateFromPatch(
  patch: JobPatch,
  command: CloudBaseCommand
): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const keys = Object.keys(patch) as (keyof JobPatch)[];
  for (const key of keys) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null) {
      update[key as string] = command.remove();
    } else {
      update[key as string] = command.set(value);
    }
  }
  return update;
}

// --- Entity serialization (camelCase -> stored as-is, _id is primary key) -

// CloudBase document database stores JSON documents. We store entities
// as-is using their camelCase field names. The _id field is the primary key.

function toDoc<T extends { id: string }>(entity: T): Record<string, unknown> {
  const { id, ...rest } = entity;
  return { _id: id, ...rest };
}

function fromDoc<T extends { id: string }>(doc: unknown): T | null {
  if (!doc || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  const { _id, ...rest } = record;
  if (!_id) return null;
  return { id: _id as string, ...(rest as object) } as T;
}

function fromDocArray<T extends { id: string }>(docs: unknown[]): T[] {
  return docs.map((d) => fromDoc<T>(d)).filter((d): d is T => d !== null);
}

// --- Idempotency _id helper (NOSQL-R2-03: projectId-scoped uniqueness) ---
//
// The idempotency record uses a deterministic _id composed of
// `${projectId}__${idempotencyKey}`. This:
//   1. Enforces (projectId, key) scope (FIX-R1 wrongly used { key } only)
//   2. Allows atomic reservation inside a CloudBase transaction via
//      doc(id).get() + add({ _id: id, ... })
export function idempotencyDocId(projectId: string, key: string): string {
  return `${projectId}__${key}`;
}

// --- Adapter factory ------------------------------------------------------

/**
 * Create a CloudBase NoSQL-backed PersistenceDependencies bundle.
 *
 * Config is validated eagerly. The SDK is initialized lazily in ensureReady().
 */
export function createCloudBaseNoSqlPersistence(
  options: CloudBaseNoSqlOptions
): CloudBaseNoSqlDeps {
  validateCloudBaseNoSqlConfig(options);

  const COLLECTIONS = makeCollections(options.dataNamespace);
  const storagePrefix = options.storagePrefix;
  let ready = false;
  let app: CloudBaseApp | null = null;
  let db: CloudBaseDatabase | null = null;
  let command: CloudBaseCommand | null = null;

  const transactionStorage = new AsyncLocalStorage<{ tx: CloudBaseTransaction }>();

  async function ensureReady(): Promise<void> {
    if (ready) return;
    const tcbModule = await import('@cloudbase/node-sdk');
    const tcb = (tcbModule as any).default ?? tcbModule;
    if (typeof tcb?.init !== 'function') {
      throw new Error(
        'CLOUDBASE_SDK_INIT_UNAVAILABLE: the @cloudbase/node-sdk module does not expose a callable init() function'
      );
    }
    const instance = tcb.init({
      env: options.envId,
      accessKey: options.apiKey,
    });
    app = instance as unknown as CloudBaseApp;
    db = (app as unknown as { database(): CloudBaseDatabase }).database();
    command = db.command;
    ready = true;
  }

  function assertReady(): void {
    if (!ready || !db || !app || !command) {
      throw new Error('CLOUDBASE_NOT_READY: call ensureReady() before using the adapter');
    }
  }

  function getDb(): CloudBaseDatabase {
    assertReady();
    return db!;
  }

  function getApp(): CloudBaseApp {
    assertReady();
    return app!;
  }

  function getCommand(): CloudBaseCommand {
    assertReady();
    return command!;
  }

  /**
   * Get a collection reference. Inside a transaction, uses the transaction's
   * collection method so all operations are atomic. Outside, uses the db.
   *
   * FIX-R3 AC-03: The return type is a union of DatabaseCollectionRef
   * (non-transaction, has where()) and TransactionCollectionRef (transaction,
   * NO where()). This means TypeScript will REJECT any attempt to call
   * where() on the result — because TransactionCollectionRef doesn't have it.
   * Code that needs where() MUST use getDb().collection() directly to make
   * it explicit that the call is non-transactional.
   */
  function collection(name: string): DatabaseCollectionRef | TransactionCollectionRef {
    const ctx = transactionStorage.getStore();
    if (ctx) {
      return ctx.tx.collection(name);
    }
    return getDb().collection(name);
  }

  /**
   * FIX-R4 Workstream A: Transaction-aware helper.
   *
   * If the caller is already inside a unitOfWork.run() (AsyncLocalStorage
   * has an active transaction), reuse that transaction — the raw
   * runTransaction() counter does NOT increase. This fixes P0-02: nested
   * runTransaction() calls created independent transactions that escaped
   * the outer context.
   *
   * If there is no active transaction, open exactly one runTransaction()
   * and propagate it via AsyncLocalStorage so nested repo calls join it.
   */
  async function withCurrentOrNewTransaction<T>(
    fn: (tx: CloudBaseTransaction) => Promise<T>
  ): Promise<T> {
    const ctx = transactionStorage.getStore();
    if (ctx) {
      // AC-01: Reuse current transaction. raw runTransaction() count does
      // not increase.
      return fn(ctx.tx);
    }
    // AC-02: No current transaction — open exactly one.
    return getDb().runTransaction(async (tx) => {
      return transactionStorage.run({ tx }, () => fn(tx));
    });
  }

  /**
   * NOSQL-R2-06: Apply storage prefix to a cloudPath. All ObjectStore
   * operations route through this helper so Preview and Production cannot
   * read or overwrite each other's files even on the same CloudBase env.
   */
  function prefixCloudPath(key: string): string {
    return `${storagePrefix}/${key}`;
  }

  async function close(): Promise<void> {
    ready = false;
    app = null;
    db = null;
    command = null;
  }

  // --- ObjectStore helpers (NOSQL-R2-04: storageKey -> fileID) -----------
  //
  // CloudBase uploadFile returns a unique fileID (cloud://...). Subsequent
  // downloadFile / getTempFileURL / deleteFile all require that fileID, not
  // the cloudPath. We persist the mapping in `object_metadata`:
  //   { _id: storageKey, fileID: string, mimeType, sizeBytes, createdAt }
  //
  // This collection is NOT an entity table — it is internal metadata and
  // is namespaced alongside the entity collections.

  async function resolveFileId(storageKey: string): Promise<string> {
    const res = await collection(COLLECTIONS.objectMetadata).doc(storageKey).get();
    const meta = unwrapDocumentData<{ fileID?: string }>(res.data);
    if (!meta) {
      throw new Error(`OBJECT_NOT_FOUND: ${storageKey}`);
    }
    if (!meta.fileID) {
      throw new Error(`OBJECT_METADATA_CORRUPT: ${storageKey}`);
    }
    return meta.fileID;
  }

  async function saveFileMetadata(
    storageKey: string,
    fileID: string,
    mimeType: string,
    sizeBytes: number
  ): Promise<void> {
    await collection(COLLECTIONS.objectMetadata).doc(storageKey).set({
      _id: storageKey,
      fileID,
      mimeType,
      sizeBytes,
      createdAt: new Date().toISOString(),
    });
  }

  async function deleteFileMetadata(storageKey: string): Promise<void> {
    await collection(COLLECTIONS.objectMetadata).doc(storageKey).remove();
  }

  /**
   * FIX-R5: Atomic project writability check.
   *
   * Replaces the old assertProjectNotDeleting (which only checked the
   * tombstone). The new check verifies BOTH:
   *   1. The project exists (PROJECT_NOT_FOUND if not)
   *   2. The project is not being deleted (PROJECT_DELETING if tombstone exists)
   *
   * This function MUST be called inside a withCurrentOrNewTransaction
   * callback so the check and the subsequent child write are atomic.
   * Calling it outside a transaction still works but does NOT provide
   * TOCTOU protection.
   *
   * The project existence check ensures that after Phase B commits
   * (project + tombstone deleted), child creates fail closed with
   * PROJECT_NOT_FOUND instead of producing orphans.
   */
  async function assertProjectWritable(projectId: string): Promise<void> {
    const projectRes = await collection(COLLECTIONS.projects).doc(projectId).get();
    const project = unwrapDocumentData<Project>(projectRes.data);
    if (!project) {
      throw new Error(`PROJECT_NOT_FOUND: ${projectId}`);
    }
    const tombstoneRes = await collection(COLLECTIONS.projectTombstones).doc(projectId).get();
    const tombstone = unwrapDocumentData<{ status?: string }>(tombstoneRes.data);
    if (tombstone) {
      throw new Error(`PROJECT_DELETING: ${projectId}`);
    }
  }

  // --- ProjectRepository (NOSQL-R2-05: deleteCascade only deletes DB) ----

  const projects: ProjectRepository & {
    getCleanupKeys(id: string): Promise<string[]>;
    deleteCleanupKeys(id: string): Promise<void>;
    /**
     * FIX-R6 (AC-R6-01/02/03): Remove successfully-deleted keys from the
     * cleanup ledger. Failed keys remain for sweeper recovery. When the
     * ledger becomes empty, the doc is deleted entirely.
     *
     * Returns the remaining (un-cleaned) keys so the caller can decide
     * whether to retry or hand off to the sweeper.
     */
    removeCleanupKeys(id: string, removedKeys: string[]): Promise<string[]>;
    /**
     * FIX-R9 H-01 / RF-R10-04: Persist metadata-missing entries to a durable
     * unresolved record. Each entry includes both storageKey AND fileID (when
     * available) so that a durable reconciliation replayer can attempt remote
     * deletion by fileID even after object_metadata is lost.
     *
     * These entries must NOT be added to completedKeys. The record survives
     * for operational review and replay via replayUnresolvedMetadata().
     *
     * Infrastructure-internal method — NOT part of the frozen interface.
     * ProjectService uses duck-typing to check if this method exists.
     */
    markUnresolvedMetadata(
      id: string,
      entries: Array<{ storageKey: string; fileID: string | null }>
    ): Promise<void>;
    /**
     * RF-R10-04 (AC-07): Durable reconciliation reader. Returns the unresolved
     * metadata entries persisted by markUnresolvedMetadata(). Each entry
     * includes storageKey, fileID (may be null if metadata was already gone),
     * and recordedAt timestamp.
     *
     * Infrastructure-internal method — NOT part of the frozen interface.
     */
    getUnresolvedMetadata(
      id: string
    ): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>>;
    /**
     * RF-R10-04 (AC-07): Durable reconciliation replayer. Reads unresolved
     * entries and attempts to delete each remote object by fileID (bypassing
     * object_metadata lookup). Entries with null fileID are reported as
     * failed (cannot replay without fileID). Successfully-deleted entries
     * are removed from the unresolved record.
     *
     * Infrastructure-internal method — NOT part of the frozen interface.
     */
    replayUnresolvedMetadata(
      id: string
    ): Promise<{
      replayed: number;
      succeeded: string[];
      failed: Array<{ storageKey: string; error: string }>;
    }>;
  } = {
    async create(input: Project): Promise<Project> {
      assertReady();
      await collection(COLLECTIONS.projects).add(toDoc(input));
      return input;
    },

    async get(id: string): Promise<Project | null> {
      assertReady();
      const res = await collection(COLLECTIONS.projects).doc(id).get();
      return fromDoc<Project>(unwrapDocumentData(res.data));
    },

    async updatePointers(
      id: string,
      input: { activeVersionId?: string; approvedVersionId?: string }
    ): Promise<Project> {
      assertReady();
      const cmd = getCommand();
      const update: Record<string, unknown> = {};
      if (input.activeVersionId !== undefined) {
        update.activeVersionId = cmd.set(input.activeVersionId);
      }
      if (input.approvedVersionId !== undefined) {
        update.approvedVersionId = cmd.set(input.approvedVersionId);
      }
      if (Object.keys(update).length === 0) {
        const existing = await collection(COLLECTIONS.projects).doc(id).get();
        const proj = fromDoc<Project>(unwrapDocumentData(existing.data));
        if (!proj) throw new Error(`PROJECT_NOT_FOUND: ${id}`);
        return proj;
      }
      await collection(COLLECTIONS.projects).doc(id).update(update);
      const res = await collection(COLLECTIONS.projects).doc(id).get();
      const proj = fromDoc<Project>(unwrapDocumentData(res.data));
      if (!proj) throw new Error(`PROJECT_NOT_FOUND: ${id}`);
      return proj;
    },

    /**
     * FIX-R5: Two-phase cascade deletion with visible tombstone barrier.
     *
     * Phase A (independent transaction — MUST commit before Phase B):
     *  1. Write tombstone { _id: id, status: 'deleting', startedAt } to
     *     project_tombstones. If tombstone already exists (from a previous
     *     failed Phase B), that's OK — the tombstone is idempotent.
     *  2. COMMIT. The tombstone is now visible to ALL concurrent
     *     transactions. Child creates that call assertProjectWritable
     *     will see it and fail with PROJECT_DELETING.
     *
     * Phase B (same transaction as caller's unitOfWork, or new one):
     *  1. Read stable snapshot of child IDs + storage keys. The tombstone
     *     blocks new child creates, so this snapshot is stable.
     *  2. Write project_cleanup_keys doc with the storage-key snapshot.
     *  3. 100-op limit check: total ops = cleanup keys set (1) + child
     *     removes (N) + project remove (1) + tombstone remove (1) = N + 3.
     *     If > 100, throw CLOUDBASE_TX_LIMIT_EXCEEDED. The tombstone
     *     remains committed from Phase A — child creates stay blocked.
     *  4. Remove each child doc by ID, then project, then tombstone LAST.
     *
     * Recovery semantics:
     *  - If Phase A succeeds but Phase B fails, the tombstone remains
     *    committed. All child creates are blocked. A retry of deleteCascade
     *    skips Phase A (tombstone already exists) and retries Phase B.
     *  - If Phase B succeeds, project + tombstone are deleted atomically.
     *    Child creates that check project existence fail with
     *    PROJECT_NOT_FOUND (no orphan possible).
     *  - project_cleanup_keys survives Phase B for post-commit Storage
     *    cleanup and sweeper recovery.
     */
    async deleteCascade(id: string): Promise<void> {
      assertReady();

      // Step 1: Idempotent re-delete — if project doesn't exist, clean
      // up any lingering tombstone from a previous failed Phase B.
      const projectDoc = await getDb().collection(COLLECTIONS.projects).doc(id).get();
      if (!unwrapDocumentData(projectDoc.data)) {
        // Project already deleted. Remove any stale tombstone.
        await getDb().collection(COLLECTIONS.projectTombstones).doc(id).remove();
        return;
      }

      // Phase A: Commit tombstone in an INDEPENDENT transaction.
      // Uses getDb().runTransaction() DIRECTLY (not withCurrentOrNewTransaction)
      // so the tombstone commits independently of the caller's unitOfWork.
      // This is the critical fix for P1-01: the tombstone MUST be visible
      // to concurrent transactions before Phase B starts.
      await getDb().runTransaction(async (tx) => {
        // Idempotent: if tombstone already exists (from a previous
        // failed Phase B), skip the write and continue.
        const existing = await tx.collection(COLLECTIONS.projectTombstones).doc(id).get();
        if (existing.data) {
          return; // Tombstone already committed from a previous attempt.
        }
        const now = new Date().toISOString();
        await tx.collection(COLLECTIONS.projectTombstones).doc(id).set({
          _id: id,
          status: 'deleting',
          startedAt: now,
        });
      });
      // Phase A is now committed. The tombstone is visible to all.

      // Phase B: Take stable snapshot, delete children + project + tombstone.
      // Uses withCurrentOrNewTransaction (reuses caller's tx or opens new one).
      await withCurrentOrNewTransaction(async () => {
        // Read stable snapshot — child IDs and storage keys.
        // The tombstone (committed in Phase A) blocks new child creates,
        // so this snapshot is stable: no new children can appear.
        const childCollections = [
          COLLECTIONS.versionIdempotency,
          COLLECTIONS.jobs,
          COLLECTIONS.jobIdempotency,
          COLLECTIONS.versions,
          COLLECTIONS.assets,
        ];

        const idsByCollection: { collection: string; ids: string[] }[] = [];
        const storageKeys: string[] = [];
        for (const collName of childCollections) {
          const res = await getDb().collection(collName).where({ projectId: id }).get();
          const docs = res.data as { _id: string; storageKey?: string }[];
          const ids = docs.map((doc) => doc._id);
          idsByCollection.push({ collection: collName, ids });
          if (collName === COLLECTIONS.assets) {
            for (const doc of docs) {
              if (doc.storageKey) storageKeys.push(doc.storageKey);
            }
          }
        }

        // Write cleanup keys doc (survives the transaction for
        // post-commit Storage cleanup and sweeper recovery).
        //
        // FIX-R8 AC-01: Check if the ledger already exists before writing.
        // Two concurrent deleteCascade calls can both reach Phase B (both
        // see the tombstone from Phase A as idempotent). The first call's
        // Phase B commits the ledger with the stable snapshot. The second
        // call's Phase B must NOT overwrite it — the first call's snapshot
        // is authoritative because it was taken from the same tombstone-
        // barrier-protected state. If we overwrite with an empty/stale
        // snapshot, already-deleted Storage keys could be lost from the
        // ledger, breaking crash-window recovery.
        const existingLedgerRes = await collection(COLLECTIONS.projectCleanupKeys).doc(id).get();
        const existingLedger = unwrapDocumentData<{ keys: string[] }>(existingLedgerRes.data);
        if (!existingLedger) {
          const now = new Date().toISOString();
          await collection(COLLECTIONS.projectCleanupKeys).doc(id).set({
            _id: id,
            keys: storageKeys,
            createdAt: now,
          });
        }
        // If existingLedger exists, it was written by a previous/concurrent
        // Phase B commit. The transaction's OCC retry ensures we see the
        // committed state. We preserve the existing ledger and proceed with
        // child/project/tombstone removal (which are idempotent no-ops if
        // the first call already deleted them).

        // 100-op limit check.
        // Phase B total ops = cleanup keys set (1) + child removes (N)
        // + project remove (1) + tombstone remove (1) = N + 3.
        // Phase A's tombstone set (1 op) is in a separate transaction
        // and does NOT count toward Phase B's limit.
        const totalChildOps = idsByCollection.reduce((sum, { ids }) => sum + ids.length, 0);
        const totalOps = totalChildOps + 3;
        if (totalOps > CLOUDBASE_TX_OP_LIMIT) {
          throw new Error(
            `CLOUDBASE_TX_LIMIT_EXCEEDED: project ${id} requires ${totalOps} ` +
            `doc operations in Phase B, limit is ${CLOUDBASE_TX_OP_LIMIT}. ` +
            `Refusing partial deletion — fail closed. ` +
            `Tombstone remains committed; retry after reducing children.`
          );
        }

        // Remove each child doc by ID, then project, then tombstone.
        for (const { collection: collName, ids } of idsByCollection) {
          for (const docId of ids) {
            await collection(collName).doc(docId).remove();
          }
        }
        await collection(COLLECTIONS.projects).doc(id).remove();
        // Tombstone removed LAST — after this, the project is fully deleted.
        // Child creates that check project existence via
        // assertProjectWritable will fail with PROJECT_NOT_FOUND.
        await collection(COLLECTIONS.projectTombstones).doc(id).remove();
      });
    },

    /**
     * FIX-R5: Read the cleanup keys persisted by Phase B of deleteCascade.
     * Infrastructure-internal method — NOT part of the frozen
     * PersistenceDependencies interface. ProjectService uses duck-typing
     * to check if this method exists before calling it.
     */
    async getCleanupKeys(id: string): Promise<string[]> {
      assertReady();
      const res = await getDb().collection(COLLECTIONS.projectCleanupKeys).doc(id).get();
      const doc = unwrapDocumentData<{ keys: string[] }>(res.data);
      return doc?.keys ?? [];
    },

    /**
     * FIX-R5: Delete the cleanup keys doc after Storage cleanup is done.
     * Infrastructure-internal method — NOT part of the frozen interface.
     *
     * FIX-R6: Kept for backward compatibility, but ProjectService now
     * prefers removeCleanupKeys() which preserves failed keys. This
     * method unconditionally deletes the ledger and should only be used
     * when the caller is certain all Storage objects are cleaned.
     */
    async deleteCleanupKeys(id: string): Promise<void> {
      assertReady();
      await getDb().collection(COLLECTIONS.projectCleanupKeys).doc(id).remove();
    },

    /**
     * FIX-R6 (AC-R6-01/02/03): Remove successfully-deleted keys from the
     * cleanup ledger atomically. Failed keys remain in the ledger for
     * sweeper recovery.
     *
     * Lifecycle:
     *  1. Read current ledger (keys snapshot from deleteCascade Phase B).
     *  2. Compute remaining = currentKeys - removedKeys.
     *  3. If remaining is empty → delete the ledger doc entirely.
     *  4. If remaining is non-empty → update the ledger with remaining keys.
     *  5. Return remaining keys.
     *
     * Crash-window safety (AC-R6-03):
     *  - If the process crashes AFTER a Storage object is deleted but
     *    BEFORE this method is called, the ledger still contains the key.
     *    On retry, the sweeper calls objects.delete(key) which throws
     *    OBJECT_NOT_FOUND (metadata already gone). ProjectService treats
     *    OBJECT_NOT_FOUND as idempotent success and passes the key to
     *    removeCleanupKeys, which removes it from the ledger.
     *  - If the process crashes DURING this method's read-update-delete,
     *    the worst case is the ledger still contains already-deleted keys.
     *    The sweeper will re-attempt them and treat OBJECT_NOT_FOUND as
     *    success — no permanent failure.
     *
     * FIX-R8 AC-02: This method now uses runTransaction() for atomic
     * read-modify-write. Concurrent calls cannot resurrect completed keys
     * because CloudBase's OCC retries on conflict, re-reading the ledger
     * to see the latest committed state.
     */
    async removeCleanupKeys(id: string, removedKeys: string[]): Promise<string[]> {
      assertReady();
      const removedSet = new Set(removedKeys);
      // FIX-R8 AC-02: Use runTransaction for atomic read-modify-write.
      // Previously this was a non-atomic read → compute → update/remove
      // sequence. Two concurrent workers could both read the same ledger
      // snapshot, compute different "remaining" sets, and the second write
      // would resurrect keys that the first worker already cleaned.
      //
      // With runTransaction, CloudBase's OCC (optimistic concurrency control)
      // detects the conflict when the second worker tries to commit. It
      // retries the callback, which re-reads the ledger and sees the first
      // worker's changes. This prevents resurrection of completed keys.
      return getDb().runTransaction(async (tx) => {
        const res = await tx.collection(COLLECTIONS.projectCleanupKeys).doc(id).get();
        const doc = res.data as { keys: string[] } | null;
        if (!doc) {
          // Ledger already deleted — nothing to remove, already fully clean.
          return [];
        }
        const remaining = (doc.keys ?? []).filter((k) => !removedSet.has(k));
        if (remaining.length === 0) {
          // All keys cleaned — delete the ledger doc.
          await tx.collection(COLLECTIONS.projectCleanupKeys).doc(id).remove();
          return [];
        }
        // Persist remaining keys for sweeper recovery.
        const cmd = getCommand();
        await tx
          .collection(COLLECTIONS.projectCleanupKeys)
          .doc(id)
          .update({ keys: cmd.set(remaining) });
        return remaining;
      });
    },

    /**
     * FIX-R9 H-01 / RF-R10-04: Mark entries as unresolved metadata-missing.
     * Each entry includes storageKey AND fileID (when available) so the
     * durable reconciliation replayer can attempt remote deletion by fileID.
     *
     * RF-R10-03 (R9-METADATA-01): Uses runTransaction for atomic read-union-
     * write. Concurrent callers' entries are preserved via OCC retry.
     *
     * RF-R10-04 (R9-METADATA-02/AC-07): Schema changed from { keys: string[] }
     * to { entries: Array<{ storageKey, fileID, recordedAt }> } so that
     * fileID is persisted for executable recovery.
     */
    async markUnresolvedMetadata(
      id: string,
      entries: Array<{ storageKey: string; fileID: string | null }>
    ): Promise<void> {
      assertReady();
      if (entries.length === 0) return;
      const now = new Date().toISOString();
      const newEntries = entries.map((e) => ({
        storageKey: e.storageKey,
        fileID: e.fileID,
        recordedAt: now,
      }));
      // RF-R10-03: Use runTransaction for atomic read-union-write.
      // Concurrent callers' entries are preserved via OCC retry.
      await getDb().runTransaction(async (tx) => {
        const res = await tx.collection(COLLECTIONS.projectUnresolvedMetadata).doc(id).get();
        const doc = res.data as { entries?: Array<{ storageKey: string; fileID: string | null; recordedAt: string }> } | null;
        const existingEntries = doc?.entries ?? [];
        // Union by storageKey: merge existing + new entries. If a storageKey
        // already exists, prefer the entry with a non-null fileID.
        const byKey = new Map<string, { storageKey: string; fileID: string | null; recordedAt: string }>();
        for (const e of existingEntries) {
          byKey.set(e.storageKey, e);
        }
        for (const e of newEntries) {
          const existing = byKey.get(e.storageKey);
          if (!existing) {
            byKey.set(e.storageKey, e);
          } else if (existing.fileID === null && e.fileID !== null) {
            // Upgrade: replace null fileID with a known fileID.
            byKey.set(e.storageKey, e);
          }
        }
        await tx.collection(COLLECTIONS.projectUnresolvedMetadata).doc(id).set({
          entries: [...byKey.values()],
        });
      });
    },

    /**
     * RF-R10-04 (AC-07): Durable reconciliation reader.
     * Returns the unresolved metadata entries persisted by markUnresolvedMetadata().
     */
    async getUnresolvedMetadata(
      id: string
    ): Promise<Array<{ storageKey: string; fileID: string | null; recordedAt: string }>> {
      assertReady();
      const res = await getDb().collection(COLLECTIONS.projectUnresolvedMetadata).doc(id).get();
      const doc = unwrapDocumentData<{
        entries?: Array<{ storageKey: string; fileID: string | null; recordedAt: string }>;
      }>(res.data);
      return doc?.entries ?? [];
    },

    /**
     * RF-R10-04 (AC-07): Durable reconciliation replayer.
     * Reads unresolved entries and attempts to delete each remote object by
     * fileID (bypassing object_metadata lookup). Entries with null fileID
     * are reported as failed. Successfully-deleted entries are removed from
     * the unresolved record.
     */
    async replayUnresolvedMetadata(
      id: string
    ): Promise<{
      replayed: number;
      succeeded: string[];
      failed: Array<{ storageKey: string; error: string }>;
    }> {
      assertReady();
      const entries = await this.getUnresolvedMetadata(id);
      if (entries.length === 0) {
        return { replayed: 0, succeeded: [], failed: [] };
      }
      const succeeded: string[] = [];
      const failed: Array<{ storageKey: string; error: string }> = [];
      for (const entry of entries) {
        if (entry.fileID === null) {
          failed.push({
            storageKey: entry.storageKey,
            error: 'FILEID_MISSING: cannot replay without fileID (metadata was already gone when recorded)',
          });
          continue;
        }
        try {
          const res = await getApp().deleteFile({ fileList: [entry.fileID] });
          if (isSdkTopLevelError(res)) {
            failed.push({
              storageKey: entry.storageKey,
              error: `STORAGE_TOPLEVEL_ERROR: ${describeTopLevelError(res)}`,
            });
            continue;
          }
          const item = res.fileList.find((f) => f.fileID === entry.fileID);
          if (!item) {
            failed.push({
              storageKey: entry.storageKey,
              error: `OBJECT_DELETE_PARTIAL: no matching result from SDK`,
            });
            continue;
          }
          if (item.code !== 'SUCCESS') {
            failed.push({
              storageKey: entry.storageKey,
              error: `OBJECT_DELETE_PARTIAL: code=${item.code}`,
            });
            continue;
          }
          // Success — try to delete object_metadata too (best-effort).
          try {
            await deleteFileMetadata(entry.storageKey);
          } catch {
            // Metadata may already be gone — that's OK, the remote object
            // was confirmed deleted by the SDK SUCCESS code.
          }
          succeeded.push(entry.storageKey);
        } catch (err) {
          failed.push({
            storageKey: entry.storageKey,
            error: (err as Error).message ?? 'UNKNOWN_ERROR',
          });
        }
      }
      // Remove succeeded entries from the unresolved record.
      if (succeeded.length > 0) {
        const succeededSet = new Set(succeeded);
        const remaining = entries.filter((e) => !succeededSet.has(e.storageKey));
        const coll = getDb().collection(COLLECTIONS.projectUnresolvedMetadata);
        if (remaining.length === 0) {
          await coll.doc(id).remove();
        } else {
          await coll.doc(id).set({ entries: remaining });
        }
      }
      return { replayed: entries.length, succeeded, failed };
    },
  };

  // --- AssetRepository ----------------------------------------------------

  const assets: AssetRepository = {
    async create(input: Asset): Promise<Asset> {
      assertReady();
      // FIX-R5: Atomic check + write in same transaction. The project
      // existence + tombstone check and the asset write MUST be in the
      // same transaction to prevent TOCTOU (check-then-write race).
      return withCurrentOrNewTransaction(async () => {
        await assertProjectWritable(input.projectId);
        await collection(COLLECTIONS.assets).add(toDoc(input));
        return input;
      });
    },

    async get(id: string): Promise<Asset | null> {
      assertReady();
      const res = await collection(COLLECTIONS.assets).doc(id).get();
      return fromDoc<Asset>(unwrapDocumentData(res.data));
    },

    async listByProject(projectId: string): Promise<Asset[]> {
      assertReady();
      const res = await getDb().collection(COLLECTIONS.assets).where({ projectId }).get();
      return fromDocArray<Asset>(res.data);
    },
  };

  // --- VersionRepository --------------------------------------------------

  const versions: VersionRepository = {
    async create(input: Version): Promise<Version> {
      assertReady();
      // FIX-R5: Atomic check + write in same transaction.
      return withCurrentOrNewTransaction(async () => {
        await assertProjectWritable(input.projectId);
        await collection(COLLECTIONS.versions).add(toDoc(input));
        return input;
      });
    },

    async createIdempotent(
      projectId: string,
      idempotencyKey: string,
      version: Version
    ): Promise<Version> {
      assertReady();
      const idemId = idempotencyDocId(projectId, idempotencyKey);
      // Fast path: check if idempotency record already exists.
      // AC-01: unwrapDocumentData handles both array (non-tx) and single-doc
      // (tx) return shapes.
      const existing = await collection(COLLECTIONS.versionIdempotency).doc(idemId).get();
      const existingDoc = unwrapDocumentData<{ versionId: string }>(existing.data);
      if (existingDoc) {
        const existingVersion = await collection(COLLECTIONS.versions)
          .doc(existingDoc.versionId)
          .get();
        const v = fromDoc<Version>(unwrapDocumentData(existingVersion.data));
        if (v) return v;
      }
      // FIX-R4 Workstream C: Use withCurrentOrNewTransaction instead of
      // unconditional getDb().runTransaction(). This fixes P0-02: when called
      // inside unitOfWork.run(), the inner transaction now joins the outer
      // transaction instead of creating an independent nested one.
      try {
        const result = await withCurrentOrNewTransaction(async (tx) => {
          // AC-02: Transaction doc().get() returns { data: T | null }.
          // Re-check inside transaction to guard against concurrent inserts.
          const recheck = await tx.collection(COLLECTIONS.versionIdempotency).doc(idemId).get();
          if (recheck.data) {
            // Another caller won; return the existing version.
            const recheckDoc = recheck.data as { versionId: string };
            const existingVersion = await tx.collection(COLLECTIONS.versions)
              .doc(recheckDoc.versionId)
              .get();
            const v = fromDoc<Version>(unwrapDocumentData(existingVersion.data));
            if (v) return v;
            // FIX-R8-CLOSURE: The idempotency record exists but the
            // referenced version document is missing. This indicates a
            // data inconsistency (partial cleanup, corruption, or bug).
            // Previously this returned the caller's UNPERSISTED input
            // version — a silent fail-open that could cascade into
            // referencing a non-existent version. Now we throw an
            // explicit error so the inconsistency surfaces.
            throw new Error(
              `IDEMPOTENT_VERSION_INCONSISTENT_STATE: idempotency record ${idemId} ` +
              `references version ${recheckDoc.versionId} but the version document is missing. ` +
              `Possible data inconsistency — manual investigation required.`
            );
          }
          // FIX-R5: Atomic project writability check inside the
          // transaction — prevents TOCTOU race.
          await assertProjectWritable(projectId);
          await tx.collection(COLLECTIONS.versions).add(toDoc(version));
          await tx.collection(COLLECTIONS.versionIdempotency).add({
            _id: idemId,
            projectId,
            key: idempotencyKey,
            versionId: version.id,
            createdAt: new Date().toISOString(),
          });
          return version;
        });
        return result;
      } catch (e) {
        const msg = (e as Error).message || '';
        if (msg.includes('E11000') || msg.includes('duplicate key')) {
          // FIX-R4 Workstream C: Re-read only in the non-transaction path.
          // In the transaction path, let the outer transaction fail so it
          // can be retried as a unit — re-reading here would escape the
          // failing transaction's context.
          const ctx = transactionStorage.getStore();
          if (!ctx) {
            const retry = await collection(COLLECTIONS.versionIdempotency).doc(idemId).get();
            const retryDoc = unwrapDocumentData<{ versionId: string }>(retry.data);
            if (retryDoc) {
              const existingVersion = await collection(COLLECTIONS.versions)
                .doc(retryDoc.versionId)
                .get();
              const v = fromDoc<Version>(unwrapDocumentData(existingVersion.data));
              if (v) return v;
            }
          }
        }
        throw e;
      }
    },

    async get(id: string): Promise<Version | null> {
      assertReady();
      const res = await collection(COLLECTIONS.versions).doc(id).get();
      return fromDoc<Version>(unwrapDocumentData(res.data));
    },

    async listByProject(projectId: string): Promise<Version[]> {
      assertReady();
      const res = await getDb().collection(COLLECTIONS.versions)
        .where({ projectId })
        .orderBy('createdAt', 'asc')
        .get();
      return fromDocArray<Version>(res.data);
    },
  };

  // --- JobRepository (NOSQL-R2-03: atomic Job + idempotency creation) ----

  const jobs: JobRepository = {
    async create(input: GenerationJob): Promise<GenerationJob> {
      assertReady();
      // FIX-R5: When idempotencyKey is present, createIdempotent
      // handles the atomic project check inside its transaction.
      if (input.idempotencyKey) {
        const result = await jobs.createIdempotent(input);
        return result.job;
      }
      // FIX-R5: Atomic check + write for non-idempotent jobs.
      return withCurrentOrNewTransaction(async () => {
        await assertProjectWritable(input.projectId);
        await collection(COLLECTIONS.jobs).add(toDoc(input));
        return input;
      });
    },

    /**
     * NOSQL-R2-03: Atomic Job + idempotency creation.
     *
     * FIX-R1 created the Job first and the idempotency record second; if the
     * second write failed (E11000), the first Job was orphaned. R2 wraps both
     * writes in a CloudBase runTransaction with a deterministic idempotency
     * _id = `${projectId}__${key}` so:
     *   - Transaction commit -> both Job and idempotency exist (no orphans)
     *   - Transaction abort (E11000 on the idempotency add) -> both rolled
     *     back, no orphan Job is left behind
     *
     * Query scope is now `(projectId, key)` (FIX-R1 used `{ key }` only,
     * which let different projects collide on the same key).
     *
     * FIX-R4 Workstream C: Uses withCurrentOrNewTransaction instead of
     * unconditional getDb().runTransaction(). This fixes P0-02: when called
     * inside unitOfWork.run(), the inner transaction now joins the outer
     * transaction instead of creating an independent nested one.
     */
    async createIdempotent(input: GenerationJob): Promise<{ job: GenerationJob; created: boolean }> {
      assertReady();
      if (!input.idempotencyKey) {
        await collection(COLLECTIONS.jobs).add(toDoc(input));
        return { job: input, created: true };
      }
      const idemId = idempotencyDocId(input.projectId, input.idempotencyKey);

      // Fast path: check if idempotency record already exists.
      // AC-01: unwrapDocumentData handles both array (non-tx) and single-doc
      // (tx) return shapes.
      const existing = await collection(COLLECTIONS.jobIdempotency).doc(idemId).get();
      const existingDoc = unwrapDocumentData<{ jobId: string }>(existing.data);
      if (existingDoc) {
        const existingJob = await collection(COLLECTIONS.jobs)
          .doc(existingDoc.jobId)
          .get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(existingJob.data));
        if (j) return { job: j, created: false };
      }

      // FIX-R4 Workstream C: Atomic creation via withCurrentOrNewTransaction.
      try {
        const result = await withCurrentOrNewTransaction(async (tx) => {
          // AC-02: Transaction doc().get() returns { data: T | null }.
          // Re-check inside transaction to guard against concurrent inserts.
          const recheck = await tx.collection(COLLECTIONS.jobIdempotency).doc(idemId).get();
          if (recheck.data) {
            const recheckDoc = recheck.data as { jobId: string };
            const existingJob = await tx.collection(COLLECTIONS.jobs)
              .doc(recheckDoc.jobId)
              .get();
            const j = fromDoc<GenerationJob>(unwrapDocumentData(existingJob.data));
            if (j) return { job: j, created: false };
            return null; // fall through to retry path below
          }
          // Create Job + idempotency atomically.
          // FIX-R5: Atomic project writability check inside the
          // transaction — prevents TOCTOU race.
          await assertProjectWritable(input.projectId);
          await tx.collection(COLLECTIONS.jobs).add(toDoc(input));
          await tx.collection(COLLECTIONS.jobIdempotency).add({
            _id: idemId,
            projectId: input.projectId,
            key: input.idempotencyKey,
            jobId: input.id,
            createdAt: new Date().toISOString(),
          });
          return { job: input, created: true };
        });
        if (result) return result;
        // result is null -> another caller won; fall through to re-read
      } catch (e) {
        const msg = (e as Error).message || '';
        const isDupKey = msg.includes('E11000') || msg.includes('duplicate key');
        if (!isDupKey) throw e;
        // FIX-R4 Workstream C: In the transaction path, let the outer
        // transaction fail so it can be retried as a unit. In the non-tx
        // path, fall through to re-read the winner.
        if (transactionStorage.getStore()) throw e;
        // Non-tx path: fall through to re-read below
      }
      // E11000 (non-tx) or transaction returned null -> another caller won.
      const retry = await collection(COLLECTIONS.jobIdempotency).doc(idemId).get();
      const retryDoc = unwrapDocumentData<{ jobId: string }>(retry.data);
      if (retryDoc) {
        const existingJob = await collection(COLLECTIONS.jobs)
          .doc(retryDoc.jobId)
          .get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(existingJob.data));
        if (j) return { job: j, created: false };
      }
      throw new Error(`IDEMPOTENCY_RESOLVE_FAILED: ${idemId}`);
    },

    async get(id: string): Promise<GenerationJob | null> {
      assertReady();
      const res = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(unwrapDocumentData(res.data));
    },

    async update(id: string, patch: JobPatch): Promise<GenerationJob> {
      assertReady();
      const cmd = getCommand();
      const update = buildUpdateFromPatch(patch, cmd);
      if (Object.keys(update).length > 0) {
        const res = await collection(COLLECTIONS.jobs).doc(id).update(update);
        if (res.updated === 0) throw new Error(`JOB_NOT_FOUND: ${id}`);
      }
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      const j = fromDoc<GenerationJob>(unwrapDocumentData(doc.data));
      if (!j) throw new Error(`JOB_NOT_FOUND: ${id}`);
      return j;
    },

    /**
     * NOSQL-R2-02: Conditional update using db.command. Uses the db-level
     * collection (not transaction) so the conditional update itself is the
     * atomic unit — the where().update() call is a single CloudBase op.
     *
     * FIX-R4 Workstream B: When inside a transaction, where().update() is
     * NOT available (transaction collections only support doc(id) ops).
     * Instead, read the doc, check conditions in memory, then update via
     * doc(id).update(). This fixes P0-01: the old where().update() escaped
     * the AsyncLocalStorage transaction context.
     */
    async updateIfClaimed(id: string, leaseToken: string, patch: JobPatch): Promise<GenerationJob | null> {
      assertReady();
      const cmd = getCommand();
      const update = buildUpdateFromPatch(patch, cmd);
      const ctx = transactionStorage.getStore();
      if (ctx) {
        // Transaction-aware path: read, check in memory, write via doc(id).
        const res = await ctx.tx.collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(res.data));
        if (!j) return null;
        if (j.leaseToken !== leaseToken || isTerminalStatus(j.status)) return null;
        if (Object.keys(update).length > 0) {
          await ctx.tx.collection(COLLECTIONS.jobs).doc(id).update(update);
          const updated = await ctx.tx.collection(COLLECTIONS.jobs).doc(id).get();
          return fromDoc<GenerationJob>(unwrapDocumentData(updated.data));
        }
        return j;
      }
      // Non-transaction path: atomic conditional update via where().update()
      if (Object.keys(update).length === 0) {
        const doc = await collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(doc.data));
        if (!j) return null;
        if (j.leaseToken !== leaseToken || isTerminalStatus(j.status)) return null;
        return j;
      }
      const query = cmd.and([
        { _id: id },
        { leaseToken: cmd.eq(leaseToken) },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
      ]);
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated === 0) return null;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(unwrapDocumentData(doc.data));
    },

    /**
     * NOSQL-R2-02: Conditional update using db.command.
     *
     * FIX-R4 Workstream B: Transaction-aware path added (see updateIfClaimed).
     */
    async updateIfActive(id: string, patch: JobPatch): Promise<GenerationJob | null> {
      assertReady();
      const cmd = getCommand();
      const update = buildUpdateFromPatch(patch, cmd);
      const ctx = transactionStorage.getStore();
      if (ctx) {
        // Transaction-aware path: read, check in memory, write via doc(id).
        const res = await ctx.tx.collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(res.data));
        if (!j) return null;
        if (isTerminalStatus(j.status)) return null;
        if (Object.keys(update).length > 0) {
          await ctx.tx.collection(COLLECTIONS.jobs).doc(id).update(update);
          const updated = await ctx.tx.collection(COLLECTIONS.jobs).doc(id).get();
          return fromDoc<GenerationJob>(unwrapDocumentData(updated.data));
        }
        return j;
      }
      // Non-transaction path: atomic conditional update via where().update()
      if (Object.keys(update).length === 0) {
        const doc = await collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(doc.data));
        if (!j) return null;
        if (isTerminalStatus(j.status)) return null;
        return j;
      }
      const query = cmd.and([
        { _id: id },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
      ]);
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated === 0) return null;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      return fromDoc<GenerationJob>(unwrapDocumentData(doc.data));
    },

    /**
     * NOSQL-R2-02: Atomic lease claim using db.command.
     *
     * Claim succeeds when:
     *   - status is non-terminal
     *   - AND (leaseToken is null) OR (leaseToken matches) OR (lease expired)
     *
     * `cmd.or` builds the disjunction; `cmd.and` combines with the status
     * guard. A single where().update() is the atomic claim unit.
     *
     * FIX-R4 Workstream B: Transaction-aware path added. Inside a tx,
     * where().update() is unavailable, so we read the doc, evaluate the
     * claim conditions in memory, and update via doc(id).update().
     */
    async claim(
      id: string,
      input: { workerId: string; leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const cmd = getCommand();
      const ctx = transactionStorage.getStore();
      if (ctx) {
        // Transaction-aware path
        const res = await ctx.tx.collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(res.data));
        if (!j) throw new Error(`JOB_NOT_FOUND: ${id}`);
        if (isTerminalStatus(j.status)) return false;
        // Replicate cmd.or([eq(null), eq(input.leaseToken), lte(now)]) in memory.
        // cmd.eq(null) matches value === null (not undefined).
        // cmd.lte(now) on leaseExpiresAt: undefined/null -> expired (compareValues returns -1).
        const tokenAvailable = j.leaseToken === null;
        const tokenMatches = j.leaseToken === input.leaseToken;
        const leaseExpired = j.leaseExpiresAt === null || j.leaseExpiresAt === undefined
          || j.leaseExpiresAt <= input.now;
        if (!tokenAvailable && !tokenMatches && !leaseExpired) return false;
        const update = {
          workerId: cmd.set(input.workerId),
          leaseToken: cmd.set(input.leaseToken),
          leaseExpiresAt: cmd.set(input.leaseExpiresAt),
          updatedAt: cmd.set(new Date().toISOString()),
        };
        await ctx.tx.collection(COLLECTIONS.jobs).doc(id).update(update);
        return true;
      }
      // Non-transaction path: atomic conditional update via where().update()
      const query = cmd.and([
        { _id: id },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
        cmd.or([
          { leaseToken: cmd.eq(null) },
          { leaseToken: cmd.eq(input.leaseToken) },
          { leaseExpiresAt: cmd.lte(input.now) },
        ]),
      ]);
      const update = {
        workerId: cmd.set(input.workerId),
        leaseToken: cmd.set(input.leaseToken),
        leaseExpiresAt: cmd.set(input.leaseExpiresAt),
        updatedAt: cmd.set(new Date().toISOString()),
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      if (res.updated > 0) return true;
      const doc = await collection(COLLECTIONS.jobs).doc(id).get();
      const j = unwrapDocumentData<GenerationJob>(doc.data);
      if (!j) throw new Error(`JOB_NOT_FOUND: ${id}`);
      return false;
    },

    /**
     * NOSQL-R2-02: Lease heartbeat using db.command.
     *
     * FIX-R4 Workstream B: Transaction-aware path added.
     */
    async heartbeat(
      id: string,
      input: { leaseToken: string; leaseExpiresAt: string; now: string }
    ): Promise<boolean> {
      assertReady();
      const cmd = getCommand();
      const ctx = transactionStorage.getStore();
      if (ctx) {
        // Transaction-aware path
        const res = await ctx.tx.collection(COLLECTIONS.jobs).doc(id).get();
        const j = fromDoc<GenerationJob>(unwrapDocumentData(res.data));
        if (!j) return false;
        if (isTerminalStatus(j.status)) return false;
        if (j.leaseToken !== input.leaseToken) return false;
        const update = {
          leaseExpiresAt: cmd.set(input.leaseExpiresAt),
          updatedAt: cmd.set(new Date().toISOString()),
        };
        await ctx.tx.collection(COLLECTIONS.jobs).doc(id).update(update);
        return true;
      }
      // Non-transaction path: atomic conditional update via where().update()
      const query = cmd.and([
        { _id: id },
        { leaseToken: cmd.eq(input.leaseToken) },
        { status: cmd.nin(TERMINAL_JOB_STATUSES) },
      ]);
      const update = {
        leaseExpiresAt: cmd.set(input.leaseExpiresAt),
        updatedAt: cmd.set(new Date().toISOString()),
      };
      const res = await getDb().collection(COLLECTIONS.jobs).where(query).update(update);
      return res.updated > 0;
    },

    /**
     * NOSQL-R2-02: Active jobs query using db.command.
     */
    async listActiveByProject(projectId: string): Promise<GenerationJob[]> {
      assertReady();
      const cmd = getCommand();
      const res = await getDb().collection(COLLECTIONS.jobs)
        .where({
          projectId,
          status: cmd.in(ACTIVE_JOB_STATUSES),
        })
        .get();
      return fromDocArray<GenerationJob>(res.data);
    },

    /**
     * NOSQL-R2-02: Lease-expired recovery query using db.command.
     */
    async listLeaseExpired(now: string): Promise<GenerationJob[]> {
      assertReady();
      const cmd = getCommand();
      const res = await getDb().collection(COLLECTIONS.jobs)
        .where(
          cmd.and([
            { status: cmd.in(ACTIVE_JOB_STATUSES) },
            cmd.or([
              { leaseToken: cmd.eq(null) },
              { leaseExpiresAt: cmd.lte(now) },
            ]),
          ])
        )
        .get();
      return fromDocArray<GenerationJob>(res.data);
    },
  };

  // --- ObjectStore (NOSQL-R2-04: persist fileID) -------------------------

  const objects: ObjectStore & {
    /**
     * RF-R10-04 (R9-METADATA-02/AC-07): Look up fileID by storageKey WITHOUT
     * deleting the object. Returns null if metadata is missing (object_metadata
     * gone). Used by ProjectService.deleteProject to capture fileID before
     * attempting delete, so that METADATA_MISSING entries can include the
     * fileID for durable reconciliation.
     *
     * Infrastructure-internal method — NOT part of the frozen ObjectStore
     * interface. ProjectService uses duck-typing.
     */
    getFileId?(key: string): Promise<string | null>;
  } = {
    /**
     * FIX-R4 Workstream G (P1-02): Upload to CloudBase Storage and persist
     * the returned fileID to `object_metadata`. If the metadata write fails,
     * attempt a compensating delete of the uploaded object to avoid
     * orphaned bytes.
     *
     * Error codes:
     *  - OBJECT_UPLOAD_FAILED: upload threw; no metadata written.
     *  - OBJECT_METADATA_FAILED_CLEANED: metadata failed, compensation
     *    succeeded (orphaned object deleted). Re-throw the original error.
     *  - OBJECT_METADATA_AND_COMPENSATION_FAILED: both metadata and
     *    compensation failed. The fileID is included for retry.
     */
    async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
      assertReady();
      const cloudPath = prefixCloudPath(key);
      let fileID: string;
      try {
        const uploadRes = await getApp().uploadFile({
          cloudPath,
          fileContent: Buffer.from(bytes),
        });
        fileID = uploadRes.fileID;
      } catch (e) {
        throw new Error(`OBJECT_UPLOAD_FAILED: ${key}: ${(e as Error).message}`);
      }
      // Metadata write — if it fails, try to compensate by deleting the
      // uploaded object so no orphaned bytes remain.
      try {
        await saveFileMetadata(key, fileID, mimeType, bytes.byteLength);
      } catch (metaErr) {
        // Compensating delete: try to remove the orphaned object.
        try {
          const compRes = await getApp().deleteFile({ fileList: [fileID] });
          // RF-R9-02: Handle SDK runtime top-level error shape.
          // When the backend API fails, the SDK returns { code, message }
          // with NO fileList. Fail closed with a stable domain error.
          if (isSdkTopLevelError(compRes)) {
            throw new Error(
              `COMPENSATION_DELETE_FAILED: STORAGE_TOPLEVEL_ERROR ${describeTopLevelError(compRes)}`
            );
          }
          // FIX-R9 C-01: SDK returns string code "SUCCESS" on success.
          // Only accept the result matching the requested fileID.
          const compItem = compRes.fileList.find((f) => f.fileID === fileID);
          if (!compItem || compItem.code !== 'SUCCESS') {
            // RF-R10-01: No free-text statusMessage判定 — code !== 'SUCCESS'
            // is failure. SDK type declares ONLY { code, fileID }.
            throw new Error(
              `COMPENSATION_DELETE_FAILED: code=${compItem?.code ?? 'NO_RESULT'}`
            );
          }
          // Compensation succeeded — throw the original metadata error.
          throw new Error(
            `OBJECT_METADATA_FAILED_CLEANED: ${key}: fileID=${fileID}: ${(metaErr as Error).message}`
          );
        } catch (compensateErr) {
          // If compensation itself threw OBJECT_METADATA_FAILED_CLEANED,
          // re-throw that (it was our own throw above).
          if (compensateErr instanceof Error && compensateErr.message.startsWith('OBJECT_METADATA_FAILED_CLEANED')) {
            throw compensateErr;
          }
          // Compensation ALSO failed — throw with both contexts and the
          // fileID so it can be retried by a sweeper.
          throw new Error(
            `OBJECT_METADATA_AND_COMPENSATION_FAILED: ${key}: fileID=${fileID}: ` +
            `metaError=${(metaErr as Error).message}; compensateError=${(compensateErr as Error).message}`
          );
        }
      }
    },

    async get(key: string): Promise<Uint8Array> {
      assertReady();
      const fileID = await resolveFileId(key);
      const res = await getApp().downloadFile({ fileID });
      return new Uint8Array(res.fileContent);
    },

    /**
     * FIX-R4 Workstream G (P1-02): Fetch a signed URL. Checks SDK status
     * codes and throws SIGNED_URL_FAILED / SIGNED_URL_EMPTY on error.
     * Does NOT persist signed URLs — they are short-lived.
     */
    async getSignedUrl(key: string): Promise<string> {
      assertReady();
      const fileID = await resolveFileId(key);
      const res = await getApp().getTempFileURL({
        fileList: [fileID],
      });
      // RF-R9-02: Handle SDK runtime top-level error shape.
      // When the backend API fails, the SDK returns { code, message } with
      // NO fileList. Fail closed with a stable domain error instead of
      // throwing TypeError from undefined.fileList. The message content
      // does NOT affect fail-closed behavior.
      if (isSdkTopLevelError(res)) {
        throw new Error(
          `STORAGE_TOPLEVEL_ERROR: ${key}: fileID=${fileID}: ${describeTopLevelError(res)}`
        );
      }
      // FIX-R9 C-01: SDK returns string code "SUCCESS". Only accept the
      // result matching the requested fileID; reject unknown codes.
      const item = res.fileList.find((f) => f.fileID === fileID);
      if (!item) {
        throw new Error(`OBJECT_NOT_FOUND: ${key}: fileID=${fileID}: no matching result from SDK`);
      }
      if (item.code !== 'SUCCESS') {
        throw new Error(`SIGNED_URL_FAILED: ${key}: fileID=${fileID}: code=${item.code}`);
      }
      if (!item.tempFileURL) {
        throw new Error(`SIGNED_URL_EMPTY: ${key}: fileID=${fileID}`);
      }
      return item.tempFileURL;
    },

    /**
     * FIX-R4 Workstream G (P1-02): Delete the remote object first. Only
     * delete metadata if the remote delete succeeded (or the object was
     * already gone). This preserves metadata for retry if the remote
     * delete fails — a sweeper can re-attempt using the stored fileID.
     *
     * FIX-R8 AC-03: When metadata is missing (resolveFileId throws
     * OBJECT_NOT_FOUND), we CANNOT confirm the remote object is deleted.
     * The metadata might be missing because:
     *  (a) A previous successful delete() cleaned both remote + metadata
     *      (crash-window — remote IS gone, but we can't confirm)
     *  (b) Metadata was never written (remote might still exist)
     *  (c) Metadata was lost/corrupted (remote state unknown)
     * We re-throw as METADATA_MISSING so the caller can distinguish
     * "metadata missing, remote unconfirmed" from "SDK confirmed remote
     * object not found." The caller (ProjectService) treats METADATA_MISSING
     * as probable success for crash-window recovery, but explicitly logs
     * that remote deletion is NOT confirmed.
     */
    async delete(key: string): Promise<void> {
      assertReady();
      let fileID: string;
      try {
        fileID = await resolveFileId(key);
      } catch (e) {
        const msg = (e as Error).message ?? '';
        if (msg.includes('OBJECT_NOT_FOUND')) {
          // AC-03: Metadata missing — cannot confirm remote deletion.
          // Re-throw as METADATA_MISSING so the caller can distinguish.
          throw new Error(
            `METADATA_MISSING: ${key}: cannot confirm remote deletion (metadata not found)`
          );
        }
        throw e;
      }
      const res = await getApp().deleteFile({ fileList: [fileID] });
      // RF-R9-02: Handle SDK runtime top-level error shape.
      // When the backend API fails, the SDK returns { code, message } with
      // NO fileList. Fail closed with a stable domain error instead of
      // throwing TypeError from undefined.fileList. Metadata is preserved
      // for retry. The message content does NOT affect fail-closed behavior.
      if (isSdkTopLevelError(res)) {
        throw new Error(
          `STORAGE_TOPLEVEL_ERROR: ${key}: fileID=${fileID}: ${describeTopLevelError(res)}`
        );
      }
      // FIX-R9 C-01: SDK returns string code "SUCCESS" on success.
      // Only accept the result matching the requested fileID. If the
      // result is missing or code != "SUCCESS", do NOT delete metadata —
      // preserve for retry.
      const item = res.fileList.find((f) => f.fileID === fileID);
      if (!item) {
        throw new Error(
          `OBJECT_DELETE_PARTIAL: ${key}: fileID=${fileID}: no matching result from SDK`
        );
      }
      if (item.code !== 'SUCCESS') {
        // RF-R10-01 (R9-STORAGE-01): Do NOT use free-text statusMessage
        // to infer "not found". SDK type IDeleteFileResult.fileList[number]
        // declares ONLY { code, fileID } — no statusMessage, no documented
        // per-item not-found code. Any code !== 'SUCCESS' is a failure.
        // Metadata + ledger are preserved for retry. GPT FIX_REQUIRED:
        // "无法权威确认 absent 时必须保留 metadata 和 ledger。
        //  不要以自由文本决定清理所有权。"
        throw new Error(
          `OBJECT_DELETE_PARTIAL: ${key}: fileID=${fileID}: code=${item.code}`
        );
      }
      // Remote delete succeeded — now delete metadata.
      await deleteFileMetadata(key);
    },

    /**
     * FIX-R4 Workstream G (P1-02): Distinguish three states:
     *  - metadata missing → false (don't check remote; no fileID to check)
     *  - metadata exists, remote object exists → true
     *  - metadata exists, remote object missing → false (log diagnostic)
     *
     * FIX-R8 AC-03: When metadata is missing, we log a distinct diagnostic
     * (METADATA_MISSING) to make it clear that the false return is NOT a
     * confirmed remote deletion — it means we cannot determine the remote
     * object's state because we have no fileID to check.
     */
    async exists(key: string): Promise<boolean> {
      assertReady();
      let fileID: string;
      try {
        fileID = await resolveFileId(key);
      } catch (e) {
        // AC-03: Metadata missing — cannot confirm remote object state.
        // Return false but log distinctly so callers understand this is
        // NOT "confirmed remote deletion" — it's "unknown, no metadata."
        const msg = (e as Error).message ?? '';
        if (msg.includes('OBJECT_NOT_FOUND')) {
          console.warn(
            `[objects.exists] METADATA_MISSING: key=${key}: cannot determine remote object state (metadata not found, remote NOT confirmed deleted)`
          );
        }
        return false;
      }
      // metadata exists — verify remote object actually exists
      try {
        const res = await getApp().getTempFileURL({ fileList: [fileID] });
        // RF-R9-02: Handle SDK runtime top-level error shape.
        // When the backend API fails, the SDK returns { code, message } with
        // NO fileList. Fail closed (return false) instead of throwing
        // TypeError. Metadata is preserved. The message content does NOT
        // affect fail-closed behavior.
        if (isSdkTopLevelError(res)) {
          console.warn(
            `[objects.exists] STORAGE_TOPLEVEL_ERROR: key=${key} fileID=${fileID} ${describeTopLevelError(res)}`
          );
          return false;
        }
        // FIX-R9 C-01: SDK returns string code "SUCCESS". Match fileID.
        const item = res.fileList.find((f) => f.fileID === fileID);
        if (!item) return false;
        if (item.code !== 'SUCCESS') {
          console.warn(
            `[objects.exists] metadata exists but remote object missing: key=${key} fileID=${fileID} code=${item.code}`
          );
          return false;
        }
        if (!item.tempFileURL) {
          console.warn(
            `[objects.exists] metadata exists but remote URL empty: key=${key} fileID=${fileID}`
          );
          return false;
        }
        return true;
      } catch (e) {
        console.warn(
          `[objects.exists] remote check failed: key=${key} fileID=${fileID}: ${(e as Error).message}`
        );
        return false;
      }
    },

    /**
     * RF-R10-04 (R9-METADATA-02/AC-07): Look up fileID by storageKey WITHOUT
     * deleting the object. Returns null if metadata is missing. Used by
     * ProjectService.deleteProject to capture fileID before attempting delete.
     */
    async getFileId(key: string): Promise<string | null> {
      assertReady();
      try {
        return await resolveFileId(key);
      } catch (e) {
        const msg = (e as Error).message ?? '';
        if (msg.includes('OBJECT_NOT_FOUND') || msg.includes('OBJECT_METADATA_CORRUPT')) {
          return null;
        }
        throw e;
      }
    },
  };

  // --- UnitOfWork (CloudBase runTransaction + AsyncLocalStorage) ----------

  const unitOfWork: UnitOfWork = {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      assertReady();
      const ctx = transactionStorage.getStore();
      if (ctx) {
        return fn();
      }
      return getDb().runTransaction(async (tx) => {
        return transactionStorage.run({ tx }, fn);
      });
    },
  };

  // --- AuthThrottleRepository ---------------------------------------------

  const authThrottle: AuthThrottleRepository = {
    async get(key: string): Promise<AuthThrottleBucket | null> {
      assertReady();
      const res = await collection(COLLECTIONS.authThrottle).doc(key).get();
      const doc = unwrapDocumentData<AuthThrottleBucket>(res.data);
      return doc || null;
    },

    async put(key: string, value: AuthThrottleBucket): Promise<void> {
      assertReady();
      await collection(COLLECTIONS.authThrottle).doc(key).set({
        _id: key,
        ...value,
      });
    },

    async delete(key: string): Promise<void> {
      assertReady();
      await collection(COLLECTIONS.authThrottle).doc(key).remove();
    },
  };

  return {
    __brand: 'cloudbase_nosql',
    projects,
    assets,
    versions,
    jobs,
    objects,
    unitOfWork,
    authThrottle,
    ensureReady,
    close,
  };
}
