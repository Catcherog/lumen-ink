# HARDEN-001C — Trae Implementation Report

> Task ID: HARDEN-001C-PUBLIC-RELEASE-HARDENING
> Batch: HARDEN-001C (Gate D 公开发布加固)
> Implementer: Trae
> Date: 2026-07-21 (Asia/Shanghai)
> Branch: `lumen/harden-001c-trae`
> Base commit: `7be5f76` (HARDEN-001B merged to main)
> Risk Level: Medium
> Codex: NOT_REQUIRED

---

## 1. Executive Summary

完成 HARDEN-001B GPT 证据审查通过后的合并与 HARDEN-001C 公开发布加固。

HARDEN-001B 审查结论 `EVIDENCE_REVIEW_PASS`，已 fast-forward 合并到 main（`4e720b6..7be5f76`）。

HARDEN-001C 通过 TDD red→green 模式关闭 GPT 任务卡指定的全部范围：
- **DEBT-HARDEN-001A-02**：真实生产路由 wiring 回归测试（`route.wiring.test.ts`，13 tests）
- **DEBT-HARDEN-001A-03**：Vercel trust proxy / `req.ip` 假设（`trust.proxy.production.test.ts`，3 tests + `index.ts` 生产代码修改）
- **Gate D 剩余公开发布安全项**：日志脱敏（`log.redaction.paths.test.ts`，7 tests + `projects.ts`/`detect.ts` 生产代码修改）
- **Production flag 切换和回滚文档**：`docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md`

不修改 PERSIST-001 业务逻辑、Cron 配置、认证 middleware 代码。不调用 Codex。

---

## 2. Pre-HARDEN-001C Steps (GPT 审查落盘 + 合并)

### 2.1 GPT 审查文件落盘

- 新建 `docs/lumen-v2/reviews/HARDEN-001B-GPT-REVIEW.md`
- 审查结论：`EVIDENCE_REVIEW_PASS`
- 8 项 AC 全部 PASS
- 无 S0/S1 风险，无阻塞修复
- Codex NOT_REQUIRED

### 2.2 状态更新

- `STATE.json`: `reviewVerdict = EVIDENCE_REVIEW_PASS`, `status = gpt_evidence_review_pass`, `nextActor = user_or_trae_for_merge`
- 新增 `harden001bGptReviewVerdict`, `harden001bGptReviewNonblockNotes`（4 项非阻塞说明）
- `DECISION-LOG.md`: 新增 D-049（HARDEN-001B GPT 证据审查裁决）
- `PROJECT-MEMORY.md` / `SESSION-HANDOFF.md` / `HARDEN-001.md` 同步更新

### 2.3 Commit + 合并

- Commit `7be5f76` pushed 到 `lumen/harden-001b-trae`（仅状态/文档，无生产代码修改）
- main fast-forward 合并 `4e720b6..7be5f76`
- 从合并后 main 创建 `lumen/harden-001c-trae` 分支

---

## 3. Acceptance Criteria Coverage

### AC-C01: /api/health 公开可达且仅返回 {"status":"ok"}

- **Status**: PASS
- **Test**: `route.wiring.test.ts > AC-C01`
- **Verification**: GET /api/health 无 auth header 返回 200 + `{ status: 'ok' }`，无 env/provider/key 字段

### AC-C02: /api/auth 无 JWT 可达

- **Status**: PASS（红阶段修复）
- **Test**: `route.wiring.test.ts > AC-C02`
- **Verification**: POST /api/auth/ 无 JWT 返回 4xx（非 authMiddleware 的 401）
- **Red phase issue**: 测试最初用 `/api/auth/login`，但 auth router 挂载 `router.post('/', ...)`，实际路径是 `/api/auth/`（带尾斜杠）

### AC-C03: 受保护路由无 JWT 返回 401

- **Status**: PASS
- **Test**: `route.wiring.test.ts > AC-C03`（5 个子测试）
- **Verification**: GET /api/providers, POST /api/edit, POST /api/detect/people, GET /api/projects, GET /api/jobs 全部返回 401

### AC-C04: /api/worker 无 CRON_SECRET 返回 401/403

- **Status**: PASS
- **Test**: `route.wiring.test.ts > AC-C04`
- **Verification**: POST/GET /api/worker/recover 无 CRON_SECRET 返回 401/403

### AC-C05: 未知 /api 路径返回 404

- **Status**: PASS
- **Test**: `route.wiring.test.ts > AC-C05`
- **Verification**: GET/POST /api/nonexistent 返回 404

### AC-C06: health 响应不含敏感字段

- **Status**: PASS
- **Test**: `route.wiring.test.ts > AC-C01`
- **Verification**: res.body 中 env/providers/hasJwtSecret/hasSeedreamKey/jwtSecret/corsAllowlist 全部 undefined

### AC-C07: 生产 app 启用 trust proxy

- **Status**: PASS（绿阶段修复）
- **Test**: `route.wiring.test.ts > AC-C07` + `trust.proxy.production.test.ts > AC-C08/C09`
- **Verification**: `app.get('trust proxy')` 返回 truthy 值（非 false）
- **Fix**: `src/server/index.ts` 添加 `app.set('trust proxy', 1);`

### AC-C08: 生产 app 设置 trust proxy

- **Status**: PASS（绿阶段修复）
- **Test**: `trust.proxy.production.test.ts > AC-C08`
- **Verification**: `app.settings['trust proxy']` 非 false，truthy

### AC-C09: trust proxy 设置值稳定

- **Status**: PASS（绿阶段修复）
- **Test**: `trust.proxy.production.test.ts > AC-C09`
- **Verification**: 设置值类型为 number/boolean/function（非 undefined）

### AC-C10: projects.ts 错误日志通过 redactError

- **Status**: PASS（绿阶段修复）
- **Test**: `log.redaction.paths.test.ts > AC-C10/AC-C14`
- **Verification**: 源码静态扫描无 `console.error('...', err)` 裸 err 参数
- **Fix**: `src/server/routes/projects.ts` 5 处 `console.error` 改为 `redactError` 包装

### AC-C11: projects.ts DELETE 错误路径日志脱敏

- **Status**: PASS（绿阶段修复）
- **Test**: `log.redaction.paths.test.ts > AC-C11`
- **Verification**: 运行时 spy 验证 console.error 输出包含 errorCode 但不含 raw Error stack/secret

### AC-C12: detect.ts mimeType 日志脱敏

- **Status**: PASS（绿阶段修复）
- **Test**: `log.redaction.paths.test.ts > AC-C12`
- **Verification**: 源码静态扫描无 `console.log(...${mimeType}...)` raw mimeType
- **Fix**: `src/server/routes/detect.ts` 改为 `redactString(mimeType || 'unknown')`

### AC-C13: detect.ts 错误路径使用 redactError（回归守卫）

- **Status**: PASS
- **Test**: `log.redaction.paths.test.ts > AC-C13`
- **Verification**: 源码包含 `redactError(` 调用（D-034 已有，未回归）

### AC-C14: projects.ts 源码不含裸 err 日志

- **Status**: PASS（绿阶段修复）
- **Test**: `log.redaction.paths.test.ts > AC-C10/AC-C14`
- **Verification**: 源码静态扫描无 `console.error(..., err/error/e/ex)` 模式

---

## 4. Implementation Details

### 4.1 生产代码修改（3 文件）

#### `src/server/index.ts`（+7 行）

```typescript
const app = express();

// D-034 / HARDEN-001C (DEBT-HARDEN-001A-03): trust the first proxy hop so
// `req.ip` reads from `X-Forwarded-For` on Vercel. Without this, every
// login-failure throttle bucket collapsed to the reverse-proxy IP and the
// throttle was effectively disabled. Set unconditionally (local dev behind
// a proxy also benefits); no regression in direct-connect local mode.
app.set('trust proxy', 1);
```

#### `src/server/routes/projects.ts`（+6 行）

新增 import：
```typescript
import { redactError } from '../security/redaction.js';
```

5 处 catch 块修改（POST / GET /:id / DELETE /:id / activate / approve）：
```typescript
// Before
console.error('[routes.projects] POST / failed', err);

// After
const redacted = redactError(err, { errorCode: 'SAVE_FAILED' });
console.error('[routes.projects] POST / failed', redacted.log);
```

#### `src/server/routes/detect.ts`（+2 行）

修改 import：
```typescript
// Before
import { redactError } from '../security/redaction.js';

// After
import { redactError, redactString } from '../security/redaction.js';
```

修改 mimeType 日志：
```typescript
// Before
console.log(`[detect/people] mimeType=${mimeType || 'unknown'} dims=${width}x${height} regions=${regions.length}`);

// After
console.log(`[detect/people] mimeType=${redactString(mimeType || 'unknown')} dims=${width}x${height} regions=${regions.length}`);
```

### 4.2 测试文件（3 文件，23 tests）

#### `src/server/security/route.wiring.test.ts`（新建，13 tests）

覆盖 AC-C01~AC-C07。动态 import 真实 `index.ts` app，设置 env 后 `const mod = await import('../index.js'); app = mod.default;`。

关键模式：
- `process.env.PORT = '0'` 避免 EADDRINUSE
- `process.env.CORS_ALLOWLIST = 'http://localhost:5173'`
- 受保护路由表数组化遍历测试

#### `src/server/security/trust.proxy.production.test.ts`（新建，3 tests）

覆盖 AC-C08~AC-C09。断言 `app.get('trust proxy')` 非 false、truthy、类型为 number/boolean/function。

#### `src/server/security/log.redaction.paths.test.ts`（新建，7 tests）

覆盖 AC-C10~AC-C14。源码静态扫描 + 运行时 console.error spy。

关键模式：
- 静态扫描 `console.error(..., err)` 裸 err 参数
- 运行时 spy 验证 DELETE 错误路径日志含 errorCode 不含 raw secret
- 静态扫描 `console.log(...${mimeType}...)` raw mimeType

### 4.3 测试 bug 修正（非生产代码 bug）

`log.redaction.paths.test.ts` 2 处 regex 修正：
- 原 regex `['"][^'"]*redaction['"]` 要求 `redaction` 紧跟引号
- 实际 ESM import 路径 `'../security/redaction.js'`，`redaction` 后面是 `.js'`
- 修正为 `['"][^'"]*redaction[^'"]*['"]`

`log.redaction.paths.test.ts` line 159-161 类型注解修复：
- TS7006 隐式 any 错误
- 添加显式 `unknown[][]` / `unknown[]` / `unknown` 类型注解

### 4.4 Production flag runbook 文档

新建 `docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md`（186 行），包含：
- Production flag 定义（`VERCEL=1` / `NODE_ENV=production`）
- 切换到 production 模式的前置条件、步骤、验证清单
- 回滚到 local/dev 模式的触发条件、步骤、验证
- 紧急回滚（Git revert / 环境变量禁用）
- 风险与注意事项（trust proxy / Provider Key / 日志脱敏 / Cron Secret）

---

## 5. Test Results

### 5.1 8 Gate Results（全部 PASS）

| Gate | 命令 | 结果 |
|------|------|------|
| 1. Client Lint | `npm run lint --prefix src/client` | PASS |
| 2. Client TSC | `npx tsc -b --noEmit` | PASS |
| 3. Client Tests | `npm run test --prefix src/client` | PASS (194 tests) |
| 4. Server TSC | `npm run build --prefix src/server` | PASS |
| 5. Server Tests | `npm run test --prefix src/server` | PASS (292 tests) |
| 6. Root Tests | `npm run test` | PASS (486 tests = 194 + 292) |
| 7. Root Build | `npm run build` | PASS |
| 8. check-lumen-collab | `node scripts/check-lumen-collab.mjs` | PASS |

### 5.2 TDD Red → Green

- Red: 3 test files, 9 failed | 14 passed (23 total)
- Green: 3 test files, 23 passed (23 total)

### 5.3 测试计数变化

- HARDEN-001B: 463 tests（194 client + 269 server）
- HARDEN-001C: 486 tests（194 client + 292 server，+23）
- 新增 23 tests：route.wiring (13) + trust.proxy (3) + log.redaction (7)

---

## 6. Debt Closure

| Debt ID | 描述 | 关闭方式 | 状态 |
|---------|------|---------|------|
| DEBT-HARDEN-001A-02 | 真实生产路由 wiring 回归测试 | `route.wiring.test.ts` 13 tests | RESOLVED |
| DEBT-HARDEN-001A-03 | Vercel trust proxy / req.ip 假设 | `trust.proxy.production.test.ts` 3 tests + `index.ts` 修改 | RESOLVED |
| Gate D 剩余公开发布安全项 | 日志脱敏 | `log.redaction.paths.test.ts` 7 tests + `projects.ts`/`detect.ts` 修改 | RESOLVED |
| Production flag 文档 | 切换和回滚 runbook | `docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md` | RESOLVED |

---

## 7. Scope Compliance

- ✅ No PERSIST-001 business logic modified
- ✅ No `/api/worker/recover` route modified
- ✅ No Cron configuration modified
- ✅ No ROUTING-001 code modified
- ✅ No authentication middleware code modified（`middleware/auth.ts`, `routes/auth.ts`, `security/authThrottle.ts`, `config/runtime.ts` 未修改）
- ✅ No real secrets in test fixtures（全部 synthetic，低于 check-lumen-collab 阈值）
- ✅ No Codex invocation（NOT_REQUIRED）

---

## 8. Known Issues & Rollback

### 8.1 已知问题

无阻塞性问题。

非阻塞说明：
1. `findProjectRoot()` 模块初始化阶段仍有 fs 读取（`package.json`），但不涉及 Provider Key/Provider 文件/`/tmp`（GPT 在 HARDEN-001B 审查中已确认）
2. 日志由对象参数改为 JSON 字符串后，可能降低部分日志平台的结构化字段检索能力（GPT 在 HARDEN-001B 审查中已确认）
3. `vitest.config.ts` 手工保留 `node_modules` 和 `.git` 并增加 `dist`，后续可改为展开默认值（GPT 在 HARDEN-001B 审查中已确认）

### 8.2 回滚方式

1. **代码回滚**：`git revert <HARDEN-001C commit> -m 1` 推送到 main
2. **Trust proxy 紧急禁用**：注释 `src/server/index.ts` 中 `app.set('trust proxy', 1);`（注意：会导致 throttle 失效）
3. **日志脱敏紧急禁用**：还原 `projects.ts`/`detect.ts` 的 `console.error`/`console.log`（注意：会泄露 raw Error stack 和 mimeType）
4. **Production flag 回滚**：参考 `docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md` 第 3 节

---

## 9. Stop Conditions Check

GPT 任务卡定义的 Stop Conditions 均未触发：
- ✅ 合并前 branch head 与已审查提交范围一致（`7be5f76`）
- ✅ 无新增生产代码变化（HARDEN-001B 审查后仅状态文档提交）
- ✅ 门禁重新运行无失败（8/8 PASS）
- ✅ 无真实 Secret/Provider Key/用户数据进入日志/响应
- ✅ HARDEN-001C 未修改 PERSIST/Cron 状态机
- ✅ 认证 wiring 或 trust proxy 通过仓库上下文确定（`route.wiring.test.ts` + `trust.proxy.production.test.ts` 验证）

---

## 10. Next Steps

1. GPT 证据审查 HARDEN-001C（使用 `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` 模板）
2. 审查通过后合并到 main
3. HARDEN-001 整体标记 complete
4. ROUTING-001 解除阻塞
5. PROD-CRON-VERIFY 继续推进

---

## 11. Related Files

### 生产代码（3 文件修改）
- `src/server/index.ts` — trust proxy 设置
- `src/server/routes/projects.ts` — redactError 包装
- `src/server/routes/detect.ts` — redactString 包装

### 测试文件（3 文件新建）
- `src/server/security/route.wiring.test.ts` — 13 tests
- `src/server/security/trust.proxy.production.test.ts` — 3 tests
- `src/server/security/log.redaction.paths.test.ts` — 7 tests

### 文档（1 文件新建 + 状态文件更新）
- `docs/lumen-v2/runbooks/PRODUCTION-FLAG-RUNBOOK.md` — 新建
- `docs/lumen-v2/evidence/HARDEN-001C/gate-results.md` — 新建
- `docs/lumen-v2/reports/HARDEN-001C-TRAE-REPORT.md` — 本文件
- `docs/lumen-v2/state/STATE.json` — 状态更新
- `docs/lumen-v2/state/SESSION-HANDOFF.md` — 交接更新
- `docs/lumen-v2/state/PROJECT-MEMORY.md` — 任务列表更新
- `docs/lumen-v2/state/DECISION-LOG.md` — 决策记录
- `docs/lumen-v2/tasks/active/HARDEN-001.md` — 任务状态更新
- `docs/ai/TECH_DEBT.md` — DEBT 关闭记录
