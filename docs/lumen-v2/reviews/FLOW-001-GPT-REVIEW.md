# FLOW-001 GPT 验收报告

## 首轮验收（端到端扩大执行包）

- 验收日期：2026-07-18（Asia/Shanghai）
- 审查分支：`lumen/flow-001-trae`
- 审查 commit：`2574abf`
- 结论：`MVP_FAIL`
- 验收方式：风险 diff、关键数据流审查、统一 8 条门禁独立重跑；未重复 UI-001 视觉证据

## 已通过项

- EditRecipe、五档参数、5 项保护项、版本化 Prompt 编译器 v1 已落地。
- V2 右栏只有一个模型调用主 CTA；旧 ParamPanel/PromptInput 的“应用/提交”入口未进入 V2。
- Prompt 经 `compilePrompt` 后进入 `submitEdit`；Provider/API/存储实现未被修改。
- 任务栏受控单一高亮，project 任务禁用，loading 状态禁用。
- 本轮独立重跑 8 条门禁全部 `EXIT_CODE=0`：client lint、client/server typecheck、client 76 tests、server 16 tests、root 92 tests、build、安全扫描。

## P0 阻塞问题

### FLOW001-P0-01：URL 结果后二次编辑提交旧 base64

`SET_RESULT` 在仅返回 `imageUrl` 时把 `currentImageUrl` 更新为新结果，却保留此前的 `currentImage` base64。V2 的 CTA 以 `currentImage || currentImageUrl` 判定可提交，而 `submitEdit` 实际只发送 `currentImage`。因此用户看到新 URL 结果后再次点击“生成预览”，请求会编辑旧图，而不是当前画布结果。

这是合法 Provider 输出状态下的数据源错位，违反端到端闭环和“失败不污染已有结果”的基本要求。

最低修复：能力判定与请求实际支持的输入类型 1:1 对齐。若本轮不增加 URL 拉取/代理能力，则 URL-only 当前结果不得携带旧 base64 继续提交，并应显示明确不可继续编辑状态；同时增加 URL-only 结果后二次提交的回归测试。

### FLOW001-P0-02：参考图参数在 V2/Recipe 真实链路中不可达

FLOW-001 移除了原 `ParamPanel` 中的 `ReferenceImages` 入口；AppV2 未解构或调用 `setReferenceImages`，新 Recipe 面板也没有参考图写入路径。`referenceImageCount` 只能在单元测试中手工赋值，真实 V2 会话始终为 0。报告所称“参考图实际数据通过现有 submitEdit 路径传递”在 V2 UI 中不可达。

这违反 Gate FLOW-001 的“所有工具参数进入 EditRecipe”以及端到端完成定义。

最低修复：在 V2 提供唯一参考图入口；增删时同步 `state.referenceImages` 与当前 Recipe 的引用信息/数量；提交时显式保证编译 Prompt、Recipe 历史参数和实际 `referenceImages` payload 一致；增加真实 UI 增删与提交 payload 回归测试。

## FIX_PACKET

```yaml
packet_type: FIX_PACKET
task_id: FLOW-001
stage: MVP
review_target: 2574abf
decision: MVP_FAIL
fix_scope:
  - id: FLOW001-P0-01
    requirement: 修复 URL-only 当前结果后二次编辑提交旧 base64；可提交判定必须与请求真实支持的当前输入一致。
  - id: FLOW001-P0-02
    requirement: 恢复 V2 参考图真实入口，并让 UI、EditRecipe、编译 Prompt、history params 与请求 payload 保持一致。
verification:
  - URL-only 结果状态下不得提交旧图；覆盖按钮状态与请求 payload 回归测试
  - V2 增删参考图后 Recipe 计数/引用、编译 Prompt 与 submitEdit payload 一致
  - 单 CTA、project 禁用、loading 禁用与任务切换测试继续通过
  - npm run lint --prefix src/client
  - npx tsc --noEmit -p src/client/tsconfig.json
  - npm test --prefix src/client
  - npx tsc --noEmit -p src/server/tsconfig.json
  - npm test --prefix src/server
  - npm test
  - npm run build
  - node scripts/check-lumen-collab.mjs
constraints:
  - 只修以上两个 P0 及直接回归
  - 不实施 STORAGE/JOB/VERSION/ROUTING
  - 不修改 Provider/API/存储协议，除非 GPT 重新确认扩大范围
  - 不覆盖或提交工作区既有无关修改
```

## 状态裁决

- FLOW-001 保持在 `tasks/active/`；
- 状态改为 `changes_requested / nextActor=trae`；
- STORAGE-001 及后续任务继续阻塞；
- Trae 只处理 FIX_PACKET 的两个 P0 与直接回归。
