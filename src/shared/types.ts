export type ProviderType = 'openai' | 'glm' | 'jimeng' | 'custom';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  enabled: boolean;
  isDefault?: boolean;
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

// 兼容旧代码的别名
export type GeminiModel = GLMModel;
export const GEMINI_MODELS = GLM_MODELS;

// 修图工具
export type RetouchTool = 'face' | 'color' | 'liquify' | 'repair' | 'remove' | 'export';

export interface ReferenceImage {
  base64: string;
  mimeType: string;
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
  selectedModel: GLMModel;
  history: HistoryEntry[];
  referenceImages: ReferenceImage[];
  selectedTool: RetouchTool;
  selectedProvider: string | null;
  showApiSettings: boolean;
}

export type EditorAction =
  | { type: 'UPLOAD_IMAGE'; payload: { base64: string; mimeType: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RESULT'; payload: { imageData?: string; imageUrl?: string; text?: string; mimeType: string; history: HistoryEntry[] } }
  | { type: 'SET_REFERENCE_IMAGES'; payload: ReferenceImage[] }
  | { type: 'SET_CURRENT_IMAGE'; payload: { image?: string; imageUrl?: string; mimeType: string } }
  | { type: 'SET_MODEL'; payload: GLMModel }
  | { type: 'RESTORE_FROM_HISTORY'; payload: { entry: HistoryEntry; index: number } }
  | { type: 'LOAD_HISTORY'; payload: HistoryEntry[] }
  | { type: 'SET_TOOL'; payload: RetouchTool }
  | { type: 'SET_PROVIDER'; payload: string | null }
  | { type: 'SET_SHOW_API_SETTINGS'; payload: boolean };
