# BASE-001 补充扫描｜面板与配置事实表

> 扫描时间：2026-07-16
> 扫描范围：PromptInput、ColorMatchingPanel、LiquifyPanel、CleanupPanel、RemovePeoplePanel、package.json、ESLint 配置

---

## 1. PromptInput.tsx

| 维度 | 事实 |
|------|------|
| 参数字段 | `prompt: string` 默认 `''`；Props: `onSubmit`（必填）、`isLoading`（必填）、`placeholder` 默认 `'输入编辑指令...'`、`externalPrompt?`、`onPromptConsumed?`、`onPromptChange?` |
| 独立提交按钮 | 是。提交按钮 + Enter 键提交（Shift+Enter 换行） |
| 提示词生成位置 | 无生成逻辑，纯文本输入框 |
| onSubmit 调用 | `handleSubmit()` → `onSubmit(prompt.trim())`，仅传 prompt 字符串 |
| 直接修改全局状态 | 否，通过 props 回调 |
| 重复逻辑 | 通用输入组件，`externalPrompt` 同步模式在 ToolPanelProps 中复用 |

## 2. ColorMatchingPanel.tsx

| 维度 | 事实 |
|------|------|
| 参数字段 | `referenceImages` 最多 1 张；`description: string` 默认 `''` |
| 独立提交按钮 | 是。底部"应用"按钮（amber），`disabled={state.isLoading}` |
| 提示词生成 | `buildPrompt()` 6 段式：身份锚定+保留+修改+光影镜头+风格+限制。硬编码常量：IDENTITY_ANCHOR、LIGHTING_ANCHOR（5500K）、QUALITY_ANCHOR、styleAnchor（85mm f/1.4, 富士Pro 400H, 柯达Portra） |
| onSubmit 调用 | `onSubmit(prompt, { tool: 'color', params, referenceImages })` |
| 直接修改全局状态 | 否 |
| 重复逻辑 | IDENTITY_ANCHOR/LIGHTING_ANCHOR/QUALITY_ANCHOR 与 LiquifyPanel 完全重复；6 段式结构一致 |

## 3. LiquifyPanel.tsx

| 维度 | 事实 |
|------|------|
| 参数字段 | `features: Record<LiquifyFeature, { enabled: boolean, strength: number }>`，strength 范围 0-100，默认 30。6 个 feature: faceSmall/jawLine/noseShrink/philtrumShort/shoulderNarrow/bodyShape |
| 独立提交按钮 | 是。底部"应用"按钮（cyan），`disabled={state.isLoading}` |
| 提示词生成 | `buildPrompt()` 6 段式（与 ColorMatchingPanel 结构一致）。强度映射：`<30` 轻微、`<55` 适度、`<80` 明显、`>=80` 大幅 |
| onSubmit 调用 | `onSubmit(prompt, { tool: 'liquify', params })` |
| 直接修改全局状态 | 否 |
| 重复逻辑 | 锚点常量与 ColorMatchingPanel 完全重复；"应用"按钮模式重复 |

## 4. CleanupPanel.tsx

| 维度 | 事实 |
|------|------|
| 参数字段 | `mode: 'auto'\|'manual'` 默认 `'auto'`；`selectionMode: 'rect'\|'brush'` 默认 `'rect'`；`brushSize: number` 默认 40，范围 10-120；`regions: Region[]`；`description: string` |
| 独立提交按钮 | 是。底部"应用"按钮（violet），手动模式无选区时禁用 |
| 提示词生成 | `buildPrompt()` 4 段式：保留+修改+风格+限制（无身份锚定和光影镜头） |
| onSubmit 调用 | `onSubmit(prompt, { tool: 'repair', params, regions })` |
| 直接修改全局状态 | 否 |
| 重复逻辑 | `imageSrc` useMemo 与 RemovePeoplePanel 完全相同；auto/manual tabs 与 RemovePeoplePanel 高度相似 |

## 5. RemovePeoplePanel.tsx

| 维度 | 事实 |
|------|------|
| 参数字段 | `mode` 默认 `'auto'`；`manualRegions`/`detectedRegions`/`selectedDetectedIds`；`isDetecting`/`detectError`；`description` |
| 独立提交按钮 | 是。按钮文案随 mode 变化（auto: "确认并去除"，manual: "应用"） |
| 提示词生成 | `buildPrompt()` 4 段式（与 CleanupPanel 结构一致） |
| onSubmit 调用 | `onSubmit(prompt, { tool: 'remove', params, regions })` |
| 直接修改全局状态 | 否。**但独特**：`handleDetect()` 内嵌 `axios.post('/api/detect/people')`，是唯一内嵌 API 调用的面板 |
| 重复逻辑 | `imageSrc` useMemo 与 CleanupPanel 完全相同；模式切换 tabs 重复 |

---

## 6. 跨文件重复逻辑汇总

| 重复模式 | 涉及文件 | 严重程度 |
|----------|----------|----------|
| 锚点常量 IDENTITY/LIGHTING/QUALITY_ANCHOR | ColorMatching、Liquify | 完全相同字面量 |
| 6 段式提示词结构 | ColorMatching、Liquify | 结构一致 |
| 4 段式提示词结构 | Cleanup、RemovePeople | 结构一致 |
| imageSrc useMemo | Cleanup、RemovePeople | 代码完全相同 |
| auto/manual tabs UI | Cleanup、RemovePeople | 几乎完全相同 |
| "应用"按钮 + spinner | 全部 4 个工具面板 | 结构相同，颜色不同 |

## 7. 测试基础设施扫描

| 检查项 | 修复前 | 修复后 |
|--------|--------|--------|
| 测试框架 | 无 | vitest（client + server） |
| 测试脚本 | 无 | client/server/root 均有 `npm test` |
| 测试文件 | 0 | 2 个（image.test.ts, operationType.test.ts） |
| 测试数量 | 0 | 13 个（client 5 + server 8） |

## 8. 关键架构发现

1. **ToolPanelProps 是统一接口**：所有工具面板实现 `ToolPanelProps`，`onSubmit: (prompt, options?) => void`
2. **无直接全局状态修改**：5 个组件均通过 `onSubmit` 回调，唯一例外是 RemovePeoplePanel 内嵌 API 调用
3. **提示词全部客户端生成**：所有 `buildPrompt` 在前端执行，服务端只接收最终字符串
4. **无测试基础设施**：修复前完全没有测试框架、配置和文件
