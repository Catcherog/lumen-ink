import type { ProviderConfig, ConversationTurn, EditResult } from 'shared/types.js';

export interface GenerateParams {
  prompt: string;
  referenceImages?: Array<{ data: string; mimeType: string }>;
  model?: string;
  outputSize?: '1080P' | '2K';
}

export interface EditParams {
  prompt: string;
  image: string; // base64
  mimeType: string;
  referenceImages?: Array<{ data: string; mimeType: string }>;
  model?: string;
  regions?: Array<{ x: number; y: number; width: number; height: number; label?: string }>;
  outputSize?: '1080P' | '2K';
}

export interface ChatParams {
  prompt: string;
  image?: string;
  mimeType?: string;
  referenceImages?: Array<{ data: string; mimeType: string }>;
  history?: ConversationTurn[];
  model?: string;
}

export interface ImageProvider {
  readonly config: ProviderConfig;
  generate(params: GenerateParams): Promise<EditResult>;
  edit(params: EditParams): Promise<EditResult>;
  chat(params: ChatParams): Promise<EditResult>;
}

export type { EditResult } from 'shared/types.js';
