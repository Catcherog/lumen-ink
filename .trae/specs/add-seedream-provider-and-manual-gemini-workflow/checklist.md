# Checklist

## Spec 完整性验证
- [x] spec.md 包含 Why、What Changes、Impact、ADDED/MODIFIED/REMOVED Requirements 五个部分
- [x] tasks.md 任务有序、可验证、有依赖关系标注
- [x] 所有 spec 引用的代码路径在项目中存在

## 后端实现验证
- [x] `src/shared/types.ts` 中 ProviderType 包含 `'seedream'`
- [x] `src/shared/types.ts` 中存在 `SEEDREAM_MODELS` 常量
- [x] `src/shared/types.ts` 中 `PROVIDER_MODELS.seedream` 列表非空
- [x] `src/shared/types.ts` 中模型定义包含 `capabilities` 字段
- [x] `src/shared/types.ts` 中存在 `ManualWorkflowExport` 类型
- [x] `src/server/services/providers/SeedreamProvider.ts` 文件已创建
- [x] SeedreamProvider 实现了 ImageProvider 接口（generate/edit/chat）
- [x] SeedreamProvider.generate() 调用 `/images/generations` 端点
- [x] SeedreamProvider.edit() 调用 `/images/edits` 端点
- [x] SeedreamProvider apiKey 支持 config 和 env 两种来源
- [x] SeedreamProvider 错误处理识别 API Key 错误并映射为 401
- [x] `src/server/services/providers/ProviderFactory.ts` 中 `createProvider` 有 `case 'seedream'` 分支
- [x] `src/server/services/providers/ProviderFactory.ts` 中 `getProviderOperationType` 处理 seedream 类型
- [x] `src/server/services/providers/ProviderStore.ts` 的 `migrateFromEnv` 支持 `SEEDREAM_API_KEY` 自动创建
- [x] `src/server/services/providers/GLMProvider.ts` edit() 方法不再静默抛错，给出明确切换提示

## 前端实现验证
- [x] `src/client/src/components/ManualWorkflowDialog.tsx` 文件已创建
- [x] ManualWorkflowDialog 显示当前图片预览
- [x] ManualWorkflowDialog 提供"下载图片"按钮
- [x] ManualWorkflowDialog 显示 prompt 文本
- [x] ManualWorkflowDialog 提供"复制 prompt"按钮
- [x] ManualWorkflowDialog 提供"打开 gemini.google.com"链接（target="_blank"）
- [x] ManualWorkflowDialog 提供上传结果图片的区域
- [x] ManualWorkflowDialog 提供"确认导入"按钮调用 onImport 回调
- [x] ManualWorkflowDialog 样式支持暗色模式
- [x] `src/client/src/components/Toolbar.tsx` 包含"导出到 Gemini"按钮
- [x] Toolbar 按钮在无图片时禁用
- [x] `src/client/src/hooks/useEditor.ts` 存在 `importExternalResult` 方法
- [x] importExternalResult 正确创建 HistoryEntry
- [x] importExternalResult 正确 dispatch SET_RESULT action
- [x] `src/client/src/components/App.tsx` 模型选择器显示能力标签（在 App.tsx 而非 ParamPanel.tsx，因为模型选择器实际位置在 App.tsx）

## 功能行为验证
- [x] 用户选择 GLM cogview-4 + 上传图片 + 点击生成 → 显示"CogView-4 仅支持文生图..."错误（GLMProvider.edit 抛 400 错误）
- [x] 用户点击"导出到 Gemini"按钮 → 弹出 ManualWorkflowDialog（Toolbar onExportToGemini 触发 setManualWorkflowOpen(true)）
- [x] 用户在对话框中下载图片 → 浏览器触发下载（ManualWorkflowDialog 内有 `<a download>` 实现）
- [x] 用户在对话框中点击复制 → prompt 进入剪贴板（navigator.clipboard.writeText）
- [x] 用户在对话框中点击"打开 gemini.google.com" → 新标签页打开（target="_blank" rel="noopener noreferrer"）
- [x] 用户在对话框中上传结果图 + 确认导入 → 编辑结果更新，历史记录新增条目（importExternalResult + SET_RESULT）
- [x] 模型选择器下拉框每个选项显示 🎨/✏️/💬 能力图标（formatModelLabel + CAPABILITY_ICONS）

## 构建与部署验证
- [x] `npm run build --prefix src/server` 退出码为 0
- [x] `npm run build --prefix src/client` 退出码为 0
- [x] git commit 成功，message 符合规范
- [x] git push 成功，Vercel 自动触发部署
