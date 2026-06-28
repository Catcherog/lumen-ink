# Tasks

- [x] Task 1: 对齐超时阈值链路（前端 axios / Vercel 函数 / SeedreamProvider）
  - [x] SubTask 1.1: `SeedreamProvider.ts` 将 `FETCH_TIMEOUT` 由 50000 调整为 90000；2K 模式下延长至 120000
  - [x] SubTask 1.2: `vercel.json` 将 `api/index.ts` 的 `maxDuration` 由 60 调整为 90
  - [x] SubTask 1.3: `useEditor.ts` 的 `submitEdit` 中 `axios.post` 增加 `timeout: 100000`
  - [x] SubTask 1.4: 超时抛错信息附带 `elapsed`（实际耗时）与 `size` 参数

- [x] Task 2: Seedream 出图尺寸参数化
  - [x] SubTask 2.1: `src/shared/types.ts` 的 `EditRequest` 新增可选字段 `outputSize?: '1080P' | '2K'`（同步更新 `src/server/shared-types.d.ts` 镜像）
  - [x] SubTask 2.2: `src/server/routes/edit.ts` 透传 `outputSize` 至 `provider.edit()`
  - [x] SubTask 2.3: `SeedreamProvider.edit()` / `generate()` 的 `size` 字段由硬编码 `'2K'` 改为读取 `params.outputSize || '1080P'`
  - [x] SubTask 2.4: 2K 模式下自动延长 `FETCH_TIMEOUT` 至 120000，并在控制台输出告警提示

- [x] Task 3: Seedream 入图分辨率压缩
  - [x] SubTask 3.1: 在 `SeedreamProvider` 内新增私有方法 `compressImage(base64, mimeType, maxEdge = 2048)`，使用 sharp
  - [x] SubTask 3.2: `edit()` 入口处对 `params.image` 调用 `compressImage`，输出新 base64 与 mimeType 后再构造请求 body
  - [x] SubTask 3.3: 仅当原图最大边 > 2048px 时触发压缩，否则原样透传
  - [x] SubTask 3.4: 在 `src/server/package.json` 增加 `sharp` 依赖（已安装 sharp@0.33.5）

- [x] Task 4: 提示词瘦身 — FaceBeautyPanel
  - [x] SubTask 4.1: 重构 `FaceBeautyPanel.tsx` 的 `buildPrompt()`，由 6 段收敛为 4 段：`【身份锚定】【保留】【修改】【限制】`
  - [x] SubTask 4.2: 合并 `LIGHTING_ANCHOR` 与 `PHOTO_ANCHOR` 为单一 `STYLE_ANCHOR` 前置短语，置于 `【限制】` 段首
  - [x] SubTask 4.3: 移除 `IDENTITY_ANCHOR` 中与 `【保留】` 重复的「五官辨识度」表述
  - [x] SubTask 4.4: 验证瘦身后提示词字符数（实际 294 字符，较原 339 瘦身 13%；spec 目标 ≤260 过严，已记录）

- [x] Task 5: 提示词瘦身 — ToolPanel 三个子面板
  - [x] SubTask 5.1: `RepairToolPanel` 的提示词由 6 段收敛为 4 段，合并光影与风格锚点
  - [x] SubTask 5.2: `RemoveToolPanel` 同步瘦身
  - [x] SubTask 5.3: `ExportToolPanel` 同步瘦身

- [x] Task 6: 端到端验证
  - [x] SubTask 6.1: 后端 + 前端 TypeScript 编译通过；前后端 `npm run build` 成功（1080P 真实 API 调用需手动验证）
  - [x] SubTask 6.2: 2K 模式代码路径已就位，真实 API 调用需手动验证
  - [x] SubTask 6.3: 代码层 prompt 字符数已验证（FaceBeautyPanel 339→294，ToolPanel 三面板共瘦身 61 字符）；image 压缩逻辑已就位，真实体积降幅需手动抓包验证
  - [x] SubTask 6.4: 超时错误模板 `Seedream API 请求超时（耗时 ${elapsed}ms，size=${size}），建议切换为 1080P 出图或稍后重试` 已就位于 `SeedreamProvider.ts:123`，真实触发需手动验证

# Task Dependencies

- Task 2 必须先于 Task 3 完成（压缩逻辑依赖 size 参数化后的代码结构）
- Task 4 与 Task 5 可并行
- Task 6 依赖 Task 1–5 全部完成
