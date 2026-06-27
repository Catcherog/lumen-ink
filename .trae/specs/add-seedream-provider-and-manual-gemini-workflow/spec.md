# 添加 Seedream Provider 和 Gemini 手动工作流 Spec

## Why

当前系统存在两个核心痛点：
1. **GLM Provider 不支持图生图编辑** — CogView-4 API 仅支持文生图，用户上传图片后点击编辑会静默失败或返回文字描述，无法完成真正的图片编辑任务。
2. **Gemini API Key 配额问题** — 用户的 Google AI Studio 未绑定结算账号，无法直接调用 Nano Banana API。而用户已订阅 Google AI PRO，可访问 gemini.google.com/app 网页版进行人工生图。

经调研，即梦的 **Seedream API（火山引擎）** 原生支持图生图编辑（约0.2元/张），是国内最佳替代方案；同时为充分利用用户的 Google AI PRO 订阅，设计半自动工作流模式：系统打包图片+prompt，用户手动到 gemini.google.com 生图后回传结果。

## What Changes

### 新增能力
- **Seedream Provider** — 新增即梦/火山引擎 Provider，支持文生图和图生图编辑，模型 seedream 4.5/5.0
- **手动工作流模式（Manual Gemini Workflow）** — 新增"导出生成任务"和"导入生成结果"功能：
  - 用户上传图片+输入prompt+选择工具参数
  - 点击"导出到 Gemini"按钮，系统打包图片+prompt为可分享格式（含图片下载、prompt 复制、一键打开 gemini.google.com 链接）
  - 用户手动在 gemini.google.com 完成生图
  - 用户将生成的图片回传系统（拖拽/上传），系统将其作为编辑结果加入历史记录
- **模型能力标签** — 模型选择器显示每个模型支持的能力（文生图/图生图/图像理解）

### 修改能力
- **GLM Provider edit() 方法** — 不再抛错，改为明确提示用户切换到支持图生图的模型（如 Seedream 或 Gemini），而不是静默失败
- **ProviderFactory 操作类型判断** — 增加 seedream 类型映射，支持 edit 操作
- **前端 useEditor** — 支持用户手动上传"外部生成的图片"作为编辑结果

### 移除能力
（无移除）

## Impact

- **Affected specs**: 
  - `build-gemini-image-editor` — Provider 系统扩展，新增 Seedream 类型
  - `beautify-ui-add-api-integrations-and-retouch-tools` — 工具面板新增"手动工作流"按钮
- **Affected code**:
  - `src/shared/types.ts` — 新增 ProviderType 'seedream'、Seedream 模型常量、ManualWorkflowRequest/Response 类型
  - `src/server/services/providers/SeedreamProvider.ts` — 新建文件
  - `src/server/services/providers/ProviderFactory.ts` — 注册新 Provider
  - `src/server/services/providers/GLMProvider.ts` — edit() 方法给出清晰提示
  - `src/client/src/components/Toolbar.tsx` — 新增"导出到 Gemini"按钮
  - `src/client/src/components/ManualWorkflowDialog.tsx` — 新建手动工作流对话框
  - `src/client/src/components/ParamPanel.tsx` — 模型选择器显示能力标签
  - `src/client/src/hooks/useEditor.ts` — 新增 importExternalResult 方法

## ADDED Requirements

### Requirement: Seedream Provider 图像生成与编辑
系统 SHALL 提供 Seedream Provider，通过火山引擎 API 调用 Seedream 模型，支持文生图和图生图编辑。

#### Scenario: 文生图成功
- **WHEN** 用户选择 Seedream Provider 且未上传图片，输入 prompt 后点击生成
- **THEN** 系统调用 `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`，返回生成图片

#### Scenario: 图生图编辑成功
- **WHEN** 用户选择 Seedream Provider 且上传图片，输入编辑 prompt 后点击生成
- **THEN** 系统调用图像编辑接口，基于上传图片和 prompt 进行编辑，返回编辑后的图片

#### Scenario: 参考图支持
- **WHEN** 用户上传参考图（reference images）
- **THEN** 系统将参考图作为多模态输入传给 Seedream，引导生成风格/构图

### Requirement: Gemini 手动工作流
系统 SHALL 提供"导出到 Gemini"按钮，将当前图片和 prompt 打包导出，方便用户在 gemini.google.com 手动生图后回传结果。

#### Scenario: 导出生成任务
- **WHEN** 用户点击"导出到 Gemini"按钮
- **THEN** 系统弹出对话框，包含：
  1. 当前图片的预览和下载按钮
  2. prompt 文本框 + 一键复制按钮
  3. "打开 gemini.google.com"链接按钮
  4. 用户上传结果图片的区域（拖拽/点击上传）
  5. "确认导入"按钮

#### Scenario: 导入生成结果
- **WHEN** 用户在对话框中上传了外部生成的图片并点击"确认导入"
- **THEN** 系统将该图片作为编辑结果加入历史记录，与正常调用 API 的结果处理流程一致（更新 currentImage、添加历史条目）

### Requirement: 模型能力标签显示
模型选择器 SHALL 显示每个模型支持的能力标签，避免用户误用不支持图生图的模型进行图片编辑。

#### Scenario: 显示能力标签
- **WHEN** 用户打开模型选择下拉框
- **THEN** 每个模型选项后面显示能力标签：
  - 🎨 文生图（generation）
  - ✏️ 图生图（edit）
  - 💬 图像理解（chat）

## MODIFIED Requirements

### Requirement: GLM Provider 编辑方法
**原行为**：edit() 直接抛出 `Error('GLM Provider 暂不支持图像编辑接口，请使用 generate 或 chat')`

**新行为**：
- 当用户选择 GLM 文生图模型（cogview-4 / glm-image）且上传了图片时，edit() 应返回明确错误：`"CogView-4 仅支持文生图，无法编辑上传的图片。请切换到 Seedream 或 Gemini Provider，或使用'导出到 Gemini'手动工作流"`
- 当用户选择 GLM-4.6V（chat 模型）且上传了图片时，正常调用 chat 接口返回文字描述

## REMOVED Requirements

（本次变更无移除）

---

## 技术调研参考

### Seedream API 端点（火山引擎方舟）
- 基础 URL: `https://ark.cn-beijing.volces.com/api/v3`
- 文生图: `POST /images/generations`
- 图生图: `POST /images/edits`（参考 OpenAI 兼容格式）
- 认证: Bearer Token（API Key）
- 模型 ID: 需用户在火山引擎控制台创建 endpoint，获取 endpoint ID（如 `ep-20260xxxxxx-xxxxx`）

### 价格参考
- Seedream API: 约 $0.03-$0.04/张 ≈ 0.2-0.3 元/张
- 即梦会员制: 基础会员 ¥54.9/月，每月725积分

### Gemini 手动工作流交互流程
```
用户在系统内 → 上传图片 + 输入prompt
   ↓
点击"导出到 Gemini"按钮
   ↓
弹出对话框：
  [图片预览] [下载图片]
  [Prompt 文本] [复制]
  [打开 gemini.google.com]
  [拖拽/上传结果图]
  [确认导入]
   ↓
用户在浏览器新标签页打开 gemini.google.com
   ↓
手动下载图片 → 上传到对话框 → 确认导入
   ↓
系统将结果加入历史，作为当前编辑结果
```
