<!--
  文件用途：文件操作安全规范，包含修改前备份、版本控制、变更记录、禁止行为、提交前检查、证据脱敏、自动扫描边界、安全违规处理。
  来源：改造方案第 8 节、AGENTS.md 第 6 节（公开仓库安全边界）、第 7 节（禁止行为）。
  适用范围：光砚 Lumen Ink V2 所有 AI 协作（Trae、GPT）与人工操作。
-->

# 文件操作安全规范 — 光砚 Lumen Ink V2 (picture-edit)

本规范约束所有参与光砚 Lumen Ink V2 的 AI、自动化工具与人工协作者的文件操作行为。项目仓库为公开 GitHub 仓库（https://github.com/Catcherog/lumen-ink.git），任何提交一旦推送即视为公开，必须严格遵守本规范。

---

## 1. 修改前备份规范

### 1.1 关键配置文件清单

以下文件为 Lumen V2 协作状态的核心载体，修改前必须确认可回滚：

| 文件 | 作用 |
|------|------|
| `docs/lumen-v2/state/STATE.json` | 任务状态机、当前任务、角色边界 |
| `docs/lumen-v2/state/PROJECT-MEMORY.md` | 项目记忆、当前最高风险 |
| `docs/lumen-v2/state/DECISION-LOG.md` | 决策记录 |
| `docs/lumen-v2/state/CHANGELOG.md` | 变更日志 |
| `docs/lumen-v2/state/SESSION-HANDOFF.md` | 会话交接 |

### 1.2 备份方式

- **优先方式**：在独立分支上修改（`lumen/<task-id>-trae` 或 `lumen/<task-id>-gpt-review`），主分支保留原状。
- **次选方式**：修改前执行 `git stash` 暂存当前工作区，完成修改后再决定是否恢复。
- **禁止**：在未提交的主分支上直接覆盖上述关键文件，导致无法回滚。

### 1.3 修改前确认

修改关键配置文件前必须确认：

- `git status` 干净，或
- 已在独立分支上隔离修改，或
- 已执行 `git stash` 暂存现有修改。

### 1.4 保留可回滚的提交历史

- 每次修改对应一次独立提交，禁止把多个任务的修改合并为一次提交。
- 提交信息必须包含任务 ID，便于追溯。
- 禁止使用 `git commit --amend` 覆盖已推送的提交。

---

## 2. 版本控制规范

### 2.1 分支策略

- 所有变更通过分支 + PR，禁止直接 push 到 `main`。
- 分支命名规范：
  - Trae 实施：`lumen/<task-id>-trae`
  - GPT 文档审查：`lumen/<task-id>-gpt-review`
- 一个 PR 只对应一个任务 ID，禁止在单个 PR 中混合多个任务。

### 2.2 PR 门禁

- PR 必须通过 `.github/workflows/lumen-v2-collab-check.yml`。
- PR 合并前必须确认：
  - 自动扫描通过（`node scripts/check-lumen-collab.mjs`）。
  - 人工检查完成（见第 5 节提交前检查清单）。
  - 提交信息格式正确（见第 3 节）。

### 2.3 受保护主分支

- `main` 为受保护分支，禁止 force-push。
- 禁止绕过 PR 流程直接向 `main` 提交。
- 禁止在 `main` 上执行 `git reset --hard` 或 `git rebase` 重写历史。

---

## 3. 变更记录规范

### 3.1 任务 ID 对应

- 每次修改必须对应一个明确的任务 ID。
- 生产代码修改必须与 `STATE.json.currentTask` 指向的当前任务一一对应。
- 禁止在无明确任务时顺手重构或升级依赖。

### 3.2 提交信息格式

**Trae 实施提交**：

```
feat(lumen-v2): <TASK-ID> implementation
```

**GPT 文档审查提交**：

```
docs(lumen-v2): review <TASK-ID>
```

### 3.3 提交正文

- 提交正文记录主要修改内容（修改了哪些文件、做了什么）。
- 涉及架构或关键决策的修改，在正文中说明原因。
- 若修改了关键配置文件（第 1.1 节），在正文中列出文件清单。

---

## 4. 禁止行为清单

以下行为严格禁止，违反将触发安全违规处理流程（第 9 节）：

### 4.1 版本控制类禁止行为

- force-push 到 `main` 或其他受保护主分支。
- 覆盖用户未提交的修改。
- 擅自丢弃工作区修改（`git checkout .`、`git restore .`、`git clean -f`）。
- 执行破坏性 reset（`git reset --hard` 到他人提交）。
- 把无关修改混入当前 commit。
- 使用 `git commit --amend` 覆盖已推送提交。
- 在无明确任务时顺手重构或升级依赖。

### 4.2 安全类禁止行为

- 提交密钥、Token、私钥、JWT Secret、Provider 完整配置。
- 提交真实客户照片、联系方式、订单、聊天记录。
- 提交未脱敏 Prompt（含客户姓名、特征、联系方式）。
- 提交模型权重、训练数据、生产数据库导出。
- 提交含密钥的终端截图、网络请求、日志。
- 提交大型生成文件（除非任务明确要求）。

---

## 5. 提交前检查清单

提交前必须逐项确认，全部通过后方可提交：

- [ ] `git status` 确认无意外文件
- [ ] `git diff --staged` 检查暂存内容
- [ ] 运行 `node scripts/check-lumen-collab.mjs` 安全扫描
- [ ] 人工检查无 API Key、密码、私钥
- [ ] 人工检查无真实客户照片、联系方式、订单
- [ ] 人工检查无未脱敏 Prompt
- [ ] 人工检查无模型权重、训练数据
- [ ] 人工检查无含密钥的终端截图、网络请求、日志
- [ ] 确认提交信息格式正确
- [ ] 确认对应任务 ID

---

## 6. 公开仓库安全边界

本节强化 AGENTS.md 第 6 节，适用于公开 GitHub 仓库（https://github.com/Catcherog/lumen-ink.git）。

### 6.1 不得提交的内容

以下内容严禁进入公开仓库，一旦推送即视为泄露：

- `.env`、API Key、JWT Secret、密码、私钥、Provider 完整配置；
- 真实客户照片、联系方式、订单、聊天记录或未脱敏 Prompt；
- 模型权重、训练数据、生产数据库导出；
- 含密钥的终端截图、网络请求或日志；
- 可用于还原凭据的加密文件与派生材料。

### 6.2 可以公开的内容

- 产品定位、流程、UI 规格和非敏感技术架构；
- 脱敏的测试命令与摘要；
- 合成或已授权的测试图片；
- 不含客户、密钥和供应商账户信息的截图；
- 错误码、性能区间和架构决策。

### 6.3 证据来源要求

证据必须使用授权测试图、合成图或充分脱敏截图，不得使用生产数据。每项证据必须说明：

- 来源：合成 / 授权 / 脱敏；
- 对应任务和验收项；
- 生成命令；
- 是否包含生产数据：必须为否。

---

## 7. 证据脱敏检查清单

证据必须使用授权测试图、合成图或充分脱敏截图。提交证据前逐项确认：

- [ ] 截图中无 API Key、Token、密码
- [ ] 截图中无真实客户照片
- [ ] 截图中无客户联系方式、订单信息
- [ ] 日志中无密钥、Token
- [ ] 网络请求中无 Authorization Header
- [ ] Prompt 内容已脱敏（无客户姓名、联系方式）
- [ ] 文件名无敏感信息
- [ ] 路径中无用户名、客户信息

### 7.1 证据存储与脱敏细则

- 终端日志优先保存为 `.txt`，手工移除路径中的用户名、Token 和账户 ID。
- 截图优先 WebP/JPEG，裁掉浏览器账号、书签、系统托盘和环境变量。
- 证据存放位置：`docs/lumen-v2/evidence/<TASK-ID>/`。

---

## 8. 自动扫描与人工检查的边界声明

### 8.1 自动扫描职责

`node scripts/check-lumen-collab.mjs` 是必跑的安全扫描，在提交前和 CI 中执行。

### 8.2 自动扫描能检测的内容

- 已知密钥模式：
  - RSA / EC / OpenSSH 私钥开头（`-----BEGIN ... PRIVATE KEY-----`）
  - OpenAI 密钥（`sk-` 前缀，长度 ≥ 20）
  - AWS Access Key（`AKIA` 前缀 + 16 位）
  - GitHub Token（`ghp_` 前缀，长度 ≥ 30）
  - Authorization Bearer Header
- 常见敏感文件名：
  - `.env`、`.env.local`、`.env.production` 等（允许 `.env.example`、`.env.sample`、`.env.template`）
  - `providers.json`
  - 匹配 `private.*key` 的文件名
- 文本文件内容扫描（扩展名：`.md`、`.json`、`.txt`、`.ts`、`.tsx`、`.js`、`.mjs`、`.yml`、`.yaml`）

### 8.3 自动扫描不能检测的内容

- 截图中的密钥（图片文件不会被扫描，需要 OCR 或人工检查）。
- 上下文相关的敏感信息（如客户姓名、业务特征）。
- 变形或编码后的密钥（如 base64 编码、分段拼接）。
- 业务相关的敏感数据（如订单号、客户 ID）。
- 非 .env 配置文件中的非标准密钥格式。
- 图片 EXIF 信息中的地理位置、设备序列号。

### 8.4 声明

**自动扫描不能替代人工检查。** 人工检查必须覆盖第 8.3 节列出的所有自动扫描不能检测的项目。提交前必须同时完成自动扫描和人工检查清单（第 5 节、第 7 节）。

---

## 9. 安全违规处理流程

### 9.1 发现已提交敏感信息

1. 立即停止相关发布或合并。
2. 评估影响范围：
   - 是否已推送到公开仓库。
   - 是否已被他人拉取或 fork。
   - 是否需要轮换泄露的密钥。
3. 执行 `git rm --cached <file>` 移除文件（不重写历史，除非必要）。
4. 更新 `.gitignore`，防止再次提交。
5. 记录违规事件到 `docs/lumen-v2/state/PROJECT-MEMORY.md` 的"当前最高风险"章节。
6. 必要时轮换泄露的密钥（API Key、Token、密码等）。

### 9.2 历史清理原则

- 优先使用 `git rm --cached` 移除文件并新增提交，不重写历史。
- 仅在密钥已泄露且必须清理历史时，才使用 `git filter-repo` 或 BFG。
- 重写历史后必须强制推送（需用户明确授权），并通知所有协作者重新克隆。

### 9.3 事故记录

- 在私有渠道记录事故，不在公开仓库复述密钥内容。
- 更新安全门禁和回归检查，防止同类事故再次发生。
- 将事故经验写入 `docs/lumen-v2/state/PROJECT-MEMORY.md`，作为后续协作的警示。

---

## 10. 相关文件索引

- `AGENTS.md` 第 6 节"公开仓库安全边界"
- `AGENTS.md` 第 7 节"禁止行为"
- `docs/lumen-v2/SECURITY-PUBLIC-REPO.md` — 公开仓库安全规范
- `scripts/check-lumen-collab.mjs` — 安全扫描脚本
- `.github/workflows/lumen-v2-collab-check.yml` — CI 协作检查工作流
- `docs/ai/REVIEW_POLICY.md` — 审查规则
- `docs/ai/TRAE_COLLABORATION_GUIDE.md` — Trae 执行手册
