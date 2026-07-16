# 06｜技术契约

## 1. 领域对象

```ts
interface Project {
  id: string;
  workspaceId: string;
  name: string;
  mode: 'pro' | 'preview';
  originalAssetId: string;
  activeVersionId: string;
  approvedVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Asset {
  id: string;
  workspaceId: string;
  projectId: string;
  kind: 'original' | 'reference' | 'result' | 'export';
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  sha256?: string;
  createdAt: string;
}

interface EditRecipe {
  id: string;
  task: 'portrait' | 'color' | 'cleanup' | 'local' | 'export';
  presetId?: string;
  params: Record<string, string | number | boolean>;
  protections: {
    identity: boolean;
    composition: boolean;
    skinTexture: boolean;
    clothingAndBackground: boolean;
  };
  referenceAssetIds: string[];
  extraInstruction?: string;
  promptCompilerVersion: string;
  routePolicy: 'quality' | 'balanced' | 'speed' | 'locked';
  lockedProviderId?: string;
  lockedModel?: string;
}

interface GenerationJob {
  id: string;
  workspaceId: string;
  projectId: string;
  inputVersionId: string;
  recipeId: string;
  status:
    | 'queued'
    | 'uploading'
    | 'analyzing'
    | 'generating'
    | 'postprocessing'
    | 'saving'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  providerId?: string;
  model?: string;
  resultVersionId?: string;
  errorCode?: string;
  diagnosticId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Version {
  id: string;
  workspaceId: string;
  projectId: string;
  parentVersionId?: string;
  assetId: string;
  recipeId?: string;
  jobId?: string;
  ordinal: number;
  approved: boolean;
  pinned: boolean;
  createdAt: string;
}
```

## 2. 真相来源约束

- React UI 状态不是业务数据真相。
- `EditorState` 不得长期持有完整 base64 作为唯一资产。
- localStorage 只保存 feature flag、界面偏好、最近项目 ID 和旧数据备份标识。
- IndexedDB 可用作本地缓存或开发 PoC，不得作为 3 人正式工作区的唯一真相。
- 正式 P0 的 Project、Asset、Version 和 Job 必须有持久化 Repository。
- 图片资产必须进入对象存储或等价的持久介质。
- Version 不可变；恢复通过切换 activeVersion，不删除后续版本。
- Job 状态必须可在刷新后查询。

## 3. API 目标

```text
POST   /api/projects
GET    /api/projects/:id
DELETE /api/projects/:id

POST   /api/assets/upload-url
POST   /api/assets/complete

POST   /api/jobs
GET    /api/jobs/:id
POST   /api/jobs/:id/cancel
POST   /api/jobs/:id/retry

POST   /api/versions/:id/approve
POST   /api/versions/:id/activate

POST   /api/exports
GET    /api/providers/capabilities
```

前端最终不得继续把“一个最长 100 秒的请求返回最终图片”作为唯一工作模式。

## 4. Repository 与 Storage Adapter

业务代码依赖接口，不直接绑定具体供应商：

```ts
interface ProjectRepository {}
interface AssetRepository {}
interface VersionRepository {}
interface JobRepository {}
interface ObjectStorage {}
```

`STORAGE-001` 冻结具体实现。要求：

- 本地开发可替换；
- Production 持久；
- 支持签名 URL；
- 支持级联删除；
- 支持备份和迁移；
- 不依赖 Vercel `/tmp`。

## 5. 模型路由

路由输入：

- task；
- 是否有输入图、区域或蒙版；
- 人脸数量；
- 输入/输出尺寸；
- routePolicy；
- Provider 健康度；
- 成功率、延迟和成本档位。

路由输出：

- providerId；
- model；
- operationType；
- fallbackChain；
- timeout；
- capabilityWarnings。

能力矩阵必须集中定义并可测试，不得由多个文件各自按模型字符串猜测。

## 6. Prompt 编译器

必须：

- 输入结构化 EditRecipe；
- 输出 Provider 适配后的 Prompt；
- 保存编译器版本和 Prompt 摘要；
- 区分身份、保留、修改、风格、质量和负面约束；
- Provider 只做协议适配，不继续分散追加业务 Prompt；
- UI 默认不暴露完整 Prompt，允许高级只读查看。

## 7. 任务执行

- Job 先持久化，再进入执行；
- 状态只能由真实执行节点更新；
- 禁止随机进度百分比；
- 成功顺序：保存 Asset → 创建 Version → Job succeeded；
- 失败不得创建成功 Version；
- 取消是 best effort，界面必须准确说明是否已进入不可取消阶段；
- 每个错误有稳定 errorCode 和 diagnosticId。

具体 worker、队列或 durable execution 方式由 `STORAGE-001` 冻结。

## 8. 生产配置

- Production 不允许默认密码、默认 JWT、默认加密密钥；
- Provider Key 不返回前端；
- Production P0 优先从环境变量读取 Provider 配置；
- 动态工作区 Provider Key 必须等待具备用户隔离的持久化方案；
- Vercel `/tmp` 不能作为 Provider 真相；
- CORS 使用 allowlist；
- 登录接口限流；
- 上传同时校验 MIME、大小、像素数和解码结果；
- 日志不记录 Key、完整 Prompt 或原图 base64；
- health 不返回默认模型和 hasApiKey 等敏感细节。

## 9. 可观测性

每个任务记录：

- task、provider、model；
- queueMs、providerMs、saveMs、totalMs；
- input/output 尺寸；
- success/errorCode；
- retryCount；
- 用户质量标签；
- 估算成本档位。

不得把原始图片或完整敏感 Prompt 写入日志。
