/**
 * 服务端专用类型声明
 * 作用：让 src/server 在编译时无需把 src/shared/types.ts 纳入 rootDir，
 *       从而保证 tsc 输出扁平到 src/server/dist/index.js。
 * 注意：这里只放服务端实际使用的类型；运行时值仍由 src/shared/types.ts 维护。
 */

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
  image?: string;
  mimeType?: string;
  referenceImages?: Array<{
    data: string;
    mimeType: string;
  }>;
  model?: string;
  providerId?: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: { url: string };
    }>;
  }>;
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
  imageData?: string;
  imageUrl?: string;
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

export type GLMModel = 'cogview-4-250304' | 'glm-4.6v' | 'glm-image';
export type GeminiModel = GLMModel;
