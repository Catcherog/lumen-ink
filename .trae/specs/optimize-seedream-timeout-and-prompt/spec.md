<br />

# 优化 Seedream 请求链路与提示词长度 Spec

## Why

用户在使用 Seedream Provider 进行图生图编辑时频繁触发 `Seedream API 请求超时（超过50秒），请稍后重试`，导致编辑请求失败。当前调用链存在三处可优化点：

1. **超时阈值不匹配** — `SeedreamProvider.ts` 硬编码 `FETCH_TIMEOUT = 50000`（50秒），而 `vercel.json` 的 `maxDuration` 为 60 秒，前端 axios 无显式超时。Seedream 2K 出图实际耗时多在 30–60s 区间，50s 阈值恰好卡在出图完成临界点，导致「即将成功时被中断」。
2. **入参未做体积优化** — 上传图片（最大 20MB）以 base64 data URL 原样塞进 JSON body，未做压缩或分辨率限制；`size: '2K'` 强制 2K 输出，进一步拉长生成耗时。
3. **提示词冗余** — `FaceBeautyPanel.tsx` 的 `buildPrompt()` 生成 6 段结构化提示词，约 300–400 中文字符，其中 `【光影镜头】` 与 `【风格】` 两段重复出现「柔光箱45度主光」「85mm f/1.4人像镜头」等锚点，增加模型理解负担与处理时间。

本次优化目标：将单次 Seedream 图生图请求的 P95 耗时从「50s 超时失败」收敛到「45s 内稳定返回」，并消除冗余提示词。

## What Changes

* **调高并分层对齐超时阈值** — `SeedreamProvider.ts` 的 `FETCH_TIMEOUT` 由 50000ms 调整为 90000ms（90s），与火山方舟 API 实际出图能力匹配；同步将 `vercel.json` 的 `maxDuration` 由 60 调整为 90，确保 Vercel 函数不会先于 Provider 超时被杀。

* **前端 axios 显式设置超时** — `useEditor.ts` 的 `submitEdit` 调用增加 `timeout: 100000`（100s），略大于后端 90s，确保后端能完整返回错误信息而非被前端先掐断。

* **入图分辨率压缩** — 在 `/api/edit` 路由或 `SeedreamProvider.edit()` 入口处，对入参 `image` 做最大边 2048px 限制的压缩预处理（仅 Seedream 类型触发，其他 Provider 不变）。

* **出图尺寸降级为可配** — `SeedreamProvider` 的 `size: '2K'` 改为依据 Provider 配置或请求参数选择 `1080P` / `2K`，默认改为 `1080P` 以显著缩短生成耗时（2K→1080P 通常可节省 30–40% 时间）。

* **提示词瘦身** — 重构 `FaceBeautyPanel.tsx` 的 `buildPrompt()`：合并 `【光影镜头】` 与 `【风格】` 为单一「镜头光影风格」段；移除 `IDENTITY_ANCHOR` 中与 `【保留】` 重复的「五官辨识度」表述；保留 `【身份锚定】【保留】【修改】【限制】` 四段核心结构。同步精简 `ToolPanel.tsx` 中 `RepairToolPanel` / `RemoveToolPanel` / `ExportToolPanel` 的同类冗余。

* **超时错误信息可观测** — 超时抛错时附带实际耗时（`elapsed`）与请求 size 参数，便于后续诊断。

## Impact

* **Affected specs**:

  * `add-seedream-provider-and-manual-gemini-workflow` — Seedream Provider 行为变更（超时、size 参数）

  * `upgrade-prompt-engineering` — 提示词结构由 6 段收敛为 4 段

* **Affected code**:

  * `src/server/services/providers/SeedreamProvider.ts` — 超时阈值、size 参数化、入图压缩

  * `src/client/src/hooks/useEditor.ts` — axios 超时配置

  * `src/client/src/components/tools/FaceBeautyPanel.tsx` — buildPrompt 瘦身

  * `src/client/src/components/tools/ToolPanel.tsx` — 三个子面板提示词同步瘦身

  * `vercel.json` — `maxDuration` 60→90

  * `src/shared/types.ts` — 新增 `EditRequest.outputSize?: '1080P' | '2K'` 可选字段

## ADDED Requirements

### Requirement: Seedream 出图尺寸可配置

系统 SHALL 允许通过 `EditRequest.outputSize` 字段指定 Seedream 出图尺寸，未指定时默认使用 `1080P` 以优先保证响应速度。

#### Scenario: 默认 1080P 出图

* **WHEN** 用户未指定 `outputSize` 调用 Seedream Provider

* **THEN** 请求 body 中 `size` 字段为 `'1080P'`

#### Scenario: 显式 2K 出图

* **WHEN** 请求携带 `outputSize: '2K'`

* **THEN** 请求 body 中 `size` 字段为 `'2K'`，超时阈值自动延长以适配 2K 耗时

### Requirement: Seedream 入图分辨率压缩

系统 SHALL 在 Seedream Provider 接收到入参 `image` 时，自动将其最大边压缩至 2048px 以内，避免超大图原样上传拖慢请求。

#### Scenario: 原图超过 2048px

* **WHEN** 用户上传 4000×3000 图片调用 Seedream 编辑

* **THEN** Provider 内部将其等比缩放至 2048×1536 后再发往火山方舟 API

#### Scenario: 原图小于 2048px

* **WHEN** 用户上传 1280×720 图片

* **THEN** 不做缩放，原样传递

### Requirement: 超时错误携带诊断信息

系统 SHALL 在 Seedream 请求超时抛错时，附带实际耗时（毫秒）与请求 `size` 参数，便于用户判断是网络问题还是出图尺寸过大。

#### Scenario: 超时错误信息

* **WHEN** Seedream 请求超过 90s 未返回

* **THEN** 抛出错误信息形如：`Seedream API 请求超时（耗时 90023ms，size=2K），建议切换为 1080P 出图或稍后重试`

## MODIFIED Requirements

### Requirement: Seedream Provider 超时阈值

**原行为**：`FETCH_TIMEOUT = 50000`（50秒），与 Vercel `maxDuration: 60` 不匹配，2K 出图频繁触发。

**新行为**：

* `FETCH_TIMEOUT` 调整为 `90000`（90秒）

* 当 `outputSize === '2K'` 时，超时阈值自动延长至 `120000`（120秒），但需触发 Vercel 函数上限告警提示

* `vercel.json` 的 `api/index.ts` 函数 `maxDuration` 同步调整为 `90`

### Requirement: FaceBeautyPanel 提示词结构

**原行为**：6 段结构 `【身份锚定】【保留】【修改】【光影镜头】【风格】【限制】`，约 300–400 字符，存在重复锚点。

**新行为**：4 段结构 `【身份锚定】【保留】【修改】【限制】`，约 200–260 字符：

* `【身份锚定】` 保留面部骨骼结构锚点，移除与 `【保留】` 重复的「五官辨识度」表述

* `【保留】` 保留构图、背景、皮肤纹理要求

* `【修改】` 保留 6 个滑块对应的修改描述（不变）

* `【限制】` 合并原 `【光影镜头】【风格】` 中的镜头/胶片/布光锚点为前置短语，与否定词列表合并

📖 \[社区提示词精华] 借鉴技法1「摄影器材作为风格锚点」与技法2「否定词集中在末尾」，将 `85mm f/1.4人像镜头 / 柔光箱45度主光 / 柯达Portra 400` 收敛为单句前置锚点，避免在 `【光影镜头】【风格】` 两段重复出现。

### Requirement: 前端 axios 超时配置

**原行为**：`useEditor.ts` 中 `axios.post('/api/edit', ...)` 未设置 `timeout`，依赖浏览器默认行为。

**新行为**：增加 `timeout: 100000`（100秒），略大于后端 90s 上限，确保后端完整返回错误响应而非被前端先掐断。

## REMOVED Requirements

（本次变更无移除）
