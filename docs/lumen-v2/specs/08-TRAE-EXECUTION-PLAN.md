# 08｜Trae 实施计划与协作契约

## 1. 总规则

1. 每次只执行一个任务 ID。
2. 先事实、再方案、再编码；不得边猜边大改。
3. 不自行修改 `00`—`07` 产品规格和 `09-DECISION-LOG.md` 的冻结决策。
4. 所有改造必须可回滚，使用独立分支和 feature flag。
5. 不新增与当前任务无关的框架或功能。
6. 没有测试、截图和复现证据，不得标记完成。
7. 遇到规格与代码冲突时停止扩展范围，在交付报告中列为“需要 GPT 决策”。

## 2. 阶段 0：仓库扫描

### SCAN-001 — 已通过

输出位于 `scans/SCAN-001-main-repo-report.md`。  
GPT 审核位于 `11-SCAN-001-REVIEW.md`。

## 3. 阶段 0.5：工程基线

### BASE-001 — 当前任务

目标：

- 修复现有 lint 错误和警告；
- 建立 client/server/root test 命令；
- 添加最小但真实的回归测试；
- 补齐 PromptInput 和四个工具面板事实扫描；
- 不改变可见产品行为。

使用：`prompts/02-base-001.md`。

## 4. 阶段 1：V2 外壳

### UI-001

目标：

- 建立 `AppV2` 和 `VITE_EDITOR_V2`；
- 顶栏改为项目上下文；
- 左栏使用稳定文字标签；
- 中央画布和右栏建立 V2 布局；
- 底部版本条仅做结构占位；
- Legacy 仍可回滚。

本轮允许兼容性保留旧“应用/提交”行为，Production flag 必须关闭。  
单一 CTA 在 FLOW-001 完成。

使用：`prompts/03-ui-001.md`。

## 5. 阶段 2：配方与操作收敛

### FLOW-001

- EditRecipe；
- 五档语义参数；
- 保护项；
- 补充要求；
- 单一“生成预览”；
- Prompt 编译器 v1；
- Provider 仅接收编译结果。

使用：`prompts/04-flow-001.md`。

## 6. 阶段 3：持久化与任务技术选型

### STORAGE-001

只做技术选型和最小验证，不做完整业务实现：

- 3 人工作区元数据；
- 图片对象存储；
- 签名 URL；
- 生成任务持久化；
- Vercel 部署适配；
- 成本、迁移和回滚。

使用：`prompts/05-storage-spike.md`。

## 7. 阶段 4：项目与版本

### VERSION-001

- Project / Asset / Version；
- 原图版本；
- 版本条；
- 查看、对比、激活、采用；
- 刷新恢复；
- 旧 history 备份和显式导入；
- 删除与资产清理。

使用：`prompts/06-version-001.md`。

## 8. 阶段 5：生成任务

### JOB-001

- GenerationJob；
- 真实阶段；
- 持久化状态；
- 取消、重试和恢复；
- 成功后创建 Version；
- 失败不污染版本。

使用：`prompts/07-job-001.md`。

## 9. 阶段 6：模型路由

### ROUTING-001

- 集中能力矩阵；
- 质量/均衡/速度策略；
- 失败转移；
- 高级模型抽屉；
- 路由证据和成本档位。

使用：`prompts/08-routing-001.md`。

## 10. 阶段 7：安全与发布

### HARDEN-001

- secret fail-fast；
- CORS allowlist；
- 登录限流；
- 上传类型/大小/像素限制；
- 日志和 health 脱敏；
- Provider 配置迁移；
- 删除策略；
- 安全测试。

使用：`prompts/09-harden-001.md`。

## 11. 每轮完成定义

Trae 必须按 `templates/TRAE-RETURN-TEMPLATE.md` 回传。  
没有完整证据，任务状态只能是“待验收”。
