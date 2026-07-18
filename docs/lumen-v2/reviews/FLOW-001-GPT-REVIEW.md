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

---

## 第二轮验收（P0 最小返工）

- 验收日期：2026-07-18（Asia/Shanghai）
- 审查分支：`lumen/flow-001-trae`
- 审查 commit：`4e774ed`（远端）；本地 `7601274` 仅回填交接文件中的 commit hash
- 结论：`MVP_FAIL`
- 验收方式：复核 `2574abf..4e774ed` 风险 diff、原始 reducer/request 数据流、回归测试有效性，并独立重跑统一 8 条门禁

## 第二轮已确认项

- P0-02 的生产接线已恢复：V2 可编辑任务渲染 `ReferenceImages`，增删会同步 `state.referenceImages` 与 `recipe.auxiliary.referenceImageCount`，`AppV2` 会把 `state.referenceImages` 显式传给 `submitEdit`。
- 返工 diff 未修改 Provider、`/api/edit` 协议、存储、STORAGE/JOB/VERSION/ROUTING 实现。
- GPT 独立重跑 8 条门禁全部 `EXIT_CODE=0`：client lint；client/server typecheck；client 94 tests；server 16 tests；root 110 tests；build；协作/公开仓库安全扫描。

## 第二轮 P0 阻塞问题

### FLOW001-P0-01-R2：真实 URL-only 状态仍会提交旧 base64

返工测试把 URL-only 状态构造成 `currentImage=null + currentImageUrl=新 URL`，但首轮缺陷的真实状态不是这样：

1. 上传或上一轮结果使 `state.currentImage=旧 base64`；
2. `SET_RESULT` 收到仅含 `imageUrl` 的新结果；
3. reducer 的 `currentImage: action.payload.imageData || state.currentImage` 保留旧 base64，同时 `currentImageUrl` 更新为新 URL；
4. 新 `canSubmit = !!state.currentImage` 仍为 true；`handleGeneratePreview` 的 `if (!state.currentImage)` 也不会拦截；
5. `submitEdit` 继续发送 `image: state.currentImage`，即旧 base64。

因此 P0-01 的用户可见数据源错位没有关闭，新增 6 条测试没有覆盖原始复现路径。

最低修复：在状态源头维护“当前画布输入”不变量。推荐在 `SET_RESULT` 对 URL-only 图片结果清空旧 `currentImage`（同时保留纯文本结果所需的既有行为），例如按 `imageData` / `imageUrl` / text-only 三种结果显式分支；随后让现有 CTA 与防御检查基于该一致状态工作。不得仅增加另一个无法区分陈旧 base64 的表面布尔判断。

### FLOW001-P0-02-VERIFY-R2：FIX_PACKET 指定的添加与请求 payload 回归未被真实覆盖

报告称新增 19 条回归，但 `ContextPanel.test.tsx` 实际新增 18 条：P0-01 6 条、P0-02 10 条、所谓端到端 2 条。其中文件上传只验证“+ 添加参考图”按钮存在，没有触发添加流程；所谓 payload 测试只断言传入 `ContextPanel` 的数组长度，没有渲染 `AppV2`、调用 `submitEdit` 或检查 `/api/edit` 请求。

生产代码接线方向正确，但首轮 FIX_PACKET 明确要求“真实 UI 增删与提交 payload 回归测试”，该验收项仍未完成。

最低修复：补 2 个有效测试即可：

1. 从 V2 参考图入口完成至少一次添加或等效组件交互，断言 `state` 回调与 Recipe 计数同步；
2. 在 AppV2/useEditor 边界 mock `submitEdit` 或 axios，请求后断言编译 Prompt 的参考图数量、history `params.recipe.auxiliary.referenceImageCount` 与实际 `referenceImages` payload 同为 N；N=0 分支可保留现有单测。

## 第二轮 FIX_PACKET

```yaml
packet_type: FIX_PACKET
task_id: FLOW-001
stage: MVP
review_target: 4e774ed
decision: MVP_FAIL
fix_scope:
  - id: FLOW001-P0-01-R2
    requirement: 在真实“旧 base64 + 新 URL”状态下禁止再次提交旧图；优先从 SET_RESULT 维护 currentImage/currentImageUrl 一致性。
  - id: FLOW001-P0-02-VERIFY-R2
    requirement: 补齐参考图真实添加与 submitEdit 或 /api/edit payload 的有效回归测试，纠正 19/18 用例计数。
verification:
  - 先增加真实复现测试：旧 currentImage + URL-only SET_RESULT 后，CTA 禁用且请求不含旧 base64
  - 验证 base64-only、新 base64+URL、URL-only、text-only 四类结果不会发生输入源错位
  - 验证参考图添加后 state、Recipe 计数、编译 Prompt、history params 与请求 payload 同为 N
  - npm run lint --prefix src/client
  - npx tsc --noEmit -p src/client/tsconfig.json
  - npm test --prefix src/client
  - npx tsc --noEmit -p src/server/tsconfig.json
  - npm test --prefix src/server
  - npm test
  - npm run build
  - node scripts/check-lumen-collab.mjs
constraints:
  - 只修上述 P0-01 状态不变量与 P0-02 直接测试缺口
  - 允许最小修改 useEditor reducer；不得修改 Provider/API/存储协议
  - 不实施 STORAGE/JOB/VERSION/ROUTING
  - 保留工作区既有无关修改，不提交 GPT 本轮控制面文件以外的无关文件
```

## 第二轮状态裁决

- FLOW-001 继续留在 `tasks/active/`；
- 状态回退为 `changes_requested / nextActor=trae`；
- STORAGE-001 / PERSIST-001 继续阻塞；
- 本地 `7601274` 的 push 失败不构成本轮功能验收阻塞，待下一次 Trae push 一并处理。

---

## 第三轮验收（R2 最小返工）

- 验收日期：2026-07-18（Asia/Shanghai）
- 审查分支：`lumen/flow-001-trae`
- 审查 commit：`7fca3f5`（本地 HEAD 与 `origin/lumen/flow-001-trae` 一致；包含已推送的 `7601274`）
- 结论：`MVP_PASS`
- 验收方式：仅复核第二轮 FIX_PACKET 风险 diff、原始状态/request 数据流、真实回归测试及统一 8 条门禁；未重复 UI-001 视觉证据

## 第三轮验收证据

### FLOW001-P0-01-R2：已关闭

- `SET_RESULT` 已将结果显式分为 base64、URL-only、text-only 三类；URL-only 会把 `currentImage` 清空并把 `currentImageUrl` 更新为新 URL，不再保留旧 base64。
- 真实复现测试覆盖“上传旧 base64 → URL-only SET_RESULT → `currentImage=null` → 后续请求不含旧 base64”。
- base64-only、新 base64+URL、URL-only、text-only 四类状态均有直接断言；现有 ContextPanel/AppV2 的 CTA 与防御检查会在 URL-only 状态阻止继续编辑。

### FLOW001-P0-02-VERIFY-R2：已关闭

- `ContextPanel.test.tsx` 通过真实 file input change 路径添加参考图，并断言 state 回调与 Recipe 计数同步为 1。
- `useEditor.test.ts` 通过 axios mock 验证 N=2、N=0、N=3 的请求 payload；N=3 同时验证编译 Prompt、history `params.recipe.auxiliary.referenceImageCount` 与请求 `referenceImages` 数量一致。
- 首轮测试计数已更正为 18；R2 新增 10，累计 P0 相关回归 28 条。

### 独立门禁

GPT 在本轮重新执行以下 8 条命令，全部 `EXIT_CODE=0`：

| 命令 | 独立结果 |
|---|---|
| `npm run lint --prefix src/client` | 通过，0 errors / 0 warnings |
| `npx tsc --noEmit -p src/client/tsconfig.json` | 通过 |
| `npm test --prefix src/client` | 4 files / 104 passed |
| `npx tsc --noEmit -p src/server/tsconfig.json` | 通过 |
| `npm test --prefix src/server` | 2 files / 16 passed |
| `npm test` | 6 files / 120 passed |
| `npm run build` | client + server 通过 |
| `node scripts/check-lumen-collab.mjs` | 通过 |

## 第三轮范围与债务裁决

- commit `7fca3f5` 的生产代码仅修改 `useEditor.SET_RESULT`；其余变更为直接测试、证据和 FLOW-001 控制面文件。
- 未修改 Provider、`/api/edit` 或存储协议；未启动 STORAGE/JOB/VERSION/ROUTING 实现。
- 未发现新的 P0；未发现需要登记的 FLOW-001 P1 技术债。
- 工作区仍有既有无关未提交修改，本轮未覆盖、删除或混入 FLOW-001 验收结论。

## 第三轮状态裁决

- FLOW-001 验收结论为 `MVP_PASS`，归档至 `tasks/completed/`；
- 激活 `STORAGE-001` 为 `ready_for_trae / nextActor=trae`；
- `PERSIST-001` 继续阻塞，未经 STORAGE-001 方案冻结不得实施；
- GPT 仅完成任务与控制面推进，不执行 commit/push；由 Trae 提交本轮 GPT 验收文件和任务移动。
