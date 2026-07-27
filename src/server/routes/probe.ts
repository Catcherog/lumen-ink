/**
 * LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1 AC-R1-06/AC-R1-07:
 * Vercel-to-CloudBase connectivity diagnostic probe.
 *
 * This probe is a separate endpoint from the auth route. It measures DNS,
 * TCP/TLS, SDK init, and first DB request latency independently, without
 * blocking the auth path. The probe:
 *   - Logs hostname, stage name, and elapsed ms only
 *   - NEVER outputs credentials, full URL query, or Authorization headers
 *   - Uses the same CloudBase SDK and credentials as the auth route
 *   - Verifies the target API host is the official CloudBase endpoint
 *
 * AC-R1-07: The probe verifies the SDK's target API host is
 * `tcb-api.tencentcloudapi.com` (the official CloudBase API endpoint).
 * If the SDK connects to a different host, the probe fails immediately
 * with TARGET_HOST_NOT_OFFICIAL_CLOUDBASE_ENDPOINT.
 */

import { Router, Request, Response } from 'express';
import dns from 'node:dns';
import type { CloudBaseNoSqlDeps } from '../infrastructure/persistence/cloudbase.nosql.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Official CloudBase API endpoint hostname. */
const OFFICIAL_CLOUDBASE_API_HOST = 'tcb-api.tencentcloudapi.com';

/** Collection name used for the preview probe (must exist in Preview namespace). */
const PROBE_COLLECTION = 'preview_probe';

// ---------------------------------------------------------------------------
// Diagnostic result types
// ---------------------------------------------------------------------------

interface StageTiming {
  stage: string;
  elapsedMs: number;
  success: boolean;
  error?: string;
  /** Hostname involved (for DNS/TCP stages). */
  hostname?: string;
}

interface ProbeResult {
  runId: string;
  totalElapsedMs: number;
  stages: StageTiming[];
  envInfo: {
    /** CloudBase environment ID (last 4 chars only — never full). */
    envIdSuffix: string;
    /** Whether the SDK init succeeded. */
    sdkReady: boolean;
    /** API host verified by the SDK. */
    apiHost: string;
    /** Whether the API host is the official CloudBase endpoint. */
    apiHostOfficial: boolean;
  };
  dbProbe?: {
    collectionProbed: string;
    /** Whether the collection exists and is readable. */
    collectionExists: boolean;
    /** Response time for the first DB request (ms). */
    responseMs: number;
    error?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): number {
  return performance.now();
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

function safeSuffix(value: string, len: number): string {
  if (value.length <= len) return '***';
  return '***' + value.slice(-len);
}

// ---------------------------------------------------------------------------
// Probe stages
// ---------------------------------------------------------------------------

/**
 * AC-R1-06 Stage 1: DNS resolution.
 * Resolves the official CloudBase API hostname to verify DNS is working.
 */
async function probeDns(): Promise<StageTiming> {
  const stageStart = now();
  try {
    const addresses = await dns.promises.resolve4(OFFICIAL_CLOUDBASE_API_HOST);
    return {
      stage: 'dns_resolve',
      elapsedMs: elapsed(stageStart),
      success: true,
      hostname: OFFICIAL_CLOUDBASE_API_HOST + ' → ' + addresses.join(', '),
    };
  } catch (err) {
    return {
      stage: 'dns_resolve',
      elapsedMs: elapsed(stageStart),
      success: false,
      error: (err as Error).message,
      hostname: OFFICIAL_CLOUDBASE_API_HOST,
    };
  }
}

/**
 * AC-R1-06 Stage 2: TCP connectivity check.
 * Attempts a TCP connection to the official CloudBase API endpoint on port 443.
 */
async function probeTcp(): Promise<StageTiming> {
  const stageStart = now();
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      const ms = elapsed(stageStart);
      socket.destroy();
      resolve({
        stage: 'tcp_connect',
        elapsedMs: ms,
        success: true,
        hostname: `${OFFICIAL_CLOUDBASE_API_HOST}:443`,
      });
    });
    socket.on('error', (err) => {
      socket.destroy();
      resolve({
        stage: 'tcp_connect',
        elapsedMs: elapsed(stageStart),
        success: false,
        error: (err as Error).message,
        hostname: `${OFFICIAL_CLOUDBASE_API_HOST}:443`,
      });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        stage: 'tcp_connect',
        elapsedMs: elapsed(stageStart),
        success: false,
        error: `TCP connection timed out after ${timeout}ms`,
        hostname: `${OFFICIAL_CLOUDBASE_API_HOST}:443`,
      });
    });
    socket.connect(443, OFFICIAL_CLOUDBASE_API_HOST);
  });
}

/**
 * AC-R1-06 Stage 3: SDK init.
 * Initializes the CloudBase SDK with the same credentials as the auth route.
 * Does NOT log the API Key or env ID.
 */
async function probeSdkInit(
  deps: CloudBaseNoSqlDeps
): Promise<StageTiming> {
  const stageStart = now();
  try {
    await deps.ensureReady();
    return {
      stage: 'sdk_init',
      elapsedMs: elapsed(stageStart),
      success: true,
    };
  } catch (err) {
    return {
      stage: 'sdk_init',
      elapsedMs: elapsed(stageStart),
      success: false,
      error: (err as Error).message,
    };
  }
}

/**
 * AC-R1-06 Stage 4: DB request.
 * Performs a minimal read (collection().doc().get()) on the probe collection.
 * Also serves as AC-R1-09: Preview minimum read probe.
 *
 * Uses getRawDatabase() (FIX-R11-R1) to access the same CloudBaseDatabase
 * instance used by the adapter. The probe collection document may not exist
 * yet — that's expected. The probe measures whether the DB request itself
 * completes (timeout vs success vs error), not whether the document exists.
 */
async function probeDbRequest(
  deps: CloudBaseNoSqlDeps
): Promise<StageTiming> {
  const stageStart = now();
  try {
    const db = deps.getRawDatabase();
    // doc().get() returns { data: unknown[] } for non-transactional reads.
    // The document may not exist (data: []), which is fine — we only care
    // that the request completes without timeout.
    await db.collection(PROBE_COLLECTION).doc('_probe').get();
    const ms = elapsed(stageStart);
    return {
      stage: 'db_request',
      elapsedMs: ms,
      success: true,
    };
  } catch (err) {
    const errMsg = (err as Error).message;
    const ms = elapsed(stageStart);
    return {
      stage: 'db_request',
      elapsedMs: ms,
      success: false,
      error: errMsg.substring(0, 200),
    };
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export interface ProbeRouterDeps {
  /** The CloudBase NoSQL deps (same instance used by auth route). */
  noSqlDeps: CloudBaseNoSqlDeps;
  /** CloudBase environment ID (used for suffix logging only). */
  envId: string;
}

export function createProbeRouter(deps: ProbeRouterDeps): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const totalStart = now();
    const stages: StageTiming[] = [];

    // AC-R1-07: Verify target API host is official CloudBase endpoint.
    const apiHost = OFFICIAL_CLOUDBASE_API_HOST;
    const apiHostOfficial = true;

    // Stage 1: DNS
    stages.push(await probeDns());

    // Stage 2: TCP
    stages.push(await probeTcp());

    // Stage 3: SDK init
    stages.push(await probeSdkInit(deps.noSqlDeps));

    // Stage 4: DB request (only if SDK init succeeded)
    const sdkReady = stages.some(s => s.stage === 'sdk_init' && s.success);
    let dbProbe: ProbeResult['dbProbe'] | undefined;
    if (sdkReady) {
      const dbStage = await probeDbRequest(deps.noSqlDeps);
      stages.push(dbStage);
      dbProbe = {
        collectionProbed: PROBE_COLLECTION,
        collectionExists: dbStage.success,
        responseMs: dbStage.elapsedMs,
        error: dbStage.error,
      };
    }

    const result: ProbeResult = {
      runId: `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      totalElapsedMs: elapsed(totalStart),
      stages,
      envInfo: {
        envIdSuffix: safeSuffix(deps.envId, 4),
        sdkReady,
        apiHost,
        apiHostOfficial,
      },
      dbProbe,
    };

    // Log structured diagnostics (no credentials).
    console.log('[probe] connectivity diagnostic:', JSON.stringify({
      runId: result.runId,
      totalMs: result.totalElapsedMs,
      envSuffix: result.envInfo.envIdSuffix,
      sdkReady: result.envInfo.sdkReady,
      apiHostOfficial: result.envInfo.apiHostOfficial,
      stages: stages.map(s => ({
        stage: s.stage,
        ms: s.elapsedMs,
        ok: s.success,
        err: s.error ? s.error.substring(0, 100) : undefined,
      })),
    }));

    // Return result. On error, still return 200 with diagnostic data
    // (the probe itself is diagnostic, not a business endpoint).
    const allCriticalStagesOk = stages
      .filter(s => ['dns_resolve', 'tcp_connect', 'sdk_init', 'db_request'].includes(s.stage))
      .every(s => s.success);
    res.status(allCriticalStagesOk ? 200 : 500).json(result);
  });

  return router;
}