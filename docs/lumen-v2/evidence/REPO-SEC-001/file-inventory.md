# File Inventory | REPO-SEC-001

> 审计日期: 2026-07-16
> 审计范围: `.trae/knowledge/` 下所有 Git 跟踪文件
> 审计执行者: Trae

## 汇总

| 分类 | 数量 | 说明 |
|------|------|------|
| PUBLIC_SAFE | 23 | 通用 Prompt、方法论、工作流、参数速查，可公开 |
| SANITIZE | 0 | 无需脱敏的文件 |
| PRIVATE_REMOVE | 2 | 含用户画像或内部经营计划，需从公开仓库移除 |
| SECRET_ROTATE | 0 | 未发现真实密钥 |
| **总计** | **25** | |

## Git 跟踪状态

- 全部 25 个文件被 Git 跟踪
- 全部在单次提交 `b53ac1a` (Initial commit) 中引入
- `.gitignore` 未排除 `.trae/knowledge/` 目录

## 详细分类

### PRIVATE_REMOVE（2 个文件）

| # | 文件路径 | 分类原因 |
|---|---------|---------|
| 1 | `.trae/knowledge/preference/preference-用户画像与偏好档案-20260514.md` | 含详细用户画像：角色定位、技术能力评估、业务策略、竞争力分析、个人成长规划、审美偏好档案、工作习惯。属于内部用户画像，不应公开 |
| 2 | `.trae/knowledge/workflow/workflow-长期任务清单-Action-Items-20260514.md` | 含个人任务计划、业务增长目标、ROI 计算计划、竞争策略。属于内部经营计划 |

### PUBLIC_SAFE（23 个文件）

| # | 文件路径 | 内容类型 | 说明 |
|---|---------|---------|------|
| 1 | `.trae/knowledge/prompt/prompt-AIX-场景合成与面部精修咒语-20260514.md` | 通用提示词 | 5条官方咒语+自定义技巧 |
| 2 | `.trae/knowledge/prompt/prompt-分层修图-img2img提示词体系-20260518.md` | 通用方法论 | 分层写法+万能模板 |
| 3 | `.trae/knowledge/prompt/prompt-商业人像精修-5大模块提示词体系-20260515.md` | 通用提示词 | 频率分离/双曲线/液化/肤色/细节 |
| 4 | `.trae/knowledge/prompt/prompt-基准精修-自然精致保留特色-20260518.md` | 通用提示词 | 自然精修提示词 |
| 5 | `.trae/knowledge/prompt/prompt-新中式暗调电影感-面部精修-20260514.md` | 通用提示词 | 风格化提示词（无个人标识） |
| 6 | `.trae/knowledge/prompt/prompt-社区提示词精华-awesome-list拆解-20260526.md` | 通用方法论 | 社区359+案例拆解 |
| 7 | `.trae/knowledge/prompt/prompt-通透调色-影调色彩分层提示词体系-20260515.md` | 通用方法论 | 影调去灰/色彩层次/二级调色 |
| 8 | `.trae/knowledge/param/param-模型对比-Image2-Banana-Seedance-20260514.md` | 通用参数 | 公开模型能力对比 |
| 9 | `.trae/knowledge/param/param-重绘幅度与参数速查-20260518.md` | 通用参数 | Denoising 速查表 |
| 10 | `.trae/knowledge/tip/tip-GPT-Image2-实战技巧-20260514.md` | 通用技巧 | 实战技巧总结 |
| 11 | `.trae/knowledge/tip/tip-Image2-img2img修图核心策略-20260518.md` | 通用策略 | 四原则+常见问题 |
| 12 | `.trae/knowledge/tip/tip-Image2-高级技巧-思考模式与文字渲染-20260514.md` | 通用技巧 | 思考模式与文字渲染 |
| 13 | `.trae/knowledge/workflow/workflow-AIX-3节点自动化修图工作流-20260514.md` | 通用工作流 | 3节点工作流描述 |
| 14 | `.trae/knowledge/workflow/workflow-Image2-Seedance2.0-超级工作流-20260514.md` | 通用工作流 | 视频生成工作流 |
| 15 | `.trae/knowledge/workflow/workflow-SOP-个人写真后期处理-标准化作业程序-20260514.md` | 通用SOP | 模板化作业程序（模板字段无实际数据） |
| 16 | `.trae/knowledge/workflow/workflow-Shotlab-3节点自动化修图实战指南-20260514.md` | 通用指南 | 操作步骤指南 |
| 17 | `.trae/knowledge/workflow/workflow-Shotlab-TVC商业广告制作-20260514.md` | 通用工作流 | TVC广告制作流程 |
| 18 | `.trae/knowledge/workflow/workflow-Shotlab-一体化工作流设计-含即梦模型-20260514.md` | 通用工作流 | 一体化工作流设计 |
| 19 | `.trae/knowledge/workflow/workflow-Sotlab-Image2-Banana-3节点修图适配方案-20260514.md` | 通用方案 | 3节点适配方案 |
| 20 | `.trae/knowledge/workflow/workflow-修脸调色分步工作流-批量一致性-20260518.md` | 通用工作流 | 三步法批量一致 |
| 21 | `.trae/knowledge/workflow/workflow-写真业务应用指南-20260514.md` | 通用方法论 | 六大应用场景（通用描述，无实际客户数据） |
| 22 | `.trae/knowledge/workflow/workflow-即梦AI-一站式修图技巧-20260514.md` | 通用技巧 | 即梦AI操作技巧 |
| 23 | `.trae/knowledge/reference/reference-视频教程索引-20260514.md` | 公开参考 | 2个B站公开教程链接 |

## 分类标准

| 分类 | 判定标准 |
|------|---------|
| PUBLIC_SAFE | 通用 Prompt、方法论、工作流、参数速查，不含个人标识、客户数据或内部经营信息 |
| SANITIZE | 大部分可公开，但含少量需脱敏的个人信息或内部数据 |
| PRIVATE_REMOVE | 整体为用户画像、内部经营数据或个人计划，不宜公开 |
| SECRET_ROTATE | 含真实 API Key、Token、密码或私钥，需立即轮换 |

## 补充说明

### 关于"客户"关键词

77 处"客户"关键词匹配均为通用工作流描述（如"客户照片精修"、"客户样片预览"），不含任何实际客户姓名、联系方式或订单数据。

### 关于"价格"关键词

少量"价格表"提及均为设计物料用途描述（如"生成工作室的海报、价目表"），不含实际定价数据。

### 关于外部链接

仅发现 2 个 B 站公开视频链接，无敏感 URL。
