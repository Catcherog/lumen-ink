#!/usr/bin/env node
/**
 * TEMP: LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01 network diagnostic | 2026-07-28 | 2026-07-31
 *
 * Diagnostic script that calls the enhanced probe endpoint on a Vercel Preview
 * deployment and formats the results into a diagnostic matrix.
 *
 * Usage:
 *   node scripts/lumen-connectivity-diagnostic.mjs <preview-url> [reps]
 *
 * Example:
 *   node scripts/lumen-connectivity-diagnostic.mjs https://lumen-xxx.vercel.app 5
 *
 * Output: JSON diagnostic matrix to stdout, human-readable summary to stderr.
 */

const url = process.argv[2];
const reps = process.argv[3] || '5';

if (!url) {
  console.error('Usage: node scripts/lumen-connectivity-diagnostic.mjs <preview-url> [reps]');
  process.exit(1);
}

const probeUrl = `${url.replace(/\/$/, '')}/api/probe?reps=${reps}`;

console.error(`[diagnostic] Calling probe: ${probeUrl}`);
console.error(`[diagnostic] Reps: ${reps}`);

try {
  const response = await fetch(probeUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(180000), // 3 min timeout for 5 reps
  });

  const status = response.status;
  const body = await response.text();

  if (status === 404) {
    console.error(`[diagnostic] Probe returned 404 — Production guard active or probe not mounted`);
    console.log(JSON.stringify({
      url: probeUrl,
      status: 404,
      error: 'Probe not available (Production guard or not mounted)',
      timestamp: new Date().toISOString(),
    }, null, 2));
    process.exit(0);
  }

  if (status !== 200 && status !== 500) {
    console.error(`[diagnostic] Unexpected status: ${status}`);
    console.log(JSON.stringify({
      url: probeUrl,
      status,
      body: body.substring(0, 500),
      timestamp: new Date().toISOString(),
    }, null, 2));
    process.exit(1);
  }

  let result;
  try {
    result = JSON.parse(body);
  } catch {
    console.error(`[diagnostic] Failed to parse JSON response`);
    console.log(body);
    process.exit(1);
  }

  // Human-readable summary to stderr
  console.error(`\n[diagnostic] === PROBE RESULTS ===`);
  console.error(`Region: ${result.region}`);
  console.error(`Environment: ${result.environment}`);
  console.error(`Reps completed: ${result.repsCompleted}`);
  console.error(`Total elapsed: ${result.totalElapsedMs}ms`);
  console.error(`\nSummary:`);
  console.error(`  DNS success:       ${result.summary?.dnsSuccessRate || 'N/A'}`);
  console.error(`  TCP success:       ${result.summary?.tcpSuccessRate || 'N/A'}`);
  console.error(`  HTTPS/TLS success: ${result.summary?.httpsTlsSuccessRate || 'N/A'}`);
  console.error(`  SDK construction:  ${result.summary?.sdkConstructionSuccessRate || 'N/A'}`);
  console.error(`  DB read success:   ${result.summary?.dbReadSuccessRate || 'N/A'}`);
  console.error(`  GATEWAY_REQUIRED:  ${result.summary?.gatewayRequired ?? 'N/A'}`);
  console.error(`  Credentials:       ${result.envInfo?.credentials || 'N/A'}`);

  if (result.reps) {
    for (const rep of result.reps) {
      console.error(`\n  --- Rep ${rep.rep} ---`);
      console.error(`  DNS: ${rep.dns.success ? 'OK' : 'FAIL'} (${rep.dns.elapsedMs}ms)`);
      if (rep.dns.addresses?.length) {
        console.error(`  IPs: ${rep.dns.addresses.join(', ')}`);
      }
      for (const ipResult of rep.ipTcpResults || []) {
        console.error(`  TCP ${ipResult.ip}: ${ipResult.tcpConnect.success ? 'OK' : 'FAIL'} (${ipResult.tcpConnect.elapsedMs}ms)${ipResult.tcpConnect.error ? ' — ' + ipResult.tcpConnect.error : ''}`);
      }
      console.error(`  HTTPS/TLS: ${rep.httpsTls.success ? 'OK' : 'FAIL'} (${rep.httpsTls.elapsedMs}ms)${rep.httpsTls.error ? ' — ' + rep.httpsTls.error : ''}`);
      console.error(`  SDK construction: ${rep.sdkConstruction.success ? 'OK' : 'FAIL'} (${rep.sdkConstruction.elapsedMs}ms)${rep.sdkConstruction.error ? ' — ' + rep.sdkConstruction.error : ''}`);
      console.error(`  DB read: ${rep.dbRead.success ? 'OK' : 'FAIL'} (${rep.dbRead.elapsedMs}ms)${rep.dbRead.error ? ' — ' + rep.dbRead.error.substring(0, 100) : ''}`);
    }
  }

  // Full JSON to stdout
  console.log(JSON.stringify({
    url: probeUrl,
    status,
    timestamp: new Date().toISOString(),
    result,
  }, null, 2));

} catch (err) {
  console.error(`[diagnostic] Error: ${err.message}`);
  console.log(JSON.stringify({
    url: probeUrl,
    error: err.message,
    timestamp: new Date().toISOString(),
  }, null, 2));
  process.exit(1);
}
