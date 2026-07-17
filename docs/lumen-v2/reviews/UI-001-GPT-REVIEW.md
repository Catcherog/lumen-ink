# UI-001 GPT 验收报告

- 任务 ID：`UI-001`
- 验收日期：2026-07-17（Asia/Shanghai）
- 审查分支：`lumen/ui-001-trae`
- 审查 commit：`9dd28359d5c6386f4833fbcd01870eb617fcdadb`
- 结论：`MVP_FAIL`
- 验收方式：本地 commit/diff 静态审查、4 张原始截图复核、7 条基线命令重跑、公开仓库安全扫描、PR 入口只读核查

## 证据与验证

- [x] commit 范围：17 个文件；生产代码仅涉及 V2 外壳和入口切换，未修改 server、Provider 实现、API 路由、Prompt 或存储代码。
- [x] Feature flag：仅当 `import.meta.env.VITE_EDITOR_V2 === 'true'` 时进入 V2；变量缺失或为 `false` 时进入 Legacy。
- [x] 视觉证据：`legacy-1440x900.png`、`v2-empty-1440x900.png`、`v2-ready-1440x900.png`、`v2-ready-1280x800.png` 均已按原始分辨率复核。
- [x] client lint：`EXIT_CODE=0`，0 errors / 0 warnings。
- [x] client typecheck：`npx tsc --noEmit -p src/client/tsconfig.json`，`EXIT_CODE=0`。
- [x] client test：1 file / 5 tests passed。
- [x] server typecheck：`npx tsc --noEmit -p src/server/tsconfig.json`，`EXIT_CODE=0`。
- [x] server test：2 files / 16 tests passed。
- [x] root test：client 5 + server 16，`EXIT_CODE=0`。
- [x] root build：client `tsc -b && vite build`、server `tsc` 均通过。
- [x] 公开仓库安全扫描：`node scripts/check-lumen-collab.mjs` 通过。
- [ ] PR/CI（非阻塞流程提醒）：回传链接为 `/pull/new/lumen/ui-001-trae` 创建页，不是带编号的实际 PR；当前环境 `gh` 未认证，未取得该任务的 CI checks 证据。

## 验收项

| 验收项 | 结果 | 证据 | 缺陷 ID |
|---|---|---|---|
| 状态允许 GPT 验收 | 通过 | `STATE.json` 为 `awaiting_gpt_acceptance / nextActor=gpt` | — |
| Legacy 默认与可回滚 | 通过 | `main.tsx` 严格比较字符串 `true`；`.env.example` 默认 `false` | — |
| V2 EMPTY / READY 布局 | 通过 | 1440×900 EMPTY、1440×900 READY、1280×800 READY 截图 | — |
| 无横向溢出 | 通过 | 两个目标分辨率截图未见横向裁切或滚动条 | — |
| 顶栏隐藏 Provider/模型/API Key | 通过 | `EditorHeader.tsx` 与截图 | — |
| 顶栏对比、导出、设置入口真实可用 | **失败** | `AppV2.tsx` 只传入 `onSettings`；`onCompare`、`onExport` 为 `undefined`，可见按钮点击无行为 | UI001-P0-01 |
| 左栏文字标签稳定 | 部分通过 | 六个标签始终显示，但“项目/人物”共享 `face` 导致同时高亮 | UI001-P0-02 |
| UI-001 不实现真实工具路由 | **失败** | `TaskRail.tsx` 会调用 `setTool(color/remove/repair/export)`；与 D-020、报告“所有项映射同一占位工具”及 UI-001 外壳边界矛盾 | UI001-P0-02 |
| 右侧 360px 容器与 FLOW-001 债务提示 | 通过 | `ContextPanel.tsx` 与截图 | — |
| 版本区不伪造版本 | 通过 | 仅显示“版本记录将在 VERSION-001 启用” | — |
| 本轮未改 Provider/API/Prompt/存储实现 | 通过 | commit 文件范围无相关实现文件 | — |
| 可审计 PR 与 CI | 非阻塞提醒 | 只提供 PR 创建页；本轮以本地 commit、7 条命令和安全扫描完成关键验收 | PROCESS-PR-01 |

## P0 阻塞问题

### UI001-P0-01：顶栏“对比/导出”是空入口

`EditorHeader` 渲染两个可交互按钮，但 `AppV2` 没有传入 `onCompare` 与 `onExport`。这既未形成任务要求的真实入口，也属于规格禁止的“为了看起来完成而使用空按钮”。中央 `ResultViewer` 内另有真实能力，不能使顶栏空按钮自动成立。

最低修复要求：将顶栏入口连接到现有真实对比/导出能力；不可使用 DOM 查询、伪事件、空回调或仅弹出“即将支持”的假实现。无图片/无结果时应有明确禁用状态；满足条件时应可触发真实行为。

### UI001-P0-02：任务栏越界改变底层工具，且选择状态与报告不一致

`TaskRail` 的“色彩/清理/局部/导出”会分别调用 `setTool('color'/'remove'/'repair'/'export')`，已经产生真实工具路由；“项目/人物”又共享 `face`，导致截图中两项同时高亮。该行为与 UI-001“只做结构外壳”、D-020 及 Trae report 的占位声明直接矛盾。

最低修复要求：任务栏使用独立的 V2 展示选择状态，保证任一时刻最多一个标签高亮；UI-001 不通过标签切换底层 `RetouchTool`。旧 `ParamPanel` 继续使用明确的兼容工具，真实任务到工具/Recipe 的映射留给 FLOW-001。同步修正报告和 D-020，使文档与代码事实一致。

## FIX_PACKET

```yaml
packet_type: FIX_PACKET
task_id: UI-001
stage: MVP
review_target: 9dd28359d5c6386f4833fbcd01870eb617fcdadb
decision: MVP_FAIL
fix_scope:
  - id: UI001-P0-01
    requirement: 将顶栏对比与导出入口接入 ResultViewer 的真实能力，并覆盖不可用状态。
  - id: UI001-P0-02
    requirement: 将任务栏展示选择与 RetouchTool 解耦，消除双高亮和 UI-001 越界路由；同步纠正文档。
verification:
  - npm run lint --prefix src/client
  - npx tsc --noEmit -p src/client/tsconfig.json
  - npm test --prefix src/client
  - npx tsc --noEmit -p src/server/tsconfig.json
  - npm test --prefix src/server
  - npm test
  - npm run build
  - node scripts/check-lumen-collab.mjs
  - 手工验证顶栏对比/导出可触发真实行为，EMPTY/无结果时状态明确
  - 手工验证六个任务标签始终显示、任一时刻最多一个高亮、点击不改变底层 RetouchTool
  - 重新提供 Legacy 1440x900、V2 EMPTY 1440x900、V2 READY 1440x900、V2 READY 1280x800 截图
constraints:
  - 只修复以上 P0 及直接回归
  - 不提前实现 FLOW-001 的 EditRecipe、五档参数或单一生成 CTA
  - 不修改 Provider、API、Prompt、生成结果或存储实现
  - 不覆盖或提交当前工作区中与 UI-001 无关的既有修改
```

非阻塞流程提醒：修复完成后建议创建实际 PR 并回传编号/URL；这不属于本轮最小跑通的 P0 修复范围。

## 裁决与状态处理

结论：`MVP_FAIL`。

- `UI-001` 保持在 `tasks/active/`；
- `STATE.status` 改为 `changes_requested`；
- `STATE.nextActor` 改为 `trae`；
- `STATE.latestGptReview` 指向本报告；
- FLOW-001 及后续任务继续阻塞，不激活下一任务；
- Trae 只处理 FIX_PACKET 中的 P0 与直接回归，修复后重新进入 `awaiting_gpt_acceptance / nextActor=gpt`。
