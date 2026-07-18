# STORAGE-001 PoC 结果

> 任务：STORAGE-001
> 创建日期：2026-07-18
> 决策状态：`pending_user_approval`（未冻结；本文件不写 `decision: frozen`）
> 主源登记：`docs/lumen-v2/evidence/STORAGE-001/source-register.md`
> 选型报告：`docs/lumen-v2/storage-options.md`

## 1. 命令与退出码

```powershell
npm test --prefix src/server -- domain/persistence.contract.test.ts
```

退出码：`0`

```
✓ domain/persistence.contract.test.ts (3 tests) 568ms
    ✓ recovers records after adapter re-instantiation and cascades deletion  436ms
    ✓ UnitOfWork rolls back on exception (no partial writes visible to a fresh instance)
    ✓ ObjectStore rejects reads of unknown keys without throwing unexpected errors

Test Files  1 passed (1)
Tests       3 passed (3)
```

## 2. 合约测试合成数据 ID

所有 ID 均为合成值，不引用真实客户、订单或生产数据。

| 实体 | 合成 ID | 备注 |
|------|---------|------|
| Project | `proj_synthetic_001` | 用于级联删除证明 |
| Asset | `asset_original_001` | 12 字节合成 PNG 占位 |
| Version | `ver_v0_001` | 项目首个版本 |
| GenerationJob | `job_queued_001` | 初始状态 `queued` |
| AuthThrottle 桶 | `auth-throttle:192.0.2.1` | TEST-NET-1 文档 IP，HMAC 派生键的前缀形式 |
| UoW 回滚 Project | `proj_uow_rollback` | 用于 UnitOfWork 回滚证明 |
| 未知对象键 | `projects/unknown/missing.bin` | 用于 ObjectStore 缺失键行为证明 |

## 3. 适配器重建恢复证明

测试步骤：

1. 在 `os.tmpdir()` 下创建临时目录 `lumen-storage-contract-*`。
2. 第一个适配器实例写入 Project / Asset / Version / GenerationJob / AuthThrottle 桶 + 12 字节对象字节。
3. 用**同一根目录**构造第二个适配器实例（`createLocalPersistence({ rootDir: tempRoot })`）。
4. 第二个实例读回所有五条记录。

通过的断言（节选）：

```ts
expect(await reloaded.projects.get(project.id)).not.toBeNull();
expect(await reloaded.assets.listByProject(project.id)).toHaveLength(1);
expect(await reloaded.versions.listByProject(project.id)).toHaveLength(1);
expect(await reloaded.jobs.get(job.id)).toMatchObject({ status: 'queued' });
expect(await reloaded.authThrottle.get(throttleKey)).toMatchObject({ failures: 3 });
```

结论：本地适配器把状态写入磁盘（`metadata.json` + `objects/<key>`），新实例从同一目录加载即可恢复记录。生产适配器（Vercel Postgres + R2 / Supabase）只要遵守同一合约即可替换。

## 4. 级联删除证明

测试步骤：

1. 重新加载的适配器调用 `projects.deleteCascade(project.id)`。
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

## 5. UnitOfWork 回滚证明

第二个测试用例：

1. 在 `unitOfWork.run` 内创建 Project，然后抛出 `synthetic rollback`。
2. 重新构造适配器实例读取该 Project。

通过的断言：

```ts
await expect(
  deps.unitOfWork.run(async () => {
    await deps.projects.create(project);
    throw new Error('synthetic rollback');
  })
).rejects.toThrow('synthetic rollback');

const reloaded = createLocalPersistence({ rootDir: tempRoot });
expect(await reloaded.projects.get(project.id)).toBeNull();
```

结论：UnitOfWork 在异常时回滚内存状态并重新持久化，新实例无法看到部分写入。

## 6. ObjectStore 缺失键行为

第三个测试用例：

- `exists('projects/unknown/missing.bin')` 返回 `false`。
- `delete('projects/unknown/missing.bin')` 不抛异常（ENOENT 静默处理）。
- `getSignedUrl('projects/unknown/missing.bin')` 返回非空字符串（本地适配器返回 `file://...` 占位）。

结论：合约对缺失键行为稳定，生产适配器（R2 presigned URL / Supabase Signed URL）可在此基础上提供时间限制的 HTTPS URL。

## 7. 选定候选方案映射

| 候选 | 元数据 | 对象存储 | 长任务执行 | 本地替代 |
|------|--------|---------|-----------|---------|
| 推荐：Vercel + Cloudflare R2 + Vercel Workflow | Vercel Postgres (Neon) | Cloudflare R2 + presigned URL | Vercel Workflow (durable, 'use workflow'/'use step') | Vercel CLI + Docker Postgres + MinIO |
| 备选：Supabase all-in-one | Supabase Postgres | Supabase Storage + Signed URL + RLS | pgmq + pg_cron + pg_net（非 durable） | Supabase CLI local |

合约表面与两个候选均兼容：`ProjectRepository` / `AssetRepository` / `VersionRepository` / `JobRepository` 可由任一 Postgres 后端实现；`ObjectStore` 可由 R2 或 Supabase Storage 实现；`JobExecutor` 可由 Vercel Workflow 或 pgmq 消费者实现；`UnitOfWork` 由 Postgres 事务实现；`AuthThrottleRepository` 由 Postgres 表或 KV 实现。

## 8. 剩余账号门槛

`account_gate: user` —— 待用户决策：

1. Cloudflare 账号注册（免费额度内不收费，但需信用卡验证）。
2. Vercel Pro 计划升级（$20/月，Function 800s maxDuration、Workflow Beta、Cron）。
3. 月度预算上限确认（推荐 $20—25/月，超出 R2 免费额度按 $0.015/GB 计）。
4. Vercel Workflow Beta 风险接受（Beta 产品，可能有 API 变更）。
5. 不可逆迁移审批（一旦写入生产 R2 / Vercel Postgres，回滚需手动导出 + 重新导入）。

`decision_authority: user`。

## 9. 不包含的内容

- 真实客户照片、订单、聊天记录或未脱敏 Prompt（无）。
- API Key、JWT Secret、Provider 完整配置（无）。
- 模型权重、训练数据、生产数据库导出（无）。
- 对象字节内容（仅记录 12 字节合成占位）。
- 完整连接字符串（仅记录官方文档 URL）。

## 10. 冻结声明

本 PoC 文件**不写** `decision: frozen`。GPT/用户冻结后由 `STATE.json` 激活 PERSIST-001。
