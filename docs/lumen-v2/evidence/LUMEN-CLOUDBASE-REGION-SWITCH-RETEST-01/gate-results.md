# Gate Results — LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01

> **Date**: 2026-07-28
> **Branch**: lumen/lumen-cloudbase-region-switch-retest-01-trae
> **Commit**: 719cb8e (Commit 1: region switch hkg1→sin1)

---

## Local Gates (AC-10)

### Server Typecheck
```
cd src/server && npx tsc --noEmit
exit code: 0
output: (empty — no errors)
```
**Result: PASS**

### Client Typecheck
```
cd src/client && npx tsc --noEmit
exit code: 0
output: (empty — no errors)
```
**Result: PASS**

### Server Tests
```
cd src/server && npx vitest run
Test Files  38 passed (38)
     Tests  515 passed (515)
  Duration  3.41s
```
**Result: PASS (515/515)**

### Client Tests
```
cd src/client && npx vitest run
Test Files  10 passed (10)
     Tests  195 passed (195)
  Duration  1.96s
```
**Result: PASS (195/195)**

### Collaboration State Check
```
node scripts/check-lumen-collab.mjs
Lumen collaboration state and basic public-repo safety checks passed.
```
**Result: PASS**

### Summary

| Gate | Result | Count |
|------|--------|-------|
| Server typecheck | PASS | 0 errors |
| Client typecheck | PASS | 0 errors |
| Server tests | PASS | 515/515 |
| Client tests | PASS | 195/195 |
| Collaboration check | PASS | — |
| **Total** | **5/5 PASS** | **710 tests** |

---

## Remote Verification (AC-03, AC-04)

### Preview Probe (1 rep)
```
GET https://lumen-7rmn0vh4y-catcher1.vercel.app/api/probe
Status: 200
region: sin1
environment: preview
dbRead.success: true (135ms)
dbReadSuccessRate: 1/1
gatewayRequired: false
```

### Preview Probe (5 reps — AC-04)
```
GET https://lumen-7rmn0vh4y-catcher1.vercel.app/api/probe?reps=5
Status: 200
Region: sin1
Reps completed: 5
Total elapsed: 2528ms
DB read success rate: 5/5
DNS success rate: 5/5
TCP success rate: 5/5
HTTPS TLS success rate: 5/5
Gateway required: false

Per-rep DB read times:
  Rep 1: success=True 256ms
  Rep 2: success=True 115ms
  Rep 3: success=True 104ms
  Rep 4: success=True 106ms
  Rep 5: success=True 116ms
```
**AC-04 Result: PASS (5/5)**

---

## AC-R1-11b Test (AC-06 — FAIL, Stop Condition)

```
POST https://lumen-7rmn0vh4y-catcher1.vercel.app/api/auth (5x wrong password)
Attempt 1: expected=401 actual=503 ms=1113
Attempt 2: expected=401 actual=503 ms=488
Attempt 3: expected=401 actual=503 ms=541
Attempt 4: expected=401 actual=503 ms=511
Throttle reset (correct login): code=503 ms=561 token=False
Attempt 5: expected=401 actual=503 ms=485
AC-R1-11b RESULT: FAIL (0/5 returned 401)
```
**AC-06 Result: FAIL — Stop Condition triggered (503 x5)**

Vercel logs confirm: `[auth] throttle.recordFailure fai…` for all 503 responses.

---

## AC-R1-10 Test (AC-05 — BLOCKED)

```
POST /api/auth (correct password) → 503 (login failed, no JWT)
FATAL: Cannot proceed without JWT. AC-R1-10 BLOCKED.
```
**AC-05 Result: BLOCKED** (throttle.put _id bug + vercel env pull issue)

---

## Production Probe (AC-09 — PRE-EXISTING ISSUE)

```
GET https://lumen-ink.vercel.app/api/health → 500
GET https://lumen-ink.vercel.app/api/probe → 500 (empty body)
```
**AC-09 Result: PRE-EXISTING ISSUE** — Production app startup failure, not caused by region switch.

---

## Log Sanitization (AC-11)

Vercel function logs reviewed:
- `[auth] throttle.recordFailure fai…` — error message (truncated), no secrets
- `[probe] connectivity diagnostic:` — diagnostic info, no secrets
- `[TCB][WARN] Your current request` — SDK warning, no secrets
- No Authorization headers, tokens, or CloudBase credentials in logs

**AC-11 Result: PASS**
