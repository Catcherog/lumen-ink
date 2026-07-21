# HARDEN-001C — 8 Gate Results

> Captured: 2026-07-21
> Branch: `lumen/harden-001c-trae`
> Base commit: `7be5f76` (HARDEN-001B merged to main)
> Task ID: HARDEN-001C-PUBLIC-RELEASE-HARDENING

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
  Duration  10.19s
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

注：首次运行失败，原因是 `log.redaction.paths.test.ts` line 161 隐式 any 类型。修复后通过（添加显式 `unknown[][]` / `unknown[]` / `unknown` 类型注解）。

## Gate 5: Server Tests

```
npm run test --prefix src/server
```

Result: **PASS** (exit 0)

```
Test Files  30 passed (30)
     Tests  292 passed (292)
  Duration  4.00s
```

注：HARDEN-001C 新增 3 个测试文件共 23 个测试已包含在内：
- `security/route.wiring.test.ts` (13 tests, AC-C01~AC-C07)
- `security/trust.proxy.production.test.ts` (3 tests, AC-C08~AC-C09)
- `security/log.redaction.paths.test.ts` (7 tests, AC-C10~AC-C14)

Server 测试从 HARDEN-001B 的 269 增加到 292（+23）。

## Gate 6: Root Tests

```
npm run test
```

Run in: repository root

Result: **PASS** (exit 0)

等价于 Gate 3 + Gate 5 串行执行。Client 194 + Server 292 = 486 tests passed。

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
✓ built in 337ms

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

3 test files, 9 tests failed (expected):

1. `route.wiring.test.ts` — AC-C02 (auth path 404) + AC-C07 (trust proxy not set)
2. `trust.proxy.production.test.ts` — AC-C08/C09 (3 tests, trust proxy not set)
3. `log.redaction.paths.test.ts` — AC-C10/C14 (projects.ts raw err) + AC-C12 (detect.ts raw mimeType)

### Green Phase (after fix)

修改 3 个生产文件 + 2 处测试 regex 修正：

1. `src/server/index.ts` — 添加 `app.set('trust proxy', 1);`（关闭 AC-C07/C08/C09）
2. `src/server/routes/projects.ts` — 5 处 `console.error('...', err)` 改为 `redactError` 包装（关闭 AC-C10/C14/C11）
3. `src/server/routes/detect.ts` — `console.log(...mimeType...)` 改为 `redactString(mimeType)` 包装（关闭 AC-C12）

测试 regex 修正（测试 bug，非生产代码 bug）：
- `log.redaction.paths.test.ts` 2 处 regex `['"][^'"]*redaction['"]` → `['"][^'"]*redaction[^'"]*['"]`
- 原因：原 regex 要求 `redaction` 紧跟引号，但 ESM import 路径是 `'../security/redaction.js'`，`redaction` 后面是 `.js'`

TDD 测试类型修复：
- `log.redaction.paths.test.ts` line 159-161 添加显式 `unknown[][]` / `unknown[]` / `unknown` 类型注解（修复 TS7006 隐式 any）

```
Test Files  3 passed (3)
     Tests  23 passed (23)
  Duration  569ms
```

## Scope Verification

- ✅ No PERSIST-001 business logic modified
- ✅ No `/api/worker/recover` route modified
- ✅ No Cron configuration modified
- ✅ No ROUTING-001 code modified
- ✅ No authentication code modified (`middleware/auth.ts`, `routes/auth.ts`, `security/authThrottle.ts`, `config/runtime.ts` unchanged)
- ✅ 3 production files modified:
  - `src/server/index.ts` (+7 lines: trust proxy 设置 + 注释)
  - `src/server/routes/projects.ts` (+6 lines: redactError import + 5 处包装)
  - `src/server/routes/detect.ts` (+2 lines: redactString import + mimeType 包装)
- ✅ 3 new test files added (23 tests total):
  - `src/server/security/route.wiring.test.ts` (13 tests)
  - `src/server/security/trust.proxy.production.test.ts` (3 tests)
  - `src/server/security/log.redaction.paths.test.ts` (7 tests)
- ✅ 1 new runbook document: `docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md`
- ✅ No real secrets in test fixtures (all synthetic, below check-lumen-collab thresholds)

## Debt Closure Verification

- ✅ DEBT-HARDEN-001A-02 RESOLVED — 真实生产路由 wiring 回归测试（`route.wiring.test.ts` 13 tests）
- ✅ DEBT-HARDEN-001A-03 RESOLVED — Vercel trust proxy / `req.ip` 假设（`trust.proxy.production.test.ts` 3 tests + `index.ts` 生产代码修改）
- ✅ Gate D 剩余公开发布安全项 — 日志脱敏（`log.redaction.paths.test.ts` 7 tests + projects.ts/detect.ts 生产代码修改）
- ✅ Production flag 切换和回滚文档 — `docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md`
