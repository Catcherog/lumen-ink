# Trae 连续执行入口｜内部稳定版加速推进

开始前按顺序读取：

1. `AGENTS.md`
2. `docs/lumen-v2/state/STATE.json`
3. `docs/lumen-v2/specs/10-INTERNAL-FAST-TRACK-DESIGN.md`
4. `docs/lumen-v2/plans/INTERNAL-FAST-TRACK-IMPLEMENTATION-PLAN.md`
5. `docs/lumen-v2/tasks/active/STORAGE-001.md`
6. `docs/lumen-v2/FAST-TRACK-DEFERRED.md`

## 连续执行授权

当前只执行 `STORAGE-001`。先单独提交并 push FLOW-001 GPT 验收控制面文件与任务移动，再创建 STORAGE 分支。

STORAGE-001 按快速计划完成两个完整方案、合成 PoC、稳定接口、合约测试、评分矩阵和推荐。若推荐方案不需要新增付费账号、不可逆迁移或预算提升，提交 `awaiting_gpt_acceptance / nextActor=gpt` 供 GPT 快速冻结；不得自行把 `decision` 写成 frozen。

GPT 冻结并将 STATE 激活为 `PERSIST-001 / ready_for_trae / nextActor=trae` 后，无需重新拆包：先执行既有 PERSIST Task 1—11，再执行快速计划 Task 5—7 的三个内部安全单元，最后执行 PERSIST Task 12 统一证据交接。每个任务按 TDD 和精确路径提交，最终统一 push 和回传。

## 只在以下情况停止

- 需要付费账号、信用卡、预算或不可逆迁移；
- 数据丢失、密钥泄漏、权限绕过或客户数据暴露；
- PoC 无法证明适配器重建恢复、Job 持久化或级联删除；
- 失败/取消创建成功 Version、刷新不可恢复、幂等失败或删除残留；
- 当前任务门禁失败；
- 必须修改已冻结 Provider/API/存储协议。

普通 S2/S3、非关键 UI、命名、动画、性能美化和 ROUTING 需求只登记到 `FAST-TRACK-DEFERRED.md`，不要停止主线，不要顺手修复。

## 每阶段回传

- 任务 ID、分支、commit、精确修改文件；
- 红→绿测试证据和完整门禁；
- 脱敏 PoC/数据快照；
- 未完成项与延期表更新；
- 报告、STATE、SESSION-HANDOFF、PROJECT-MEMORY、DECISION-LOG、CHANGELOG；
- 不提交工作区既有无关修改。
