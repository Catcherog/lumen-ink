# LUMEN-EPHEMERAL-DEMO-RUNTIME-01

## Workflow

- `taskId`: `LUMEN-EPHEMERAL-DEMO-RUNTIME-01`
- `executionStatus`: `READY_FOR_CODEX_EXECUTION`
- `status`: `awaiting_gpt_acceptance`
- `nextActor`: `gpt`
- `branch`: `codex/lumen-ephemeral-demo-runtime-01`
- `scope`: explicit public ephemeral runtime; no merge or deployment

## Goal

让光砚在 `LUMEN_RUNTIME_MODE=ephemeral-demo` 下可以公开运行并调用图像模型完成编辑。访客不登录，使用自己的 Provider API Key，编辑结果由浏览器下载；该模式暂不保存用户、项目、历史、图片、Provider 配置或限流状态到 CloudBase 或其他持久化后端。

## Frozen runtime contract

```env
LUMEN_RUNTIME_MODE=ephemeral-demo
PERSISTENCE_BACKEND=disabled
AUTH_MODE=disabled
CORS_ALLOWLIST=https://<exact-public-origin>
```

`CORS_ALLOWLIST` 只能是明确 origin，不能使用通配符。运行时通过 `GET /api/runtime` 公布非敏感功能描述；`GET /api/health` 只公布同一类非敏感描述。

## Acceptance criteria

- [ ] `ephemeral-demo` 是显式分支；启动不选择或初始化 CloudBase，不创建 ProviderStore 持久化路径、项目/历史服务、Worker 或认证限流器。
- [ ] `PERSISTENCE_BACKEND` 与 `AUTH_MODE` 必须为 `disabled`；配置矛盾时启动失败，不全局 fail-open。
- [ ] `/api/auth` 返回快速结构化 `AUTH_DISABLED_IN_EPHEMERAL_MODE`；`/api/providers`、项目、历史、Job 路径不触发持久化。
- [ ] `/api/edit` 接受请求级 BYO Provider 配置，只允许已登记 Provider 类型/模型；Key 不进入响应、日志或 localStorage。
- [ ] Provider 上游错误映射为稳定 `errorCode` 与用户安全 message，且不回显上游 body。
- [ ] 前端先确认 `/api/runtime` 再渲染；临时模式不显示登录、云端项目、历史导入、版本或 Job 持久化 UI。
- [ ] 结果支持 base64 与 Provider URL 的浏览器手动下载；下载失败有可读错误。
- [ ] 仅允许精确 CORS origin；没有 `*`。
- [ ] 完成客户端/服务端构建与测试、协作安全扫描；不合并、不部署。

## Scope exclusions

真实 Provider 调用、Vercel 生产部署、域名/DNS、CloudBase 数据库验证、用户限流和任何生产写入均不属于本任务验收范围。
