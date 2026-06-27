# Provider 设置 UI 逻辑修复 - Product Requirement Document

## Overview
- **Summary**: 修复 API 设置弹窗与主页 Provider 选择器之间的状态同步问题、API Key 显示困惑问题，以及整体交互逻辑不通顺的问题，让用户能清晰地管理 Provider 配置。
- **Purpose**: 当前 UI 存在多个逻辑断层：编辑 Provider 时 API Key 输入框为空让用户误以为 Key 没保存；在弹窗内修改默认 Provider 后关闭，主页仍显示旧的默认 Provider；状态切换缺少反馈和自动处理。这些问题导致用户无法顺畅地配置和使用多 Provider。
- **Target Users**: 使用图像编辑器的开发者/运营人员，需要在多个 AI Provider（GLM、Gemini、OpenAI 等）之间切换使用。

## Goals
- 修复弹窗关闭后主页 Provider 状态不刷新的问题
- 解决编辑 Provider 时 API Key 显示为空带来的困惑
- 修复 404 错误（排查并修复请求路径问题）
- 完善 Provider 启用/禁用/默认切换时的自动状态处理
- 改善整体交互反馈，让配置逻辑符合用户直觉

## Non-Goals (Out of Scope)
- 不新增 Provider 类型
- 不改变加密存储逻辑
- 不重构整体架构
- 不添加 Provider 连通性测试功能（可作为后续优化）

## Background & Context
- 项目使用 Express 后端 + React 前端
- Provider 配置持久化在本地 JSON 文件中，API Key 使用 AES-256-GCM 加密存储
- 后端 `/api/providers` 列表接口出于安全考虑，返回时会将 apiKey 字段清空
- 目前 App.tsx 中 providers 列表仅在 token 变化或 showApiSettings 变化时刷新，关闭弹窗不会触发刷新
- 自动迁移逻辑（migrateFromEnv）中，GLM 先创建且 isDefault=true，Gemini 后创建时 isDefault 为 false

## Functional Requirements
- **FR-1**: 关闭 API 设置弹窗后，主页 Provider 选择器必须立即反映最新状态（包括默认 Provider、启用/禁用状态、新增/删除的 Provider）
- **FR-2**: 编辑已有 Provider 时，API Key 区域必须明确显示该 Key 是否已设置，避免用户误以为 Key 丢失
- **FR-3**: 新建 Provider 保存后，应自动选中该 Provider 并可选择是否设为默认
- **FR-4**: 禁用当前正在使用的 Provider 时，必须自动切换到其他可用的（启用的）Provider
- **FR-5**: 删除当前正在使用的 Provider 时，必须自动切换到其他可用的 Provider
- **FR-6**: 设置新的默认 Provider 后，主页 Provider 选择器应立即切换到该默认 Provider
- **FR-7**: API Key 输入框在编辑模式下应有清晰的提示文案，区分"新建"和"编辑"场景
- **FR-8**: 排查并修复导致 404 错误的 API 请求问题

## Non-Functional Requirements
- **NFR-1**: 所有状态变更必须在 100ms 内反映到 UI 上，无明显延迟
- **NFR-2**: API Key 安全策略不变——列表接口不返回真实 Key，编辑留空表示保留原 Key
- **NFR-3**: 不破坏现有功能，所有已有 Provider 配置数据不受影响

## Constraints
- **Technical**: React + TypeScript 前端，Express 后端，API Key 加密存储
- **Business**: 保持现有数据格式兼容，不做 breaking change
- **Dependencies**: 现有 ProviderStore、ProviderFactory、路由结构

## Assumptions
- 用户配置的 Provider 数据存储在本地 data/providers.json 中
- 环境变量 GLM_API_KEY、GEMINI_API_KEY 可作为 Key 的 fallback
- 至少有一个 Provider 处于启用状态（否则无法使用图像编辑功能）

## Acceptance Criteria

### AC-1: 关闭弹窗后主页状态同步
- **Given**: 用户在 API 设置弹窗中修改了默认 Provider（点击了星星）
- **When**: 用户关闭弹窗回到主页
- **Then**: 顶部 Provider 下拉框显示的 Provider 名称和模型必须与新设置的默认 Provider 一致
- **Verification**: `programmatic`

### AC-2: 编辑模式下 API Key 状态清晰
- **Given**: 用户打开一个已配置 API Key 的 Provider 进行编辑
- **When**: 编辑表单打开
- **Then**: API Key 输入框区域必须明确标注"已设置"状态，placeholder 提示"留空则不修改"，用户不会误以为 Key 为空
- **Verification**: `human-judgment`

### AC-3: 新建 Provider 后自动选中
- **Given**: 用户在弹窗中新建了一个 Provider 并点击保存
- **When**: 保存成功后回到列表视图
- **Then**: 主页 Provider 选择器自动切换到新建的 Provider，模型选择器显示该 Provider 的默认模型
- **Verification**: `programmatic`

### AC-4: 禁用当前 Provider 时自动切换
- **Given**: Provider A 正在被选中使用，用户在列表中禁用了 Provider A
- **When**: 禁用操作成功
- **Then**: 系统自动切换到另一个启用的 Provider（优先默认 Provider），主页选择器同步更新
- **Verification**: `programmatic`

### AC-5: 404 错误消除
- **Given**: 用户正常使用 API 设置弹窗的所有功能（增删改查、启停、设默认）
- **When**: 执行任意操作
- **Then**: 顶部不出现"Request failed with status code 404"错误提示
- **Verification**: `programmatic`

### AC-6: 设置默认 Provider 立即生效
- **Given**: 用户在列表中点击非默认 Provider 的星星图标设为默认
- **When**: 操作成功后关闭弹窗
- **Then**: 主页立即显示新的默认 Provider，模型也切换到该 Provider 的默认模型
- **Verification**: `programmatic`

### AC-7: 弹窗内操作即时反馈
- **Given**: 用户在弹窗内执行任意操作（启/停、设默认、编辑保存）
- **When**: 操作成功后
- **Then**: 列表视图立即更新显示最新状态，无需关闭重开弹窗
- **Verification**: `human-judgment`

## Open Questions
- [ ] 新建 Provider 后是否需要自动设为默认？建议：询问用户或提供复选框选项
- [ ] 是否需要在 Provider 列表中显示 Key 配置状态（已设置/未设置/环境变量）来帮助用户排查问题？
