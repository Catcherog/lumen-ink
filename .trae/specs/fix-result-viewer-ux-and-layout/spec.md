# 修复结果查看器布局错乱与交互体验 Spec

## Why

用户反馈每次图片生成完成后，整个页面显示和 UI 就突然不正常了（布局错乱），只有删除生成的结果后才会恢复正常。同时，生成的图片在画布上或历史中单击一下就直接消失或被替换，缺少「查看大图 / 保存 / 下载 / 删除」等常见图片交互选项，不符合用户对图片编辑工具的预期。

## What Changes

- **修复布局错乱**：排查并修复 `ResultViewer` 在「无结果 → 空状态」与「有结果 → 工具栏 + 画布」两种模式切换时导致的布局异常。统一两种状态的外层容器结构，避免 DOM 结构突变引发的样式抖动。
- **精简工具栏溢出**：`ResultViewer` 顶部工具栏按钮过多（结果/原图/对比 + 滑块/分屏 + 上传/缩放/全屏/打开原图/下载 + lastCallMeta 文本），在窄屏下 `flex-wrap` 反复换行会挤压画布高度。改为不换行 + 溢出收纳，并隐藏非关键元信息。
- **新增图片交互菜单**：点击画布上的生成结果图片时，弹出操作浮层（查看大图 / 下载 / 复制 / 在新标签打开 / 设为当前结果），而不是让图片消失。
- **修正历史项交互**：当前点击历史项任意位置会触发 `onRestore`，且 `RESTORE_FROM_HISTORY` 会执行 `history.slice(0, index)` 截断后续历史，导致「单击一下就没了」的误操作。改为：点击历史项缩略图只「切换查看」该项结果（不截断历史），并显式提供「恢复到此处」和「删除此项」按钮。
- **保留功能**：保留原有的滑块对比、分屏对比、全屏、1:1 缩放、上传替换、下载等全部已有能力。

## Impact

- Affected specs:
  - `build-gemini-image-editor`（结果查看器与画布交互相关需求）
  - `beautify-ui-add-api-integrations-and-retouch-tools`（UI 美化与工具面板）
- Affected code:
  - `src/client/src/components/ResultViewer.tsx`（主要改动：布局修复 + 图片交互菜单）
  - `src/client/src/components/HistoryPanel.tsx`（交互重构：切换查看 vs 恢复 vs 删除）
  - `src/client/src/hooks/useEditor.ts`（新增 `VIEW_HISTORY` action 用于仅切换查看不截断；新增 `DELETE_HISTORY` action 用于删除单条历史）
  - `src/shared/types.ts`（新增 `EditorAction` 类型：`VIEW_HISTORY` / `DELETE_HISTORY`）
  - `src/client/src/App.tsx`（传递新的 history 操作回调）

---

## ADDED Requirements

### Requirement: 生成结果图片支持点击交互菜单

系统 SHALL 在画布上点击生成的结果图片时，弹出操作浮层，提供查看、保存、复制等选项，而不是让图片消失或被替换。

#### Scenario: 点击画布上的结果图片
- **WHEN** 用户在画布区域点击生成的结果图片（非对比模式、非加载中）
- **THEN** 弹出一个浮层菜单，包含至少以下选项：
  - 「查看大图」（进入全屏查看模式）
  - 「下载」（触发下载，行为同现有下载按钮）
  - 「在新标签页打开」（`window.open` 打开图片 URL）
  - 「复制提示词」（将本次生成的提示词复制到剪贴板，若有 `lastCallMeta`）
- **THEN** 点击浮层外部区域可关闭浮层
- **THEN** 浮层不遮挡图片主体，定位在点击位置附近或图片角落

#### Scenario: 对比模式下不触发浮层
- **WHEN** 当前处于对比模式（`effectiveViewMode === 'compare'`）
- **THEN** 点击图片不弹出浮层，保持滑块拖动行为

---

### Requirement: 历史项支持「仅查看」与「恢复到此处」分离

系统 SHALL 将历史项的「切换查看该项结果」与「恢复到该项（截断后续历史）」拆分为两个独立操作，避免用户误点击导致历史丢失。

#### Scenario: 点击历史项缩略图仅切换查看
- **WHEN** 用户点击历史项的缩略图或主体区域
- **THEN** 仅将画布的 `currentImage` / `currentImageUrl` 切换为该项结果，不修改 `history` 数组
- **THEN** 该项标记为「当前查看」高亮状态
- **THEN** 不截断后续历史记录

#### Scenario: 显式恢复到某历史项
- **WHEN** 用户点击历史项上的「恢复到此处」按钮
- **THEN** 将 `history` 截断到该项（含该项），`currentImage` 切换为该项结果
- **THEN** 弹出确认提示或直接执行（依据实现选择，推荐直接执行 + Toast 提示）

#### Scenario: 删除单条历史项
- **WHEN** 用户点击历史项上的「删除」按钮
- **THEN** 仅从 `history` 数组中移除该项，不影响其他历史
- **THEN** 若删除的是当前查看项，自动切换查看为最近的一条历史或清空画布

---

## MODIFIED Requirements

### Requirement: ResultViewer 布局在结果状态切换时保持稳定

系统 SHALL 保证从空状态切换到有结果状态（或反向切换）时，外层容器结构与尺寸不发生突变，避免页面抖动或布局错乱。

#### Scenario: 首次生成结果
- **WHEN** 用户首次生成图片完成，`resultImage` 从 null 变为有值
- **THEN** `ResultViewer` 根容器结构保持 `flex flex-col` + `min-h-0`，画布区域始终占据剩余空间
- **THEN** 工具栏不换行挤压画布，按钮溢出时收纳到「更多」菜单或隐藏非关键项
- **THEN** 画布区域的 `flex-1 min-h-0 relative` 始终生效，图片 `object-contain` 居中显示

#### Scenario: 清除结果回到空状态
- **WHEN** 用户删除当前结果或切换到无结果状态
- **THEN** 画布区域平滑切换为空状态占位（上传引导），不出现闪烁或高度塌陷

#### Scenario: 工具栏窄屏适配
- **WHEN** 画布宽度小于 640px
- **THEN** 工具栏只保留核心按钮（结果/原图/对比 + 下载），其余收纳到「⋯」溢出菜单
- **THEN** `lastCallMeta` 文本在小于 lg 屏幕时隐藏（现有逻辑已 `hidden lg:inline`，保留）

---

### Requirement: ResultViewer 顶部工具栏不换行

系统 SHALL 保证 `ResultViewer` 顶部工具栏在任意宽度下不使用 `flex-wrap` 换行，避免按钮挤占画布高度。

#### Scenario: 工具栏按钮过多
- **WHEN** 视图模式、对比模式、缩放、全屏、下载等按钮同时显示
- **THEN** 工具栏使用 `flex-nowrap` + `overflow-x-auto` 或溢出收纳，不换行
- **THEN** 画布高度始终为容器高度减去工具栏单行高度

---

## 技术要点

1. **布局根因排查**：`ResultViewer` 空状态（`!displaySrc && !resultText && !isLoading`）返回单层 `div.w-full.h-full.flex.flex-col`，而有结果状态返回 `div.w-full.h-full.min-h-0.flex.flex-col` + 工具栏 + 画布。两套结构差异 + 工具栏 `flex-wrap` 是布局抖动的首要嫌疑点。统一为始终渲染外层 `flex flex-col` 容器，空状态作为画布区域的内容而非替换整个组件树。

2. **历史 action 拆分**：
   - 新增 `VIEW_HISTORY`：仅设置 `currentImage/currentImageUrl/currentMimeType`，不修改 `history`
   - 新增 `DELETE_HISTORY`：从 `history` 中过滤掉指定 id，若删除的是当前查看项则切换到最近一条
   - 保留 `RESTORE_FROM_HISTORY`：显式截断（恢复到此处），由独立按钮触发

3. **图片交互菜单实现**：使用绝对定位浮层 + `onClick` 监听画布图片，点击时记录点击坐标并显示菜单。点击外部或 ESC 关闭。复用现有 `handleDownload` / `toggleFullscreen` / `handleOpenOriginal` 逻辑。

4. **localStorage 历史持久化**：`useEditor` 现有 `useEffect` 在 `state.history` 变化时保存轻量版历史。新增的 `VIEW_HISTORY` 不改变 `history`，不触发保存；`DELETE_HISTORY` 改变 `history`，正常触发保存。

5. **回归保护**：保留滑块对比、分屏对比、全屏、1:1 缩放、上传替换、下载、原图查看、移动端面板等全部现有能力，仅调整触发入口与布局稳定性。
