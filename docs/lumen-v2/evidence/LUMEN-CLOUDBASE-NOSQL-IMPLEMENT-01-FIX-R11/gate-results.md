# FIX-R11 Gate Results

**Date**: 2026-07-27
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r11`
**Base**: `8928906cd1af93d05a683db0134431634f69402b` (fix-r10 HEAD)
**HEAD**: `150352d` (auth throttle timeout)

## Commits

| # | SHA | Message |
|---|-----|---------|
| 1 | `66ef762` | feat(lumen-v2): FIX-R11 runtime compatibility |
| 2 | `725d8c5` | feat(lumen-v2): FIX-R11 deployment configuration |
| 3 | `150352d` | feat(lumen-v2): FIX-R11 auth throttle timeout |

## 8 Gates (Local)

| # | Gate | Result | Details |
|---|------|--------|---------|
| 1 | Client lint | PASS | 0 errors |
| 2 | Client tsc --noEmit | PASS | exit 0 |
| 3 | Client tests | PASS | 195 tests / 10 files |
| 4 | Server tsc --noEmit | PASS | exit 0 |
| 5 | Server tests | PASS | 501 tests / 37 files (includes 5 new module-interop tests) |
| 6 | Root tests | PASS | 195 client + 501 server = 696 combined |
| 7 | Build | PASS | server + client |
| 8 | check-lumen-collab | PASS | no secrets detected |

## Preview Deployment Verification

| Item | Value | Status |
|------|-------|--------|
| Preview URL | https://lumen-d32fv6kdf-catcher1.vercel.app | Ready |
| Deployment ID | dpl_ (from vercel inspect) | Ready |
| Region | hkg1 | PASS |
| GET / | 200 | PASS |
| GET /api/health | 200 {"status":"ok"} | PASS |
| GET /api/projects (no auth) | 401 | PASS |
| POST /api/auth (wrong password) | 503 in 7.2s | PASS (AC-10/11 fail closed) |
| Log: CLOUDBASE_CONFIG_REQUIRED | absent | PASS |
| Log: tcb.init is not a function | absent | PASS |
| Log: Cannot find module ws | absent | PASS |

## AC-10/AC-11 Auth Timeout Diagnostic

### Before fix (first Preview deployment)

- POST /api/auth (wrong password) -> 504 in 60.6s (Vercel Runtime Timeout)
- Root cause: `throttle.isBlocked(ip)` calls CloudBase NoSQL `collection().doc().get()` which hangs indefinitely

### After fix (second Preview deployment with auth.ts timeout)

- POST /api/auth (wrong password) -> 503 in 7.2s
- `withTimeout(throttle.isBlocked(ip), 8000, 'AUTH_THROTTLE_TIMEOUT')` rejects at 8s
- Auth route catches error and returns 503 (fail closed)
- Security check NOT skipped; password NOT verified; no 401 leaked

### AC-12 Phase Diagnostic (inferred from logs)

| Phase | Status | Evidence |
|-------|--------|----------|
| SDK import | PASS | No "Cannot find module" errors in logs |
| SDK init | PASS | No "tcb.init is not a function" errors in logs |
| Repository init | PASS | No "CLOUDBASE_CONFIG_REQUIRED" errors in logs |
| DB request start | REACHED | throttle.isBlocked -> repo.get -> collection().doc().get() |
| DB response/error | TIMEOUT | 8s AUTH_THROTTLE_TIMEOUT; CloudBase unreachable from Vercel HK |

## Blocked ACs

### AC-09: Preview namespace round-trip - BLOCKED

CloudBase NoSQL database is unreachable from Vercel HK (hkg1). Auth throttle
calls timeout at 8s, preventing any authenticated API operation. Cannot
execute create/read/delete round-trip via API.

### AC-13: CloudBase IP whitelist / network ACL - REQUIRES USER

Cannot verify CloudBase network ACL configuration without CloudBase console
access. Vercel outbound IPs are not fixed; CloudBase may have IP restrictions.

### AC-14-18: Blocked by AC-09

Cannot merge to main or execute Production smoke test until AC-09 passes.

## Vercel Preview Environment Variables (all present, encrypted)

- CLOUDBASE_API_KEY
- CLOUDBASE_ENV_ID
- CLOUDBASE_DATA_NAMESPACE
- CLOUDBASE_STORAGE_PREFIX
- CLOUDBASE_PRODUCTION_DATA_NAMESPACE
- CLOUDBASE_PRODUCTION_STORAGE_PREFIX
- PERSISTENCE_BACKEND
- JWT_SECRET
- AUTH_PASSWORD
- PROVIDER_ENCRYPTION_KEY
- SEEDREAM_API_KEY
- CORS_ALLOWLIST
