export type ProviderType = 'openai' | 'glm' | 'gemini' | 'seedream' | 'jimeng' | 'custom';

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
