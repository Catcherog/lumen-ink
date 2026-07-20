# HARDEN-001B — 8 Gate Results

> Captured: 2026-07-21
> Branch: `lumen/harden-001b-trae`
> Base commit: `4e720b6` (HARDEN-001A merged to main)
> Task ID: HARDEN-001B-PROVIDER-KEY-MIGRATION

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
Test Files  10 passed (10)
     Tests  194 passed (194)
  Duration  2.58s
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

## Gate 5: Server Tests

```
npm run test --prefix src/server
```

Result: **PASS** (exit 0)

```
Test Files  27 passed (27)
     Tests  269 passed (269)
  Duration  2.77s
```

注：HARDEN-001B 新增 `services/providers/providerKey.lifecycle.test.ts` 12 测试已包含在内。

dist/ 编译产物不再被 vitest 扫描（DEBT-HARDEN-001A-04 根本解决）。真实 unique 测试计数：
- 26 source `.ts` test files (含 1 新增) + 269 tests
- 之前含 dist 重复：52 files / 514 tests
- 现在纯源码：27 files / 269 tests

## Gate 6: Root Tests

```
npm run test
```

Run in: repository root

Result: **PASS** (exit 0)

等价于 Gate 3 + Gate 5 串行执行。Client 194 + Server 269 = 463 tests passed。

## Gate 7: Root Build

```
npm run build
```

Run in: repository root

Result: **PASS** (exit 0)

```
> client@0.0.0 build
> tsc -b && vite build

vite v8.0.16 building client environment for production...
✓ 1859 modules transformed.
dist/index.html                   0.45 kB │ gzip:   0.30 kB
dist/assets/index-EvrWUPCw.css   46.34 kB │ gzip:   8.82 kB
dist/assets/index-CH0bT766.js   346.83 kB │ gzip: 105.97 kB
✓ built in 315ms

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

3 tests failed:

1. `AC-B01: does not contain /tmp when VERCEL env is unset`
   - 失败原因：源码中 `path.join('/tmp', 'lumen-ink-data')` 存在
2. `AC-B01: does not contain /tmp when VERCEL=1 env is set`
   - 失败原因：源码中 `process.env.VERCEL ? path.join('/tmp', ...)` 分支存在
3. `AC-B05: loadFromFile failure logs redacted message without file contents`
   - 失败原因：`console.error` 输出 `[object Object]` 而非序列化 JSON，导致 `PROVIDER_STORE_LOAD_FAILED` 不可见

### Green Phase (after fix)

修复 1：移除 `DEFAULT_DATA_DIR` 中的 `process.env.VERCEL` 分支
```typescript
// Before
const DEFAULT_DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'lumen-ink-data')
  : path.join(projectRoot, 'src', 'server', 'data');

// After
const DEFAULT_DATA_DIR = path.join(projectRoot, 'src', 'server', 'data');
```

修复 2：序列化 redacted log 为 JSON 字符串
```typescript
// Before
console.error('[ProviderStore] Failed to load providers.json', redacted.log);

// After
console.error(
  '[ProviderStore] Failed to load providers.json',
  JSON.stringify(redacted.log)
);
```

修复 3：创建 `src/server/vitest.config.ts` 排除 dist/（根本解决 DEBT-HARDEN-001A-04）

```
Test Files  1 passed (1)
     Tests  12 passed (12)
  Duration  238ms
```

## Scope Verification

- ✅ No PERSIST-001 business logic modified
- ✅ No `/api/worker/recover` route modified
- ✅ No Cron configuration modified
- ✅ No ROUTING-001 code modified
- ✅ No authentication code modified (`middleware/auth.ts`, `routes/auth.ts`, `security/authThrottle.ts`, `config/runtime.ts` unchanged)
- ✅ Only 1 production file modified: `src/server/services/providers/ProviderStore.ts` (2 edits: remove /tmp branch, fix log serialization)
- ✅ 1 new test file added: `src/server/services/providers/providerKey.lifecycle.test.ts` (12 tests)
- ✅ 1 new config file added: `src/server/vitest.config.ts` (excludes dist/ from test collection)
- ✅ No real secrets in test fixtures (all synthetic, below check-lumen-collab thresholds)
- ✅ DEBT-HARDEN-001A-04 RESOLVED (root-cause fix via vitest.config.ts)
