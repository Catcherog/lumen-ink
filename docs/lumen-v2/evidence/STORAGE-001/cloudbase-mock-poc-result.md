# STORAGE-001 CloudBase Mock Adapter PoC 结果

> 任务：STORAGE-001（2026-07-18 修订）
> 创建日期：2026-07-18
> 决策状态：`pending_gpt_acceptance`（未冻结；本文件不写 `decision: frozen`）
> 主源登记：`docs/lumen-v2/evidence/STORAGE-001/source-register.md`
> 选型报告：`docs/lumen-v2/storage-options.md`

## 1. 命令与退出码

```powershell
npm test --prefix src/server -- domain/cloudbase-mock.contract.test.ts
```

退出码：`0`

```
✓ domain/cloudbase-mock.contract.test.ts (6 tests) 9ms
    ✓ repository CRUD round-trips through camelCase ↔ snake_case field mapping
    ✓ UnitOfWork rolls back Version and Job — no partial success state visible
    ✓ ObjectStore emits private signed URLs with expiry and deterministic signature
    ✓ deleteCascade removes project metadata, child entities, and object bytes
    ✓ Job lease expires after TTL and allows safe retry by a second worker
    ✓ createVersionIdempotent returns the same Version for the same idempotencyKey

Test Files  1 passed (1)
Tests       6 passed (6)
```

## 2. 文件清单

| 文件 | 角色 | 行数（约） |
|------|------|----------|
| `src/server/infrastructure/persistence/cloudbase-mock.ts` | CloudBase mock adapter PoC | ~600 |
| `src/server/domain/cloudbase-mock.contract.test.ts` | 6 个合约测试 | ~250 |

不接入生产路径；只更新设计映射和 mock 合约。`PersistenceDependencies` 接口表面保持冻结不变。

## 3. 合成数据 ID

所有 ID 均为合成值，不引用真实客户、订单或生产数据。

| 实体 | 合成 ID | 备注 |
|------|---------|------|
| Project | `proj_cb_001` | CloudBase mock 主测试 Project |
| Asset | `asset_cb_001` | 12 字节合成 PNG 占位 |
| Version | `ver_cb_001`、`ver_cb_v1_idempotent` | 含幂等键测试 |
| GenerationJob | `job_cb_001` | 用于 lease 过期与重试证明 |
| AuthThrottle 桶 | `auth-throttle:198.51.100.1` | TEST-NET-2 文档 IP |
| UoW 回滚 Project | `proj_cb_uow_rollback` | 用于事务回滚证明 |
| 私有对象 key | `projects/proj_cb_001/assets/asset_cb_001.bin` | 用于签名 URL 证明 |

## 4. PoC-only Helper（不在冻结接口上）

CloudBase mock adapter 暴露以下 PoC-only helper 用于演示 lease/idempotency 语义；这些 helper **不是**冻结 `PersistenceDependencies` 接口的一部分，PERSIST-001 实施时可自由调整：

```ts
createVersionIdempotent(projectId, idempotencyKey, version): Promise<Version>
acquireJobLease(jobId, leaseSeconds, now?): Promise<void>
heartbeatJobLease(jobId, leaseSeconds, now?): Promise<void>
releaseJobLease(jobId, now?): Promise<void>
listLeaseExpiredJobs(now?): Promise<Job[]>
dumpPgStyleRows(): CloudBasePgRows   // 用于测试断言 snake_case 字段
setFixedNow(now | null): void         // 用于测试时间确定性
```

## 5. 6 个测试场景证明要点

### 5.1 场景 1：repository CRUD 与字段映射

测试步骤：

1. 调用 `projects.create()` 写入 Project（camelCase 字段：`id`、`name`、`createdAt`、`updatedAt`、`lastVersionId`、`lastJobId`）。
2. `assets.create()` 写入 Asset；`versions.create()` 写入 Version；`jobs.create()` 写入 GenerationJob；`authThrottle.put()` 写入 AuthThrottle。
3. `dumpPgStyleRows()` 暴露 PG-style snake_case 行结构（`id`、`name`、`created_at`、`updated_at`、`last_version_id`、`last_job_id`）。
4. 各 repository 的 `get` / `listByProject` 读回数据，断言 camelCase 字段完整 round-trip。

通过的断言（节选）：

```ts
expect(rows.projects[0]).toMatchObject({
  id: 'proj_cb_001',
  name: 'CloudBase PoC Project',
  created_at: '2026-07-18T00:00:00Z',
  updated_at: '2026-07-18T00:00:05Z',  // updatePointers 后变化
  last_version_id: 'ver_cb_001',
  last_job_id: 'job_cb_001',
});
expect((await deps.projects.get('proj_cb_001'))?.lastVersionId).toBe('ver_cb_001');
```

结论：camelCase ↔ snake_case 双向 mapper 在 CRUD 路径上稳定；PERSIST-001 实施时可直接复用此 mapper 模式。

### 5.2 场景 2：UnitOfWork 事务失败回滚

测试步骤：

1. 在 `unitOfWork.run` 内创建 Version 与 Job，然后抛出 `synthetic rollback`。
2. 重新构造 adapter 实例读取该 Version 和 Job。

通过的断言：

```ts
await expect(
  deps.unitOfWork.run(async () => {
    await deps.versions.create(version);
    await deps.jobs.create(job);
    throw new Error('synthetic rollback');
  })
).rejects.toThrow('synthetic rollback');

const reloaded = createCloudBaseMockPersistence({ storageRoot: tempRoot });
expect(await reloaded.versions.listByProject(project.id)).toHaveLength(0);
expect(await reloaded.jobs.get(job.id)).toBeNull();
```

结论：UnitOfWork 在异常时回滚内存状态并重新持久化，新实例无法看到部分写入；不会出现 Version 创建成功而 Job 失败的部分成功状态。

### 5.3 场景 3：私有对象签名 URL

测试步骤：

1. `objects.put(key, bytes)` 写入 12 字节合成 PNG。
2. `objects.getSignedUrl(key)` 返回签名 URL。
3. 断言 URL 格式：`https://{bucket}.pg.storage.cloudbase.com/{key}?expires={unix}&signature={hex}`。

通过的断言：

```ts
const url = await deps.objects.getSignedUrl('projects/proj_cb_001/assets/asset_cb_001.bin');
expect(url).toMatch(/^https:\/\/lumen-ink-private\.pg\.storage\.cloudbase\.com\/projects\/proj_cb_001\/assets\/asset_cb_001\.bin\?expires=\d+&signature=[0-9a-f]{64}$/);
expect(url).toContain('expires=');
expect(url).toMatch(/signature=[0-9a-f]{64}/);  // SHA-256 hex
```

结论：CloudBase mock 的 `getSignedUrl` 返回带 `bucket` / `key` / `expires` / `signature` 的 HTTPS URL，符合 CloudBase PG Storage `createSignedUrl` 的语义；PERSIST-001 实施时只需替换为真实 CloudBase SDK 调用。

### 5.4 场景 4：项目级联删除

测试步骤：

1. 重新加载的 adapter 调用 `projects.deleteCascade(project.id)`。
2. 删除实现按顺序：移除对象字节 → 删除版本 → 删除 Job → 删除 Asset → 删除 Project → 持久化元数据。

通过的断言：

```ts
await reloaded.projects.deleteCascade(project.id);

expect(await reloaded.projects.get(project.id)).toBeNull();
expect(await reloaded.assets.listByProject(project.id)).toHaveLength(0);
expect(await reloaded.versions.listByProject(project.id)).toHaveLength(0);
expect(await reloaded.jobs.get(job.id)).toBeNull();
expect(await reloaded.objects.exists(asset.storageKey)).toBe(false);
```

结论：项目级联删除清空元数据 + 对象字节，符合 STORAGE-001 硬条件「项目级联删除」。

### 5.5 场景 5：Job lease 过期与安全重试

测试步骤：

1. `acquireJobLease(jobId, leaseSeconds=60)` 在 t0 获取租约。
2. `listLeaseExpiredJobs(now=t0+61s)` 返回该 Job（lease 已过期）。
3. 第二个 worker 调用 `acquireJobLease(jobId, leaseSeconds=60, now=t0+61s)` 安全接管。
4. 第一个 worker 的 `heartbeatJobLease` 在过期后调用不会覆盖第二个 worker 的 lease（基于 `leaseExpiresAt < now` 判定）。

通过的断言：

```ts
const adapter = createCloudBaseMockPersistence({ storageRoot: tempRoot });
const t0 = new Date('2026-07-18T00:00:00Z');
await adapter.acquireJobLease('job_cb_001', 60, t0);

const t1 = new Date('2026-07-18T00:01:01Z');  // t0 + 61s
const expired = await adapter.listLeaseExpiredJobs(t1);
expect(expired.map(j => j.id)).toContain('job_cb_001');

// 第二个 worker 安全接管
await adapter.acquireJobLease('job_cb_001', 60, t1);
const job = await adapter.jobs.get('job_cb_001');
expect(job?.leaseExpiresAt).toBe('2026-07-18T00:02:01Z');  // t1 + 60s
```

结论：Job lease TTL 模式可安全支持「过期 → 重试」语义；PERSIST-001 实施时通过 `UPDATE jobs SET lease_expires_at = NOW() + interval WHERE lease_expires_at < NOW()` 即可实现原子接管。

### 5.6 场景 6：幂等键防重

测试步骤：

1. 第一次调用 `createVersionIdempotent(projectId, 'idem-key-001', version)` 创建 Version。
2. 第二次调用相同 `idempotencyKey` 返回同一 Version（不创建新行）。
3. 不同 `idempotencyKey` 创建新 Version。

通过的断言：

```ts
const v1 = await adapter.createVersionIdempotent(project.id, 'idem-key-001', version);
const v2 = await adapter.createVersionIdempotent(project.id, 'idem-key-001', anotherVersionPayload);
expect(v2.id).toBe(v1.id);  // 同一 ID
expect(await adapter.versions.listByProject(project.id)).toHaveLength(1);

const v3 = await adapter.createVersionIdempotent(project.id, 'idem-key-002', version);
expect(v3.id).not.toBe(v1.id);
expect(await adapter.versions.listByProject(project.id)).toHaveLength(2);
```

结论：`idempotencyKey` 唯一约束在 mock 中通过 `Map<idempotencyKey, Version>` 实现；PERSIST-001 实施时通过 `UNIQUE(idempotency_key)` 数据库约束 + `ON CONFLICT DO NOTHING RETURNING *` 即可实现原子幂等。

## 6. 候选 A 能力映射证明

| 冻结接口 | CloudBase 实现 | mock 适配 | PoC 通过 |
|---------|---------------|----------|---------|
| ProjectRepository | CloudBase PostgreSQL `projects` 表 | ✓ snake_case 行 + camelCase mapper | ✓ |
| AssetRepository | CloudBase PostgreSQL `assets` 表 | ✓ 同上 | ✓ |
| VersionRepository | CloudBase PostgreSQL `versions` 表（含 `idempotency_key` 唯一约束） | ✓ | ✓ 场景 6 |
| JobRepository | CloudBase PostgreSQL `jobs` 表（含 `lease_expires_at` 字段） | ✓ | ✓ 场景 5 |
| ObjectStore | CloudBase PG Storage 私有 bucket + `createSignedUrl` | ✓ HTTPS 签名 URL | ✓ 场景 3 |
| UnitOfWork | PostgreSQL 事务（`BEGIN` / `COMMIT` / `ROLLBACK`） | ✓ snapshot + rollback | ✓ 场景 2 |
| AuthThrottleRepository | CloudBase PostgreSQL `auth_throttle` 表 | ✓ | ✓ |
| JobExecutor | 现有 Vercel Node Function（Hobby 300s maxDuration） | ✓（沿用现有 `local.ts`） | ✓ |
| 任务恢复 | DB Job 状态 + lease/heartbeat + 幂等键 + 显式 retry | ✓ PoC-only helper 演示 | ✓ 场景 5、6 |

## 7. 不接入生产路径声明

- 本 PoC 仅使用内存 mock + `os.tmpdir()` 持久化模拟 CloudBase PG 行为。
- 不创建 CloudBase 真实环境，不索取或写入密钥，不连接生产数据。
- 不修改生产 Provider、上传、Job 或 Version 运行路径。
- PERSIST-001 实施时由生产 adapter（`src/server/infrastructure/persistence/cloudbase.ts`）替换 mock，接口签名不变。

## 8. 不包含的内容（安全边界）

- 真实客户照片、订单、聊天记录、未脱敏 Prompt（无）。
- API Key、JWT Secret、Provider 完整配置、CloudBase SecretId / SecretKey（无）。
- 模型权重、训练数据、生产数据库导出（无）。
- 对象字节内容（仅 12 字节合成占位）。
- 完整连接字符串（仅记录官方文档 URL）。

## 9. 冻结声明

本 PoC 文件**不写** `decision: frozen`。GPT 验收通过后由 GPT 写入冻结并更新 STATE.json 激活 PERSIST-001。
