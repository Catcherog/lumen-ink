# HARDEN-001A — 8 Gate Results

> Captured: 2026-07-21
> Branch: `lumen/harden-001a-trae`
> Base commit: `e08eb3e`（POST-MERGE-PARALLEL-ACTIVATION-01 激活 commit）
> Task ID: HARDEN-001A-AUTH-BOUNDARY

## Gate 1: Client Lint

```
npm run lint --prefix src/client
```

Result: **PASS** (exit 0)

```
> client@0.0.0 lint
> eslint .
```

No errors, no warnings.

## Gate 2: Client TypeScript

```
npx tsc -b --noEmit
```

Run in: `src/client`

Result: **PASS** (exit 0, no output)

## Gate 3: Client Tests

```
npm run test --prefix src/client
```

Result: **PASS** (exit 0)

```
 RUN  v4.1.10 D:/360Downloads/Trae 项目/picture-edit/src/client

 ✓ src/utils/image.test.ts (5 tests) 11ms
 ✓ src/utils/recipe.test.ts (54 tests) 15ms
 ✓ src/utils/legacyHistory.test.ts (20 tests) 53ms
 ✓ src/hooks/useEditor.test.ts (9 tests) 43ms
 ✓ src/components/v2/VersionStrip.test.tsx (10 tests) 129ms
 ✓ src/hooks/useProject.test.tsx (9 tests) 196ms
 ✓ src/components/v2/JobStatusPanel.test.tsx (26 tests) 170ms
 ✓ src/components/v2/LegacyHistoryImport.test.tsx (7 tests) 156ms
 ✓ src/AppV2.persist.test.tsx (18 tests) 456ms
 ✓ src/components/v2/ContextPanel.test.tsx (36 tests) 553ms

 Test Files  10 passed (10)
      Tests  194 passed (194)
   Start at  21:55:09
   Duration  10.38s
```

## Gate 4: Server TypeScript

```
npm run build --prefix src/server
```

Result: **PASS** (exit 0, no output)

```
> lumen-ink-server@0.1.0 build
> tsc
```

注：首次运行失败 4 个 TypeScript 错误（vi.fn 类型不兼容 Express RequestHandler、AuthThrottleRepository 接口未含 store 属性）。修复测试 helper 类型定义后通过。修复仅触及测试文件 `src/server/security/auth.boundary.test.ts`，未触及生产代码。

## Gate 5: Server Tests

```
npm run test --prefix src/server
```

Result: **PASS** (exit 0)

```
 RUN  v4.1.10 D:/360Downloads/Trae 项目/picture-edit/src/server

 ✓ security/auth.boundary.test.ts (33 tests) 229ms    ← HARDEN-001A 新增
 ✓ security/authThrottle.test.ts (6 tests) 73ms
 ✓ security/imageValidation.test.ts (10 tests) 36ms
 ✓ security/redaction.test.ts (19 tests) 7ms
 ✓ security/security.integration.test.ts (9 tests) 169ms
 ✓ config/runtime.test.ts (14 tests) 10ms
 ✓ domain/persistence.contract.test.ts (3 tests) 182ms
 ✓ domain/cloudbase-mock.contract.test.ts (7 tests) 13ms
 ✓ domain/jobState.test.ts (14 tests) 11ms
 ✓ services/ProjectService.test.ts (10 tests) 457ms
 ✓ services/GenerationService.p0.test.ts (8 tests) 1766ms
 ✓ services/GenerationService.test.ts (16 tests) 3508ms
 ✓ services/providers/ProviderStore.test.ts (8 tests) 84ms
 ✓ services/providers/operationType.test.ts (8 tests) 3ms
 ✓ infrastructure/persistence/cloudbase.ensureReady.test.ts (3 tests) 257ms
 ✓ infrastructure/persistence/cloudbase.http.contract.test.ts (16 tests) 35ms
 ✓ infrastructure/persistence/cloudbase.transaction.contract.test.ts (5 tests) 15ms
 ✓ infrastructure/persistence/cloudbase.lease.contract.test.ts (5 tests) 7ms
 ✓ infrastructure/persistence/select.test.ts (6 tests) 4ms
 ✓ infrastructure/executor/worker.test.ts (4 tests) 1050ms
 ✓ infrastructure/executor/worker-recovery.test.ts (5 tests) 76ms
 ✓ routes/projects.test.ts (9 tests) 433ms
 ✓ routes/jobs.test.ts (11 tests) 809ms
 ✓ routes/edit.compat.test.ts (9 tests) 454ms
 ✓ routes/worker.test.ts (6 tests) 32ms
 ✓ persist.e2e.test.ts (13 tests) 1588ms
 (+ 26 paired dist/*.js test files, all passed)

 Test Files  52 passed (52)
      Tests  514 passed (514)
```

注：52 文件 = 26 source `.ts` + 26 paired `dist/*.js`（编译产物）。514 测试 = 257 source + 257 dist 重复。HARDEN-001A 新增 `security/auth.boundary.test.ts` 33 测试已包含在内。

## Gate 6: Root Tests

```
npm run test
```

Run in: repository root

Result: **PASS** (exit 0)

等价于 Gate 3 + Gate 5 串行执行。Client 194 + Server 514 = 708 tests passed。

## Gate 7: Root Build

```
npm run build
```

Run in: repository root

Result: **PASS** (exit 0)

```
> lumen-ink@0.1.0 build
> npm run build --prefix src/client && npm run build --prefix src/server

> client@0.0.0 build
> tsc -b && vite build

vite v8.0.16 building client environment for production...

✓ 1859 modules transformed.
dist/index.html                   0.45 kB │ gzip:   0.30 kB
dist/assets/index-EvrWUPCw.css   46.34 kB │ gzip:   8.82 kB
dist/assets/index-CH0bT766.js   346.83 kB │ gzip: 105.97 kB
✓ built in 390ms

> lumen-ink-server@0.1.0 build
> tsc
```

## Gate 8: check-lumen-collab

```
node scripts/check-lumen-collab.mjs
```

Result: **PASS** (exit 0)

```
Lumen collaboration state and basic public-repo safety checks passed.
```

## TDD Red → Green Evidence

### Red Phase (initial run)

```
Test Files  1 failed (1)
      Tests  1 failed | 32 passed (33)
```

Failed test:
```
FAIL  security/auth.boundary.test.ts > HARDEN-001A: authentication boundary (D-012 P0)
      > AC-A08: throttle returns 429 after threshold
      > does not issue a token when already blocked, even with correct password

AssertionError: expected 200 to be 429 // Object.is equality
- Expected
+ Received
- 429
+ 200
```

Root cause: Test fixture bug — pre-block only `127.0.0.1` (6 failures), but supertest on this platform uses `::ffff:127.0.0.1` or `::1` for `req.ip`. Production code is correct (uses `req.ip` consistently for HMAC key derivation).

### Green Phase (after fixture fix)

Fix: Pre-block all 3 possible IP formats (`127.0.0.1`, `::ffff:127.0.0.1`, `::1`), each with 6 failures.

```
Test Files  1 passed (1)
      Tests  33 passed (33)
   Duration  724ms
```

No production code changes required. D-034 internal security floor (landed in PERSIST-001) already satisfies all HARDEN-001A acceptance criteria.

## Scope Verification

- ✅ No PERSIST-001 business logic modified (grep: no `PERSIST|/api/worker|cron|worker-recovery|GenerationService|ProjectService|recover` references in test file)
- ✅ No Cron configuration modified
- ✅ No ROUTING-001 code modified
- ✅ No production auth code modified (`middleware/auth.ts`, `routes/auth.ts`, `security/authThrottle.ts`, `config/runtime.ts` unchanged)
- ✅ Only 1 new test file added: `src/server/security/auth.boundary.test.ts`
- ✅ No real secrets in test fixtures (all synthetic, below check-lumen-collab thresholds)
