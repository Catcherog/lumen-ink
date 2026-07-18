# 09｜PERSIST-001 项目版本与可恢复生成闭环设计

> 状态：待用户复核的已确认方向设计稿
> 日期：2026-07-18
> 生效前提：FLOW-001 通过验收，STORAGE-001 完成方案比较、PoC，并由 GPT/用户冻结供应商与成本方案。

## 1. 决策与目标

STORAGE-001 保持独立决策门，不与生产实现混合。存储方案冻结后，原 VERSION-001 与 JOB-001 合并为单一任务 `PERSIST-001`，在同一任务 ID、分支和 PR 中交付完整闭环：

> 上传原图 → 创建 Project/Asset/V0 → 创建 GenerationJob → 执行 Provider → 保存结果 Asset/Version → Job 成功 → 刷新恢复 → 对比/采用/重试/取消/删除。

合并原因：Version 的创建时机、Job 的成功事务、失败不污染版本、资产清理和刷新恢复共享同一数据模型与一致性边界。分两次实施会产生临时接口、重复迁移和二次返工。

## 2. 范围

### 必须交付

- Project、Asset、Version、GenerationJob 数据模型与迁移；
- 原图上传创建 Project、original Asset 与不可变 V0；
- GenerationJob 创建、查询、真实状态、best-effort 取消、重试和刷新恢复；
- 成功结果保存为 result Asset 与不可变子 Version；
- 成功顺序与一致性：Asset → Version → Job `succeeded`；
- 失败或取消不得创建成功 Version；
- 底部版本条展示真实版本，支持查看、对比、激活、采用；
- 项目删除的元数据与对象存储级联清理；
- 旧 `edit_history` 先备份、只读查看、显式导入可恢复条目；
- 旧 `/api/edit` 作为受控兼容层，并给出弃用路径；
- 错误码、`diagnosticId`、脱敏日志和故障测试。

### 不在本任务

- 智能模型路由与 fallbackChain（ROUTING-001）；
- 多工作区角色与细粒度权限（P1）；
- Production 全量安全门禁（HARDEN-001）；
- 客户 Preview 模式；
- 画笔蒙版、智能对象选择或 Photoshop 式图层。

## 3. 领域边界

四个 Repository 各自负责单一真相：

- `ProjectRepository`：项目元数据、active/approved Version 指针；
- `AssetRepository`：对象存储 key、类型、大小、尺寸、哈希与删除；
- `VersionRepository`：不可变版本链、父子关系、Recipe/Job 来源；
- `JobRepository`：任务状态、尝试次数、错误、租约/执行标记与时间戳。

业务层通过 `GenerationService` 编排，不允许路由或 React 组件跨过服务层直接组合多 Repository 写入。

## 4. 数据流与一致性

### 上传

1. 校验上传元数据；
2. 写入 original Asset；
3. 在数据库事务中创建 Project、V0，并设置 `activeVersionId=V0`；
4. 若数据库写入失败，清理已上传对象；清理失败记录可重试的 orphan cleanup。

### 生成

1. 持久化 Job 为 `queued` 并立即返回 `jobId`；
2. 执行器按真实事件推进 `uploading/analyzing/generating/postprocessing/saving`；
3. Provider 成功后先写 result Asset；
4. 在数据库事务中创建不可变 Version、更新 Project activeVersion、将 Job 标记 `succeeded`；
5. 任一步失败，Job 标记 `failed`，不得创建成功 Version；孤立 Asset 进入清理队列。

### 重试与取消

- 重试创建新的 attempt 或子 Job，保留原失败记录，不覆盖审计信息；
- 取消为 best-effort：未开始任务可直接取消；Provider 已执行时停止后续保存，无法保证终止外部计费；
- 客户端只展示服务端真实状态，不推算百分比。

## 5. API 边界

建议最小接口：

- `POST /api/projects`：上传并创建 Project/V0；
- `GET /api/projects/:id`：恢复项目、版本与活动任务；
- `DELETE /api/projects/:id`：级联删除；
- `POST /api/projects/:id/jobs`：基于 inputVersion + EditRecipe 创建 Job；
- `GET /api/jobs/:id`：查询状态；
- `POST /api/jobs/:id/cancel`：best-effort 取消；
- `POST /api/jobs/:id/retry`：从可重试错误创建新 attempt；
- `POST /api/projects/:id/versions/:versionId/activate`：激活版本；
- `POST /api/projects/:id/versions/:versionId/approve`：标记采用。

所有写接口必须校验工作区、资源归属、输入状态与幂等键；重复请求不得创建重复 Version。

## 6. 前端状态

- `AppV2` 只持有当前视图状态与服务器快照，不再把内存 history 当长期真相；
- 版本条由真实 Version 列表驱动，移除占位组件；
- 生成后使用 `jobId` 查询/订阅状态，刷新时从项目详情恢复；
- ResultViewer 始终显示 active Version；查看历史版本不隐式改变 active Version；
- “采用”与“激活”是明确操作，避免浏览动作污染项目状态；
- 取消、失败和重试提供可操作错误提示，不伪造成功版本。

## 7. 旧数据迁移

- 首次升级前备份 `edit_history` 原文；
- 默认只读展示，不自动写入正式 Version；
- 仅当图片内容仍可读取、元数据可校验且用户显式确认时导入；
- 每条导入结果记录来源、导入时间与失败原因；
- 失效 URL 不导入，不因迁移失败删除原备份。

## 8. 测试与证据

### 自动化测试

- Repository 合约测试：CRUD、不可变约束、级联删除、幂等；
- 事务测试：Asset 成功但 DB 失败、Version 成功但 Job 更新失败等补偿路径；
- Job 状态机测试：合法/非法转换、超时、额度不足、网络中断、保存失败、取消竞态、重试；
- API 测试：归属校验、输入验证、错误码、幂等键；
- 前端测试：刷新恢复、版本查看/激活/采用、Job 状态、失败不新增版本；
- 兼容测试：旧 `/api/edit` 受控路径与弃用提示；
- 删除测试：数据库记录、对象和派生资源全部清理。

### 脱敏证据

- 使用合成图完成上传、生成、刷新、对比、采用、失败、重试、取消、删除全流程；
- 保存数据表快照、对象列表、状态转换记录与目标分辨率截图；
- 证据不得包含密钥、真实客户图、完整 Provider 配置或未脱敏 Prompt。

## 9. 验收门槛

- 刷新后 Project、active Version 和未完成 Job 可恢复；
- Version 不可变，父子关系与 Recipe/Job 来源可追踪；
- Job 失败/取消绝不创建成功 Version；
- 成功顺序满足 Asset → Version → Job succeeded；
- 取消、重试、超时、额度、网络和保存失败均有自动化测试；
- 删除项目后无数据库残留和对象泄漏，补偿失败可诊断/重试；
- 不存在伪进度、history 冒充 Version、失效 URL 自动导入；
- 统一工程门禁和公开仓库安全扫描通过。

## 10. 回滚

- 数据库迁移必须提供向前修复或明确回退脚本；禁止依赖破坏性 downgrade；
- 新 API 与 UI 通过 feature flag 接入，旧 `/api/edit` 在本任务内保留受控兼容；
- 对象存储使用命名空间隔离，回滚时可停止新写入而不删除已有资产；
- 若后台执行器不可用，可关闭异步入口并保留项目/版本只读访问；
- 回滚不得删除用户资产或旧 history 备份。

## 11. 任务与 Git 组织

- 合并任务 ID：`PERSIST-001`；
- 建议分支：`lumen/persist-001-trae`；
- 一个 PR 只对应 `PERSIST-001`；
- 原 VERSION-001 与 JOB-001 已按用户确认标记 `superseded_by: PERSIST-001`，保留原文供审计；
- STORAGE-001 未冻结前不得激活或实施 PERSIST-001；
- PERSIST-001 通过后再激活 ROUTING-001，HARDEN-001 保留最终发布门禁。

## 12. 完成定义

不是以“表已创建”或“接口已返回 jobId”为完成，而是必须从上传、持久化、生成、保存版本、刷新恢复、失败处理、采用与删除形成真实闭环。任何依赖假数据、内存状态、随机定时器或伪造百分比的路径均不计入完成。
