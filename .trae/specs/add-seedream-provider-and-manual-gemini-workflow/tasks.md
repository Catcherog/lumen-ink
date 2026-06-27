# Tasks

## Phase 1: 后端 Provider 扩展

- [x] Task 1: 在 `src/shared/types.ts` 扩展 ProviderType 和模型常量
  - [x] SubTask 1.1: 新增 `'seedream'` 到 ProviderType 联合类型
  - [x] SubTask 1.2: 新增 `SEEDREAM_MODELS` 常量（seedream-4.5、seedream-5.0-lite）和 `PROVIDER_MODELS.seedream` 列表
  - [x] SubTask 1.3: 为每个 GLM/Gemini/OpenAI 模型添加 `capabilities` 字段（generation/edit/chat）
  - [x] SubTask 1.4: 新增 `ManualWorkflowExport` 类型（包含 imageBase64、mimeType、prompt、tool、params）

- [x] Task 2: 创建 `src/server/services/providers/SeedreamProvider.ts`
  - [x] SubTask 2.1: 实现 `generate()` 方法 — 调用 `POST {baseUrl}/images/generations`，body 包含 model/prompt/size
  - [x] SubTask 2.2: 实现 `edit()` 方法 — 调用 `POST {baseUrl}/images/edits`，使用 FormData 上传图片+prompt+referenceImages
  - [x] SubTask 2.3: 实现 `chat()` 方法 — 抛出明确错误"Seedream 不支持对话模式"
  - [x] SubTask 2.4: 复用 `parseError()` 模式识别 API Key 错误并映射为 401
  - [x] SubTask 2.5: baseUrl 默认 `https://ark.cn-beijing.volces.com/api/v3`，apiKey 从 config 或 env `SEEDREAM_API_KEY` 读取

- [x] Task 3: 在 `ProviderFactory.ts` 注册 Seedream Provider
  - [x] SubTask 3.1: 在 `createProvider` switch 中添加 `case 'seedream'` 分支
  - [x] SubTask 3.2: 在 `getProviderOperationType` 中处理 seedream 类型 — 图生图模型统一返回 'edit'
  - [x] SubTask 3.3: 在 `ProviderStore.migrateFromEnv()` 中添加从 `SEEDREAM_API_KEY` 自动创建默认 Provider 的逻辑

- [x] Task 4: 修复 `GLMProvider.edit()` 方法
  - [x] SubTask 4.1: 当模型是 cogview-4 或 glm-image 且 params.image 非空时，抛出明确错误："CogView-4 仅支持文生图，无法编辑上传的图片。请切换到 Seedream 或 Gemini Provider，或使用'导出到 Gemini'手动工作流"
  - [x] SubTask 4.2: 当模型是 glm-4.6v 时，正常委托给 chat() 方法（保留现有行为）

## Phase 2: 前端手动工作流

- [x] Task 5: 创建 `src/client/src/components/ManualWorkflowDialog.tsx` 手动工作流对话框
  - [x] SubTask 5.1: 顶部显示当前图片预览（可缩略图形式）+ "下载图片"按钮
  - [x] SubTask 5.2: 中部显示 prompt 文本框（只读，从父组件传入）+ "复制 prompt"按钮
  - [x] SubTask 5.3: "打开 gemini.google.com"链接按钮（target="_blank" rel="noopener"）
  - [x] SubTask 5.4: 底部拖拽/点击上传区域，接受图片文件，转 base64
  - [x] SubTask 5.5: "确认导入"按钮 — 调用 onImport 回调传入图片数据
  - [x] SubTask 5.6: 样式与现有 ApiSettingsModal 保持一致（TailwindCSS、暗色模式支持）

- [x] Task 6: 在 `src/client/src/components/Toolbar.tsx` 新增"导出到 Gemini"按钮
  - [x] SubTask 6.1: 在工具栏添加新按钮（图标用 Upload 或 ExternalLink from lucide-react）
  - [x] SubTask 6.2: 按钮点击打开 ManualWorkflowDialog
  - [x] SubTask 6.3: 当没有上传图片时按钮禁用，tooltip 提示"请先上传图片"

- [x] Task 7: 在 `src/client/src/hooks/useEditor.ts` 新增 `importExternalResult` 方法
  - [x] SubTask 7.1: 接收 { base64, mimeType, prompt } 参数
  - [x] SubTask 7.2: 创建 HistoryEntry（tool='manual'、providerId='manual-gemini'、prompt 保留原值）
  - [x] SubTask 7.3: dispatch SET_RESULT action，与 API 调用成功流程一致
  - [x] SubTask 7.4: 在 EditorState 中可选添加 `manualWorkflowOpen` 状态控制对话框开关

## Phase 3: UI 能力标签

- [x] Task 8: 改进 `src/client/src/components/ParamPanel.tsx` 模型选择器
  - [x] SubTask 8.1: 从 `PROVIDER_MODELS` 改用 `EXTENDED_PROVIDER_MODELS`（包含 capabilities 字段）
  - [x] SubTask 8.2: 每个 option 文本后追加能力图标（🎨/✏️/💬）
  - [ ] SubTask 8.3: 当用户上传了图片但选择文生图模型时，显示警告提示

## Phase 4: 验证与测试

- [ ] Task 9: 添加端到端验证
  - [ ] SubTask 9.1: 验证 Seedream Provider 在 UI 中正确显示在模型列表
  - [ ] SubTask 9.2: 验证"导出到 Gemini"对话框正确显示图片+prompt
  - [ ] SubTask 9.3: 验证用户上传结果图后，历史记录正确添加，currentImage 正确更新
  - [ ] SubTask 9.4: 验证 GLM cogview-4 选模型并上传图片时，显示清晰错误提示
  - [ ] SubTask 9.5: 验证模型选择器显示能力标签

- [ ] Task 10: TypeScript 构建验证
  - [ ] SubTask 10.1: `npm run build --prefix src/server` 通过
  - [ ] SubTask 10.2: `npm run build --prefix src/client` 通过

- [ ] Task 11: 提交并推送
  - [ ] SubTask 11.1: git commit message: "feat: 添加 Seedream Provider 和 Gemini 手动工作流"
  - [ ] SubTask 11.2: git push 到 GitHub，等待 Vercel 自动部署

# Task Dependencies

- Task 2 (SeedreamProvider) 依赖 Task 1 (types 扩展)
- Task 3 (ProviderFactory) 依赖 Task 2
- Task 4 (GLM 修复) 独立可并行
- Task 5 (ManualWorkflowDialog) 独立可并行
- Task 6 (Toolbar 按钮) 依赖 Task 5
- Task 7 (useEditor importExternalResult) 独立可并行
- Task 8 (ParamPanel 能力标签) 依赖 Task 1
- Task 9-11 (验证) 依赖前面所有任务完成

# 可并行执行的任务组

**组 A（后端）**: Task 1 → Task 2 → Task 3，Task 4 可并行
**组 B（前端对话框）**: Task 5、Task 7 可并行
**组 C（前端 UI）**: Task 6 → Task 5，Task 8 依赖 Task 1
