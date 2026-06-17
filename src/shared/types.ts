export interface EditRequest {
  prompt: string;
  image: string; // base64
  mimeType: string;
  referenceImages?: Array<{
    data: string; // base64
    mimeType: string;
  }>;
  model?: string;
  history?: ConversationTurn[];
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

export interface HistoryEntry {
  id: string;
  prompt: string;
  resultImage?: string; // base64
  resultImageUrl?: string; // GLM URL
  resultMimeType?: string;
  timestamp: number;
}

export interface EditorState {
  originalImage: string | null;
  originalMimeType: string;
  currentImage: string | null; // latest result, or original if no edits yet
  currentImageUrl: string | null; // GLM URL
  currentMimeType: string;
  history: HistoryEntry[];
  selectedModel: GLMModel;
  isLoading: boolean;
  error: string | null;
}

export type EditorAction =
  | { type: 'UPLOAD_IMAGE'; payload: { base64: string; mimeType: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_HISTORY'; payload: HistoryEntry }
  | { type: 'SET_CURRENT_IMAGE'; payload: { image?: string; imageUrl?: string; mimeType: string } }
  | { type: 'SET_MODEL'; payload: GLMModel }
  | { type: 'RESTORE_FROM_HISTORY'; payload: { entry: HistoryEntry; index: number } };
