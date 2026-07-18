# Trae Prompt｜STORAGE-001 持久化与任务基础设施技术选型

> 状态：`ready_for_trae / nextActor=trae`（FLOW-001 于 2026-07-18 通过 GPT 第三轮验收后激活）。

> GPT 验收：2026-07-18，`MVP_PASS_WITH_DEBT`；候选 A 已冻结。P1 契约收敛进入 PERSIST-001 首门，详见 `docs/lumen-v2/reviews/STORAGE-001-GPT-REVIEW.md` 与 D-040。

> 前置条件：`FLOW-001` 已通过。  
> 本任务以技术报告和最小 PoC 为主，不接入生产数据。

## 目标

为 3 人工作区选择可执行的：

- 元数据数据库；
- 图片对象存储；
- 签名 URL；
- GenerationJob 持久化；
- 长任务执行或 durable execution；
- 本地开发替代方案。

## 至少比较两个完整方案

每个方案必须覆盖：

- Vercel 部署兼容性；
- 80—100 秒模型调用；
- 刷新和断线恢复；
- 任务取消/重试；
- 资产级联删除；
- 环境变量与 Provider Key；
- 月度固定成本和变量成本；
- Windows 本地开发；
- 数据迁移和备份；
- 供应商锁定风险。

IndexedDB 只能作为缓存/PoC，不得作为正式多人真相方案。

## PoC

使用合成文本或小型占位图片，不使用真实客户图：

- 创建一条 Project；
- 上传一个 Asset；
- 创建并更新一个 Job；
- 刷新后读取；
- 删除后验证资产清理。

## 输出

- `docs/lumen-v2/storage-options.md`
- 架构图；
- PoC 分支；
- 评分矩阵；
- 推荐方案；
- 回滚方案；
- 需要用户提供的账号、预算或环境变量清单。

未经 GPT/用户冻结，不进入 PERSIST-001。

## PERSIST-001 接口交付要求

为避免选型 PoC 在下一任务被重写，STORAGE-001 还必须产出并验证以下稳定出口：

- `src/server/domain/persistence.ts`：Project/Asset/Version/Job Repository、ObjectStore、UnitOfWork 契约；
- `src/server/domain/persistence.ts`：同时提供持久化登录限流所需的 `AuthThrottleRepository`，并由 `PersistenceDependencies.authThrottle` 暴露；
- `src/server/infrastructure/persistence/index.ts`：导出冻结方案的 `PersistenceDependencies`；
- `src/server/infrastructure/executor/index.ts`：导出 `JobExecutor.enqueue/cancel`；
- 可重复运行的合约测试：创建 Project/Asset/Job 与限流桶、重建适配器后读取、级联删除与对象清理；
- `docs/lumen-v2/storage-options.md` 明确 `decision: frozen`、依赖版本、环境变量、本地替代和回滚。

STORAGE-001 通过后激活 `PERSIST-001`，不再激活已被取代的 VERSION-001/JOB-001。

## 内部稳定版快速执行包（D-034）

本任务按 `docs/lumen-v2/plans/INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 1—3 连续执行：

1. 只比较两个满足硬条件的完整方案；
2. 使用固定 100 分权重矩阵，恢复/一致性、长任务执行、删除任一项低于 3/5 即淘汰；
3. 使用合成数据和本地临时目录实现稳定接口与可重复合约测试；
4. PoC 必须证明适配器重建后恢复 Project/Asset/V0/Job，并证明级联删除和对象清理；
5. 无付费、预算或不可逆决策时交 GPT 快速冻结；否则交用户决策；
6. 本任务不得实施 PERSIST 业务服务、真实版本 UI 或生产数据迁移。

普通供应商功能差异、UI、命名和非关键优化不阻塞，记录到 `docs/lumen-v2/FAST-TRACK-DEFERRED.md`。
