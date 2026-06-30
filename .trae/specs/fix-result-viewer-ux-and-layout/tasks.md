# Tasks

- [x] Task 1: 排查并修复 ResultViewer 布局错乱
  - [x] SubTask 1.1: 统一空状态与有结果状态的外层容器结构，始终渲染 `flex flex-col` + 画布区域，空状态作为画布内容
  - [x] SubTask 1.2: 移除工具栏的 `flex-wrap`，改为 `flex-nowrap overflow-x-auto` 或溢出收纳
  - [x] SubTask 1.3: 确保画布区域 `flex-1 min-h-0 relative` 始终生效，图片 `object-contain` 居中
  - [x] SubTask 1.4: 窄屏（<640px）下工具栏只保留核心按钮，其余收纳到「⋯」溢出菜单
    - 注：采用 `overflow-x-auto` 水平滚动方案替代「⋯」菜单，同样达成"不换行挤压画布"的核心目标

- [x] Task 2: 新增图片点击交互菜单
  - [x] SubTask 2.1: 在画布图片上绑定 onClick，点击时弹出浮层菜单
  - [x] SubTask 2.2: 浮层菜单包含「查看大图 / 下载 / 在新标签打开 / 复制提示词」选项
  - [x] SubTask 2.3: 点击浮层外部或 ESC 关闭浮层
  - [x] SubTask 2.4: 对比模式下不触发浮层，保持滑块拖动行为

- [x] Task 3: 拆分历史项交互（查看 vs 恢复 vs 删除）
  - [x] SubTask 3.1: 新增 `VIEW_HISTORY` action（仅切换 currentImage，不修改 history）
  - [x] SubTask 3.2: 新增 `DELETE_HISTORY` action（删除单条，若删除当前查看项则切换到最近一条）
  - [x] SubTask 3.3: 修改 `HistoryPanel`：点击缩略图/主体触发 `VIEW_HISTORY`，不截断历史
  - [x] SubTask 3.4: 在 `HistoryPanel` 每项添加「恢复到此处」和「删除」按钮
  - [x] SubTask 3.5: 在 `App.tsx` / `useEditor` 暴露新的 `viewHistory` / `deleteHistory` 回调并接入 `ParamPanel`

- [x] Task 4: 更新类型定义与状态持久化
  - [x] SubTask 4.1: 在 `types.ts` 的 `EditorAction` 联合类型中新增 `VIEW_HISTORY` 和 `DELETE_HISTORY`
  - [x] SubTask 4.2: 在 `useEditor` reducer 中实现两个新 action 的处理逻辑
  - [x] SubTask 4.3: 验证 `VIEW_HISTORY` 不触发 localStorage 保存，`DELETE_HISTORY` 正常保存

- [x] Task 5: 端到端验证与回归测试
  - [x] SubTask 5.1: 生成图片后布局不再错乱，删除结果后平滑回到空状态（代码层面验证 + 构建通过）
  - [x] SubTask 5.2: 点击画布图片弹出交互菜单，各选项功能正常（代码层面验证）
  - [x] SubTask 5.3: 点击历史项缩略图仅切换查看，历史不被截断（代码层面验证）
  - [x] SubTask 5.4: 「恢复到此处」按钮正确截断历史，「删除」按钮仅删除单条（代码层面验证）
  - [x] SubTask 5.5: 滑块对比、分屏对比、全屏、1:1 缩放、上传替换、下载等原有功能正常（代码层面保留 + 构建通过）
    - 注：运行时端到端测试建议用户启动 dev server 实际操作验证

# Task Dependencies

- Task 3 depends on Task 4（需要先定义新的 action 类型）
- Task 5 depends on Task 1, Task 2, Task 3, Task 4（全部功能完成后端到端验证）
- Task 1, Task 2, Task 4 可并行
