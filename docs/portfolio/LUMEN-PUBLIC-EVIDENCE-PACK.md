# Lumen 光砚 · 公开证据包

> **用途**：作品集展示层（官网 Lumen 案例页 + 简历）对外证据聚合。
> **维护方**：Trae Lumen Evidence Lane
> **创建日期**：2026-07-23
> **仓库**：`Catcherog/lumen-ink`（picture-edit）
> **分支**：`portfolio/lumen-evidence-pack-01`（从最新闭合 HEAD `ca6a317` 创建）
> **状态标记**：`PROVISIONAL`（Codex delta-review 输入尚未生成，Lumen 最终验收状态字段未由 Codex 校正，不得自行上调）

---

## 0. 基线核验（Lane C §1）

| 项 | 值 |
| --- | --- |
| 仓库 | `Catcherog/lumen-ink` |
| 源分支 | `lumen/cloudbase-nosql-implement-01-fix-r9` |
| 最新生产代码 SHA | `e55b84d`（FIX-R9 implementation） |
| 最新闭合/证据 SHA | `ca6a317`（FIX-R9 EVIDENCE-CORRECTION-04 evidence calibration） |
| Local HEAD | `ca6a317` |
| Remote HEAD | `ca6a317`（`origin/lumen/cloudbase-nosql-implement-01-fix-r9`，`git fetch origin` 成功） |
| 远端新鲜度 | VERIFIED（fetch 成功，local == remote） |
| 作品集分支 | `portfolio/lumen-evidence-pack-01`（从 `ca6a317` 创建） |

## 1. 产品目标态

面向摄影与内容创作者的多模型 AI 图像工作台，将生成、编辑、参考图、任务状态、资产管理和失败恢复统一到一套可持续迭代的产品体验中。

## 2. 当前版本重点（已验证能力）

- 多模型 provider 抽象（OpenAI / GLM / Seedream / Gemini）
- 图片生成与编辑流程
- 异步任务状态
- 历史任务
- NoSQL 持久化（CloudBase）
- 幂等
- 并发
- 删除协调
- Storage 生命周期
- 定时清理
- Preview / Production 分级

## 3. 证据清单（8 项，对齐任务 §5.5）

### 3.1 工作台首页
- **证据类型**：UI
- **状态**：VERIFIED_CURRENT（React/TypeScript 工作台前端）
- **截图状态**：`ASSET_NOT_FOUND` / `PUBLIC_SAFE_NOT_EVALUATED`（截图文件待补，本包不判定安全）

### 3.2 生成或编辑流程
- **证据类型**：UI + API
- **状态**：VERIFIED_CURRENT（生成/编辑工具链 + 服务端）
- **截图状态**：`ASSET_NOT_FOUND` / `PUBLIC_SAFE_NOT_EVALUATED`

### 3.3 任务历史与状态
- **证据类型**：UI + 数据
- **状态**：VERIFIED_CURRENT（异步任务状态机）
- **截图状态**：`ASSET_NOT_FOUND` / `PUBLIC_SAFE_NOT_EVALUATED`

### 3.4 Provider 抽象图
- **证据类型**：架构
- **状态**：VERIFIED_CURRENT（provider 工厂与适配器，统一模型调用、错误处理、故障转移）
- **覆盖模型**：OpenAI / GLM / Seedream / Gemini（4 类）
- **截图状态**：`ASSET_NOT_FOUND` / `PUBLIC_SAFE_NOT_EVALUATED`

### 3.5 NoSQL 持久化状态图
- **证据类型**：架构 + 数据
- **状态**：FIX-R9 证据已校准至 `ca6a317`；`readyForPreview=false`；持久化工程处于最终验收
- **审计范围**：幂等、事务、删除协调、Storage 生命周期
- **截图状态**：`ASSET_NOT_FOUND` / `PUBLIC_SAFE_NOT_EVALUATED`

### 3.6 失败恢复或删除协调流程
- **证据类型**：状态机 + 测试
- **状态**：VERIFIED_CURRENT（高风险审计 + 多轮修复证据）
- **截图状态**：`ASSET_NOT_FOUND` / `PUBLIC_SAFE_NOT_EVALUATED`

### 3.7 测试与验收摘要
- **证据类型**：测试
- **状态**：VERIFIED_CURRENT
- **规模**：46 个测试文件、16 个 tracked 图片、162 个文档、403+ tracked 文件

### 3.8 受控演示说明
- **证据类型**：部署
- **入口**：`lumen-ink.vercel.app`（密码保护）
- **CTA**：`受控演示｜申请体验`
- **说明**：由于演示会产生模型调用成本，当前采用受控访问方式；案例页提供完整产品流程和脱敏运行证据。
- **密码**：不得在官网源码或页面泄露密码。

## 4. 状态分层

| 层 | 内容 |
| --- | --- |
| Verified（已验证） | provider 抽象、生成/编辑流程、异步任务、历史任务、幂等、事务、删除协调、Storage 生命周期、46 测试文件 |
| In Closure（收尾中） | CloudBase NoSQL 持久化最终验收（FIX-R9 证据已校准，`readyForPreview=false`）；真实 CloudBase OCC / Storage 状态码 / 新 collection/index 行为待 Preview 验证 |
| Next Iteration（后续计划） | 公开无密码体验入口；真实并发语义线上验证；脱敏指标证据补证 |

## 5. 禁止主张

不得出现以下字面短语或主张：

- 无门槛公开体验
- 已全面生产上线
- 已证明所有真实 CloudBase 并发语义
- 无证据的转化率和交付周期（「转化近翻倍、周期周→天」为简历业务主张，缺少脱敏指标证据）

## 6. 我的贡献

- 用户和业务需求：摄影修图真实痛点调研、专家经验六段结构化
- 产品架构：统一生成/编辑/参考图/任务/资产/恢复的产品体验
- Agent / 数据流程：provider 工厂与适配器、NoSQL 持久化与高风险审计
- 工程协作：前端 React/TypeScript + 服务端 Express
- 测试与验收：46 测试文件、多轮 FIX-R5~R9 修复闭环
- 迭代决策：公开体验与生产持久化分级决策（受控演示 + readyForPreview 门禁）

## 7. 截图安全说明

本证据包描述的截图（3.1~3.6）当前文件尚未提供，标记 `ASSET_NOT_FOUND` / `PUBLIC_SAFE_NOT_EVALUATED`。截图补齐后须逐张检查：人名 / 手机号 / 邮箱 / 客户数据 / 飞书 Base/Table/Record ID / Token/API Key / 地址栏参数 / 本地绝对路径 / 文件名 / 二维码 / 账号头像或昵称。FAIL 截图不得进入官网。

---

## 附：官网证据引用（demonstratio content/evidence/lumen.json）

官网通过 `content/evidence/lumen.json` 引用结构化证据 ID（LUMEN-001 ~ LUMEN-008），与本包口径一致。
