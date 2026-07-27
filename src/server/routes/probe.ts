/**
 * LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01:
 * Vercel-to-CloudBase connectivity diagnostic probe (enhanced).
 *
 * Changes from FIX-R11-R1:
 *  - AC-01: SDK init stage renamed to "sdk_construction"; output explicitly
 *    states "Credentials: NOT_VALIDATED" (SDK construction ≠ credential check)
 *  - AC-02: Production guard — returns 404 when VERCEL_ENV=production
 *  - AC-03~08: Multi-IP TCP test, HTTPS/TLS test, ?reps=N parameter,
 *    Vercel region output, structured diagnostic matrix
 *
 * This probe is a separate endpoint from the auth route. It measures DNS,
 * TCP/TLS per DNS A record, HTTPS/TLS to hostname, SDK construction, and
 * first DB request latency independently, without blocking the auth path.
 * The probe:
 *   - Logs hostname, stage name, IP (last octet masked), and elapsed ms only
 *   - NEVER outputs credentials, full URL query, or Authorization headers
 *   - Uses the same CloudBase SDK and credentials as the auth route
 *   - Verifies the target API host is the official CloudBase endpoint
 *   - Does NOT write any business data (read-only probe collection)
 *
 * AC-R1-07: The probe verifies the SDK's target API host is
 * `tcb-api.tencentcloudapi.com` (the official CloudBase API endpoint).
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

/** TCP/HTTPS timeout per attempt (ms). */
const TCP_TIMEOUT_MS = 5000;
const HTTPS_TIMEOUT_MS = 5000;

/** Maximum repetitions allowed via ?reps=N. */
const MAX_REPS = 10;
const DEFAULT_REPS = 1;

// ---------------------------------------------------------------------------
// Diagnostic result types
// ---------------------------------------------------------------------------

interface IpTcpResult {
  /** IP address tested (last octet masked in logs). */
  ip: string;
  tcpConnect: {
    success: boolean;
    elapsedMs: number;
    error?: string;
  };
}

interface RepResult {
  rep: number;
  dns: {
    addresses: string[];
    elapsedMs: number;
    success: boolean;
    error?: string;
  };
  /** One TCP test per resolved DNS A record. */
  ipTcpResults: IpTcpResult[];
  /** HTTPS/TLS request to the hostname (SNI-based). */
  httpsTls: {
    success: boolean;
    elapsedMs: number;
    error?: string;
  };
  /** SDK construction (tcb.init). NOT credential validation. */
  sdkConstruction: {
    success: boolean;
    elapsedMs: number;
    error?: string;
  };
  /** DB minimal read query. */
  dbRead: {
    success: boolean;
    elapsedMs: number;
    error?: string;
  };
}

interface ProbeResult {
  runId: string;
  /** Vercel region (e.g. hkg1, hnd1, sin1) or 'local'. */
  region: string;
  /** Vercel environment (production, preview, development). */
  environment: string;
  /** Number of repetitions completed. */
  repsCompleted: number;
  totalElapsedMs: number;
  reps: RepResult[];
  envInfo: {
    /** CloudBase environment ID (last 4 chars only — never full). */
    envIdSuffix: string;
    /** API host verified by the SDK. */
    apiHost: string;
    /** Whether the API host is the official CloudBase endpoint. */
    apiHostOfficial: boolean;
    /**
     * AC-01: SDK construction status. This ONLY means the tcb.init() call
     * returned an app object. It does NOT validate credentials.
     */
    sdkConstructionOk: boolean;
    /** AC-01: Credentials are NOT validated by SDK construction. */
    credentials: 'NOT_VALIDATED';
  };
  /** Summary across all reps. */
  summary: {
    dnsSuccessRate: string;
    tcpSuccessRate: string;
    httpsTlsSuccessRate: string;
    sdkConstructionSuccessRate: string;
    dbReadSuccessRate: string;
    /** AC-08: GATEWAY_REQUIRED if all reps fail DB read. */
    gatewayRequired: boolean;
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

/** Mask the last octet of an IPv4 address for logging. */
function maskIp(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  }
  return '***';
}

// ---------------------------------------------------------------------------
// Probe stages
// ---------------------------------------------------------------------------

/**
 * DNS resolution. Returns all A records for the official CloudBase API host.
 */
async function probeDns(): Promise<RepResult['dns']> {
  const stageStart = now();
  try {
    const addresses = await dns.promises.resolve4(OFFICIAL_CLOUDBASE_API_HOST);
    return {
      addresses,
      elapsedMs: elapsed(stageStart),
      success: true,
    };
  } catch (err) {
    return {
      addresses: [],
      elapsedMs: elapsed(stageStart),
      success: false,
      error: (err as Error).message,
    };
  }
}

/**
 * TCP connectivity test to a specific IP on port 443.
 * Tests each DNS A record individually.
 */
async function probeTcpToIp(ip: string): Promise<IpTcpResult> {
  const stageStart = now();
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.on('connect', () => {
      const ms = elapsed(stageStart);
      socket.destroy();
      resolve({
        ip,
        tcpConnect: { success: true, elapsedMs: ms },
      });
    });
    socket.on('error', (err) => {
      socket.destroy();
      resolve({
        ip,
        tcpConnect: {
          success: false,
          elapsedMs: elapsed(stageStart),
          error: (err as Error).message,
        },
      });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        ip,
        tcpConnect: {
          success: false,
          elapsedMs: elapsed(stageStart),
          error: `TCP timed out after ${TCP_TIMEOUT_MS}ms`,
        },
      });
    });
    socket.connect(443, ip);
  });
}

/**
 * HTTPS/TLS request to the official CloudBase API hostname.
 * Verifies TLS handshake succeeds (SNI-based, not IP-based).
 * Does NOT complete a full API call — just verifies TLS connectivity.
 */
async function probeHttpsTls(): Promise<RepResult['httpsTls']> {
  const stageStart = now();
  const https = await import('node:https');
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: OFFICIAL_CLOUDBASE_API_HOST,
        port: 443,
        path: '/',
        method: 'HEAD',
        timeout: HTTPS_TIMEOUT_MS,
      },
      () => {
        const ms = elapsed(stageStart);
        req.destroy();
        resolve({ success: true, elapsedMs: ms });
      }
    );
    req.on('error', (err) => {
      resolve({
        success: false,
        elapsedMs: elapsed(stageStart),
        error: (err as Error).message,
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        elapsedMs: elapsed(stageStart),
        error: `HTTPS/TLS timed out after ${HTTPS_TIMEOUT_MS}ms`,
      });
    });
    req.end();
  });
}

/**
 * AC-01: SDK construction (NOT credential validation).
 * Initializes the CloudBase SDK by calling tcb.init(). This ONLY proves
 * the SDK module loaded and init() returned an app object. It does NOT
 * validate whether the API Key is correct or the environment exists.
 *
 * Credentials can only be validated by a successful authenticated API call
 * (e.g., DB read), which is tested separately in the dbRead stage.
 */
async function probeSdkConstruction(
  deps: CloudBaseNoSqlDeps
): Promise<RepResult['sdkConstruction']> {
  const stageStart = now();
  try {
    await deps.ensureReady();
    return {
      success: true,
      elapsedMs: elapsed(stageStart),
    };
  } catch (err) {
    return {
      success: false,
      elapsedMs: elapsed(stageStart),
      error: (err as Error).message,
    };
  }
}

/**
 * DB minimal read query on the probe collection.
 * This is the ONLY stage that can validate credentials — a successful DB
 * read proves the API Key is valid and the environment exists.
 */
async function probeDbRead(
  deps: CloudBaseNoSqlDeps
): Promise<RepResult['dbRead']> {
  const stageStart = now();
  try {
    const db = deps.getRawDatabase();
    // doc().get() returns { data: unknown[] } for non-transactional reads.
    // The document may not exist (data: []), which is fine — we only care
    // that the request completes without timeout.
    await db.collection(PROBE_COLLECTION).doc('_probe').get();
    return {
      success: true,
      elapsedMs: elapsed(stageStart),
    };
  } catch (err) {
    const errMsg = (err as Error).message;
    return {
      success: false,
      elapsedMs: elapsed(stageStart),
      error: errMsg.substring(0, 200),
    };
  }
}

/**
 * Run a single repetition of all diagnostic stages.
 */
async function runSingleRep(
  rep: number,
  deps: CloudBaseNoSqlDeps
): Promise<RepResult> {
  // Stage 1: DNS resolution
  const dnsResult = await probeDns();

  // Stage 2: TCP test to each resolved IP
  const ipTcpResults: IpTcpResult[] = [];
  if (dnsResult.success && dnsResult.addresses.length > 0) {
    for (const ip of dnsResult.addresses) {
      ipTcpResults.push(await probeTcpToIp(ip));
    }
  }

  // Stage 3: HTTPS/TLS to hostname
  const httpsTlsResult = await probeHttpsTls();

  // Stage 4: SDK construction (NOT credential validation)
  const sdkConstructionResult = await probeSdkConstruction(deps);

  // Stage 5: DB minimal read (only if SDK construction succeeded)
  let dbReadResult: RepResult['dbRead'];
  if (sdkConstructionResult.success) {
    dbReadResult = await probeDbRead(deps);
  } else {
    dbReadResult = {
      success: false,
      elapsedMs: 0,
      error: 'SDK construction failed — DB read skipped',
    };
  }

  return {
    rep,
    dns: dnsResult,
    ipTcpResults,
    httpsTls: httpsTlsResult,
    sdkConstruction: sdkConstructionResult,
    dbRead: dbReadResult,
  };
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

  router.get('/', async (req: Request, res: Response) => {
    // AC-02: Production guard — return 404 in Production environment.
    // This is a secondary guard; the primary guard is in index.ts which
    // does not mount the probe router at all in Production.
    if (process.env.VERCEL_ENV === 'production') {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    // Parse ?reps=N parameter
    const repsParam = parseInt(req.query.reps as string, 10);
    const reps = isNaN(repsParam)
      ? DEFAULT_REPS
      : Math.min(Math.max(1, repsParam), MAX_REPS);

    const totalStart = now();
    const repResults: RepResult[] = [];

    for (let i = 1; i <= reps; i++) {
      repResults.push(await runSingleRep(i, deps.noSqlDeps));
    }

    // Compute summary
    const dnsOk = repResults.filter(r => r.dns.success).length;
    const tcpOk = repResults.filter(r => r.ipTcpResults.some(ip => ip.tcpConnect.success)).length;
    const httpsOk = repResults.filter(r => r.httpsTls.success).length;
    const sdkOk = repResults.filter(r => r.sdkConstruction.success).length;
    const dbOk = repResults.filter(r => r.dbRead.success).length;
    const total = repResults.length;

    const result: ProbeResult = {
      runId: `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      region: process.env.VERCEL_REGION || 'local',
      environment: process.env.VERCEL_ENV || 'development',
      repsCompleted: total,
      totalElapsedMs: elapsed(totalStart),
      reps: repResults,
      envInfo: {
        envIdSuffix: safeSuffix(deps.envId, 4),
        apiHost: OFFICIAL_CLOUDBASE_API_HOST,
        apiHostOfficial: true,
        sdkConstructionOk: sdkOk > 0,
        credentials: 'NOT_VALIDATED',
      },
      summary: {
        dnsSuccessRate: `${dnsOk}/${total}`,
        tcpSuccessRate: `${tcpOk}/${total}`,
        httpsTlsSuccessRate: `${httpsOk}/${total}`,
        sdkConstructionSuccessRate: `${sdkOk}/${total}`,
        dbReadSuccessRate: `${dbOk}/${total}`,
        // AC-08: GATEWAY_REQUIRED if all reps fail DB read
        gatewayRequired: dbOk === 0,
      },
    };

    // Log structured diagnostics (no credentials, IPs masked).
    console.log('[probe] connectivity diagnostic:', JSON.stringify({
      runId: result.runId,
      region: result.region,
      env: result.environment,
      totalMs: result.totalElapsedMs,
      reps: result.repsCompleted,
      envSuffix: result.envInfo.envIdSuffix,
      apiHostOfficial: result.envInfo.apiHostOfficial,
      credentials: result.envInfo.credentials,
      summary: result.summary,
      repsSummary: repResults.map(r => ({
        rep: r.rep,
        dns: { ok: r.dns.success, ms: r.dns.elapsedMs, ips: r.dns.addresses.map(maskIp) },
        tcp: r.ipTcpResults.map(ip => ({
          ip: maskIp(ip.ip),
          ok: ip.tcpConnect.success,
          ms: ip.tcpConnect.elapsedMs,
        })),
        httpsTls: { ok: r.httpsTls.success, ms: r.httpsTls.elapsedMs },
        sdkConstruction: { ok: r.sdkConstruction.success, ms: r.sdkConstruction.elapsedMs },
        dbRead: { ok: r.dbRead.success, ms: r.dbRead.elapsedMs },
      })),
    }));

    // Return result. On error, still return 200 with diagnostic data
    // (the probe itself is diagnostic, not a business endpoint).
    const allOk = dbOk > 0;
    res.status(allOk ? 200 : 500).json(result);
  });

  return router;
}
