# Provider 设置 UI 逻辑修复 - The Implementation Plan

## [x] Task 1: 排查并修复 404 错误
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 检查后端 [index.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/index.ts) 中路由挂载方式，确认 `/api/providers` 路由是否正确注册
  - 检查前端 axios 请求的 baseURL 配置（vite.config.ts 中的 proxy 设置）
  - 修复导致 404 的请求路径问题
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-1.1: 启动服务后，所有 Provider 相关 API（GET/POST/PUT/PATCH/DELETE /api/providers）均返回 2xx 或预期的 4xx（如删除不存在的 ID），无 404
  - `human-judgement` TR-1.2: 在 UI 中操作增删改查、启停、设默认，顶部不出现红色 404 错误提示

## [x] Task 2: 后端添加 hasApiKey 字段
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 修改 [ProviderStore.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/services/providers/ProviderStore.ts) 的 `list()` 方法，在返回的 ProviderConfig 中添加 `hasApiKey: boolean` 字段（根据 apiKey 是否为空判断）
  - 修改 [providers.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/routes/providers.ts) 的 `sanitize()` 函数，保留 `hasApiKey` 字段
  - 修改 [types.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/shared/types.ts) 的 `ProviderConfig` 接口，添加 `hasApiKey?: boolean`
- **Acceptance Criteria Addressed**: AC-2, AC-7
- **Test Requirements**:
  - `programmatic` TR-2.1: GET /api/providers 返回的每个 provider 对象包含 hasApiKey 布尔字段
  - `programmatic` TR-2.2: 有 Key 的 provider hasApiKey 为 true，无 Key 的为 false
  - `programmatic` TR-2.3: 返回数据中 apiKey 字段始终为空字符串（安全策略不变）

## [x] Task 3: 改进 ApiSettingsModal 的 API Key 显示与提示
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - 修改 [ApiSettingsModal.tsx](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/src/components/ApiSettingsModal.tsx)，编辑已有 Provider 时：
    - 若 provider.hasApiKey 为 true，在 API Key 标签旁显示绿色"已设置"徽章，input placeholder 为"留空则不修改"
    - 若 provider.hasApiKey 为 false，显示橙色"未设置"徽章，input placeholder 为"输入 API Key"
  - 新建 Provider 时（editingId === 'new'），placeholder 为"输入 API Key（可选，留空使用环境变量）"
  - 添加"设为默认 Provider"复选框（编辑和新建时都显示）
- **Acceptance Criteria Addressed**: AC-2, AC-7
- **Test Requirements**:
  - `human-judgement` TR-3.1: 编辑已配置 Key 的 Provider 时，API Key 区域清晰显示"已设置"状态，用户不会误以为 Key 丢失
  - `human-judgement` TR-3.2: 新建和编辑模式的 placeholder 文案明确区分
  - `programmatic` TR-3.3: 表单中包含"设为默认"复选框，勾选后保存调用时带上 isDefault: true

## [x] Task 4: 添加 onChange 回调实现状态同步
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - 给 ApiSettingsModal 组件添加 `onProvidersChanged?: () => void` prop
  - 在 handleSave、handleDelete、handleToggleEnabled、handleSetDefault 操作成功后调用此回调
  - 修改 [App.tsx](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/src/App.tsx)：
    - 传递 onProvidersChanged 回调，回调中重新加载 providers 列表
    - 修复 providers 加载 useEffect 的依赖：当前依赖 state.showApiSettings 会在打开时刷新，但关闭时不刷新。改为在 showApiSettings 从 true 变为 false 时（关闭弹窗）也刷新，同时保留 onChange 回调的即时刷新
- **Acceptance Criteria Addressed**: AC-1, AC-6, AC-7
- **Test Requirements**:
  - `programmatic` TR-4.1: 在弹窗中修改默认 Provider 后关闭，App 的 providers 状态更新，selectedProvider 指向新的默认 Provider
  - `programmatic` TR-4.2: 在弹窗内执行任意操作（启停/设默认/保存/删除）后立即调用 onProvidersChanged
  - `human-judgement` TR-4.3: 关闭弹窗后，顶部 Provider 下拉框显示最新状态

## [x] Task 5: 完善自动切换 Provider 逻辑
- **Priority**: high
- **Depends On**: Task 4
- **Description**:
  - 修改 [App.tsx](file:///d:/360Downloads/Trae%20项目/picture-edit/src/client/src/App.tsx) 中自动选择 Provider 的 useEffect：
    - 当当前选中的 Provider 被禁用时，自动切换到默认 Provider（或第一个启用的 Provider）
    - 当当前选中的 Provider 被删除时，自动切换到默认 Provider（或第一个启用的 Provider）
    - 当设置了新的默认 Provider 且新默认是启用状态时，自动切换到该默认 Provider
  - 确保模型选择器也同步更新为新 Provider 的默认模型
  - 修复 prevProviderRef 的逻辑：当 providers 列表刷新导致 selectedProvider 变化时（如自动切换），也要更新模型
- **Acceptance Criteria Addressed**: AC-3, AC-4, AC-6
- **Test Requirements**:
  - `programmatic` TR-5.1: 禁用当前正在使用的 Provider 后，自动切换到另一个启用的 Provider
  - `programmatic` TR-5.2: 删除当前正在使用的 Provider 后，自动切换到另一个启用的 Provider
  - `programmatic` TR-5.3: 设置新的默认 Provider（启用状态）后，自动切换到该 Provider
  - `programmatic` TR-5.4: 切换 Provider 后，模型选择器显示该 Provider 的默认模型
  - `programmatic` TR-5.5: 新建 Provider 保存后（如果勾选了设为默认），自动切换到新建的 Provider

## [x] Task 6: 修复迁移逻辑中 isDefault 冲突问题
- **Priority**: medium
- **Depends On**: Task 1
- **Description**:
  - 修改 [ProviderStore.ts](file:///d:/360Downloads/Trae%20项目/picture-edit/src/server/services/providers/ProviderStore.ts) 的 `migrateFromEnv()` 方法：
    - 当前 GLM 先创建设为 isDefault=true，然后 Gemini 创建时 `this.providers.length === 0` 为 false 所以不设默认
    - 但创建新 provider 时没有清除其他 provider 的 isDefault，可能导致多个默认
    - 修复：迁移时遵循"第一个迁移成功的设为默认"原则，且创建前检查是否已有默认
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-6.1: 迁移完成后，providers 列表中有且仅有一个 isDefault=true
  - `programmatic` TR-6.2: 已有 isDefault 的 Provider 时，新迁移的 Provider 不自动设为默认

## [x] Task 7: 端到端验证
- **Priority**: high
- **Depends On**: Task 5, Task 6
- **Description**:
  - 启动前后端服务，手动验证完整流程：
    1. 打开 API 设置，确认列表中两个 Provider 状态正确
    2. 编辑 Gemini Provider，确认 API Key 显示"已设置"状态，不是空的
    3. 将 Gemini 设为默认（点星星），确认星星切换成功
    4. 关闭弹窗，确认主页 Provider 显示"默认 Gemini Provider"，模型显示 Gemini 的默认模型
    5. 重新打开设置，禁用 Gemini，确认主页自动切回 GLM
    6. 添加一个新 Provider，勾选设为默认，保存后确认主页自动切换到新 Provider
    7. 删除新 Provider，确认自动切回可用的 Provider
    8. 所有操作无 404 错误
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7
- **Test Requirements**:
  - `human-judgement` TR-7.1: 完整流程走下来，交互逻辑通顺，状态始终一致
  - `human-judgement` TR-7.2: 无红色错误提示，无状态回退到 GLM 的异常情况
