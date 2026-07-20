# JOB-PORTFOLIO-LUMEN-01｜光砚求职展示版本收尾

> **Project ID**：`lumen-ink-v2`（用户任务卡写为 `lumen-v2`，仓库 STATE.json 实际为 `lumen-ink-v2`，本任务统一采用仓库事实）
> **Task ID**：JOB-PORTFOLIO-LUMEN-01
> **Risk Level**：Medium
> **Recommended Owner**：Trae
> **Recommended Route**：R2 — GPT 规划 → Trae 执行 → GPT 证据审查
> **Codex**：NOT_REQUIRED
> **Status**：`active / ready_for_trae / nextActor=trae`
> **基线 commit**：`7be5f76`（main HEAD，含 HARDEN-001A/B，不含 C）
> **分支**：`lumen/job-portfolio-lumen-01-trae`
> **激活日期**：2026-07-21
> **激活来源**：用户直接下发任务卡，用户授权 R2 路径

---

## 背景

以最小技术收尾完成"光砚"求职展示版本，形成可在线体验或可稳定复现的产品证据，重点证明：

1. 多模型产品设计
2. 专业图像工作流抽象
3. 生成任务持久化与恢复
4. 核心认证和 Provider Key 安全边界
5. Preview 与 Production 状态区分真实、准确

本任务以尽快形成求职可用展示资产为优先级，**不以清零技术债为目标**。

## 与并行任务的关系

- **HARDEN-001C**：当前在 `lumen/harden-001c-trae` 分支（HEAD `301fd3e`）等待 GPT 证据审查，与本任务并行推进，互不阻塞
- **PROD-CRON-VERIFY**：`awaiting_user_evidence / nextActor=user`，本任务采用 Track B 路径，Cron 状态标记 `PENDING_PRODUCTION_VERIFICATION`
- **PERSIST-001**：已合并到 main（`f0e28dd`，在 `7be5f76` 之前），`gpt_evidence_review_pass`，未归档
- **ROUTING-001**：blocked，不依赖本任务

## 目标

形成求职可用展示资产，包括：

- 稳定在线入口或完整稳定录屏（至少满足一项）
- 完整证据包（录屏、对比图、Provider 比较表、可靠性证据卡、PORTFOLIO-EVIDENCE.md）
- 真实状态描述，不夸大

## In Scope

1. **完成 PROD-CRON-VERIFY**（Track B 路径）：
   - 确认 Production Cron 已注册（如能验证）
   - 取得至少一次真实执行结果（如能验证）
   - 记录时间、部署版本、HTTP 结果和恢复结果
   - **无法完成时保留为 PENDING/BLOCKED，不得伪造通过**

2. **验证公开访问入口**：
   - 页面可打开
   - 登录可用
   - 核心静态资源加载正常
   - API 请求未因 Routing、CORS 或部署配置导致核心流程不可用

3. **验证持久化恢复**：
   - 创建真实生成任务
   - 刷新页面后恢复
   - 关闭后重新进入仍可恢复
   - 至少覆盖一种短暂失败、轮询中断或重新查询后的恢复场景
   - 验证导出来源与恢复后的版本一致

4. **只修复直接阻塞以下体验的问题**：
   - 公开入口打不开
   - 前端 API Routing 错误
   - 登录无法完成
   - 上传、提交、恢复、导出主链路中断
   - Production Cron 无法按既定设计执行

5. **形成求职展示证据**：
   - 一段完整主流程录屏
   - 两组固定原图与结果对比
   - Provider 比较表
   - 可靠性证据卡
   - `docs/portfolio/PORTFOLIO-EVIDENCE.md`

## Out of Scope

- 新增泛化 HARDEN 批次
- 清理所有技术债
- 新增 RBAC、多用户权限或管理后台
- 重构 Provider、持久化、任务状态机或 Cron 架构
- 扩大日志、安全、性能或依赖审计
- 新增 Provider
- 为展示目的修改核心业务语义
- 将 Preview 证据包装为 Production 证据
- 修改与公开体验无直接关系的代码
- 调用 Codex 进行常规审计

**现有非阻塞安全债务可以保留，但公开材料不得表述为"所有安全问题均已解决"。**

## Acceptance Criteria

### 技术收尾

| AC | 描述 |
|----|------|
| AC-01 | 公开入口能够加载登录页面和主要前端资源，无阻塞性 404、500、Routing 或 CORS 错误 |
| AC-02 | 用户可完成登录、上传、选择工具、选择 Provider、提交生成和导出 |
| AC-03 | 生成任务提交后刷新页面，任务状态和结果能够恢复 |
| AC-04 | 关闭页面或重新进入项目后，任务、版本和可导出结果能够恢复 |
| AC-05 | 至少提供一次短暂失败或轮询中断后的恢复证据；不得仅测试完全成功路径 |
| AC-06 | Production Cron 注册状态有真实平台证据 |
| AC-07 | Production Cron 至少一次真实执行有时间、部署版本、返回结果和恢复效果证据；未满足时必须标记 PENDING 或 BLOCKED |
| AC-08 | 本轮生产代码修改仅限直接阻塞公开体验的问题 |

### 展示证据

| AC | 描述 |
|----|------|
| AC-09 | 录屏完整包含：登录 → 上传图片 → 选择工具 → 选择 Provider → 提交 → 刷新或重新进入 → 恢复任务 → 查看结果 → 导出 |
| AC-10 | 录屏和截图中不出现 API Key、Token、Secret、连接字符串、私人客户照片或敏感控制台信息 |
| AC-11 | 准备两组固定原图和结果图，能够说明不同编辑目标或工作流价值 |
| AC-12 | Provider 比较表至少包含：Provider、使用模型、质量观察、实测时延、成本或成本口径、适用场景、局限、证据来源 |
| AC-13 | 不得把估算成本写成实测成本；无法确认的数据标记为 ESTIMATED 或 NOT_MEASURED |
| AC-14 | 可靠性证据卡至少包含：身份验证默认拒绝、Provider Key 不回传前端、生成任务持久化、刷新后恢复、短暂失败恢复、Preview 状态、Production Cron 状态 |
| AC-15 | 每项可靠性证据都使用以下状态之一：VERIFIED / PREVIEW_VERIFIED / PENDING_PRODUCTION_VERIFICATION / BLOCKED / NOT_TESTED |
| AC-16 | `docs/portfolio/PORTFOLIO-EVIDENCE.md` 包含证据索引、演示脚本、产品价值说明、技术边界和当前已知限制 |
| AC-17 | 公开文案严格使用真实状态，不出现"Production 已完整验证"之类超出证据的声明 |
| AC-18 | check-lumen-collab、相关 client/server 测试、typecheck 和 build 通过 |
| AC-19 | 输出完成包，列明 commit、分支、部署入口、录屏路径、截图路径、测试结果和未完成项 |
| AC-20 | 稳定在线入口或完整稳定录屏至少满足一项；证据包必须完整 |

## 双轨出口

### Track A：Production 验证成功

公开状态：**可在线体验｜核心持久化与安全加固完成｜生产恢复门禁已验证**

要求同时具有：
- Production URL
- Cron 注册证据
- 首次执行证据
- 恢复成功证据

### Track B：Production Cron 尚未完成（本任务采用）

公开状态：**可在线体验｜核心持久化与安全加固完成｜生产恢复门禁待最终验证**

要求：
- Preview 或公开入口可完成核心演示
- 录屏稳定
- Cron 明确标记 `PENDING_PRODUCTION_VERIFICATION`
- 写清阻塞原因和下一步
- 不再因此延迟简历、官网和作品集发布

## 执行约束

- **不修改与公开体验无直接关系的代码**
- **不重构持久化、幂等、状态机或 Cron 架构**
- **不伪造 Production 运行结果**
- **录屏使用授权、合成或可公开素材**
- **公开文案严格使用真实状态**

### Public Status Wording

**允许**（Track B）：
> 可在线体验｜核心持久化与安全加固完成｜生产恢复门禁待最终验证

**禁止**：
- "已完成全部 Production 验证"
- "生产环境完全稳定"
- "所有安全问题已解决"
- "零故障"
- "支持任意模型无缝切换"

## Stop Conditions

出现以下情况立即停止技术修改并回报：

- 真实 Secret、Provider Key、Token 或客户数据进入日志、视频、截图或仓库
- 生成恢复出现重复任务、重复扣费或错误成功版本
- 修复要求重构持久化、幂等、状态机或 Cron
- Preview 与 Production 状态无法区分
- 当前分支包含无法解释的额外生产改动
- 原有生产测试失败
- 为追求"全部通过"开始扩展新的 Harden 范围

## Codex 升级条件

默认不调用 Codex。只有以下情况才重新评估：

- 真实恢复结果与持久化状态机记录矛盾
- Cron 重复执行导致重复生成或版本污染
- 出现数据丢失或 Secret 泄露
- Trae 连续两轮无法定位同一生产阻塞
- 必须通过完整仓库运行才能判断核心业务不变量

普通 Routing、Vercel 配置、文档、录屏和证据整理不得升级 Codex。

## PORTFOLIO-EVIDENCE.md 建议结构

```
# 光砚｜AI 专业图像工作流产品证据

## 1. 项目概述
## 2. 用户问题与产品目标
## 3. 核心工作流
## 4. 多 Provider 产品设计
## 5. 专业工具与参数抽象
## 6. 持久化与任务恢复
## 7. 安全边界
## 8. 两组前后对比案例
## 9. Provider 质量、时延与成本比较
## 10. 可靠性证据卡
## 11. 在线体验与部署状态
## 12. 演示视频
## 13. 已知限制
## 14. 技术验证附录
```

## Review History

### 2026-07-21｜激活（用户直接下发）

- 触发：用户直接下发任务卡，授权 R2 路径
- 操作：基于 main `7be5f76` 创建分支 `lumen/job-portfolio-lumen-01-trae`；创建本任务文件
- 并行声明：与 HARDEN-001C（awaiting_gpt_acceptance）并行推进，互不阻塞
- Track 选择：Track B（PROD-CRON-VERIFY 标记 PENDING_PRODUCTION_VERIFICATION）
- 前置确认：
  - HARDEN-001C 已 push 到远端，GPT 可在新窗口启动审查
  - PROD-CRON-VERIFY 保持 `awaiting_user_evidence`，不阻塞本任务
  - 工作区无关改动已 stash 保存
