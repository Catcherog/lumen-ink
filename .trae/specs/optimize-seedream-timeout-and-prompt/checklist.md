# Checklist

- [x] `SeedreamProvider.ts` 中 `FETCH_TIMEOUT` 已由 50000 调整为 90000（默认）或 120000（2K 模式）
  - 验证：`src/server/services/providers/SeedreamProvider.ts:6` `const FETCH_TIMEOUT = 90000;`；`src/server/services/providers/SeedreamProvider.ts:7` `const FETCH_TIMEOUT_2K = 120000;`；`src/server/services/providers/SeedreamProvider.ts:104` 根据 `size` 选择超时
- [x] `vercel.json` 中 `api/index.ts` 的 `maxDuration` 已由 60 调整为 90
  - 验证：`vercel.json:11` `"maxDuration": 90`
- [x] `useEditor.ts` 的 `axios.post('/api/edit', ...)` 已设置 `timeout: 100000`
  - 验证：`src/client/src/hooks/useEditor.ts:192` `timeout: 100000,`
- [x] 超时抛错信息包含 `elapsed`（实际耗时 ms）与 `size` 参数
  - 验证：`src/server/services/providers/SeedreamProvider.ts:122-123` `const elapsed = Date.now() - startTime; throw Object.assign(new Error(\`Seedream API 请求超时（耗时 ${elapsed}ms，size=${size}），建议切换为 1080P 出图或稍后重试\`), { status: 504 });`
- [x] `EditRequest` 类型新增可选字段 `outputSize?: '1080P' | '2K'`
  - 验证：`src/shared/types.ts:44` 与 `src/server/shared-types.d.ts:56` 均含 `outputSize?: '1080P' | '2K';`
- [x] `/api/edit` 路由透传 `outputSize` 至 `provider.edit()` / `provider.generate()`
  - 验证：`src/server/routes/edit.ts:9` 解构 `outputSize`；`edit.ts:43` 传入 `provider.generate({ ..., outputSize })`；`edit.ts:46-54` 传入 `provider.edit({ ..., outputSize })`
- [x] `SeedreamProvider.edit()` / `generate()` 的 `size` 字段读取 `params.outputSize || '1080P'`，不再硬编码 `'2K'`
  - 验证：`SeedreamProvider.ts:158` (generate) `const size = params.outputSize || '1080P';`；`SeedreamProvider.ts:181` (edit) 同样；全文件无硬编码 `'2K'` 默认值
- [x] `SeedreamProvider` 入参 `image` 最大边超过 2048px 时自动等比压缩至 2048px
  - 验证：`SeedreamProvider.ts:36-57` `compressImage` 方法；`SeedreamProvider.ts:41` `longestEdge = Math.max(width, height)`；`SeedreamProvider.ts:47-54` 等比 resize；`SeedreamProvider.ts:197` `edit()` 中 `await this.compressImage(params.image, params.mimeType)`
- [x] 原图小于 2048px 时不触发压缩，原样透传
  - 验证：`SeedreamProvider.ts:43-45` `if (longestEdge <= maxEdge) { return { image, mimeType }; }`
- [x] `src/server/package.json` 已包含 `sharp` 依赖
  - 验证：`src/server/package.json:17` `"sharp": "^0.33.5"`
- [ ] `FaceBeautyPanel.buildPrompt()` 输出为 4 段结构（`【身份锚定】【保留】【修改】【限制】`），字符数 ≤ 260
  - 失败原因：4 段结构已满足（`src/client/src/components/tools/FaceBeautyPanel.tsx:98-103`），但字符数超标。目标过严，实际 294 字符（all=100 时），较原 339 已瘦身 13%。自然预设（natural preset）下为 325 字符。spec 目标 ≤260 未能达成，建议放宽至 ≤300 或继续精简 IDENTITY_ANCHOR/STYLE_ANCHOR 文案。
- [x] `LIGHTING_ANCHOR` 与 `PHOTO_ANCHOR` 已合并为单一 `STYLE_ANCHOR`，不再在两段中重复出现
  - 验证：`FaceBeautyPanel.tsx:19` `const STYLE_ANCHOR = ...`；`ToolPanel.tsx:10` `const STYLE_ANCHOR = ...`；两文件中已无 `LIGHTING_ANCHOR` / `PHOTO_ANCHOR` / `【光影镜头】` / `【风格】`。
  - 备注：项目内仍有 4 个**未在本次 Spec 范围内**的面板保留旧锚点（`LiquifyPanel.tsx`、`ColorMatchingPanel.tsx`、`RemovePeoplePanel.tsx`、`CleanupPanel.tsx`），如需全局统一可后续追加迭代。
- [x] `RepairToolPanel` / `RemoveToolPanel` / `ExportToolPanel` 三个子面板的提示词已同步瘦身
  - 验证：`ToolPanel.tsx:21-26`（Repair）、`ToolPanel.tsx:67-72`（Remove）、`ToolPanel.tsx:105-110`（Export）均为 4 段结构（`【身份锚定】【保留】【修改】【限制】`），均引用 `STYLE_ANCHOR` 与 `QUALITY_ANCHOR`
- [ ] 本地端到端测试：4000×3000 测试图 + 人脸美化工具，1080P 模式在 45s 内返回成功
  - 需手动验证：会消耗真实 API 配额，未执行
- [ ] 本地端到端测试：2K 模式在 90s 内返回成功，超时阈值生效
  - 需手动验证：会消耗真实 API 配额，未执行
- [ ] 实际请求 body 抓包验证：prompt 字符数较优化前减少 ≥ 30%，image 体积较优化前减少 ≥ 50%（针对大图场景）
  - 需手动验证：会消耗真实 API 配额，未执行。代码层 prompt 字符数降幅约 13%（339→294），未达 30% 目标；image 压缩逻辑（最大边 2048）已就位，大图场景体积降幅预计可达成。
- [ ] 超时场景验证：错误信息形如 `Seedream API 请求超时（耗时 XXXXXms，size=XX），建议切换为 1080P 出图或稍后重试`
  - 需手动验证：会消耗真实 API 配额，未执行真实超时触发。但代码层模板已严格匹配（`SeedreamProvider.ts:123`），格式无误，仅需运行时确认。

---

## 附：构建与类型检查验证（额外执行）

- [x] `cd src/server && npx tsc --noEmit` 后端 TypeScript 编译通过（exit 0，无错误）
- [x] `cd src/client && npx tsc --noEmit` 前端 TypeScript 编译通过（exit 0，无错误）
- [x] `cd src/server && npm run build` 后端构建成功（tsc 输出 dist/）
- [x] `cd src/client && npm run build` 前端构建成功（vite 输出 dist/index.html + assets/index-*.js 340.86 kB / css 40.89 kB）
