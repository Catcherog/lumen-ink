# Provider 设置 UI 逻辑修复 - Verification Checklist

## 后端 & API 相关
- [x] GET /api/providers 正常返回 200，无 404
- [x] POST /api/providers 创建 Provider 正常返回 201
- [x] PUT /api/providers/:id 更新 Provider 正常返回 200
- [x] PATCH /api/providers/:id/default 设置默认正常返回 200
- [x] DELETE /api/providers/:id 删除 Provider 正常返回 200
- [x] 列表接口返回的每个 provider 对象包含 `hasApiKey` 布尔字段
- [x] 列表接口返回的 `apiKey` 字段始终为空字符串（不泄露真实 Key）
- [x] 有真实 Key 的 provider `hasApiKey` 为 true，无 Key 的为 false
- [x] 迁移后 providers 列表有且仅有一个 `isDefault=true`
- [x] 创建/设置默认 provider 时，其他 provider 的 isDefault 被正确清除

## API Key 显示与表单
- [x] 编辑已配置 Key 的 Provider 时，API Key 标签旁显示"已设置"标识
- [x] 编辑未配置 Key 的 Provider 时，显示"未设置"标识
- [x] 编辑模式下 API Key 输入框 placeholder 为"留空则不修改"
- [x] 新建模式下 API Key 输入框 placeholder 为"输入 API Key（可选，留空使用环境变量）"
- [x] 新建/编辑表单中包含"设为默认 Provider"复选框
- [x] 勾选"设为默认"后保存，该 Provider 被设为默认

## 状态同步
- [x] 在弹窗内点击星星设为默认后，列表中星星位置立即更新
- [x] 在弹窗内启用/禁用 Provider 后，状态标签立即更新
- [x] 关闭弹窗后，主页 Provider 下拉框显示最新的默认 Provider
- [x] 关闭弹窗后，主页模型下拉框显示对应 Provider 的默认模型
- [x] 新建 Provider 保存后关闭弹窗，主页自动切换到新建的 Provider（如果勾选了设默认）
- [x] 编辑 Provider 保存后关闭弹窗，主页状态与编辑结果一致

## 自动切换逻辑
- [x] 禁用当前正在使用的 Provider，自动切换到其他启用的 Provider
- [x] 删除当前正在使用的 Provider，自动切换到其他启用的 Provider
- [x] 切换 Provider 后，模型选择器自动更新为该 Provider 的默认模型
- [x] 如果所有 Provider 都被禁用，Provider 下拉框显示"选择 Provider"提示
- [x] 设置新的默认 Provider（启用状态）后，自动切换到该 Provider

## 交互体验
- [x] 所有操作无 404 错误提示
- [x] 编辑 Provider 时用户不会误以为 Key 丢失
- [x] 列表操作（启停/设默认/编辑/删除）后无需关闭重开弹窗即可看到最新状态
- [x] 保存/删除/启停等操作有加载状态反馈
- [x] 完整流程（设默认→关闭→验证→禁用→自动切换→新建→删除）逻辑通顺，无状态回退异常
