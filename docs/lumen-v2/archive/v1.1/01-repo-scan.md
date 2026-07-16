# Trae Prompt｜SCAN-001 主仓扫描（禁止改代码）

你现在负责光砚 Lumen Ink V2 的第一轮仓库扫描。先读取资料包中的：

- `00-PROJECT-MEMORY.md`
- `01-EXECUTIVE-AUDIT.md`
- `05-FUNCTIONAL-PRD.md`
- `06-TECHNICAL-CONTRACT.md`
- `09-DECISION-LOG.md`

## 硬性限制

1. 本轮禁止修改生产代码、依赖、配置和 UI。
2. 不要直接开始重构。
3. 所有结论必须引用实际文件路径、组件名、类型名或路由。
4. 如果资料包和仓库冲突，列出冲突，不要自行决定覆盖。
5. 不读取或输出真实 API Key、客户图片、`.env` 内容。

## 扫描范围

请检查：

- 根目录、前端、后端、共享类型和 Vercel 配置；
- 当前页面布局与组件树；
- `useEditor`/Reducer/Context 的状态流；
- 上传、编辑、参考图、历史和导出流程；
- ProviderFactory、ProviderStore 和各 Provider；
- auth、edit、detect、providers 路由；
- 文件/数据库/localStorage/临时目录存储；
- lint、typecheck、test、build；
- 当前错误处理、超时、取消和重试；
- 安全 fallback、CORS、上传大小、日志和健康检查。

## 输出文件

只新增文档：`docs/lumen-v2/current-state-scan.md`。

文档必须包含：

1. 仓库结构图；
2. 当前组件树；
3. 关键调用链；
4. 状态和数据真相来源；
5. Provider 能力矩阵；
6. 持久化实际行为；
7. 已有测试和构建结果；
8. 与资料包冲突项；
9. P0 每个 Epic 对应的修改文件；
10. 迁移风险；
11. 建议实施顺序；
12. 需要 GPT/用户确认的问题。

## 执行验证

在不修改代码的前提下运行仓库已有的：

- 安装或锁文件一致性检查；
- lint；
- typecheck；
- test；
- build。

记录完整命令、退出码和失败原因。不要为了通过而修代码。

## 最终回复格式

```text
任务 ID：SCAN-001
代码修改：无
新增文档：
扫描结论：
构建状态：
最高风险：
与规格冲突：
建议下一任务：
需要决策：
```
