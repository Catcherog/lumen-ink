# FIX-R11-R1 Codex Limited Review Package

**Task ID**: `LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1-CONNECTIVITY-AND-AUTH-EVIDENCE`
**Codex Mode**: `READ_ONLY`
**Scope**: Auth throttle timeout, security invariants, and related tests only
**Date**: 2026-07-27
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r11`
**HEAD**: `2d78248`
**Base**: `85c6161`

---

## Files in Scope (Codex must NOT modify)

### 1. `src/server/routes/auth.ts` — Auth Route with Timeout

**Diff from `85c6161`**:

```typescript
// Added: THROTTLE_TIMEOUT_MS constant (outer timeout: 12000ms)
const THROTTLE_TIMEOUT_MS = 12000;

// Added: withTimeout() helper
function withTimeout<T>(promise: Promise<T>, ms: number, errorCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${errorCode}: operation timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}

// Modified: isBlocked, recordFailure, recordSuccess now wrapped with withTimeout()
// - isBlocked: withTimeout(throttle.isBlocked(ip), THROTTLE_TIMEOUT_MS, 'AUTH_THROTTLE_TIMEOUT')
// - recordFailure: withTimeout(throttle.recordFailure(ip), THROTTLE_TIMEOUT_MS, 'AUTH_THROTTLE_TIMEOUT')
// - recordSuccess: withTimeout(throttle.recordSuccess(ip), THROTTLE_TIMEOUT_MS, 'AUTH_THROTTLE_TIMEOUT')
```

**Key design decisions**:
1. Outer timeout (12000ms) > SDK timeout (10000ms) → SDK returns specific error first
2. `isBlocked`/`recordFailure` timeout → 503 (fail-closed)
3. `recordSuccess` timeout → 200 (best-effort, not fail-closed)

### 2. `src/server/security/authThrottle.ts` — Throttle Interface

**Unchanged** from `85c6161`. The throttle interface remains:
```typescript
export interface AuthThrottle {
  isBlocked(ip: string): Promise<ThrottleResult>;
  recordFailure(ip: string): Promise<ThrottleResult>;
  recordSuccess(ip: string): Promise<void>;
}
```

### 3. `src/server/routes/auth.ts` — withTimeout() Helper

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, errorCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${errorCode}: operation timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}
```

### 4. `src/server/infrastructure/persistence/cloudbase.nosql.ts` — SDK Timeout

```typescript
// Added to CloudBaseNoSqlOptions:
sdkTimeout?: number;  // default 10000ms

// In ensureReady():
const sdkTimeout = options.sdkTimeout ?? 10000;
const instance = tcb.init({
  env: options.envId,
  accessKey: options.apiKey,
  timeout: sdkTimeout,  // NEW: SDK native timeout
});

// Added to CloudBaseNoSqlDeps:
getRawDatabase(): CloudBaseDatabase;  // For diagnostic probe only
```

### 5. `src/server/routes/probe.ts` — Diagnostic Probe (NEW)

Full file at `src/server/routes/probe.ts`. Key characteristics:
- `GET /api/probe` — only active when `PERSISTENCE_BACKEND=cloudbase-nosql`
- 4 stages: DNS → TCP → SDK init → DB request
- Logs: hostname, stage name, elapsed ms only (no credentials)
- API host verification: hardcoded to `tcb-api.tencentcloudapi.com`

### 6. `src/server/routes/auth.throttle-timeout.test.ts` — 14 Tests (NEW)

Full file at `src/server/routes/auth.throttle-timeout.test.ts`. Tests cover:
1. isBlocked resolve → 200 on correct password
2. isBlocked reject → 503 (fail closed)
3. isBlocked timeout → 503 (fail closed)
4. recordFailure reject → 503 (fail closed)
5. recordFailure timeout → 503 (fail closed)
6. recordSuccess reject → 200 (best-effort)
7. recordSuccess timeout → 200 (best-effort)
8. timeout 后延迟 resolve → 503
9. timeout 后延迟 reject → 503
10. 不重复发送 response → 503 only
11. 401 after wrong password (normal flow)
12. 503 hides password (fail closed)
13. isBlocked fail → password never checked
14. recordSuccess fail → token still issued

### 7. Security Invariant — recordSuccess Failure

**Location**: `auth.ts` lines 121-136

**Invariant**: `recordSuccess` failure does NOT block login. Rationale:
1. `recordSuccess` is best-effort cleanup
2. Bucket's TTL-based expiry (`windowMs`) is the durable safety net
3. A failed `recordSuccess` does NOT invalidate JWT, re-block IP, or allow bypass
4. Worst case: premature 429 (not a bypass)
5. Alternative (fail login) creates DOS vector

### 8. APPENDIX: Full Diff

`git diff 85c6161..2d78248 -- src/server/routes/auth.ts src/server/security/authThrottle.ts src/server/routes/probe.ts src/server/routes/auth.throttle-timeout.test.ts src/server/infrastructure/persistence/cloudbase.nosql.ts src/server/infrastructure/persistence/cloudbase.nosql.module-interop.test.ts src/server/index.ts`

---

## Test Results

```
Server: 38 files, 515 tests PASS
Client: 10 files, 195 tests PASS
Total: 710 tests PASS
8/8 gates PASS
```

---

## Codex Review Questions

1. Does `withTimeout()` correctly handle the case where the inner promise settles after the timeout fires? (The `finally()` clears the timer, but `Promise.race` already resolved with the timeout rejection.)
2. Is the security invariant for `recordSuccess` failure (allow login) sound? Could a malicious actor exploit this?
3. Is the timeout hierarchy (SDK 10000ms < outer 12000ms) sufficient to guarantee SDK errors are returned before Promise.race cuts them off?
4. Does the probe endpoint (`/api/probe`) expose any sensitive information beyond what's documented?
5. Are there any edge cases in the 14 throttle timeout tests that are not covered?