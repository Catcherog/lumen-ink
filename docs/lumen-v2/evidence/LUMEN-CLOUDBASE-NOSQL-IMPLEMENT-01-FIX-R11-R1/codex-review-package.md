# FIX-R11-R1 Codex 限域审查包

**审查范围**: 认证 throttle timeout、安全不变量及相关测试
**审查模式**: READ_ONLY
**审查人**: Codex

---

## 1. auth.ts Diff

```diff
-const THROTTLE_TIMEOUT_MS = 8000;
+const THROTTLE_TIMEOUT_MS = 12000;
```

完整 diff: 见 `docs/lumen-v2/reports/LUMEN-CLOUDBASE-NOSQL-IMPLEMENT-01-FIX-R11-R1-TRAE-REPORT.md` §2-§5

---

## 2. Throttle Interface

Position: `src/server/security/authThrottle.ts`

```typescript
export interface ThrottleResult {
  blocked: boolean;
  retryAfterMs: number;
}

export interface AuthThrottle {
  isBlocked(ip: string): Promise<ThrottleResult>;
  recordFailure(ip: string): Promise<ThrottleResult>;
  recordSuccess(ip: string): Promise<void>;
}
```

实现: `createAuthThrottle()` 使用 HMAC-SHA256 哈希 IP，通过 `AuthThrottleRepository` 接口持久化。

---

## 3. Timeout Helper

Position: `src/server/routes/auth.ts`

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number, errorCode: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${errorCode}: operation timed out after ${ms}ms`)),
        ms
      );
    }),
  ]);
}
```

**AC-R1-03 已知局限**: `Promise.race` 不取消底层 Promise。SDK 原生 timeout (10000ms) 是主要防线。Vercel Function cold-start 边界是最终资源隔离。`@cloudbase/node-sdk` 无内置 abort 机制。

---

## 4. 相关测试

Position: `src/server/routes/auth.throttle-timeout.test.ts`

14 测试覆盖:
- isBlocked: resolve / reject / timeout
- recordFailure: reject / timeout
- recordSuccess: reject / timeout (best-effort, login succeeds)
- Late settle: resolve after timeout / reject after timeout
- No double response

---

## 5. 安全不变量

### isBlocked / recordFailure: FAIL CLOSED
- 数据库不可达 → 503 (不跳过限流检查)
- 不泄露密码是否正确 (401 vs 503 区分)

### recordSuccess: BEST-EFFORT (NOT fail-closed)
- 清除限流桶是尽力而为的清理操作
- 桶的 TTL 过期 (windowMs) 是持久安全网
- recordSuccess 失败不:
  - 使已签发的 JWT token 失效
  - 重新封锁 IP
  - 允许绕过 isBlocked (桶仍存在但 isBlocked 只计失败次数)
- 最坏情况: 过早 429 (非绕过)
- 替代方案 (登录失败) 会创建 DoS 向量

### Timeout Hierarchy
```
SDK timeout (10000ms) < Outer timeout (12000ms) < Vercel Function (300s)
```

---

## 6. 测试结果

| 测试套件 | 结果 |
|----------|------|
| auth.throttle-timeout (14 tests) | ✅ 14/14 PASS |
| authThrottle (6 tests) | ✅ 6/6 PASS |
| auth.boundary (30+ tests) | ✅ ALL PASS |
| Server total (38 files, 515 tests) | ✅ ALL PASS |
| Client total (10 files, 195 tests) | ✅ ALL PASS |
| check-lumen-collab | ✅ PASS |

---

## 7. 审查问题

1. `withTimeout` 的 `Promise.race` + `finally` cleanup 模式是否正确处理了所有竞态条件？
2. `recordSuccess` 的 best-effort 语义是否在 100% 情况下安全？（最坏情况仅为过早 429）
3. SDK timeout (10000ms) 与 outer timeout (12000ms) 的 2000ms 差距是否足够覆盖 SDK 超时→错误传播的延迟？
4. `getRawDatabase()` 暴露原始数据库实例是否存在被业务代码误用的风险？文档中 "MUST NOT use for business operations" 是否足够？