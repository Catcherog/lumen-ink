# Trae Prompt｜PERSIST-001 项目版本与可恢复生成闭环

> 前置条件：FLOW-001 已通过；STORAGE-001 已由 GPT 于 2026-07-18 冻结为候选 A。
> 当前状态：`ready_for_trae / nextActor=trae`。按 D-040 先完成契约收敛门，再连续实施完整扩大包。

## 目标

在同一任务 ID、分支和 PR 中合并原 VERSION-001 与 JOB-001，一次交付：

- Project、Asset、不可变 Version、GenerationJob；
- 上传创建 original Asset 与 V0；
- Job 创建、真实状态、查询、best-effort 取消、重试和刷新恢复；
- 成功顺序 Asset → Version → Job succeeded；
- 失败/取消不创建成功 Version；
- 真实版本条、查看、对比、激活和采用；
- 项目级联删除与对象清理；
- 旧 history 备份、只读查看和显式导入；
- 旧 `/api/edit` 受控兼容与弃用路径。

## 权威输入

- 设计：`docs/lumen-v2/specs/09-PERSISTENT-GENERATION-CLOSURE-DESIGN.md`
- 实施计划：`docs/lumen-v2/plans/PERSIST-001-IMPLEMENTATION-PLAN.md`
- 存储决策：`docs/lumen-v2/storage-options.md`（必须为 frozen）

## 执行规则

- Trae 严格按实施计划的 Task 1—12 执行并勾选；
- TDD：先失败测试，再最小实现，再通过测试；
- 每个任务形成独立可回滚 commit，最终统一 push；
- 不实施 ROUTING、多工作区 IAM、Preview、图层或 Production 全量 HARDEN；
- 按 D-034 合并内部安全底线：运行时 secret fail-fast、登录限流、CORS allowlist、服务端图片解码/大小/像素校验、Provider 响应与 health/log 脱敏；完整公开发布 HARDEN 仍不在本任务；
- 不使用真实客户数据，不伪造进度或成功版本；
- 未满足前置条件时只能标记 blocked。
- 除付费/真实凭据、不可逆迁移、数据/安全 P0、候选 A 无法实现 D-040 语义或完整门禁失败外，不做普通阶段交接。

## 验收

以设计第 9 节、实施计划 Task 11—12 和 `07-ACCEPTANCE-PLAN.md` 的 Gate PERSIST-001 验收。任何失败/取消创建成功 Version、刷新不可恢复、删除残留资产或伪进度均为 P0。

内部稳定版还必须通过 `INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md` Task 5—8 的安全矩阵。默认密码/JWT fallback、凭据/图片泄漏、未授权访问或上传校验绕过均为 P0，不得登记为延期。
