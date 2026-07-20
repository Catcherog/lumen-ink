# HARDEN-001A Trae Implementation Report

> 任务：HARDEN-001A-AUTH-BOUNDARY（D-012 P0 认证边界）
> 报告日期：2026-07-21
> 报告作者：Trae
> 分支：`lumen/harden-001a-trae`
> 状态推进：`ready_for_trae / nextActor=trae` → `awaiting_gpt_acceptance / nextActor=gpt`
> 基线提交：`e08eb3e`（POST-MERGE-PARALLEL-ACTIVATION-01 激活 commit）
> 风险等级：High
> 推荐路径：R3，但当前阶段不调用 Codex（NOT_REQUIRED）

## 1. 执行摘要

HARDEN-001A 在 `lumen/harden-001a-trae` 单分支内完成 D-012 P0 认证边界的 TDD 验证。经过只读攻击面盘点，确认 PERSIST-001 已落地的 D-034 内部安全底线（runtime secret fail-fast、durable login throttle HMAC-derived key、CORS allowlist、allowlist redaction）已满足 HARDEN-001A 任务卡 AC-A02 ~ AC-A13 全部认证边界要求。本批次采用 TDD specification-test 模式：先写覆盖所有 AC 的失败测试（red），修正测试 fixture bug 后全绿（green），无需任何生产代码改动。

**关键产出**：
- 33 个新测试用例覆盖 AC-A02 至 AC-A13（`src/server/security/auth.boundary.test.ts`，547 行）
- 认证攻击面矩阵（受保护路由 × 认证规则 × 授权规则 × 期望行为 × 风险）
- 8 门禁全绿：client 194 + server 514（含新 33 测试）= 708 root tests passed
- 不触及 PERSIST/Cron/ROUTING 任何代码（仅新增测试文件）

## 2. 提交记录

| 顺序 | Commit | 说明 |
|------|--------|------|
| 1 | (本提交) | `feat(lumen-v2): HARDEN-001A authentication boundary`（TDD 测试 + 报告 + 状态推进） |

分支：`lumen/harden-001a-trae`
变更：新增 1 个测试文件 + 1 个 Trae 报告 + 1 个 gate-results 证据 + 更新 STATE.json 与 SESSION-HANDOFF.md。

## 3. 范围遵守

按 HARDEN-001A 任务卡与 SESSION-HANDOFF 指示执行：

- ✅ 单一范围提交：仅 1 个 commit，对应 1 个任务 ID（HARDEN-001A）
- ✅ TDD：先写失败测试（red：1 个 fixture bug），再修正 fixture 使全绿（green）
- ✅ 不修改 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置（grep 验证无 PERSIST/Cron/ROUTING 关键词）
- ✅ 不启动 ROUTING-001 或 HARDEN-001B/C
- ✅ 保留工作区既有无关修改：使用精确 `git add <path>`，未触碰未提交的无关文件
- ✅ 未提交密钥、真实客户数据或未脱敏证据（check-lumen-collab PASS）
- ✅ 未遇到硬停止条件

## 4. 只读认证攻击面盘点

### 4.1 受保护路由矩阵

| 路由/资源 | 当前认证 | 当前授权 | 期望行为 | 风险 |
|----------|---------|---------|---------|------|
| `POST /api/auth` | 无（公开登录端点） | 无 | 限流 5 次失败后 429 | 低（已实现 HMAC-derived IP throttle） |
| `GET /api/health` | 无（健康检查） | 无 | 保持匿名可用 | 无（业务无关） |
| `/api/providers/*` | `createAuthMiddleware` (Bearer JWT) | D-012 P0 单工作区 | 无凭据 401，有效 JWT 200 | 低 |
| `POST /api/edit` | `createAuthMiddleware` | 同上 | 同上 | 低 |
| `POST /api/detect` | `createAuthMiddleware` | 同上 | 同上 | 低 |
| `/api/projects/*` | `createAuthMiddleware` | 同上 | 同上 | 低 |
| `/api/jobs/*` | `createAuthMiddleware` | 同上 | 同上 | 低 |
| `/api/projects/:id/jobs` | `createAuthMiddleware` + `Idempotency-Key` 必需 | 同上 | 同上 + 409 缺幂等键 | 低 |
| `/api/worker/recover` | 独立 `CRON_SECRET` Bearer（常量时间比较） | 仅 Cron 调用 | 无 secret 时 503，secret 不匹配 401 | 低（**Out of Scope，仅核对不修改**） |

### 4.2 关键安全机制位置

| 机制 | 实现位置 | AC 覆盖 |
|------|---------|---------|
| JWT 验证（无 fallback） | `src/server/middleware/auth.ts` `createAuthMiddleware` | AC-A02/A03/A05/A07/A13 |
| 密码登录 + JWT 签发 | `src/server/middleware/auth.ts` `createLogin` | AC-A05/A06/A13 |
| 限流（HMAC-derived IP key） | `src/server/security/authThrottle.ts` | AC-A08/A09 |
| 登录路由 + 限流接入 | `src/server/routes/auth.ts` `createAuthRouter` | AC-A08/A10/A11/A12 |
| 部署模式 fail-fast | `src/server/config/runtime.ts` `loadRuntimeConfig` | AC-A06 |
| 凭据脱敏 | `src/server/security/redaction.ts` | AC-A10/A11 |
| 路由挂载（集中化） | `src/server/index.ts` | AC-A13 |
| CRON 独立认证 | `src/server/routes/worker.ts` `checkCronAuth` | Out of Scope |

### 4.3 搜索结果（无风险项）

- ❌ 无硬编码默认密码用于生产（`changeme` 仅 local 模式，deployed 模式 ≥12 字符强制校验）
- ❌ 无 NODE_ENV/debug/test bypass（部署模式严格校验所有 secret）
- ❌ 无 `jwt.decode` 不 verify 路径（仅使用 `jwt.verify`）
- ❌ 无验证失败后继续执行的 catch/fallback（失败直接 `res.status(401)` + return）
- ❌ 无直接信任用户提供身份 Header 的逻辑（限流使用 HMAC(ip, jwtSecret)，且 `trust proxy` 必须显式设置才信任 X-Forwarded-For）
- ❌ 无分散在不同路由里的认证判断（所有受保护路由统一通过 `createAuthMiddleware`）

## 5. TDD 证据

### 5.1 红灯阶段（初次运行）

```
Test Files  1 failed (1)
     Tests  1 failed | 32 passed (33)
```

失败测试：`AC-A08: throttle returns 429 after threshold > does not issue a token when already blocked, even with correct password`

失败原因：**测试 fixture bug**，非生产代码缺陷。原 fixture 仅预阻塞 `127.0.0.1`，但 supertest 在 Windows/Node 上可能使用 `::ffff:127.0.0.1` 或 `::1`。生产代码用 `req.ip` 一致地派生 HMAC key，行为正确。

### 5.2 绿灯阶段（fixture 修正后）

```
Test Files  1 passed (1)
      Tests  33 passed (33)
```

修正：预阻塞所有 3 种 IP 格式（`127.0.0.1`、`::ffff:127.0.0.1`、`::1`），各 6 次失败。

### 5.3 测试覆盖明细

| AC | 测试数 | 关键场景 |
|----|--------|---------|
| AC-A02 | 3 | 缺失 Authorization、空字符串、handler 不调用 |
| AC-A03 | 7 | 非 Bearer、Bearer 无 token、空 token、小写 bearer、错误签名、过期、篡改 |
| AC-A04 | 1 | D-012 P0 单工作区模型文档化（无 RBAC，无 403 路径） |
| AC-A05 | 2 | 有效 token 200、handler 调用一次 |
| AC-A06 | 3 | deployed 模式拒绝 changeme、拒绝缺失 AUTH_PASSWORD、local 模式 changeme 仅 dev |
| AC-A07 | 2 | jwt.verify 抛错不调用 next、成功才调用 next |
| AC-A08 | 3 | 6 次失败 429+Retry-After、blocked 状态正确密码不发 token、成功清除计数 |
| AC-A09 | 2 | 无 trust proxy 时 X-Forwarded-For 不影响 key、有 trust proxy 时分区 |
| AC-A10/A11 | 6 | 失败响应不含密码/JWT secret/真实密码、成功响应不含密码、401 不回显 Authorization、console 不打印凭据 |
| AC-A12 | 2 | 失败登录只创建 throttle bucket、成功登录清除 bucket |
| AC-A13 | 2 | createAuthMiddleware 单一工厂、createLogin 单一工厂 |

### 5.4 AC 未直接测试项说明

- **AC-A01**：受保护路由清单见本报告 §4.1（攻击面矩阵）
- **AC-A14**：新增逻辑具备正常、边界、异常测试（见 §5.3）
- **AC-A15**：既有非认证相关测试保持通过（server 514 + client 194 = 708 root tests passed）
- **AC-A16**：Diff 仅含新增测试文件 + 报告/证据/状态文件，不触及 PERSIST/Cron/ROUTING（grep 验证）
- **AC-A17**：完成包包含实际测试命令、输出摘要、红→绿 TDD 证据、完整文件清单（见 §6 与 §7）
- **AC-A18**：Trae 不宣称安全验收最终完成，进入 `awaiting_gpt_acceptance` 后停止

## 6. 8 门禁结果

| # | 门禁 | 命令 | 结果 |
|---|------|------|------|
| 1 | Client Lint | `npm run lint --prefix src/client` | **PASS** (0 errors, 0 warnings) |
| 2 | Client TypeScript | `npx tsc -b --noEmit` (in `src/client`) | **PASS** (exit 0, no output) |
| 3 | Client Tests | `npm run test --prefix src/client` | **PASS** (10 files / 194 tests) |
| 4 | Server TypeScript | `npm run build --prefix src/server` (`tsc`) | **PASS** (exit 0, no output) |
| 5 | Server Tests | `npm run test --prefix src/server` | **PASS** (52 files / 514 tests, 含新 33) |
| 6 | Root Tests | `npm run test` (root) | **PASS** (client 194 + server 514) |
| 7 | Root Build | `npm run build` (root) | **PASS** (client vite build + server tsc) |
| 8 | check-lumen-collab | `node scripts/check-lumen-collab.mjs` | **PASS** ("state and basic public-repo safety checks passed") |

详细输出见 `docs/lumen-v2/evidence/HARDEN-001A/gate-results.md`。

## 7. 文件清单

### 7.1 新增文件

- `src/server/security/auth.boundary.test.ts`（547 行，33 测试）
- `docs/lumen-v2/reports/HARDEN-001A-TRAE-REPORT.md`（本文件）
- `docs/lumen-v2/evidence/HARDEN-001A/gate-results.md`

### 7.2 修改文件

- `docs/lumen-v2/state/STATE.json`（status / nextActor / latestTraeReport / lastUpdatedAt）
- `docs/lumen-v2/state/SESSION-HANDOFF.md`（追加 HARDEN-001A 完成交接段）

### 7.3 未修改文件（明确不修改）

- `src/server/middleware/auth.ts`（生产代码 — D-034 已满足 AC）
- `src/server/routes/auth.ts`（生产代码 — D-034 已满足 AC）
- `src/server/security/authThrottle.ts`（生产代码 — D-034 已满足 AC）
- `src/server/config/runtime.ts`（生产代码 — D-034 已满足 AC）
- `src/server/routes/worker.ts`（Out of Scope — CRON 独立认证）
- `src/server/index.ts`（路由挂载 — 已集中化）
- 任何 PERSIST-001 业务逻辑、`/api/worker/recover`、Cron 配置、ROUTING 相关代码

## 8. 测试 fixture 秘密安全说明

测试文件使用以下短秘密（均低于 check-lumen-collab.mjs 阈值）：

```typescript
const JWT_SECRET = 'harden-001a-test-jwt-secret-32!';       // 32 chars, 无 sk- 前缀
const AUTH_PASSWORD = 'harden-001a-pw-12';                  // 14 chars
const PROVIDER_ENC_KEY = 'harden-001a-enc-key-32chars-test!!'; // 32 chars
```

- ❌ 不触发 `sk-[A-Za-z0-9_-]{20,}` 模式
- ❌ 不触发 `Authorization:\s*Bearer\s+[A-Za-z0-9._-]{16,}` 模式（测试用 `Bearer ${token}` 拼接变量，非字面量）
- ❌ 不触发 `-----BEGIN ... PRIVATE KEY-----` 模式
- ✅ check-lumen-collab.mjs PASS
- ✅ 所有秘密均为合成 fixture，与生产环境无关

`changeme` 字符串在测试中出现 5 次，用于验证本地开发默认密码不能用于部署模式（`AUTH_PASSWORD_TOO_SHORT` 错误）。这是已存在的 `runtime.test.ts` 测试 fixture 约定，不是真实秘密。

## 9. Codex 必要性评估

当前阶段：**NOT_REQUIRED**

理由：
- 任务卡明确指示当前阶段不调用 Codex
- 测试全绿，无机械问题需要 Codex 审计
- D-034 已在 PERSIST-001 经过 GPT 证据验收
- 若 GPT 第一轮证据审查发现明确机械问题，先由 Trae 修复，不浪费 Codex 审计额度
- Codex 窄范围只读安全审计时机：Trae 修复完成、GPT 第一轮证据审查后、合并前（仅当 GPT 审查未发现明确问题时）

## 10. Stop Conditions 检查

| 条件 | 是否触发 |
|------|---------|
| D-012 正式语义互相冲突 | ❌ 否 |
| 实现需要真实 Production Secret | ❌ 否 |
| 发现生产环境硬编码默认密码或公开 Secret | ❌ 否 |
| JWT fallback 会造成认证失败后放行 | ❌ 否 |
| 权限判断涉及跨租户或复杂数据隔离 | ❌ 否（D-012 P0 单工作区） |
| 修改不可避免触及 PERSIST/Cron 核心状态机 | ❌ 否 |
| 实现认证需要破坏现有 API 兼容性 | ❌ 否 |
| 新增测试通过但原有核心测试失败 | ❌ 否 |
| 无法可靠区分 401 与 403 | ❌ 否（D-012 P0 无 403 路径，已文档化） |
| Trae 连续两轮无法解决 | ❌ 否 |
| 工作区遗留文件被意外纳入 Diff | ❌ 否（精确 `git add` 隔离） |

无 Stop Conditions 触发。

## 11. 状态推进

- **status**: `ready_for_trae` → `awaiting_gpt_acceptance`
- **nextActor**: `trae` → `gpt`
- **latestTraeReport**: `docs/lumen-v2/reports/HARDEN-001A-TRAE-REPORT.md`
- **lastUpdatedAt**: 2026-07-21
- **lastUpdatedBy**: trae

Trae 不宣称安全验收最终完成。进入 `awaiting_gpt_acceptance` 后停止，等待 GPT 证据审查。
