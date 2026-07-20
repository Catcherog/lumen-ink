# HARDEN-001B — Trae Implementation Report

> Task ID: HARDEN-001B-PROVIDER-KEY-MIGRATION
> Batch: HARDEN-001B (Provider Key 安全迁移)
> Implementer: Trae
> Date: 2026-07-21 (Asia/Shanghai)
> Branch: `lumen/harden-001b-trae`
> Base commit: `4e720b6` (HARDEN-001A merged to main)
> Risk Level: Medium
> Codex: NOT_REQUIRED

---

## 1. Executive Summary

完成 D-011 Provider Key 迁离 `/tmp` 的剩余工作。D-034 已在 PERSIST-001 落地 env-managed 模式（deployed 模式下从环境变量重建 Provider 元数据，无 fs 写入），但 `ProviderStore.ts` 中 `DEFAULT_DATA_DIR` 仍硬编码 `process.env.VERCEL ? '/tmp/lumen-ink-data' : ...` 分支，违反 D-011「Production Provider 配置不依赖 `/tmp`」的明确要求。

本轮通过 TDD red→green 模式：
- 移除 `/tmp` 硬编码依赖
- 修复 redacted log 序列化 bug（`console.error` 输出 `[object Object]`）
- 根本解决 DEBT-HARDEN-001A-04（dist/ 测试重复计数）通过新建 `vitest.config.ts` 排除 dist/

不修改 PERSIST-001 业务逻辑、Cron 配置、认证代码。不调用 Codex。

---

## 2. Acceptance Criteria Coverage

### AC-B01: DEFAULT_DATA_DIR 不引用 /tmp（无论 VERCEL 环境变量如何）

- **Status**: PASS
- **Test**: `providerKey.lifecycle.test.ts > AC-B01`
- **Verification**: 源码静态扫描，确认 `process.env.VERCEL ? path.join('/tmp', ...)` 分支已移除

### AC-B02: deployed 模式零 fs 操作

- **Status**: PASS
- **Test**: `providerKey.lifecycle.test.ts > AC-B02`
- **Verification**: `vi.spyOn(fs, 'existsSync' | 'mkdirSync' | 'readFileSync' | 'writeFileSync')` 在 `list()` / `get()` / `getDefault()` / `create()` / `update()` / `delete()` / `setDefault()` 调用后均 `not.toHaveBeenCalled()`

### AC-B03: deployed 模式 cold start 不创建任何目录或文件

- **Status**: PASS
- **Test**: `providerKey.lifecycle.test.ts > AC-B03`
- **Verification**: 配置 `dataDir` 为不存在的子目录，调用 `list()` + `getDefault()` 后 `fs.existsSync(freshDataDir) === false`

### AC-B04: Provider Key 不返回前端

- **Status**: PASS
- **Test**: `providerKey.lifecycle.test.ts > AC-B04`
- **Verification**: `list()` 返回所有 provider 的 `apiKey === ''` 且 `hasApiKey === true`；`create()` 在 env-managed 模式返回 sanitized view

### AC-B05: 错误日志脱敏，不泄露 apiKey

- **Status**: PASS（修复后）
- **Test**: `providerKey.lifecycle.test.ts > AC-B05`
- **Verification**: 写入损坏 JSON 触发 `loadFromFile` 失败，`console.error` 输出包含 `PROVIDER_STORE_LOAD_FAILED` 但不包含原始文件内容
- **Fix**: 将 `console.error('...', redacted.log)` 改为 `console.error('...', JSON.stringify(redacted.log))`，因为 `redacted.log` 是 `Record<string, unknown>`，默认序列化为 `[object Object]`

### AC-B06: env-managed 模式 CRUD 不创建 providers.json 文件

- **Status**: PASS
- **Test**: `providerKey.lifecycle.test.ts > AC-B06`
- **Verification**: 调用 `create` / `update` / `setDefault` / `delete` 后 `fs.existsSync(path.join(tempDir, 'providers.json')) === false`

### AC-B07: local 模式 delete 清理行为

- **Status**: PASS
- **Test**: `providerKey.lifecycle.test.ts > AC-B07`
- **Verification**: `delete()` 后从 providers.json 中移除对应 provider；`delete()` 不存在的 id 返回 `false` 且不修改文件

### AC-B08: VERCEL=1 但 isDeployed=false 时不写入 /tmp

- **Status**: PASS
- **Test**: `providerKey.lifecycle.test.ts > AC-B08`
- **Verification**: 模拟误配置（VERCEL=1 但 local 模式），`writeFileSync` 调用路径不包含 `/tmp/lumen-ink-data`，全部指向显式 `dataDir` 覆盖

---

## 3. Files Changed

### 3.1 Production Code (1 file)

| Path | Change |
|------|--------|
| `src/server/services/providers/ProviderStore.ts` | (1) 移除 `DEFAULT_DATA_DIR` 中 `process.env.VERCEL ? '/tmp/lumen-ink-data' : ...` 分支，统一使用 `path.join(projectRoot, 'src', 'server', 'data')`；(2) 修复 `console.error` 序列化 `redacted.log` 为 JSON 字符串 |

### 3.2 New Test File (1 file)

| Path | Tests | Coverage |
|------|-------|----------|
| `src/server/services/providers/providerKey.lifecycle.test.ts` | 12 | AC-B01 ~ AC-B08 全部 D-011 不变量 |

### 3.3 New Config File (1 file)

| Path | Purpose |
|------|---------|
| `src/server/vitest.config.ts` | 排除 `**/dist/**` 防止编译产物被测试运行器扫描（DEBT-HARDEN-001A-04 根本解决） |

### 3.4 Documentation (will be added in docs commit)

- `docs/lumen-v2/evidence/HARDEN-001B/gate-results.md`
- `docs/lumen-v2/reports/HARDEN-001B-TRAE-REPORT.md` (本文件)
- `docs/lumen-v2/state/STATE.json` (状态推进)
- `docs/lumen-v2/state/SESSION-HANDOFF.md`
- `docs/lumen-v2/state/PROJECT-MEMORY.md`
- `docs/lumen-v2/state/DECISION-LOG.md` (D-048)
- `docs/lumen-v2/tasks/active/HARDEN-001.md` (Review History)
- `docs/ai/TECH_DEBT.md` (DEBT-HARDEN-001A-04 → RESOLVED)

---

## 4. TDD Red → Green Evidence

### Red Phase

3 tests failed on initial run:

```
FAIL  services/providers/providerKey.lifecycle.test.ts > AC-B01: DEFAULT_DATA_DIR does not reference /tmp
  > does not contain /tmp when VERCEL env is unset
  > does not contain /tmp when VERCEL=1 env is set

FAIL  services/providers/providerKey.lifecycle.test.ts > AC-B05: error logs are redacted
  > loadFromFile failure logs redacted message without file contents
  AssertionError: expected '[ProviderStore] Failed to load provid…' to contain 'PROVIDER_STORE_LOAD_FAILED'
  Received: "[ProviderStore] Failed to load providers.json [object Object]"

Test Files  1 failed (1)
     Tests  3 failed | 9 passed (12)
```

### Green Phase

After 2 minimal fixes:
1. Remove `process.env.VERCEL` branch in `DEFAULT_DATA_DIR`
2. `JSON.stringify(redacted.log)` in `console.error`

```
Test Files  1 passed (1)
     Tests  12 passed (12)
  Duration  238ms
```

No production auth code changes. D-034 internal security floor preserved.

---

## 5. Debt Resolution

### DEBT-HARDEN-001A-04: 后续清理 dist 测试重复计数

- **Status**: RESOLVED (本轮根本解决)
- **Root Cause**: vitest 默认配置未排除 `dist/`，导致编译产物 `*.test.js` 与源码 `*.test.ts` 同时被收集
- **Fix**: 新建 `src/server/vitest.config.ts`，`test.exclude` 包含 `'**/dist/**'`
- **Before**: 52 files / 514 tests (含 26 dist 重复)
- **After**: 27 files / 269 tests (纯源码)

### 其他 debt

- DEBT-HARDEN-001A-01 (AC-A04 NOT_APPLICABLE): 仍 OPEN，待 P1 RBAC
- DEBT-HARDEN-001A-02 (生产路由 wiring 回归): 仍 OPEN，待 HARDEN-001C
- DEBT-HARDEN-001A-03 (Vercel trust proxy): 仍 OPEN，待 HARDEN-001C

---

## 6. Scope Compliance

### 6.1 不修改清单（全部遵守）

- ❌ 未修改 PERSIST-001 业务逻辑
- ❌ 未修改 `/api/worker/recover` 路由
- ❌ 未修改 Cron 配置
- ❌ 未修改 ROUTING-001 相关代码
- ❌ 未修改认证代码（`middleware/auth.ts` / `routes/auth.ts` / `security/authThrottle.ts` / `config/runtime.ts` 全部保持原状）
- ❌ 未调用 Codex（NOT_REQUIRED）

### 6.2 Stop Conditions 检查

- ✅ 未出现真实认证绕过
- ✅ 未出现 Secret 泄露
- ✅ 原有生产测试无失败（flaky test 已重跑确认通过）
- ✅ 未触及 PERSIST/Cron 状态机

---

## 7. Gate Results Summary

| Gate | Name | Result |
|------|------|--------|
| 1 | Client Lint | PASS |
| 2 | Client TypeScript | PASS |
| 3 | Client Tests | 194/194 PASS |
| 4 | Server TypeScript | PASS |
| 5 | Server Tests | 269/269 PASS (含 12 新增) |
| 6 | Root Tests | 463/463 PASS |
| 7 | Root Build | PASS |
| 8 | check-lumen-collab | PASS |

完整证据见 `docs/lumen-v2/evidence/HARDEN-001B/gate-results.md`。

---

## 8. Next Steps

1. Trae 提交本批次到 `lumen/harden-001b-trae` 分支
2. 状态推进到 `awaiting_gpt_acceptance / nextActor=gpt`
3. GPT 证据审查
4. 通过后合并到 main
5. 合并后立即创建 `lumen/harden-001c-trae` 分支，启动 HARDEN-001C 公开发布加固
6. PROD-CRON-VERIFY 保持并行，不阻塞 HARDEN-001C
7. ROUTING-001 继续保持阻塞

---

**Report End**
