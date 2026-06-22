# 图像编辑器 UI 美化、API 接入与专业修图功能 Spec

## Why

当前基于 GLM API 的网页编辑器已完成基础文生图、多轮对话和参考图能力，但 UI 仍偏向工具原型，且只支持单一 GLM 模型。用户希望把它升级为面向客户的商业修图工作台：界面更专业（参考像素蛋糕），允许客户自行接入 GPT-Image-2、GLM、即梦等常用图像模型 API，并提供追色、人脸美化、液化、背景穿帮修复、路人去除等写真后期高频功能。

📖 [用户画像与偏好档案] 明确业务聚焦“个人写真后期处理”，工作流偏好“半自动模式：用户上传 → AI 处理 → 用户确认”，且已掌握分层提示词、参考图锁风格等方法论。本次升级应围绕这一业务流设计。

## What Changes

- 整体 UI 重设计：采用专业修图软件布局（左侧工具栏 + 中央画布 + 右侧面板），统一视觉语言、图标、色彩与间距。
- 新增 API Provider 管理中心：客户可添加、编辑、删除图像模型 API（GPT-Image-2、GLM、即梦/Seedance 等），并在编辑时切换 Provider。
- 后端扩展多 Provider 路由：统一抽象图像生成/编辑接口，支持不同模型的协议转换。
- 新增专业修图工具模块：追色、人脸美化、液化、背景穿帮修复、路人去除，以提示词模板 + 参考图 + 局部编辑的方式实现。
- 扩展提示词模板库：新增“追色”、“液化塑形”、“穿帮修复”、“路人去除”等分类，融入知识库中的摄影术语与防御词。
- 优化结果展示：强化 Before/After 对比、缩放、全屏预览、操作历史时间线。
- **BREAKING**：共享类型 `EditRequest` / `EditResponse` 需增加 `providerId` 字段；后端不再默认只读取 `GLM_API_KEY`，而是按 Provider 配置读取。

## Impact

- Affected specs: `build-gemini-image-editor`（在其已完成功能上做增强）。
- Affected code:
  - 前端：`src/client/src/App.tsx`、组件、模板、hooks、样式。
  - 后端：`src/server/routes/edit.ts`、新增 Provider 服务抽象、API 配置接口。
  - 共享类型：`src/shared/types.ts`。
  - 配置：`.env.example` 新增 Provider 相关变量。

---

## ADDED Requirements

### Requirement: 专业修图工作台布局

系统 SHALL 提供类似像素蛋糕的专业修图界面：

- **WHEN** 用户登录后进入编辑器
- **THEN** 页面呈现三栏布局：
  - 左侧：工具分类栏（修脸、调色、液化、修复、消除、导出）。
  - 中央：大图画布，支持原图/结果/对比三种视图。
  - 右侧：参数与提示词面板，随左侧选中工具变化。
- **THEN** 顶部 Header 保留全局模型/Provider 切换、用户操作入口。

#### Scenario: 工具切换
- **WHEN** 用户点击左侧某工具（如“人脸美化”）
- **THEN** 右侧参数面板显示该工具对应的可调参数和提示词模板
- **THEN** 中央画布保持当前图片不变

#### Scenario: 响应式适配
- **WHEN** 屏幕宽度小于 1024px
- **THEN** 左侧工具栏收缩为图标 + 抽屉
- **THEN** 右侧面板变为底部抽屉或可切换标签

---

### Requirement: API Provider 管理

系统 SHALL 允许客户自行添加和管理图像模型 API：

- **WHEN** 用户进入“API 设置”页面
- **THEN** 用户可添加一个 Provider，包含：
  - 名称（自定义，如“我的 GPT-Image-2”）
  - 类型（OpenAI / GLM / 即梦 / 自定义 OpenAI-compatible）
  - API Key（密码输入框，前端掩码显示）
  - Base URL（可选，用于代理或自定义端点）
  - 默认模型（如 `gpt-image-2`、`cogview-4-250304`）
- **THEN** 用户可编辑、删除、启用/禁用 Provider
- **THEN** API Key 通过后端安全存储，前端不可读取明文

#### Scenario: 编辑时切换 Provider
- **WHEN** 用户在顶部模型选择器切换 Provider
- **THEN** 后续编辑请求使用该 Provider 的 API Key 和端点
- **THEN** 不支持的模型类型给出友好提示

#### Scenario: Provider 类型扩展
- **WHEN** 后端新增一种 OpenAI-compatible Provider
- **THEN** 前端无需修改即可在类型下拉中看到并配置

---

### Requirement: 多 Provider 后端代理

系统 SHALL 通过后端统一代理所有 Provider 的 API 调用：

- **WHEN** 前端发起 `/api/edit` 请求并携带 `providerId`
- **THEN** 后端根据 Provider 配置路由到对应服务实现
- **THEN** 后端完成请求协议转换（OpenAI Images Edit、GLM Images Generations、Chat Completions 等）
- **THEN** 返回统一格式给前端

#### Scenario: 错误映射
- **WHEN** Provider 返回 401/403
- **THEN** 后端返回“API Key 无效或已过期，请检查 API 设置”
- **WHEN** Provider 返回 429
- **THEN** 后端返回“该 API 额度已用尽，请切换 Provider 或稍后重试”

---

### Requirement: 追色功能

系统 SHALL 提供追色（参考图色调迁移）功能：

- **WHEN** 用户选择“追色”工具
- **THEN** 右侧显示参考图上传区与描述输入框
- **WHEN** 用户上传参考图并可选输入补充描述
- **THEN** 系统将参考图作为风格锁定输入，调用图像编辑模型
- **THEN** 返回保持原图构图与人物特征，但色调、光影、质感向参考图靠拢的结果

📖 [社区提示词精华] 追色提示词应使用“保留/修改/风格/限制”四层结构，并借鉴摄影术语锚点技法，如 `85mm人像镜头, 柯达Portra 400胶片模拟` 替代抽象的“电影级写实”。

#### Scenario: 无参考图追色
- **WHEN** 用户只输入文字描述（如“日系清新通透色调”）
- **THEN** 系统按文字描述调色，不强制要求参考图

---

### Requirement: 人脸美化

系统 SHALL 提供专业级人脸美化：

- **WHEN** 用户选择“人脸美化”工具
- **THEN** 右侧显示可调整参数：肤色提亮、磨皮强度、瘦脸、大眼、去瑕疵、立体光影
- **WHEN** 用户调整参数并点击应用
- **THEN** 系统生成对应的提示词，强调“保留本人特征、不要网红脸、不要塑料皮”
- **THEN** 返回自然精致、辨识度保留的人像结果

📖 [用户画像与偏好档案] 皮肤质感标准为“韩系高级奶油肌”，底线是“保留真实皮肤纹理和毛孔、保留面部立体光影”，禁止塑料皮、假白、柔焦糊脸。

#### Scenario: 强度分级
- **WHEN** 用户选择“自然 / 精致 / 高定”三档预设
- **THEN** 参数滑块自动调整到对应位置
- **THEN** 提示词中的修饰强度同步变化

---

### Requirement: 液化塑形

系统 SHALL 提供基于 AI 的液化塑形（通过生成式编辑实现）：

- **WHEN** 用户选择“液化”工具
- **THEN** 右侧显示可选调整项：小脸、下颌线收紧、鼻翼缩小、人中缩短、肩部收窄、身形微调
- **WHEN** 用户启用某一项并设置强度
- **THEN** 系统生成强调“轻微、自然、保持本人特征”的提示词
- **THEN** 返回轮廓微调后的结果

📖 [用户画像与偏好档案] 修脸方向为“小V脸、下颌线收紧、中庭缩短、鼻翼鼻头缩小、人中缩短”，底线是“保持本人特征、不要网红脸、不要过度整形感、五官辨识度不变”。

#### Scenario: 预览与重试
- **WHEN** 用户对液化结果不满意
- **THEN** 可调低强度或撤销该步骤，重新生成

---

### Requirement: 背景穿帮修复

系统 SHALL 提供背景穿帮修复：

- **WHEN** 用户选择“穿帮修复”工具
- **THEN** 用户可在画布上框选或涂抹需要修复的区域（辅助定位）
- **WHEN** 用户提交修复
- **THEN** 系统生成提示词，要求只修复选定区域、保持人物和其他背景不变
- **THEN** 返回修复后的结果

📖 [GPT-Image2 实战技巧] 局部精准修改可“只修改图片中的特定部分，保留其他所有内容不变”，适用于去除瑕疵和穿帮元素。

#### Scenario: 全图自动检测
- **WHEN** 用户不框选区域直接点击“自动修复”
- **THEN** 系统调用模型自动识别并修复常见穿帮（如支架、反光板、杂物）

---

### Requirement: 路人去除

系统 SHALL 提供路人/多余人物去除：

- **WHEN** 用户选择“路人去除”工具
- **THEN** 用户可框选或涂抹要去掉的人物
- **WHEN** 用户提交
- **THEN** 系统生成提示词，要求去除指定人物并用周围环境自然填充
- **THEN** 返回清理后的结果

#### Scenario: 自动路人检测
- **WHEN** 用户点击“自动识别路人”
- **THEN** 系统返回候选路人区域（矩形标注）供用户确认
- **THEN** 用户确认后执行去除

---

### Requirement: 扩展提示词模板库

系统 SHALL 扩展模板库以覆盖新增修图场景：

- **WHEN** 用户打开模板面板
- **THEN** 看到分类：面部精修、液化塑形、追色、调色风格、背景替换、穿帮修复、路人去除、风格迁移
- **THEN** 每个模板支持一键填入当前工具的参数面板

📖 [社区提示词精华] 模板应使用五段式结构化写法（Scene / Subject / Important details / Use case / Constraints），并在末尾集中否定词，如 `no plastic skin, no digital over-sharpening`。

---

### Requirement: 操作历史与撤销

系统 SHALL 提供专业修图软件式的历史管理：

- **WHEN** 用户完成一次编辑
- **THEN** 左侧历史面板新增一个步骤节点，显示操作类型和缩略图
- **WHEN** 用户点击历史节点
- **THEN** 可回退到该步骤状态并继续编辑
- **THEN** 历史记录保存到 localStorage，刷新页面后可恢复

---

### Requirement: 结果预览增强

系统 SHALL 增强结果展示：

- **WHEN** 结果返回后
- **THEN** 中央画布默认显示结果图
- **THEN** 提供 1:1 / 适应屏幕 / 全屏 三种缩放模式
- **THEN** Before/After 对比支持滑块拖动和左右分屏两种模式
- **THEN** 提供下载 PNG 和“在新标签页打开原图”按钮

---

## MODIFIED Requirements

### Requirement: 编辑请求统一接口

原 `POST /api/edit` 仅支持 GLM 模型。修改后：

- **WHEN** 前端发起编辑请求
- **THEN** 请求体 SHALL 包含 `providerId` 字段
- **THEN** 后端根据 `providerId` 查找对应 Provider 配置并路由
- **THEN** 返回统一格式 `{ success, imageData?, imageUrl?, text?, mimeType?, error? }`

**变更点**：
- `EditRequest` 增加 `providerId?: string`。
- 后端 `editImage` 服务由单一 GLM 实现改为 Provider 工厂模式。
- 环境变量由 `GLM_API_KEY` 扩展为可配置多个 Provider。

---

## REMOVED Requirements

### Requirement: 单一 GLM 模型硬编码

**Reason**：需要支持客户自定义多 Provider。
**Migration**：保留默认 GLM Provider（从环境变量自动初始化），确保现有用户无感知过渡。

---

## 技术架构

### 前端
- **框架**：React + Vite + TypeScript（保持现有栈）。
- **样式**：Tailwind CSS；引入 `lucide-react` 统一图标，必要时引入 `@radix-ui` 组件提升可访问性。
- **布局**：CSS Grid 三栏布局，支持响应式折叠。
- **画布**：原生 HTML/CSS + Canvas 2D 实现选区/涂抹辅助（仅前端辅助定位，真正编辑仍走模型 API）。

### 后端
- **运行时**：Node.js + Express（保持现有栈）。
- **Provider 抽象**：定义 `ImageProvider` 接口，各 Provider 实现 `edit/generate/chat` 方法。
- **存储**：API Provider 配置初期存储在 SQLite/JSON 文件（`data/providers.json`），API Key 加密存储；后续可迁移到数据库。
- **认证**：保留 JWT 共享密码认证，Provider 管理只对登录用户开放。

### 共享类型
- 扩展 `src/shared/types.ts`，新增 `ProviderConfig`、`ProviderType`、`ProviderModel` 等类型。

---

## 里程碑

### Phase 1: UI 骨架与布局升级
- 三栏专业布局落地
- 左侧工具栏、右侧参数面板、中央画布分离
- 响应式折叠适配

### Phase 2: API Provider 管理
- Provider 数据模型与存储
- 前端 Provider 设置页
- 后端 Provider 工厂与路由
- 默认 GLM Provider 兼容

### Phase 3: 专业修图工具
- 追色、人脸美化、液化、穿帮修复、路人去除五个工具
- 模板库扩展
- 画布辅助选区/涂抹交互
- 操作历史增强

### Phase 4: 结果预览与收尾
- 1:1 / 适应 / 全屏预览
- Before/After 双模式对比
- 性能与错误体验优化
