# UI-001 Trae 实施报告

## 任务元数据

- **任务 ID**: UI-001
- **任务名**: V2 工作台外壳
- **执行者**: Trae
- **实施日期**: 2026-07-17
- **状态**: awaiting_gpt_acceptance
- **仓库**: https://github.com/Catcherog/lumen-ink.git
- **分支**: `lumen/ui-001-trae`
- **前置依赖**: BASE-001 已通过 GPT 验收（`MVP_PASS_WITH_DEBT`，2026-07-17）
- **阻塞关系**: UI-001 通过前禁止 FLOW-001 / STORAGE-001 / VERSION-001 / JOB-001

## 1. 执行摘要

按 `docs/lumen-v2/tasks/active/UI-001.md` 规格，建立可回滚的 V2 工作台外壳：

- 新增 `VITE_EDITOR_V2` feature flag，Legacy 与 `AppV2` 并存；
- 顶栏展示项目上下文，不展示 Provider / 模型 / API Key；
- 左侧任务栏 72px，始终显示文字标签；
- 中央复用 `ResultViewer` 与 `ImageUploader`，支持 EMPTY / READY；
- 右侧建立 360px 上下文面板容器；
- 底部建立版本区结构占位；
- 1440×900 / 1280×800 截图验证无横向溢出；
- 未修改 Provider、API、Prompt 和生成结果逻辑。

## 2. Feature flag

### 配置

`.env.example` 新增：

```bash
# ===== Feature flags =====
# V2 工作台外壳开关（本地/Preview 可设为 true；Production 未设置时必须为 false）
VITE_EDITOR_V2=false
```

真实 `.env` 不提交。本地开发时可在 `src/client/.env.local` 中写入 `VITE_EDITOR_V2=true` 启用 V2。

### 入口切换

`src/client/src/main.tsx`：

```tsx
const enableV2 = import.meta.env.VITE_EDITOR_V2 === 'true';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {enableV2 ? <AppV2 /> : <App />}
  </StrictMode>,
);
```

### 回滚方式

- 删除或置空 `VITE_EDITOR_V2`，或设为 `false`，重启 client dev server 即回滚到 Legacy；
- 生产环境未设置该变量时，默认进入 Legacy，符合 D-010 决策。

## 3. 新增组件

| 文件 | 职责 |
|------|------|
| `src/client/src/AppV2.tsx` | V2 主布局，整合 header / rail / main / context panel / version strip，复用 `useEditor`、`ResultViewer`、`ApiSettingsModal`、登录态 |
| `src/client/src/components/v2/EditorHeader.tsx` | 顶栏：光砚标识、项目名、当前会话标签、对比/导出/设置入口、主题切换、退出登录 |
| `src/client/src/components/v2/TaskRail.tsx` | 左栏：项目 / 人物 / 色彩 / 清理 / 局部 / 导出，固定文字标签 + 图标 |
| `src/client/src/components/v2/ContextPanel.tsx` | 右侧面板容器：360px 宽，顶部显示 FLOW-001 临时兼容提示，内部复用 `ParamPanel` |
| `src/client/src/components/v2/VersionStripPlaceholder.tsx` | 底部版本区占位：显示“版本记录将在 VERSION-001 启用” |

## 4. 临时债务

按 UI-001 规格第 4 节，本轮不实现 EditRecipe 和单一 CTA：

- V2 右侧面板仍通过 `ParamPanel` 展示原有“应用/提交”按钮；
- `ContextPanel.tsx` 顶部以琥珀色提示条明确标注：
  > 此区域为 FLOW-001 临时兼容区：当前“应用/提交”按钮与参数面板将在配方模型完成后收敛为单一“生成预览”操作。
- 该债务将在 FLOW-001 中处理，不在 UI-001 顺手修复。

## 5. 验证结果

执行全部 baseline 命令，EXIT_CODE = 0：

| 命令 | 结果 |
|------|------|
| `npm run lint --prefix src/client` | 0 errors / 0 warnings |
| `npm run test --prefix src/client` | 1 file, 5 passed |
| `npm run test --prefix src/server` | 2 files, 16 passed |
| `npm run build` | client `tsc -b && vite build` 通过；server `tsc` 通过 |

## 6. 证据文件

位于 `docs/lumen-v2/evidence/UI-001/`：

| 文件 | 说明 |
|------|------|
| `legacy-1440x900.png` | Legacy 界面，1440×900，验证 flag 关闭时不变 |
| `v2-empty-1440x900.png` | V2 未上传状态，1440×900，验证 EMPTY 布局 |
| `v2-ready-1440x900.png` | V2 已上传状态，1440×900，验证 READY 布局 |
| `v2-ready-1280x800.png` | V2 已上传状态，1280×800，验证较小分辨率可用 |

截图在本地 dev server 运行、登录成功后捕获；未包含真实客户照片或敏感信息。

## 7. 修改文件清单

### 生产代码

- `src/client/src/main.tsx` — 根据 `VITE_EDITOR_V2` 切换 `App` / `AppV2`
- `src/client/src/AppV2.tsx` — 新增 V2 主布局
- `src/client/src/components/v2/EditorHeader.tsx` — 新增
- `src/client/src/components/v2/TaskRail.tsx` — 新增
- `src/client/src/components/v2/ContextPanel.tsx` — 新增
- `src/client/src/components/v2/VersionStripPlaceholder.tsx` — 新增

### 配置

- `.env.example` — 新增 `VITE_EDITOR_V2=false`

### 文档与状态

- `docs/lumen-v2/reports/UI-001-TRAE-REPORT.md` — 本文件
- `docs/lumen-v2/evidence/UI-001/` — 截图证据
- `docs/lumen-v2/state/STATE.json` — 推进至 `awaiting_gpt_acceptance / nextActor=gpt`
- `docs/lumen-v2/state/SESSION-HANDOFF.md` — 更新本轮摘要
- `docs/lumen-v2/state/PROJECT-MEMORY.md` — 更新当前状态
- `docs/lumen-v2/state/DECISION-LOG.md` — 追加 UI-001 相关决策
- `docs/lumen-v2/state/CHANGELOG.md` — 追加 UI-001 实施条目
- `docs/lumen-v2/prompts/NEW-WINDOW-GPT.md` — 固定模板，无需替换占位符

## 8. 已知限制与回滚

- 任务栏当前所有项映射到同一底层 `RetouchTool`（`face`），仅用于外壳占位；具体工具路由与参数收敛在 FLOW-001 实现；
- 右侧面板仍为旧 `ParamPanel`，存在“应用/提交”双 CTA，已标记为 FLOW-001 临时债务；
- 版本区为纯占位，无真实版本数据；
- 回滚：将 `VITE_EDITOR_V2` 设为 `false` 或删除该变量，即可恢复 Legacy 界面。

## 9. 未涉及范围

按 UI-001 规格，本轮未修改：

- Provider 配置与 API 调用逻辑
- Prompt 构建逻辑
- 图像生成/编辑结果逻辑
- `docs/ai/` 目录（按 DF-RULES-01 债务约束，由独立 docs-only 任务处理）
