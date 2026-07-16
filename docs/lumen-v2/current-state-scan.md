# SCAN-001｜光砚 Lumen Ink V2 主仓扫描报告

> 任务性质：只读扫描，未修改任何生产代码、依赖或配置。  
> 扫描时间：2026-07-16  
> 主仓路径：`d:\360Downloads\Trae 项目\picture-edit`  
> 协作包：`lumen-ink-v2-collaboration-pack.zip`

---

## 1. 仓库结构图

```text
picture-edit/
├── .trae/                          # AI 配置（rules / knowledge / specs）
│   ├── rules/                      # _core.md, _file_management.md 等
│   ├── knowledge/                  # prompt、workflow、tip、preference
│   └── specs/                      # 历次功能规格（fix-provider-ui、build-gemini-editor 等）
├── api/
│   └── index.ts                    # Vercel Serverless 入口，转发到 src/server/dist/index.js
├── docs/
│   ├── design-philosophy-紫韵浮岚-20260606.md
│   └── lumen-v2/
│       └── current-state-scan.md   # 本文件
├── public/
├── src/
│   ├── client/                     # React 19 + Vite 6 + Tailwind 4 前端
│   │   src/
│   │   ├── App.tsx                 # 顶栏 Provider/模型选择、布局、登录态
│   │   ├── hooks/useEditor.ts      # 全局 reducer + API 调用
│   │   ├── components/
│   │   │   ├── Toolbar.tsx         # 左侧工具栏
│   │   │   ├── ParamPanel.tsx      # 右侧面板容器
│   │   │   ├── ResultViewer.tsx    # 中央画布/对比/下载
│   │   │   ├── ImageUploader.tsx   # 上传组件
│   │   │   ├── HistoryPanel.tsx    # 历史记录列表
│   │   │   ├── PromptInput.tsx     # 提示词输入
│   │   │   ├── ReferenceImages.tsx # 参考图
│   │   │   ├── ApiSettings*.tsx    # Provider 配置弹窗
│   │   │   ├── LoginPage.tsx
│   │   │   ├── ManualWorkflowDialog.tsx
│   │   │   └── tools/              # 6 类工具面板
│   │   │       ├── ToolPanel.tsx
│   │   │       ├── FaceBeautyPanel.tsx
│   │   │       ├── ColorMatchingPanel.tsx
│   │   │       ├── LiquifyPanel.tsx
│   │   │       ├── CleanupPanel.tsx
│   │   │       ├── RemovePeoplePanel.tsx
│   │   │       └── types.ts
│   │   ├── templates/promptTemplates.ts
│   │   └── utils/{error.ts, image.ts}
│   ├── server/                     # Express 4 + TypeScript 后端
│   │   ├── index.ts                # Express 实例、CORS、默认密钥、/api/health
│   │   ├── middleware/auth.ts      # JWT + 密码认证
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── providers.ts
│   │   │   ├── edit.ts
│   │   │   └── detect.ts
│   │   └── services/providers/
│   │       ├── ProviderStore.ts    # Provider 配置加密持久化
│   │       ├── ProviderFactory.ts  # 工厂 + 操作类型判定
│   │       ├── ImageProvider.ts    # Provider 接口
│   │       ├── SeedreamProvider.ts
│   │       ├── GeminiProvider.ts
│   │       ├── OpenAIProvider.ts
│   │       └── GLMProvider.ts
│   └── shared/types.ts             # 前后端共享类型
├── vercel.json                     # Vercel 路由、maxDuration=90s
└── package.json                    # 根脚本 dev/build
```

---

## 2. 当前组件树

```text
App (token / darkMode / toolbarExpanded / providers / promptInput)
├── LoginPage
└── ErrorBoundary
    └── 工作台布局
        ├── header
        │   ├── Provider select
        │   ├── Model select
        │   ├── ApiSettingsButton → ApiSettingsModal
        │   ├── Dark mode toggle
        │   └── Logout
        ├── Toolbar (left)
        │   └── face / color / liquify / repair / remove / export
        ├── ResultViewer (center)
        │   ├── view mode: result / original / compare (slider | split)
        │   ├── zoom / fullscreen / download
        │   └── ImageUploader (empty state)
        └── ParamPanel (right)
            ├── ToolPanel (per-tool params)
            ├── PromptInput
            ├── ReferenceImages
            ├── TemplatePanel
            └── HistoryPanel
```

### 2.1 关键文件映射

- 顶栏：`src/client/src/App.tsx` L202-L281
- 布局响应式：`App.tsx` L170-L174, L283-L386
- 左工具栏：`src/client/src/components/Toolbar.tsx`
- 右参数面板：`src/client/src/components/ParamPanel.tsx`
- 中央画布/对比：`src/client/src/components/ResultViewer.tsx`
- 状态管理：`src/client/src/hooks/useEditor.ts`
- 工具面板分发：`src/client/src/components/tools/ToolPanel.tsx`
- 修脸参数面板：`src/client/src/components/tools/FaceBeautyPanel.tsx`

---

## 3. 关键调用链

### 3.1 编辑主链路（同步 100s 阻塞）

```text
ToolPanel/FaceBeautyPanel.handleApply
  → onSubmit(prompt, { tool, params, regions, referenceImages })
    → ParamPanel.handleSubmit
      → App.submitEdit (from useEditor)
        → useEditor.submitEdit
          → axios.post('/api/edit', { prompt, image(base64), mimeType, model, providerId, regions, referenceImages })
            → src/server/routes/edit.ts
              → ProviderFactory.getProvider(providerId) → ProviderStore.get/getDefault
              → ProviderFactory.getProviderOperationType(type, model)
              → provider.generate | provider.edit | provider.chat
                → SeedreamProvider / GeminiProvider / OpenAIProvider / GLMProvider
          ← 返回 { imageData | imageUrl, text, meta }
        → dispatch(SET_RESULT) → 更新 currentImage / resultImage / history
```

### 3.2 Provider 管理链路

```text
App.loadProviders
  → axios.get('/api/providers')
    → src/server/routes/providers.ts
      → ProviderStore.list() → 读取 src/server/data/providers.json 或 /tmp/lumen-ink-data/providers.json
  ← 返回脱敏 Provider 列表

App.setProvider / setModel
  → useEditor.dispatch(SET_PROVIDER / SET_MODEL)
```

### 3.3 上传链路

```text
ImageUploader / ResultViewer.handleFileSelect
  → validateImageFile (JPG/PNG/WebP, ≤20MB)
  → fileToBase64
  → useEditor.uploadImage
    → dispatch(UPLOAD_IMAGE)
      → originalImage=base64, currentImage=base64, history=[], referenceImages=[]
```

### 3.4 历史/恢复链路

```text
useEditor mount
  → loadSavedHistory (localStorage 'edit_history')
  → dispatch(LOAD_HISTORY)

history 变化
  → localStorage.setItem('edit_history', JSON.stringify(lightweightHistory))  // 去掉 base64

HistoryPanel 操作
  → onView: 仅切换 currentImage（不截断）
  → onRestore: 截断 history 到该索引
  → onDelete: 删除单条，currentImage 回退到最近一条或原图
```

---

## 4. 状态和数据真相来源

### 4.1 前端状态（useEditor reducer）

文件：`src/client/src/hooks/useEditor.ts` L18-L36

| 字段 | 含义 | 问题 |
|------|------|------|
| `originalImage` | 上传原图 base64 | 刷新丢失，无项目化 |
| `currentImage` / `currentImageUrl` | 当前查看/编辑的图片 | 可能为原图或某次结果 |
| `resultImage` / `resultImageUrl` | 最近一次生成结果 | 单结果，无版本链 |
| `selectedTool` | 当前工具：face/color/liquify/repair/remove/export/manual | |
| `selectedProvider` / `selectedModel` | 当前 Provider 和模型 | 与 V2 智能路由冲突 |
| `referenceImages` | 参考图 base64 数组 | 无角色语义 |
| `history` | `HistoryEntry[]` | 本地 localStorage，截断式恢复 |
| `isLoading` | 布尔加载态 | 无阶段状态 |
| `error` | 错误字符串 | |

### 4.2 后端状态

- Provider 配置：`ProviderStore.ts` 读取 `src/server/data/providers.json`（本地）或 `/tmp/lumen-ink-data/providers.json`（Vercel）
- 无 Project / Asset / Version / GenerationJob 持久化
- 无用户隔离、无审计日志

### 4.3 当前数据流真相

1. **图片真相 = 前端内存 base64**；刷新后仅保留历史元数据，图片可能无法恢复（GLM URL 会过期）。
2. **Provider 真相 = ProviderStore.json + 环境变量**；Vercel `/tmp` 不持久，已记录为已知风险。
3. **编辑结果 = 单张最新结果 + history 数组**；不是不可变版本树。
4. **任务状态 = 前端 `isLoading` + 100s HTTP 超时**；无 jobId、无轮询、无取消。

---

## 5. Provider 能力矩阵

| Provider | 类型 | generate | edit | chat | 默认模型 | 超时 | 备注 |
|----------|------|----------|------|------|----------|------|------|
| Seedream | `seedream` | ✅ | ✅ | ❌ | doubao-seedream-4-5-251128 | 80s | Vercel 上限 90s，4k 也 80s；size 归一化到 2K/4K |
| Gemini | `gemini` | ✅ | ✅ | ✅ | gemini-2.5-flash-image | 50s | edit 无图时降级 generate |
| OpenAI | `openai` | ✅ | ✅ | ✅ | gpt-image-2 / dall-e-3 / gpt-4o | 50s | chat 实际可用 |
| GLM | `glm` | ✅ | ⚠️ | ✅ | cogview-4-250304 / glm-4.6v | 50s | CogView/GLM-Image 不能图生图；glm-4.6v 走 chat |
| Jimeng | `jimeng` | ❌ | ❌ | ❌ | — | — | 未实现，工厂抛错 |
| Custom | `custom` | ❌ | ❌ | ❌ | — | — | 未实现，工厂抛错 |

能力判定集中位置：`src/server/services/providers/ProviderFactory.ts` L39-L63  
共享模型列表：`src/shared/types.ts` L111-L134（`PROVIDER_MODELS`）

### 5.1 操作类型判定规则

- `glm`: cogview-4 / glm-image → `generate`; glm-4.6v → `chat`
- `openai`: gpt-image-2 → `edit`; dall-e / gpt-image-* → `generate`; 其他 → `chat`
- `gemini`: 统一 `edit`（内部有图编辑、无图生成）
- `seedream`: 统一 `edit`（内部有图编辑、无图生成）

---

## 6. 持久化实际行为

### 6.1 前端持久化

- `localStorage.setItem('auth_token', token)` — 登录态
- `localStorage.setItem('edit_history', ...)` — 历史元数据（不含 base64，但含 GLM URL）
- 无 IndexedDB / 无对象存储 / 无 Project 持久化

### 6.2 后端持久化

文件：`src/server/services/providers/ProviderStore.ts` L26-L30

```ts
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'lumen-ink-data')
  : path.join(projectRoot, 'src', 'server', 'data');
```

- 本地开发：持久化到 `src/server/data/providers.json`
- Vercel：使用 `/tmp/lumen-ink-data/providers.json`，实例回收即丢失
- 加密：AES-256-GCM，密钥来自 `PROVIDER_ENCRYPTION_KEY` 或 JWT_SECRET 派生

### 6.3 与 V2 持久化要求的差距

- 无 Project 表
- 无 Asset 表
- 无 Version 表
- 无 GenerationJob 表
- 图片资产未持久化

---

## 7. 已有测试和构建结果

### 7.1 执行命令与结果

| 命令 | 工作目录 | 退出码 | 结果 |
|------|----------|--------|------|
| `npm run build` | 根目录 | 0 | ✅ 通过 |
| `npm run build` | `src/client` | 0 | ✅ 通过 |
| `npm run lint` | `src/client` | 1 | ❌ 2 errors, 2 warnings |
| `npx tsc --noEmit` | `src/client` | 0 | ✅ 通过 |
| `npm run test` | `src/client` | 1 | ❌ 无 test 脚本 |
| `npm run build` | `src/server` | 0 | ✅ 通过 |
| `npx tsc --noEmit` | `src/server` | 0 | ✅ 通过 |
| `npm run test` | `src/server` | 1 | ❌ 无 test 脚本 |

### 7.2 Lint 失败详情

文件：`src/client/src/App.tsx`

- L116: `error    Avoid calling setState() directly within an effect`
- L117: `warning  React Hook useEffect has a missing dependency: 'loadProviders'`
- L125: `warning  React Hook useEffect has a missing dependency: 'loadProviders'`

文件：`src/client/src/components/ManualWorkflowDialog.tsx`

- L146:38: `error  Cannot call impure function during render: Date.now`

### 7.3 测试覆盖

- 前后端均无 `test` 脚本，无任何自动化测试。

---

## 8. 与资料包冲突项

| # | 资料包要求 | 当前仓库实际 | 冲突级别 | 涉及文件 |
|---|------------|--------------|----------|----------|
| C1 | V2 顶栏显示「项目名+保存状态」，不显示 Provider | 顶栏显示 Provider + 模型选择 | P0 | `App.tsx` L215-L262 |
| C2 | 左工具栏使用稳定文字标签 | 当前仅图标，文字仅在 expanded 状态显示 | P0 | `Toolbar.tsx` L62-L65 |
| C3 | 单一主操作「生成预览」 | 每个工具面板有自己的「应用」按钮，PromptInput 有「提交」按钮 | P0 | `FaceBeautyPanel.tsx` L171, `ToolPanel.tsx` 多处, `PromptInput.tsx` |
| C4 | 人像参数改 5 档语义值 | 当前为 0-100 滑块数值 | P0 | `FaceBeautyPanel.tsx` L152-L168 |
| C5 | 默认隐藏 Provider/模型，用户选择质量/均衡/速度 | 用户必须手动选择 Provider 和模型 | P0 | `App.tsx` L215-L262, `useEditor.ts` L30 |
| C6 | 智能模型路由 + 失败转移 | 无路由策略，直接调用选定 Provider | P0 | `ProviderFactory.ts`, `edit.ts` |
| C7 | 创建任务 ID，阶段状态，轮询/SSE | 同步 HTTP 100s 请求，无 jobId | P0 | `useEditor.ts` L218-L229, `edit.ts` |
| C8 | 不可变版本 + 底部版本条 | 单结果 + history 截断恢复 | P0 | `useEditor.ts`, `ResultViewer.tsx` |
| C9 | 项目工作区（Project/Asset/Version） | 无项目对象，上传即进编辑态 | P0 | `useEditor.ts` L38-L51 |
| C10 | 保护项默认开启（身份/构图/皮肤纹理/服装背景） | 提示词中已有身份锚定和保留，但 UI 无明确保护项开关 | P0 | `FaceBeautyPanel.tsx` |
| C11 | 生产环境缺失 JWT/密码/加密密钥时 fail-fast | 代码使用 `??=` 设置默认值 | P0 | `src/server/index.ts` L37-L38, `middleware/auth.ts` L4-L5 |
| C12 | 上传限制：MIME/大小/像素数 | 仅校验 MIME 和 20MB，无像素上限 | P0 | `src/client/src/utils/image.ts` L1-L12 |
| C13 | Provider 配置和项目元数据不得依赖 `/tmp` | Vercel 下仍使用 `/tmp` | P0 | `ProviderStore.ts` L27-L29 |
| C14 | CORS allowlist | `app.use(cors())` 无限制 | P0 | `src/server/index.ts` L45 |
| C15 | 日志不得记录 Key、完整 Prompt、原图 base64 | `console.error('Edit error:', error)` 可能包含原始请求；detect 路由打印 mimeType/dims | P1 | `edit.ts` L84, `detect.ts` L169 |
| C16 | 健康检查不得泄露 Provider 配置细节 | `/api/health` 返回 defaultModel/hasApiKey | P1 | `src/server/index.ts` L48-L70 |
| C17 | 自由文本改名为「补充要求」 | 当前仍叫「生成指令」/「分析指令」 | P0 | `ParamPanel.tsx` L96-L97 |
| C18 | 参考图角色化（身份/色彩/风格/构图） | 参考图仅作为数量追加到 prompt | P1 | `SeedreamProvider.ts` L169-L170 等 |
| C19 | 对比模式：左右拖动/并排/闪烁、缩放平移同步 | 当前有 slider/split，但无闪烁、平移同步弱 | P1 | `ResultViewer.tsx` L413-L474 |
| C20 | 生产密钥按用户/工作区隔离 | 单密码 + 单 JWT Secret，无隔离 | P2 | `middleware/auth.ts` |

---

## 9. P0 每个 Epic 对应的修改文件

### Epic 1：项目工作区

| 需求 | 需新增/修改的文件 |
|------|-------------------|
| Project/Asset/Version 领域对象 | `src/shared/types.ts` 新增 Project/Asset/Version/EditRecipe/GenerationJob |
| 项目 CRUD API | `src/server/routes/projects.ts`（新增）、`src/server/index.ts` 注册路由 |
| 项目状态管理 | `src/client/src/hooks/useEditor.ts` 或新建 `useProject.ts` |
| 顶部项目状态栏 | `src/client/src/App.tsx` 顶栏重构 |
| 空状态/最近项目 | `src/client/src/components/ResultViewer.tsx`、`ImageUploader.tsx` |
| 持久化层 | 本地 IndexedDB 或对象存储（待决策 D-007） |

### Epic 2：任务型编辑

| 需求 | 需修改的文件 |
|------|--------------|
| 任务导航文字标签 | `src/client/src/components/Toolbar.tsx` |
| EditRecipe 模型 | `src/shared/types.ts` |
| 5 档参数语义 | `src/client/src/components/tools/FaceBeautyPanel.tsx`、新建参数转换器 |
| 保护项 UI | 新建 `ProtectionPanel.tsx`，在 `ParamPanel.tsx` 引入 |
| 单一「生成预览」CTA | `src/client/src/components/ParamPanel.tsx`、`ToolPanel.tsx`、各工具面板 |
| Prompt 编译器版本化 | 新建 `src/client/src/lib/promptCompiler.ts` 或 `src/server/services/promptCompiler.ts` |
| 补充要求输入框 | 重命名 `PromptInput.tsx` 文案与职责 |

### Epic 3：智能模型路由

| 需求 | 需修改的文件 |
|------|--------------|
| 能力矩阵集中定义 | `src/shared/types.ts` 扩展 PROVIDER_MODELS 能力/成本/延迟 |
| 路由服务 | `src/server/services/routing/ModelRouter.ts`（新增） |
| 路由 API | `src/server/routes/providers.ts` 新增 `/capabilities` 或独立路由 |
| 高级模型抽屉 | 新建 `src/client/src/components/ModelDrawer.tsx` |
| 前端隐藏 Provider | `src/client/src/App.tsx` 移除顶栏 Provider/模型选择 |
| 失败转移逻辑 | `src/server/routes/edit.ts`、`ModelRouter.ts` |

### Epic 4：生成任务

| 需求 | 需修改的文件 |
|------|--------------|
| Job 服务与状态机 | `src/server/services/jobs/JobService.ts`（新增） |
| Job 路由 | `src/server/routes/jobs.ts`（新增） |
| 后端异步执行 | `src/server/routes/edit.ts` 重写为创建 job + 后台执行 |
| 前端轮询/SSE | `src/client/src/hooks/useEditor.ts`、`useGenerationJob.ts`（新增） |
| 取消/重试 | `src/server/routes/jobs.ts` 新增 `/:id/cancel`、`/:id/retry` |
| 阶段状态 UI | 新建 `JobStatusPanel.tsx` |

### Epic 5：版本与对比

| 需求 | 需修改的文件 |
|------|--------------|
| 版本创建与保存 | `src/server/services/VersionService.ts`（新增） |
| 版本条组件 | 新建 `src/client/src/components/VersionStrip.tsx` |
| 对比模式增强 | `src/client/src/components/ResultViewer.tsx` |
| 采用/恢复/复制配方 | `src/client/src/components/VersionStrip.tsx` + API |

### Epic 6：质量保护

| 需求 | 需修改的文件 |
|------|--------------|
| 保护项默认值 | `FaceBeautyPanel.tsx` 或新建 `ProtectionPanel.tsx` |
| 输出检查 | `src/server/services/quality/OutputValidator.ts`（新增） |
| 人工质量标签 | `Version` 类型 + UI |

### Epic 7：安全与可靠性

| 需求 | 需修改的文件 |
|------|--------------|
| 生产密钥 fail-fast | `src/server/index.ts` L37-L38、`middleware/auth.ts` L4-L5 |
| CORS allowlist | `src/server/index.ts` L45 |
| 上传像素限制 | `src/client/src/utils/image.ts`、`src/server/routes/edit.ts` |
| 持久存储替代 /tmp | `src/server/services/providers/ProviderStore.ts` L27-L29 |
| 日志脱敏 | `src/server/routes/edit.ts` L84、`detect.ts` L169 |
| 健康检查脱敏 | `src/server/index.ts` L48-L70 |
| 数据删除策略 | 新增 Project/Asset 删除路由 |

---

## 10. 迁移风险

| 风险 ID | 风险描述 | 影响 | 缓解建议 |
|---------|----------|------|----------|
| R1 | 当前 `history` 截断恢复语义与 V2 不可变版本冲突 | 高 | 保留旧 history 作为只读导入，新建 Version 系统 |
| R2 | Provider/模型选择是大量现有 UI 逻辑的核心 | 高 | 用 feature flag `VITE_EDITOR_V2` 渐进切换，保留旧路径 |
| R3 | 同步 `/api/edit` 100s 请求被前端/后端/网关多处依赖 | 高 | 先新增 `/api/jobs` 异步链路，旧路由保留兼容 |
| R4 | `localStorage` 中的历史元数据无法直接映射到 Project/Version | 中 | 设计迁移脚本，将历史转换为首个项目 + 版本链 |
| R5 | Vercel `/tmp` 上的 Provider 配置在正式部署会丢失 | 高 | P0 必须将 Provider 配置迁移到持久存储或环境变量 |
| R6 | 默认 JWT/密码在生产环境会被利用 | 高 | P0 必须改为缺失即失败，并提供部署文档 |
| R7 | 无测试覆盖，重构易回归 | 高 | 在 UI-001 前补充最小单元测试和 e2e 冒烟测试 |
| R8 | 当前滑块数值 0-100 无法直接映射到 5 档语义 | 中 | 定义映射表，旧 custom 值归到最接近档位 |
| R9 | 多个 Provider 的 prompt 追加逻辑分散 | 中 | 集中到 Prompt 编译器，Provider 只做协议适配 |
| R10 | 参考图目前以 base64 在请求体传输，大文件易触发 50MB JSON 限制 | 高 | 引入上传 URL + 对象存储或 IndexedDB |

---

## 11. 建议实施顺序

基于「先扫描、后外壳、再内核、最后安全加固」原则：

1. **UI-001 V2 外壳**（feature flag `VITE_EDITOR_V2`）
   - 新建 `AppV2.tsx`、顶栏项目状态、左栏文字标签、单一「生成预览」CTA、底部版本条占位。
   - 不接入异步任务，先保持现有 `/api/edit` 同步调用。

2. **FLOW-001 配方模型**
   - 新增 `EditRecipe` 类型和 Prompt 编译器 v1。
   - 将现有 0-100 滑块映射到 5 档语义。
   - 保护项 UI 默认开启。

3. **JOB-001 异步任务**
   - 新增 `/api/jobs` 路由和 `JobService`。
   - 前端轮询或 SSE，支持取消/重试/刷新恢复。
   - 此步骤后废弃旧的同步 `/api/edit` 主链路。

4. **VERSION-001 版本与持久化**
   - 实现 Project/Asset/Version 领域对象和存储。
   - 底部版本条、对比、恢复、采用。
   - 迁移旧 localStorage history。

5. **ROUTING-001 智能模型路由**
   - 集中能力矩阵，`ModelRouter`。
   - 高级模型抽屉，质量/均衡/速度策略。

6. **HARDEN-001 安全与发布**
   - fail-fast 密钥、CORS allowlist、上传像素限制、日志脱敏、持久存储替代 `/tmp`。

---

## 12. 需要 GPT/用户确认的问题

### 12.1 必须在本轮冻结前确认

1. **D-007 图片持久化**：P0 采用方案 A（IndexedDB 本地优先）还是方案 B（Postgres + 对象存储）？
   - 影响：Project/Asset/Version 实现、Vercel 部署架构、成本。

2. **D-008 默认单结果还是双候选？**
   - 当前资料包暂定单结果，是否确认？

3. **现有 history 数据迁移策略**
   - 是否将现有 localStorage history 作为 V1 数据导入为首个项目的版本链？还是清空重新开始？

4. **V2 外壳 feature flag 默认开启范围**
   - 仅本地开发开启，还是 Vercel 预览环境也开启？

5. **Provider 配置持久化方案**
   - 继续使用本地文件 + 环境变量回退？
   - 还是迁移到数据库/Vercel Blob/其他 KV？

6. **认证方式升级**
   - P0 是否仍保持单密码登录？
   - 是否需要引入更安全的用户/工作区隔离？

### 12.2 需要补充扫描的信息

7. **当前实际部署环境**
   - 是否已在 Vercel Production 部署？
   - 当前 `SEEDREAM_API_KEY` 等环境变量是否已配置？

8. **PromptInput 组件完整实现**
   - 本次扫描未逐行读取 `PromptInput.tsx`，需确认其是否包含独立的「提交」按钮和 apply 冲突。

9. **ColorMatchingPanel / LiquifyPanel / CleanupPanel / RemovePeoplePanel 的当前参数**
   - 这些面板未完全展开扫描，需确认是否也使用 0-100 滑块和独立的「应用」按钮。

---

## 附录 A：运行命令原始输出摘要

### A.1 根目录 build

```text
> npm run build
> npm run build --prefix src/client && npm run build --prefix src/server
...
exit 0
```

### A.2 Client lint

```text
D:\...\src\client\src\App.tsx
  116:5  error    Avoid calling setState() directly within an effect
  117:6  warning  React Hook useEffect has a missing dependency: 'loadProviders'
  125:6  warning  React Hook useEffect has a missing dependency: 'loadProviders'

D:\...\src\client\src\components\ManualWorkflowDialog.tsx
  146:38  error  Cannot call impure function during render `Date.now` is an impure function.

✖ 4 problems (2 errors, 2 warnings)
exit 1
```

### A.3 Client / Server type检查

```text
npx tsc --noEmit
exit 0
```

### A.4 Client / Server test

```text
npm error Missing script: "test"
exit 1
```

---

## 附录 B：关键代码行速查

- 默认密钥：`src/server/index.ts` L37-L38
- CORS 无限制：`src/server/index.ts` L45
- 50MB JSON：`src/server/index.ts` L46
- `/tmp` 存储：`src/server/services/providers/ProviderStore.ts` L27-L29
- 100s 客户端超时：`src/client/src/hooks/useEditor.ts` L229
- 80s Seedream 超时：`src/server/services/providers/SeedreamProvider.ts` L8
- 操作类型判定：`src/server/services/providers/ProviderFactory.ts` L39-L63
- 顶栏 Provider 选择：`src/client/src/App.tsx` L215-L262
- 修脸 0-100 滑块：`src/client/src/components/tools/FaceBeautyPanel.tsx` L152-L168
- 工具面板独立「应用」按钮：`src/client/src/components/tools/ToolPanel.tsx` L54, L93, L161
