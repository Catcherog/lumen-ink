# FIX-R11-R1 Gate Results

**Date**: 2026-07-27
**Branch**: `lumen/cloudbase-nosql-implement-01-fix-r11`
**HEAD**: `85c6161`

## Gate Summary

| Gate | Result | Details |
|------|--------|---------|
| 1. Client lint | ✅ PASS | 0 errors |
| 2. Client tsc --noEmit | ✅ PASS | Build succeeded |
| 3. Client tests | ✅ PASS | 195 tests, 10 files |
| 4. Server tsc --noEmit | ✅ PASS | 0 errors |
| 5. Server tests | ✅ PASS | 515 tests, 38 files |
| 6. Root tests | ✅ PASS | 710 tests total |
| 7. Build | ✅ PASS | Client + Server |
| 8. check-lumen-collab | ✅ PASS | No secrets leaked |

## Auth Throttle Timeout Tests

14/14 PASS (new file: `src/server/routes/auth.throttle-timeout.test.ts`)

## Module Interop Test

Updated to expect `timeout: 10000` in `tcb.init()` call (AC-R1-02). 2/2 occurrences updated.

## Diff Summary

- `src/server/infrastructure/persistence/cloudbase.nosql.ts`: +sdkTimeout option, +getRawDatabase() implementation
- `src/server/routes/auth.ts`: 8000→12000ms timeout, AC-R1-03 docs, AC-R1-05 security invariant
- `src/server/index.ts`: +probe router mount (CloudBase NoSQL only)
- `src/server/routes/auth.throttle-timeout.test.ts`: NEW — 14 tests
- `src/server/routes/probe.ts`: NEW — diagnostic probe
- `src/server/infrastructure/persistence/cloudbase.nosql.module-interop.test.ts`: +timeout expectation