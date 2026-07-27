# LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01 Trae Report

> **Task ID**: LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01
> **Branch**: lumen/lumen-cloudbase-region-switch-retest-01-trae
> **Risk Level**: MEDIUM
> **Route**: R2
> **Date**: 2026-07-28
> **Status**: STOP_CONDITION_TRIGGERED → awaiting_gpt_acceptance (Codex Escalation)

---

## 1. Executive Summary

将 Vercel Serverless 区域从 hkg1 切换到 sin1，重新部署 Preview。区域切换本身成功（AC-01~AC-04, AC-08, AC-10~AC-11 全部 PASS），但 AC-R1-11b 重测触发 **Stop Condition**：5/5 返回 503 而非预期的 401。

**根因**：`cloudbase.nosql.ts` 的 `authThrottle.put()` 方法在 `doc(key).set({_id: key, ...value})` 中重复设置 `_id` 字段。CloudBase 在文档已存在时拒绝 `_id` 更新（"不能更新_id的值"），导致 `throttle.recordFailure()` 抛出错误，auth.ts 的 fail-closed 逻辑返回 503。

此 bug 在 hkg1 时被掩盖（TCP 不可达，DB 写入从未执行）。sin1 区域 DB 可达后，bug 暴露。

**修复范围超出本轮 AC-02 约束**（仅允许 vercel.json 变更），触发 Codex Escalation Condition。

---

## 2. Baseline (AC-01)

| Item | Value |
|------|-------|
| Branch | lumen/lumen-cloudbase-region-switch-retest-01-trae |
| Local HEAD (start) | c505ad3 (Lane B 远端 HEAD) |
| Local HEAD (Commit 1) | 719cb8e |
| Remote HEAD | 719cb8e |
| Remote URL | https://github.com/Catcherog/lumen-ink.git |
| git status (start) | clean (3 pre-existing untracked: .vercel/, LUMEN-PRODUCTION-DEPLOYMENT-BASELINE-RECOVERY-01-TRAE-REPORT.md, task file) |

---

## 3. Changes (AC-02)

### Commit 1: `chore(lumen): switch Vercel region from hkg1 to sin1` (719cb8e)

```
vercel.json | 2 +-
1 file changed, 1 insertion(+), 1 deletion(-)
```

变更内容：`"regions": ["hkg1"]` → `"regions": ["sin1"]`

**无其他生产代码变更**。认证实现、timeout 状态机、错误映射均未修改。

---

## 4. AC Results

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ PASS | Local=Remote=719cb8e; branch tracking origin |
| AC-02 | ✅ PASS | git diff --stat: only vercel.json (1 line) |
| AC-03 | ✅ PASS | Preview URL: https://lumen-7rmn0vh4y-catcher1.vercel.app; /api/probe returns region=sin1 |
| AC-04 | ✅ PASS | /api/probe?reps=5: DB read 5/5 (104-256ms), DNS 5/5, TCP 5/5, TLS 5/5 |
| AC-05 | ⛔ BLOCKED | AC-R1-10 无法完成：login 返回 503（throttle.put _id bug + vercel env pull 问题） |
| AC-06 | ❌ FAIL | AC-R1-11b: 5/5 返回 503（预期 401）。**Stop Condition triggered** |
| AC-07 | ✅ PASS | fail-closed 503 行为由 AC-R1-11b 的 503 响应证实（auth.ts:154-163 catch→503） |
| AC-08 | ✅ PASS | THROTTLE_TIMEOUT_MS=12000 (auth.ts:48) > SDK timeout 10000ms |
| AC-09 | ⚠️ PRE-EXISTING | Production /api/probe 返回 500（非 404）。全部路由 500（app 启动失败）。非本轮区域切换导致 |
| AC-10 | ✅ PASS | server typecheck=0, client typecheck=0, server tests=515 pass, client tests=195 pass, collab check=PASS |
| AC-11 | ✅ PASS | 日志仅含 `[auth] throttle.recordFailure fai...`（截断错误消息），无 Secret/Token/Authorization |
| AC-12 | ✅ PASS | 见本报告 + 完成包 |
| AC-13 | ✅ PASS | Local HEAD = Remote HEAD = 719cb8e (Commit 1)；Commit 2 push 后重新验证 |
| AC-14 | ✅ PASS | git status --short: 仅 .vercel/（Vercel CLI 本地配置，gitignored）+ pre-existing untracked report |
| AC-15 | ✅ PASS | 未合并 main，未切 Production |

---

## 5. AC-R1-11b Failure Analysis (AC-06, Stop Condition)

### 5.1 Test Output (raw)

```
=== AC-R1-11b: Wrong Password -> 401 (5x) ===
  Attempt 1: expected=401 actual=503 ms=1113
  Attempt 2: expected=401 actual=503 ms=488
  Attempt 3: expected=401 actual=503 ms=541
  Attempt 4: expected=401 actual=503 ms=511
  Throttle reset (correct login): code=503 ms=561 token=False
  Attempt 5: expected=401 actual=503 ms=485
AC-R1-11b RESULT: FAIL (0/5 returned 401)
```

Raw output file: `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01/ac-r1-10-11b-raw-output.txt`

### 5.2 Vercel Logs

```
TIME         STATUS  MESSAGE
02:17:46.01  503     [auth] throttle.recordFailure fai…
02:17:45.51  503     [auth] throttle.recordFailure fai…
02:17:44.95  503     [auth] throttle.recordFailure fai…
... (all 503 errors from throttle.recordFailure)
```

### 5.3 Root Cause

**文件**: `src/server/infrastructure/persistence/cloudbase.nosql.ts`
**方法**: `authThrottle.put(key, value)`

```typescript
async put(key: string, value: AuthThrottleBucket): Promise<void> {
  assertReady();
  await collection(COLLECTIONS.authThrottle).doc(key).set({
    _id: key,   // ← BUG: 与 doc(key) 重复设置 _id
    ...value,
  });
}
```

**CloudBase 行为**:
- `doc(key).set(data)` 是 upsert 操作
- 文档不存在时：创建文档，`_id: key` 被接受
- 文档已存在时：替换文档内容，但 CloudBase 拒绝 `_id` 更新 → `不能更新_id的值`
- 之前的测试运行留下了 throttle bucket 文档，导致所有后续 `put` 调用都失败

**影响链**:
1. `authThrottle.recordFailure(ip)` → `repo.put(key, bucket)` → CloudBase 拒绝 → 抛出错误
2. `auth.ts:154-163` catch 块捕获错误 → 返回 503 (fail-closed)
3. 预期的 401 (密码错误) 永远无法返回

**为什么 hkg1 时未暴露**: hkg1 TCP 不可达 → `repo.get(key)` 超时 → `isBlocked()` 失败 → 503 (在 `recordFailure` 之前)。DB 写入从未执行，所以 `_id` bug 未触发。

### 5.4 Fix Required (OUT OF SCOPE for this task)

移除 `put()` 方法中的 `_id: key`：

```typescript
async put(key: string, value: AuthThrottleBucket): Promise<void> {
  assertReady();
  await collection(COLLECTIONS.authThrottle).doc(key).set({
    ...value,  // _id 由 doc(key) 隐式设置，不需显式传递
  });
}
```

**此修复需要修改 cloudbase.nosql.ts（生产代码）**，违反 AC-02 约束（"生产配置变更仅限 vercel.json"）。触发 Codex Escalation Condition: "需要修改认证核心逻辑"。

### 5.5 Failure Classification

| 类别 | 匹配 | 说明 |
|------|------|------|
| 网络不稳定 | ❌ | sin1 DB 读取 5/5 成功 |
| Preview 环境变量不一致 | ⚠️ 次要 | vercel env pull 返回 ""（所有用户定义变量），无法获取 AUTH_PASSWORD；但 Vercel 运行时环境变量有效（函数未崩溃） |
| SDK timeout | ❌ | 响应时间 488-1113ms，远低于 10000ms timeout |
| 外层 auth timeout | ❌ | 响应时间远低于 12000ms THROTTLE_TIMEOUT_MS |
| **认证业务逻辑错误** | ✅ **主因** | throttle.put `_id` 重复设置导致 CloudBase 拒绝写入 |

---

## 6. AC-R1-10 Status (AC-05)

AC-R1-10 (create/read/delete round-trip) 无法完成：

1. **Login 步骤失败**：`POST /api/auth` 返回 503
   - 原因 A (主): throttle.put `_id` bug → `recordFailure` 失败 → 503
   - 原因 B (次): `vercel env pull` 未解密用户环境变量 → 测试脚本无法获取正确 AUTH_PASSWORD → 即使 throttle.put 修复，login 仍可能因密码不匹配而走 `recordFailure` 路径
2. **无 JWT** → 后续 CRUD 步骤无法执行

**注意**：即使修复 throttle.put bug，AC-R1-10 仍需解决 vercel env pull 问题才能获取正确密码进行测试。但 `recordSuccess`（正确密码路径）调用 `repo.delete(key)` 而非 `repo.put(key)`，不受 `_id` bug 影响。因此修复 throttle.put 后，正确密码 login 应能返回 200。

---

## 7. Production /api/probe (AC-09)

| Endpoint | Status | Note |
|----------|--------|------|
| Production /api/health | 500 | App 启动失败 |
| Production /api/probe | 500 | App 启动失败（空 body） |

**Production 全部路由返回 500**，表明 Express app 在启动时崩溃。可能原因：
- PERSISTENCE_BACKEND 配置为 `cloudbase-postgres`（而非 `cloudbase-nosql`）
- CloudBase PostgreSQL 环境变量缺失
- Runtime config fail-fast 抛出错误

**此为 pre-existing 问题**，非本轮区域切换导致。Production 部署为 1d 前（Jul 26），本轮未修改 Production 配置。修复需修改 Production 环境变量，超出本轮范围（"不切 Production"）。

---

## 8. Gate Results (AC-10)

| Gate | Result | Details |
|------|--------|---------|
| Server typecheck | ✅ PASS | `tsc --noEmit` exit 0 |
| Client typecheck | ✅ PASS | `tsc --noEmit` exit 0 |
| Server tests | ✅ PASS | 515 tests pass (38 files), 0 fail |
| Client tests | ✅ PASS | 195 tests pass (10 files), 0 fail |
| Collaboration check | ✅ PASS | `node scripts/check-lumen-collab.mjs` PASS |
| **Total** | **✅ 5/5 PASS** | **710 tests pass** |

---

## 9. Preview Deployment Details (AC-12)

| Field | Value |
|-------|-------|
| Preview URL | https://lumen-7rmn0vh4y-catcher1.vercel.app |
| Deployment ID | lumen-7rmn0vh4y-catcher1 |
| Region | sin1 |
| Environment | preview |
| Status | Ready |
| Commit SHA | 719cb8e |
| Build Duration | 37s |

### Request Status Codes & Timings

| Request | Method | Status | Ms |
|---------|--------|--------|-----|
| /api/probe (1 rep) | GET | 200 | 490 |
| /api/probe?reps=5 | GET | 200 | 2528 |
| /api/probe rep1 DB read | - | success | 256 |
| /api/probe rep2 DB read | - | success | 115 |
| /api/probe rep3 DB read | - | success | 104 |
| /api/probe rep4 DB read | - | success | 106 |
| /api/probe rep5 DB read | - | success | 116 |
| /api/auth (wrong pw) #1 | POST | 503 | 1113 |
| /api/auth (wrong pw) #2 | POST | 503 | 488 |
| /api/auth (wrong pw) #3 | POST | 503 | 541 |
| /api/auth (wrong pw) #4 | POST | 503 | 511 |
| /api/auth (correct pw) | POST | 503 | 561 |
| /api/auth (wrong pw) #5 | POST | 503 | 485 |
| Production /api/health | GET | 500 | - |
| Production /api/probe | GET | 500 | - |

### Raw Output Files

- AC-R1-10/11b test: `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01/ac-r1-10-11b-raw-output.txt`
- Gate results: `docs/lumen-v2/evidence/LUMEN-CLOUDBASE-REGION-SWITCH-RETEST-01/gate-results.md`

---

## 10. Stop Condition & Escalation

### Triggered Stop Condition

> "AC-R1-11b 仍出现 timeout、503 或 500。"

AC-R1-11b: 5/5 返回 503 → Stop Condition triggered.

### Codex Escalation Conditions Matched

> "需要修改认证核心逻辑、timeout 状态机或错误映射。"

修复 `throttle.put` `_id` 重复 bug 需要修改 `cloudbase.nosql.ts`（认证 throttle 存储实现），属于认证核心逻辑。

### Recommended Next Action

1. **GPT 审查本报告**，确认 Stop Condition 正确触发
2. **创建 FIX 任务** 修复 `cloudbase.nosql.ts` 的 `authThrottle.put()` 方法（移除 `_id: key`）
3. **修复后重跑** AC-R1-10、AC-R1-11b
4. **解决 vercel env pull 问题**（次要：Vercel CLI 未解密用户环境变量，影响本地测试能力）
5. **独立排查** Production /api/probe 500 问题（pre-existing，非本轮范围）

---

## 11. Out of Scope Confirmation

- ✅ 未修改认证实现（auth.ts, authThrottle.ts, cloudbase.nosql.ts）
- ✅ 未修改 timeout 参数
- ✅ 未修改错误映射
- ✅ 未合并 main
- ✅ 未切 Production
- ✅ 未修改数据库数据
- ✅ 未引入网关
- ✅ 未多区域部署
