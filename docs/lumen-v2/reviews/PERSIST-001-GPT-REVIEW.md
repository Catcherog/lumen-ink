# PERSIST-001 GPT 验收报告

## 首轮验收

- 验收日期：2026-07-18（Asia/Shanghai）
- 审查分支：`lumen/persist-001-trae`
- 审查基线：`6eaec9464dccbe5c14a5cd1d40419595cb496f37`
- 审查 HEAD：`4e3a1253145b74aa30278ec201208d1baae28f28`
- 结论：`MVP_FAIL`
- 验收方式：风险 diff、核心一致性反例、部署接线核查、统一 8 门禁独立重跑

## 已确认项

- 当前控制面为 `PERSIST-001 / awaiting_gpt_acceptance / nextActor=gpt`，STORAGE 候选 A 仍为 `decision: frozen`。
- 9 阶段 Job 状态、幂等键、lease 字段、认证 API、客户端恢复 UI、legacy history 显式导入和内部安全单元均有实现及自动化测试。
- 独立门禁全部 exit 0：client lint、client/server typecheck、client 194 tests、server 332 tests、root 526 tests、build、`check-lumen-collab`。server/root 计数包含 `dist` 编译测试的重复收集，不能作为 332/526 个独立用例解释。
- 当前分支与 `origin/lumen/persist-001-trae` 一致；工作区既有无关修改未纳入本轮审查写入。

## P0 阻塞问题

### PERSIST001-P0-01：候选 A 生产适配器与真实 Job 执行器未落地

`src/server/index.ts` 在所有环境固定创建 `createLocalPersistence` 和 `createLocalJobExecutor`。本地 executor 的 `enqueue` 是 no-op；生产代码中没有任何调用 `GenerationService.executeJob` 的 worker/sweeper。仓库也不存在 CloudBase PostgreSQL/PG Storage 生产 adapter，`infrastructure/persistence/index.ts` 只导出 local adapter。

因此部署后创建 Job 只会停在 `queued`；Vercel 运行时数据写入本地文件系统而不是冻结的 CloudBase 持久层，无法满足刷新恢复、适配器重建恢复、持久 Job 状态或候选 A 的生产接线。这直接违反 PERSIST Task 3 Step 4 和内部稳定版核心闭环。

### PERSIST001-P0-02：最终 lease 失败会留下错误 Version 和断链 activeVersion

`GenerationService.executeJob` 先在 `UnitOfWork.run` 中提交 result Asset、Version 和 `Project.activeVersionId`，事务提交后才调用 `jobs.updateIfClaimed(... status=succeeded)`。最终条件写失败时，补偿逻辑只删除 result object，不能回滚已提交 metadata。

GPT 最小反例强制最终 `updateIfClaimed` 返回 null，结果为：抛出 `JOB_LEASE_EXPIRED`、Job=`failed`，但 `versionCount=2`、`assetCount=2`、activeVersion 指向新 Version，且该 Asset 的 object 已被删除。这同时造成“失败创建成功 Version”和“Version 指向不存在对象”，违反 `Asset → Version → Job succeeded` 原子顺序及 D-043。

### PERSIST001-P0-03：执行中取消可被原 worker 覆盖为 succeeded

`cancelJob` 使用无条件 `jobs.update(status=cancelled)`，没有撤销 lease；`heartbeat`/`updateIfClaimed` 只校验 token，不校验当前状态或 lease 是否仍有效。正在 Provider 调用的 worker 返回后仍可继续写 `postprocessing → saving → succeeded`。

GPT 最小反例在 providerFactory 阻塞期间调用取消：取消接口先返回 `cancelled`，随后同一执行返回 `succeeded`，最终 Job=`succeeded` 且创建 V1。该行为直接违反“取消不创建成功 Version”的 P0 验收条件。

### PERSIST001-P0-04：Job 冻结的输入版本未被执行路径消费

`createJob` 正确记录 `inputVersionId`，但 `executeJob` 忽略它，重新读取执行时的 `project.activeVersionId` 并据此选择 Asset。Job 排队后只要用户切换活动版本，执行语义就会漂移到另一输入。当前 `ObjectStore` 又没有读取接口，生产 providerFactory 只收到 Job，仓库内不存在可读取冻结输入对象并调用 Provider 的实现。

这违反不可变 Job 输入和可重试/可恢复语义；最低修复必须让原始 Job 与 retry 都消费记录在 Job 上的 `inputVersionId` 及其 Asset bytes。

## FIX_PACKET

```yaml
packet_type: FIX_PACKET
task_id: PERSIST-001
stage: MVP
review_target: 4e3a1253145b74aa30278ec201208d1baae28f28
decision: MVP_FAIL
fix_scope:
  - id: PERSIST001-P0-01
    requirement: 实现并按部署模式注入候选 A 的 CloudBase PostgreSQL/PG Storage adapter 与可实际调用 executeJob 的执行器/恢复扫描；本地模式保留 local，测试保留 mock。
  - id: PERSIST001-P0-02
    requirement: 将 Asset、Version、Project 指针和 Job 条件 succeeded 纳入同一事务及同一 lease 条件；任何条件失败必须不留下 metadata 或 object。
  - id: PERSIST001-P0-03
    requirement: 取消必须原子终止发布资格；后续 heartbeat、阶段迁移和最终提交均不得把 cancelled Job 改回活动态或 succeeded。
  - id: PERSIST001-P0-04
    requirement: executeJob 和 retry 必须读取 Job.inputVersionId 对应 Asset，而不是执行时 activeVersion；生产 Provider 路径必须取得该对象 bytes。
verification:
  - 部署模式 adapter 选择测试：CloudBase 配置缺失 fail-fast，存在配置时不创建 local adapter
  - 创建 Job 后真实 executor 可执行并刷新恢复；进程/adapter 重建后 queued/active Job 可接管
  - 最终 updateIfClaimed/事务提交故障反例：Job 非 succeeded 时无新增 Asset/Version、activeVersion 不变、无对象残留
  - provider 进行中取消反例：取消返回后最终保持 cancelled、无新增 Version
  - lease 过期且无/有接管两类反例；stale worker 不得续租或发布
  - Job 创建后切换 activeVersion，执行仍读取原 inputVersionId；retry 保持同一输入
  - npm.cmd run lint --prefix src/client
  - npx.cmd tsc --noEmit -p src/client/tsconfig.json
  - npm.cmd test --prefix src/client
  - npx.cmd tsc --noEmit -p src/server/tsconfig.json
  - npm.cmd test --prefix src/server
  - npm.cmd test
  - npm.cmd run build
  - node.exe scripts/check-lumen-collab.mjs
constraints:
  - 只修四个 P0 及直接回归，不启动 ROUTING/HARDEN/PERSIST-002
  - 保持候选 A 与冻结 Provider/API 方向；允许为正确事务上下文和对象读取做 D-040 最小契约修正并同步 adapter 合约测试
  - 不接真实客户数据；CloudBase live 凭据仍由用户在部署环境配置，不进入仓库或测试前置条件
  - 保留并不提交工作区既有无关修改
```

## 状态裁决

- PERSIST-001 保持在 `tasks/active/`；
- 状态改为 `changes_requested / nextActor=trae`；
- 不归档 PERSIST-001，不激活 ROUTING/HARDEN；
- Trae 只执行上述四个 P0 与直接回归，完成后重新统一回传。
