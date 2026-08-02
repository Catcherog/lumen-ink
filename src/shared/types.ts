export type ProviderType = 'openai' | 'glm' | 'gemini' | 'seedream' | 'jimeng' | 'custom';

export type RuntimeMode = 'persistent' | 'ephemeral-demo';
export type PersistenceMode = 'enabled' | 'disabled';
export type AuthMode = 'password' | 'disabled';

export interface PublicRuntimeConfig {
  runtimeMode: RuntimeMode;
  persistence: PersistenceMode;
  auth: AuthMode;
  features: {
    authentication: boolean;
    persistence: boolean;
    cloudHistory: boolean;
    manualDownload: boolean;
  };
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  enabled: boolean;
  isDefault?: boolean;
  hasApiKey?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Request-scoped BYO provider input accepted only by explicit ephemeral-demo. */
export interface EphemeralProviderConfig {
  type: Extract<ProviderType, 'openai' | 'glm' | 'gemini' | 'seedream'>;
  apiKey: string;
  defaultModel: string;
}

export interface ProviderModel {
  id: string;
  name: string;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface EditRequest {
  prompt: string;
  image?: string; // base64
  mimeType?: string;
  referenceImages?: Array<{
    data: string; // base64
    mimeType: string;
  }>;
  model?: string;
  providerId?: string;
  /** Request-scoped BYO provider; never persisted or accepted in persistent mode. */
  provider?: EphemeralProviderConfig;
  history?: ConversationTurn[];
  // 可选：区域信息（用于穿帮修复/路人去除）
  regions?: Region[];
  // 可选：出图尺寸，默认 1k，可选 '2k'/'4k'（火山方舟 API 规范）
  outputSize?: '1k' | '2k' | '4k';
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

export interface EditResponse {
  success: boolean;
  imageData?: string; // base64
  imageUrl?: string; // GLM returns URL
  mimeType?: string;
  text?: string;
  error?: string;
  meta?: {
    providerName: string;
    providerType: string;
    model: string;
    operationType: string;
  };
}

export interface EditResult {
  imageData?: string;
  imageUrl?: string;
  text?: string;
  mimeType?: string;
}

// GLM 模型定义
export type GLMModel = 'cogview-4-250304' | 'glm-4.6v' | 'glm-image';

export const GLM_MODELS: Array<{ id: GLMModel; name: string; description: string; type: 'generation' | 'chat' }> = [
  { id: 'cogview-4-250304', name: 'CogView-4（文生图）', description: '快速文生图，5-10秒出图，适合生成新图', type: 'generation' },
  { id: 'glm-image', name: 'GLM-Image（高清文生图）', description: '高清文生图，20秒出图，细节更丰富', type: 'generation' },
  { id: 'glm-4.6v', name: 'GLM-4.6V（图像理解+编辑）', description: '多模态模型，可理解图片并生成描述，支持对话', type: 'chat' },
];

// Gemini 图像模型
export type GeminiImageModel = 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';

export const GEMINI_IMAGE_MODELS: Array<{ id: string; name: string; description: string; type: 'generation' | 'edit' }> = [
  { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image（Nano Banana）', description: '快速图像生成与编辑，低延迟', type: 'edit' },
  { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash Image（Nano Banana 2）', description: '最新推荐，更好的指令遵循与细节', type: 'edit' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image（Nano Banana Pro）', description: '高质量，更好的文字渲染与构图', type: 'edit' },
];

// Seedream 图像模型（火山引擎方舟）— 模型 ID 为方舟推理接入点 ID
export type SeedreamModel = 'doubao-seedream-4-5-251128' | 'doubao-seedream-5-0-lite-250415';

export const SEEDREAM_MODELS: Array<{ id: string; name: string; description: string; type: 'generation' | 'edit' }> = [
  { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5', description: '即梦图像模型4.5，支持文生图和图生图编辑，文字渲染强', type: 'edit' },
  { id: 'doubao-seedream-5-0-lite-250415', name: 'Seedream 5.0 Lite', description: '即梦图像模型5.0 Lite，支持深度思考与原生4K输出（需在方舟控制台开通接入点）', type: 'edit' },
];

// 各 Provider 类型的可选模型列表（供前端动态下拉使用）
export interface ProviderModelOption {
  value: string;
  label: string;
  capabilities?: Array<'generation' | 'edit' | 'chat'>;
}

export const PROVIDER_MODELS: Record<ProviderType, ProviderModelOption[]> = {
  glm: [
    { value: 'cogview-4-250304', label: 'CogView-4（文生图）', capabilities: ['generation'] },
    { value: 'glm-image', label: 'GLM-Image（高清文生图）', capabilities: ['generation'] },
    { value: 'glm-4.6v', label: 'GLM-4.6V（图像理解+编辑）', capabilities: ['chat'] },
  ],
  openai: [
    { value: 'gpt-image-2', label: 'GPT Image 2（图生图编辑）', capabilities: ['edit'] },
    { value: 'gpt-image-2-t2i', label: 'GPT Image 2（文生图）', capabilities: ['generation'] },
    { value: 'gpt-4o', label: 'GPT-4o（图像理解）', capabilities: ['chat'] },
    { value: 'dall-e-3', label: 'DALL·E 3（文生图）', capabilities: ['generation'] },
  ],
  gemini: [
    { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image（Nano Banana）', capabilities: ['generation', 'edit'] },
    { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image（Nano Banana 2）', capabilities: ['generation', 'edit'] },
    { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image（Nano Banana Pro）', capabilities: ['generation', 'edit'] },
  ],
  seedream: [
    { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5（文生图+图生图）', capabilities: ['generation', 'edit'] },
    { value: 'doubao-seedream-5-0-lite-250415', label: 'Seedream 5.0 Lite（4K 高清）', capabilities: ['generation', 'edit'] },
  ],
  jimeng: [],
  custom: [],
};

// 兼容旧代码的别名
export type GeminiModel = GLMModel;
export const GEMINI_MODELS = GLM_MODELS;

// 修图工具
export type RetouchTool = 'face' | 'color' | 'liquify' | 'repair' | 'remove' | 'export' | 'manual';

export interface ReferenceImage {
  base64: string;
  mimeType: string;
}

// 手动工作流导出数据
export interface ManualWorkflowExport {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  tool?: RetouchTool;
  params?: Record<string, unknown>;
  regions?: Region[];
}

export interface HistoryEntry {
  id: string;
  prompt: string;
  tool?: RetouchTool;
  params?: Record<string, unknown>;
  providerId?: string;
  regions?: Region[];
  resultImage?: string; // base64
  resultImageUrl?: string; // GLM URL
  resultMimeType?: string;
  text?: string;
  timestamp: number;
}

export interface EditorState {
  originalImage: string | null;
  originalMimeType: string;
  currentImage: string | null; // latest result, or original if no edits yet
  currentImageUrl: string | null; // GLM URL
  currentMimeType: string;
  resultImage: string | null;
  resultImageUrl: string | null;
  resultText: string | null;
  resultMimeType: string;
  isLoading: boolean;
  error: string | null;
  selectedModel: string;
  history: HistoryEntry[];
  referenceImages: ReferenceImage[];
  selectedTool: RetouchTool;
  selectedProvider: string | null;
  showApiSettings: boolean;
  lastCallMeta?: {
    providerName: string;
    providerType: string;
    model: string;
    operationType: string;
  };
}

export type EditorAction =
  | { type: 'UPLOAD_IMAGE'; payload: { base64: string; mimeType: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RESULT'; payload: { imageData?: string; imageUrl?: string; text?: string; mimeType: string; history: HistoryEntry[]; meta?: { providerName: string; providerType: string; model: string; operationType: string } } }
  | { type: 'SET_REFERENCE_IMAGES'; payload: ReferenceImage[] }
  | { type: 'SET_CURRENT_IMAGE'; payload: { image?: string; imageUrl?: string; mimeType: string } }
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'RESTORE_FROM_HISTORY'; payload: { entry: HistoryEntry; index: number } }
  | { type: 'LOAD_HISTORY'; payload: HistoryEntry[] }
  | { type: 'SET_TOOL'; payload: RetouchTool }
  | { type: 'SET_PROVIDER'; payload: string | null }
  | { type: 'SET_SHOW_API_SETTINGS'; payload: boolean }
  | { type: 'VIEW_HISTORY'; payload: { entry: HistoryEntry } }
  | { type: 'DELETE_HISTORY'; payload: { id: string } };

// ===== FLOW-001: EditRecipe / 五档参数 / 保护项 / Prompt 编译器 =====

/**
 * 五档语义化参数（D-005 决策）。
 * 旧值 0-100 数值通过 `legacyValueToTier` 映射到本类型。
 */
export type Tier = 'off' | 'light' | 'natural' | 'obvious' | 'strong';

export const TIER_ORDER: readonly Tier[] = ['off', 'light', 'natural', 'obvious', 'strong'] as const;

export const TIER_LABELS: Record<Tier, string> = {
  off: '关闭',
  light: '轻微',
  natural: '自然',
  obvious: '明显',
  strong: '强烈',
};

/**
 * V2 任务栏标签 ID。FLOW-001 起作为 EditRecipe.taskId 的来源。
 * D-020 / D-026 落地：与底层 RetouchTool 解耦，由 V2_TASK_TOOL_MAP 提供 1:1 映射。
 */
export type V2TaskId = 'project' | 'subject' | 'color' | 'cleanup' | 'local' | 'export';

/**
 * V2 任务到底层修图工具的真实映射（FLOW-001 落地）。
 * - `project` 不映射到任何工具（项目元信息，不发起编辑，CTA 应禁用）。
 * - 其余五个 V2TaskId 1:1 对应一个 RetouchTool。
 */
export const V2_TASK_TOOL_MAP: Record<V2TaskId, RetouchTool | null> = {
  project: null,
  subject: 'face',
  color: 'color',
  cleanup: 'repair',
  local: 'liquify',
  export: 'export',
};

/**
 * V2 任务可发起编辑的判定（project 任务不发起编辑）。
 */
export const V2_TASK_EDITABLE: Record<V2TaskId, boolean> = {
  project: false,
  subject: true,
  color: true,
  cleanup: true,
  local: true,
  export: true,
};

/** V2 任务展示元信息（标题、描述、图标 hint） */
export interface V2TaskMeta {
  title: string;
  description: string;
}

export const V2_TASK_META: Record<V2TaskId, V2TaskMeta> = {
  project: { title: '项目', description: '项目元信息与原图导入，不发起编辑' },
  subject: { title: '人物', description: '人像精修：肤色、磨皮、瘦脸、大眼、去瑕疵、立体光影' },
  color: { title: '色彩', description: '整体色调、光影与质感调整，可附参考图' },
  cleanup: { title: '清理', description: '去除杂物、瑕疵、路人或水印' },
  local: { title: '局部', description: '液化塑形：脸型、下颌线、鼻翼、肩部、身形' },
  export: { title: '导出', description: '格式与质量优化后导出最终成片' },
};

/** 保护项（FLOW-001 任务规格：身份、构图、皮肤纹理、服装、背景，默认开启） */
export interface ProtectionItems {
  identity: boolean;
  composition: boolean;
  skinTexture: boolean;
  clothing: boolean;
  background: boolean;
}

/** 人像五档参数 */
export interface PortraitParams {
  skinBrightness: Tier;
  smoothing: Tier;
  faceSlim: Tier;
  eyeEnlarge: Tier;
  blemish: Tier;
  sculptLight: Tier;
}

/** 人像参数中文名（用于 UI 展示与编译器输出） */
export const PORTRAIT_PARAM_LABELS: Record<keyof PortraitParams, string> = {
  skinBrightness: '肤色提亮',
  smoothing: '磨皮',
  faceSlim: '瘦脸',
  eyeEnlarge: '大眼',
  blemish: '去瑕疵',
  sculptLight: '立体光影',
};

/** 保护项中文名（用于 UI 展示与编译器输出） */
export const PROTECTION_LABELS: Record<keyof ProtectionItems, string> = {
  identity: '身份（面部骨骼、五官比例、辨识度）',
  composition: '构图（人物位置、画幅、裁切）',
  skinTexture: '皮肤纹理（毛孔、质感、真实感）',
  clothing: '服装（衣物、配饰、颜色）',
  background: '背景（场景、光影、色调）',
};

/**
 * EditRecipe：从 UI 参数到 Provider 请求的中间层（FLOW-001 首版，schemaVersion=1）。
 * - `tool` 来自 `V2_TASK_TOOL_MAP[taskId]`，作为 `submitEdit` 的 `options.tool`。
 * - `auxiliary.description` 取代旧 PromptInput 的独立提交，统一为"补充要求"。
 */
export interface EditRecipe {
  schemaVersion: 1;
  taskId: V2TaskId;
  tool: RetouchTool | null;
  portrait: PortraitParams;
  protections: ProtectionItems;
  auxiliary: {
    /** 补充要求（原 PromptInput 文本，不再独立提交） */
    description: string;
    /** 参考图数量（参考图实际数据存于 useEditor.state.referenceImages） */
    referenceImageCount: number;
    /** 区域信息（用于穿帮修复/路人去除；FLOW-001 仅存储，UI 不强制构建） */
    regions: Region[];
    /** 导出格式（仅 export 任务使用） */
    outputFormat: 'jpeg' | 'png' | 'webp';
    /** 导出质量百分比（仅 export 任务使用） */
    outputQuality: number;
  };
}

/** 编译后的 Prompt（版本化，version=1 为 FLOW-001 首版编译器输出） */
export interface CompiledPrompt {
  version: 1;
  prompt: string;
  recipe: EditRecipe;
}
