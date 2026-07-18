# Trae Prompt｜FLOW-001 配方模型与单一生成操作

> 前置条件：`UI-001` 已通过 GPT 验收。

## 目标

将分散在各工具面板的参数、Prompt 和提交动作收敛为统一 EditRecipe：

- 定义共享 `EditRecipe`；
- 人像参数改为五档；
- 增加身份、构图、皮肤纹理、服装与背景保护项，默认开启；
- PromptInput 改为“补充要求”，不再独立提交；
- 右栏只保留一个“生成预览”主按钮；
- 新建版本化 Prompt 编译器 v1；
- Provider 只接收编译后的请求。

## 约束

- 本轮继续使用现有同步 `/api/edit`；
- 不做数据库、异步 Job、版本持久化或智能路由；
- 保持当前 Provider 输出兼容；
- 五档必须有明确旧值映射；
- 保护项必须体现在编译 Prompt 中；
- 完整 Prompt 默认折叠只读。

## 验收重点

- AC-002 单一主操作；
- 各任务面板参数都进入 Recipe；
- 没有隐藏的独立模型调用入口；
- Recipe 和 Prompt 编译器有单元测试；
- 旧工具基础结果不发生未解释回归。

## 扩大执行包（一次性交付，减少往返）

Trae 本轮应在同一任务 ID、同一分支和同一 PR 内完成以下闭环，不再拆成只改 UI 或只写类型的小批次：

1. 定义 `EditRecipe`、五档参数、保护项、旧值映射和默认值；任务栏 `V2TaskId` 与 Recipe/工具的真实映射在此落地。
2. 实现纯函数 Prompt 编译器 v1，输出带显式版本；所有保护项与“补充要求”必须进入编译结果。
3. 将现有同步 `/api/edit` 调用统一改为只消费编译后的请求，保持 Provider 输出兼容。
4. 收敛 V2 右栏：删除临时债务提示和旧“应用/提交”入口，只保留一个真实“生成预览”主 CTA；完整 Prompt 默认折叠只读。
5. 增加 Recipe、旧值映射、Prompt 编译器、单 CTA/无隐藏提交入口的自动化测试；覆盖至少一个成功提交和一个不可提交状态。
6. 更新报告、脱敏证据、状态与交接文件，并由 Trae commit/push。

### 完成定义

- 不以“组件已创建”作为完成；必须从 UI 参数到 Recipe、编译 Prompt、`/api/edit` 请求形成端到端闭环。
- 不要求 STORAGE/JOB/VERSION 能力，不得引入数据库、持久化、异步任务或伪进度。
- 若没有 P0/P1，GPT 下一轮只做一次风险驱动验收；未变更的 UI-001 视觉证据不重跑。

### 必跑门禁

```text
npm run lint --prefix src/client
npx tsc --noEmit -p src/client/tsconfig.json
npm test --prefix src/client
npx tsc --noEmit -p src/server/tsconfig.json
npm test --prefix src/server
npm test
npm run build
node scripts/check-lumen-collab.mjs
```

## Review History

- 2026-07-18 GPT 首轮验收：`MVP_FAIL`。8 条门禁全绿，但保留两个 P0：URL-only 结果后二次编辑会提交旧 base64；参考图在 V2 UI / Recipe / 请求链路中不可达。仅按 `docs/lumen-v2/reviews/FLOW-001-GPT-REVIEW.md` 的 FIX_PACKET 修复，不得启动 STORAGE-001。
- 2026-07-18 GPT 第二轮验收：`MVP_FAIL`。真实 reducer 状态仍为“旧 base64 + 新 URL”，现 `canSubmit`/防御检查仍会放行旧图；参考图生产接线已恢复，但承诺的 19 条回归实际为 18 条，且未真实覆盖添加与请求 payload。仅按同一 review 文件的第二轮 FIX_PACKET 最小返工。
- 2026-07-18 Trae R2 返工完成：`awaiting_gpt_acceptance / nextActor=gpt`。`useEditor.SET_RESULT` 重写为三种结果显式分支（base64 / URL-only / text-only），URL-only 时清空旧 base64；新建 `useEditor.test.ts`（9 用例）覆盖真实复现 + SET_RESULT 四分支 + payload 一致性；`ContextPanel.test.tsx` 新增 1 用例覆盖真实添加流程；纠正 19/18 计数（首轮实际 18，R2 新增 10，累计 P0 相关 28 用例）。8 条门禁全绿：client 104 / server 16 / root 120。范围遵守：仅最小修改 `useEditor.SET_RESULT` reducer；未修改 `/api/edit` 协议、Provider 实现、存储协议；未启动 STORAGE/JOB/VERSION/ROUTING。待 GPT 第三轮验收。
- 2026-07-18 GPT 第三轮验收：`MVP_PASS`。commit `7fca3f5` 关闭第二轮两个 P0，GPT 独立重跑 8 条门禁全绿（client 104 / server 16 / root 120）；无新增 P0/P1。FLOW-001 归档，激活 STORAGE-001。
