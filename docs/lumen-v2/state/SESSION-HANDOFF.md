# SESSION HANDOFF｜窗口交接

## LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1 implementation handoff (2026-08-02)

- **Task**: `LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1`
- **Branch**: `codex/lumen-ephemeral-demo-runtime-01-fix-r1`
- **Exact functionality base**: `lumen/lumen-auth-throttle-id-fix-01-trae@e5fcd089d03fd9d4975cfaf3e85f1d5db9cb3392`
- **Status**: `awaiting_gpt_acceptance / nextActor=gpt`
- **Report**: `docs/lumen-v2/reports/LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1-CODEX-REPORT.md`
- **Evidence**: `docs/lumen-v2/evidence/LUMEN-EPHEMERAL-DEMO-RUNTIME-01-FIX-R1/`
- **Local gates**: client 15 files/213 tests, server 46 files/555 tests, client/server build, client lint, and targeted H-01/M-01/M-02 tests pass.
- **Release boundary**: PR #6 remains Draft/superseded; no merge, production alias change, real Provider write, or production deployment was performed.
- **State conflict resolved for this user-authorized task**: the inherited state pointer named the older CORS task. That task remains in the history; this active fix task is now the implementation handoff for the rebased branch.

---

## PR #5 UX-only post-merge state closure (2026-08-02)

- **Task ID**: `LUMEN-UX-PR5-POSTMERGE-STATE-CLOSURE-01`
- **PR #5**: `MERGED` at `9858bed4aeae97682376999e0afd623f80a027b7`.
- **Base**: `lumen/lumen-auth-throttle-id-fix-01-trae` @ `9f9672bd52ebbf3b42439af642e664b81eb563e0`.
- **Head**: `codex/lumen-ux-pr-rebase-clean-01` @ `e691e368e2ee26cb3356df45810b1b179e683d72`.
- **PR #3**: `CLOSED / NOT_MERGED / SUPERSEDED` by PR #5.
- **Scope**: PR #5 was the reviewed UX-only replacement with exactly 16 changed UX files. This closure changes only `STATE.json` and this handoff; it does not modify production code, tests, CORS files, main, or the Production Alias.
- **Validation recorded**: client 206/206, server 538/538, typecheck, lint, build, collaboration check, diff check, and Vercel automatic Preview check all PASS. No manual deployment or Production Alias switch was performed.
- **Closure boundary**: the state-only closure commit is based directly on PR #5 merge SHA above.

---

## 当前状态（2026-07-28，LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01 Stop Condition 触发，待 GPT 验收）

- 日期：2026-07-28
- **任务**：`LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01`（区域切换 hkg1→sin1 + AC 重测）
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`（Stop Condition triggered）
- **分支**：`lumen/lumen-cloudbase-region-switch-retest-01-trae`
- **HEAD**：`719cb8e`（Commit 1: vercel.json hkg1→sin1）
- **Risk Level**：MEDIUM
- **Route**：R2
- **Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01-TRAE-REPORT.md`
- **门禁证据**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01/gate-results.md`
- **Preview**：`https://lumen-7rmn0vh4y-catcher1.vercel.app` (Ready, **sin1**)

### AC 结果汇总

| AC | 结果 | 说明 |
|----|------|------|
| AC-01~AC-04 | ✅ PASS | 基线、配置变更、Preview sin1、DB 5/5 |
| AC-05 | ⛔ BLOCKED | AC-R1-10 无法完成（throttle.put bug + env pull 问题） |
| **AC-06** | **❌ FAIL** | **AC-R1-11b: 5/5 返回 503（预期 401）→ Stop Condition** |
| AC-07~AC-08 | ✅ PASS | fail-closed 503 回归 + timeout 层级 12000>10000 |
| AC-09 | ⚠️ PRE-EXISTING | Production /api/probe = 500（app 启动失败，非本轮导致） |
| AC-10~AC-15 | ✅ PASS | 710 tests + collab check + worktree clean + 不合并 main |

### Stop Condition 根因

**`cloudbase.nosql.ts` 的 `authThrottle.put()` 方法**：

```typescript
await collection(COLLECTIONS.authThrottle).doc(key).set({
  _id: key,  // ← BUG: 与 doc(key) 重复
  ...value,
});
```

CloudBase 在文档已存在时拒绝 `_id` 更新（"不能更新_id的值"），导致 `recordFailure()` 抛错 → auth.ts fail-closed → 503。此 bug 在 hkg1 时被 TCP 不可达掩盖。

### Codex Escalation

- **触发条件**：需要修改认证核心逻辑（throttle 存储实现）
- **修复范围**：移除 `put()` 中的 `_id: key`（1 行变更）
- **AC-02 约束**：本轮仅允许 vercel.json 变更，不可修复

### 次要问题

1. `vercel env pull` 返回 `""`（所有用户环境变量）→ 无法本地获取 AUTH_PASSWORD
2. Production /api/probe = 500（pre-existing app 启动失败，全部路由 500）

### 待 GPT 决策

1. **验收区域切换**（AC-01~AC-04, AC-08, AC-10~AC-11 PASS）或驳回
2. **创建 FIX 任务** 修复 `throttle.put` `_id` bug（Codex scope: auth throttle storage only）
3. **Fix 后重跑** AC-R1-10、AC-R1-11b
4. **独立排查** Production 500 问题（pre-existing，非本轮范围）

---

## 历史状态（2026-07-28，LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01 完成，待 GPT 验收）

- 日期：2026-07-28
- **任务**：`LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01`（Lane B — Trae 网络对照与证据校正）
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- **分支**：`lumen/cloudbase-connectivity-differential-01-trae`
- **HEAD**：`5e0a51a`（probe enhancement + evidence correction）
- **Risk Level**：MEDIUM
- **Route**：R2
- **Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01-TRAE-REPORT.md`
- **诊断矩阵**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01/diagnostic-matrix.md`

### 三区域网络对照结果

| 区域 | DNS | TCP (两个 IP) | HTTPS/TLS | SDK 构造 | DB 读取 | 结论 |
|------|-----|----------------|-----------|----------|---------|------|
| **hkg1** (香港) | 5/5 ✅ | 0/5 ❌ | 0/5 ❌ | 5/5 ✅ | 0/5 ❌ | **阻塞** |
| **hnd1** (东京) | 5/5 ✅ | 5/5 ✅ | 5/5 ✅ | 5/5 ✅ | 5/5 ✅ | **通过** |
| **sin1** (新加坡) | 5/5 ✅ | 5/5 ✅ | 5/5 ✅ | 5/5 ✅ | 5/5 ✅ | **通过** |

### 关键结论

1. **连接问题是 hkg1 单一区域问题**，不是 Vercel 到 CloudBase 的普遍不可达
2. **hnd1 和 sin1 均实现 5/5 稳定成功**，包括认证 DB 读取（凭据有效性已验证）
3. **GATEWAY_REQUIRED 未触发**（2/3 区域成功）
4. **建议**：将 `vercel.json` 区域从 `hkg1` 切换到 `sin1`（或 `hnd1`），无需 Cloud Function 网关
5. **AC-R1-10 和 AC-R1-11b**：在切换区域后可重测，预期 PASS

### AC 合规（9/9 PASS）

| AC | 描述 | 结果 |
|----|------|------|
| AC-01 | Probe 不再将 init 成功描述为凭据有效 | ✅ PASS |
| AC-02 | Production 环境 /api/probe 返回 404 | ✅ PASS (双重守卫) |
| AC-03 | 三个 Vercel 区域均有独立结果 | ✅ PASS |
| AC-04 | 两个 A 记录均分别测试 | ✅ PASS |
| AC-05 | 每个组合至少重复 5 次 | ✅ PASS |
| AC-06 | 诊断不产生业务数据写入 | ✅ PASS |
| AC-07 | 至少一个区域稳定成功 | ✅ PASS (hnd1 + sin1) |
| AC-08 | 全部失败时输出 GATEWAY_REQUIRED | ✅ PASS (hkg1 输出 true，整体未触发) |
| AC-09 | Local=Remote、worktree clean、无 Production 变更 | ✅ PASS |

### 证据校正（已应用到 FIX-R11-R1）

1. **AC-R1-11 拆分**：AC-R1-11a (DB 不可用→503, PASS) + AC-R1-11b (DB 正常→401, BLOCKED_EXTERNAL_NETWORK)
2. **SDK 术语修正**："SDK init OK (credentials valid)" → "SDK construction: OK (credentials NOT_VALIDATED)"
3. **根因收窄**："Vercel HK 永久不可达" → "hkg1 本次测试时段不可达" → 已确认 hkg1-specific
4. **AC-R1-08 修正**：SDK init 0ms 仅证明对象构造，不验证凭据；凭据有效性现由 hnd1/sin1 成功 DB 读取证明

### 并行 Lane 状态

| Lane | Owner | 状态 | 范围 |
|------|-------|------|------|
| Lane A — Codex 安全审查 | Codex | 独立进行 | Auth throttle timeout + 安全不变量 + Probe 暴露 (只读) |
| Lane B — 网络对照 | Trae | **完成**（本报告） | 三区域对照 + 证据校正 |

### Preview 部署 URL

| 区域 | URL |
|------|-----|
| hkg1 | `https://lumen-9j3f7boia-catcher1.vercel.app` |
| hnd1 | `https://lumen-gswr3nyc2-catcher1.vercel.app` |
| sin1 | `https://lumen-6meq1727z-catcher1.vercel.app` |

### 待 GPT 决策

1. **验收 LUMEN-CLOUDBASE-CONNECTIVITY-DIFFERENTIAL-01**：9/9 AC PASS
2. **区域切换决策**：是否批准将 `vercel.json` 从 `hkg1` 切换到 `sin1`
3. **AC-R1-10/AC-R1-11b 重测**：区域切换后是否启动重测任务
4. **Codex Lane A 结果**：等待 Codex 安全审查裁决（AUDIT_PASS / CHANGES_REQUIRED / BLOCKED_INSUFFICIENT_EVIDENCE）

---

## 历史状态（2026-07-27，FIX-R11-R1 实施完成，待 GPT 决策）

- 日期：2026-07-27
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1-CONNECTIVITY-AND-AUTH-EVIDENCE`
- **状态**：`CODEX_REQUIRED`（GPT 裁决 2026-07-28）
- **Risk Level**：HIGH
- **Route**：R2 → bounded Codex audit after implementation
- **Codex**：`REQUIRED`（Codex Escalation Condition 触发：CloudBase 直连不可用）
- **分支**：`lumen/cloudbase-nosql-implement-01-fix-r11`（从 `85c6161` 创建 R1）
- **HEAD**：`2d78248`（1 commit: auth throttle timeout safety + connectivity probe）
- **Preview**：`https://lumen-oi0t51ho5-catcher1.vercel.app` (Ready, hkg1)
- **Trae 报告**：`docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1-TRAE-REPORT.md`
- **门禁证据**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1/gate-results.md`
- **Codex 审查包**：`docs/lumen-v2/evidence/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1/codex-review-package.md`

### 已通过 AC (13/16 — 拆分后)

AC-R1-01 ✅ | AC-R1-02 ✅ | AC-R1-03 ✅ | AC-R1-04 ✅ | AC-R1-05 ✅ | AC-R1-06 ✅ | AC-R1-07 ✅ | AC-R1-08 ✅ | AC-R1-09 ✅ | AC-R1-11a ✅ | AC-R1-12 ✅ | AC-R1-13 ✅ | AC-R1-14 ✅

### 阻塞 AC (3/16 — 拆分后)

- **AC-R1-10** create/read/delete round-trip：CloudBase NoSQL TCP 不可达
- **AC-R1-11b** 正常 DB 状态 401：DB 不可达，无法测试
- **AC-R1-08** 凭据有效性：SDK init 不验证凭据，需独立控制台证据或成功鉴权请求

### 关键诊断

```
DNS:    ✅ 63ms  → 124.223.121.50, 109.244.144.136
TCP:    ❌ 5002ms → "TCP connection timed out after 5000ms"
SDK:    ✅ 0ms   → SDK construction OK (credentials NOT_VALIDATED)
DB:     ❌ 10066ms → "connect timeout" (SDK native timeout)
Total:  15130ms
```

- **根因（收窄后）**：Vercel hkg1 本次测试时段 → CloudBase 上海 TCP 443 超时
- **Endpoint 正确**：`tcb-api.tencentcloudapi.com`（官方）
- **凭据状态**：NOT_VALIDATED（SDK init 仅构造 app 对象，不验证凭据）
- **Auth fail-closed**：错误密码 → 503 in ~10s

### 实施概要

1. **SDK 原生 timeout**：`cloudbase.nosql.ts` 新增 `sdkTimeout`（默认 10000ms），传入 `tcb.init({ timeout })`
2. **Timeout 层级**：外层 `THROTTLE_TIMEOUT_MS=12000` > SDK 10000ms，确保 SDK 先返回具体错误
3. **14 个 throttle timeout 测试**：覆盖 isBlocked/recordFailure/recordSuccess 的 resolve/reject/timeout/late-settle 场景
4. **诊断 probe**：`GET /api/probe` 独立端点，DNS→TCP→SDK→DB 四阶段诊断，不输出凭据
5. **安全不变量文档**：`recordSuccess` 失败仍允许登录（best-effort），依赖 TTL bucket 过期

### 待 GPT 决策

1. **Codex Escalation**：CloudBase 直连不可用确认 → 触发 Codex 限域审查（auth throttle timeout + 安全不变量）
2. **网络路径决策**：CloudBase Run/Cloud Function 数据网关，或 IP 白名单/区域切换
3. **AC-R1-10/AC-R1-11-401 处置**：是否接受 blocked 状态，或等待网络解决后重测

---

## 历史状态（2026-07-27，FIX-R11 Preview 部署成功，CloudBase 不可达阻塞 AC-09，待 GPT 决策）

> 已被 FIX-R11-R1 增强。FIX-R11 的 auth throttle timeout 从 8s 改进为 SDK 原生 timeout 10000ms + 外层 12000ms 层级控制。

- 日期：2026-07-27
- **任务**：`LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-PRODUCTION-RUNTIME-COMPATIBILITY`
- **状态**：`awaiting_gpt_acceptance / nextActor=gpt`
- **HEAD**：`150352d`（3 commits: runtime compatibility + deployment config + auth throttle timeout）
- **Preview**：`https://lumen-d32fv6kdf-catcher1.vercel.app` (Ready, hkg1)
- 11/18 AC passed, 7/18 blocked by CloudBase unreachability

---

**EVIDENCE PROVIDED BY TRAE; NOT YET INDEPENDENTLY VERIFIED.**
