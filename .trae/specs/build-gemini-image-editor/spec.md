# Gemini 图像编辑器网页 Spec

## Why

当前修图工作依赖 Shotlab 平台，无法定制化界面和流程。需要一个自建的网页端图像编辑器，接入 Gemini API 实现面部精修、背景替换、风格迁移和多轮对话式编辑，为团队和客户提供专属的修图服务入口。

## What Changes

- 新增基于 Gemini API 的网页端图像编辑器
- 支持图像上传、编辑指令输入、参考图上传、结果预览与下载
- 支持多轮对话式编辑（保持上下文连续修改）
- 支持模型切换（免费模型 vs 付费模型）
- 后端代理 API 调用，保护 API Key 安全
- 预留用户认证和用量管理接口

## Impact

- Affected specs: 无（全新功能）
- Affected code: 新增项目，不影响现有代码

---

## ADDED Requirements

### Requirement: 图像上传与预处理

系统 SHALL 提供图像上传功能，支持以下格式和约束：

- **WHEN** 用户点击上传区域或拖拽图片
- **THEN** 系统接受 JPG/PNG/WebP 格式，单文件最大 20MB
- **THEN** 系统在上传后显示原图预览，并显示图片尺寸信息
- **THEN** 系统自动将图片转为 Base64 编码供 API 调用使用

#### Scenario: 图片过大
- **WHEN** 用户上传超过 20MB 的图片
- **THEN** 系统提示"图片过大，请压缩后上传"并拒绝处理

#### Scenario: 不支持的格式
- **WHEN** 用户上传非 JPG/PNG/WebP 格式文件
- **THEN** 系统提示"不支持该格式，请上传 JPG/PNG/WebP 图片"

---

### Requirement: 编辑指令输入

系统 SHALL 提供编辑指令输入功能：

- **WHEN** 用户在编辑指令输入框中输入自然语言描述
- **THEN** 系统将指令连同图片发送给 Gemini API
- **THEN** 系统显示处理中状态（loading 动画）
- **THEN** API 返回后显示编辑结果图片

#### Scenario: 快捷指令
- **WHEN** 用户点击预设的快捷指令按钮（如"面部精修"、"背景替换"、"调色"）
- **THEN** 系统自动填充对应的提示词模板到输入框
- **THEN** 用户可在模板基础上修改后提交

#### Scenario: 空指令提交
- **WHEN** 用户未输入任何指令就点击提交
- **THEN** 系统提示"请输入编辑指令"

---

### Requirement: 参考图上传

系统 SHALL 支持上传参考图用于风格迁移和引导编辑：

- **WHEN** 用户在参考图区域上传图片
- **THEN** 系统显示参考图缩略图
- **THEN** 系统将参考图作为辅助输入发送给 Gemini API（最多 14 张）

#### Scenario: 参考图风格迁移
- **WHEN** 用户上传参考图并输入"按照参考图的风格和色调修改这张照片"
- **THEN** 系统将原图和参考图一起发送给 API
- **THEN** 返回融合参考图风格的结果

---

### Requirement: 多轮对话式编辑

系统 SHALL 支持多轮对话式编辑，保持上下文连续：

- **WHEN** 用户对编辑结果继续输入修改指令
- **THEN** 系统将之前的编辑历史（原图 + 历次指令 + 历次结果）作为上下文发送
- **THEN** API 基于完整上下文生成新一轮编辑结果

#### Scenario: 编辑历史展示
- **WHEN** 用户进行多轮编辑
- **THEN** 系统在侧边栏展示编辑历史时间线（每轮的指令和结果缩略图）
- **THEN** 用户可点击任意历史节点查看该轮结果的大图

#### Scenario: 上下文长度限制
- **WHEN** 对话轮次超过 10 轮
- **THEN** 系统自动保留最近 10 轮上下文，更早的轮次仅保留缩略图记录
- **THEN** 系统提示用户"上下文已精简，如需从更早版本继续请点击对应历史节点"

---

### Requirement: 模型切换

系统 SHALL 支持在不同 Gemini 模型间切换：

- **WHEN** 用户在模型选择器中选择不同模型
- **THEN** 系统切换到对应模型进行后续编辑调用

#### 可选模型列表

| 模型 ID | 显示名称 | 说明 |
|---------|---------|------|
| `gemini-2.0-flash-exp-image-generation` | Flash（免费） | 基础修图，免费额度可用 |
| `gemini-3.1-flash-image-preview` | Nano Banana 2（推荐） | 快速高质量，需付费 API |
| `gemini-3-pro-image-preview` | Nano Banana Pro | 最高质量，需付费 API |

#### Scenario: 免费额度用尽
- **WHEN** 用户使用免费模型但额度已耗尽
- **THEN** 系统显示"免费额度已用尽，请切换到付费模型或等待额度刷新"
- **THEN** 提供"升级 API 额度"的引导链接

---

### Requirement: 结果预览与下载

系统 SHALL 提供编辑结果的预览和下载功能：

- **WHEN** API 返回编辑结果
- **THEN** 系统在主画布区域显示结果图片
- **THEN** 提供"下载"按钮，点击后保存为 PNG 格式
- **THEN** 提供"原图/结果对比"切换视图

#### Scenario: Before/After 对比
- **WHEN** 用户点击"对比"按钮
- **THEN** 系统显示原图和编辑结果的左右/上下对比视图
- **THEN** 支持滑块拖动对比

---

### Requirement: 提示词模板库

系统 SHALL 提供与项目知识库对齐的提示词模板库：

- **WHEN** 用户点击"提示词模板"按钮
- **THEN** 系统展示分类模板列表

#### 模板分类

| 分类 | 模板示例 |
|------|---------|
| 面部精修 | 韩系奶油肌、自然美颜、轻微修脸 |
| 背景替换 | 换纯色背景、换场景背景、去除杂物 |
| 调色风格 | 新中式暗调、通透日系、电影感暖调 |
| 风格迁移 | 按参考图风格、按摄影风格 |

📖 [社区提示词精华] 模板应借鉴社区的摄影术语锚点技法，如用"85mm人像镜头, 柔光箱布光"替代"电影级写实"。

#### Scenario: 使用模板
- **WHEN** 用户选择一个模板
- **THEN** 系统将模板内容填入编辑指令输入框
- **THEN** 用户可修改后提交

---

### Requirement: 后端 API 代理

系统 SHALL 通过后端代理所有 Gemini API 调用：

- **WHEN** 前端发起编辑请求
- **THEN** 请求发送到后端 `/api/edit` 端点
- **THEN** 后端将请求转发到 Gemini API，API Key 存储在后端环境变量中
- **THEN** 后端将 API 响应返回给前端

#### Scenario: API Key 安全
- **WHEN** 前端代码被浏览器审查
- **THEN** 无法找到 Gemini API Key（Key 仅存在于后端）

#### Scenario: 错误处理
- **WHEN** Gemini API 返回 429（额度耗尽）
- **THEN** 后端返回友好错误信息"API 调用额度已用尽，请稍后重试"
- **WHEN** Gemini API 返回 5xx
- **THEN** 后端返回"Gemini 服务暂时不可用，请稍后重试"

---

### Requirement: 用户认证（预留）

系统 SHALL 预留用户认证接口，初期实现简单的密码保护：

- **WHEN** 用户首次访问网页
- **THEN** 系统显示密码输入页面
- **WHEN** 用户输入正确密码
- **THEN** 系统进入编辑器主界面
- **WHEN** 用户输入错误密码
- **THEN** 系统提示"密码错误"

#### Scenario: 后续扩展
- 预留用户表和权限字段，后续可扩展为多用户系统
- 预留用量统计字段，后续可按用户统计 API 调用量

---

### Requirement: 响应式布局

系统 SHALL 支持桌面端和平板端使用：

- **WHEN** 在 1280px+ 宽度屏幕上访问
- **THEN** 显示完整的三栏布局（左：历史/模板 | 中：画布 | 右：指令/设置）
- **WHEN** 在 768px-1279px 宽度屏幕上访问
- **THEN** 显示两栏布局（画布 + 侧边抽屉）
- **WHEN** 在 768px 以下宽度屏幕上访问
- **THEN** 显示单栏布局（画布 + 底部面板）

---

## 技术架构

### 前端
- **框架**: React + Vite
- **样式**: Tailwind CSS
- **状态管理**: React Context + useReducer
- **图片处理**: 浏览器原生 Canvas API（压缩/格式转换）

### 后端
- **运行时**: Node.js + Express
- **API 调用**: `@google/generative-ai` SDK
- **认证**: JWT（初期简化为共享密码）
- **环境变量**: dotenv 管理 API Key

### 部署
- **开发**: 本地 `npm run dev`（前后端同端口）
- **生产**: 可部署到 Vercel（前端）+ Railway/Render（后端）
- **API Key**: 通过环境变量注入，不写入代码

### 项目结构
```
src/
├── client/           ← 前端 React 应用
│   ├── components/   ← UI 组件
│   ├── hooks/        ← 自定义 Hooks
│   ├── templates/    ← 提示词模板数据
│   ├── App.tsx
│   └── main.tsx
├── server/           ← 后端 Express 服务
│   ├── routes/       ← API 路由
│   ├── services/     ← Gemini API 调用封装
│   ├── middleware/   ← 认证中间件
│   └── index.ts
└── shared/           ← 前后端共享类型
```

---

## Gemini API 调用方式

### 编辑请求格式
```
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}

Body:
{
  "contents": [{
    "parts": [
      { "text": "编辑指令" },
      { "inline_data": { "mime_type": "image/jpeg", "data": "base64编码的原图" } },
      { "inline_data": { "mime_type": "image/jpeg", "data": "base64编码的参考图" } }  // 可选
    ]
  }],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"]
  }
}
```

### 多轮编辑格式
```
Body:
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "第一轮指令" },
        { "inline_data": { "mime_type": "image/jpeg", "data": "原图base64" } }
      ]
    },
    {
      "role": "model",
      "parts": [
        { "inline_data": { "mime_type": "image/jpeg", "data": "第一轮结果base64" } }
      ]
    },
    {
      "role": "user",
      "parts": [
        { "text": "第二轮指令" }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"]
  }
}
```

---

## 里程碑

### Phase 1: MVP（最小可用版本）
- 图像上传 + 单轮编辑 + 结果下载
- 后端 API 代理
- 免费模型支持

### Phase 2: 核心功能
- 多轮对话式编辑
- 参考图上传
- 提示词模板库
- Before/After 对比

### Phase 3: 生产化
- 模型切换（付费模型）
- 用户认证
- 编辑历史持久化
- 响应式布局优化
