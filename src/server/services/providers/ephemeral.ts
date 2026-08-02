import type { EphemeralProviderConfig, ProviderConfig, ProviderType } from 'shared/types.js';
import type { ImageProvider } from './ImageProvider.js';
import { createProvider } from './ProviderFactory.js';

export interface EphemeralProviderSuccess {
  config: ProviderConfig;
  provider: ImageProvider;
}

export interface EphemeralProviderFailure {
  errorCode: 'PROVIDER_KEY_MISSING' | 'PROVIDER_TYPE_UNSUPPORTED' | 'PROVIDER_MODEL_FORBIDDEN';
  status: 400 | 403;
}

export type EphemeralProviderResult = EphemeralProviderSuccess | EphemeralProviderFailure;

const SUPPORTED_TYPES: ReadonlySet<ProviderType> = new Set([
  'openai',
  'glm',
  'gemini',
  'seedream',
]);

// Keep this runtime allowlist local to the server package. The shared model
// catalog is a client/runtime module and is intentionally not imported by the
// server build, whose `shared/*` alias is type-only.
const ALLOWED_MODELS: Record<EphemeralProviderConfig['type'], readonly string[]> = {
  seedream: ['doubao-seedream-4-5-251128', 'doubao-seedream-5-0-lite-250415'],
  openai: ['gpt-image-2', 'gpt-image-2-t2i', 'gpt-4o', 'dall-e-3'],
  gemini: [
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ],
  glm: ['cogview-4-250304', 'glm-image', 'glm-4.6v'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function defaultName(type: EphemeralProviderConfig['type']): string {
  switch (type) {
    case 'seedream':
      return '即梦 Seedream';
    case 'openai':
      return 'GPT OpenAI';
    case 'gemini':
      return 'Google Gemini';
    case 'glm':
      return '智谱 GLM';
  }
}

export function createEphemeralProvider(input: unknown): EphemeralProviderResult {
  if (!isRecord(input) || typeof input.apiKey !== 'string' || input.apiKey.trim() === '') {
    return { errorCode: 'PROVIDER_KEY_MISSING', status: 400 };
  }

  const type = input.type;
  if (typeof type !== 'string' || !SUPPORTED_TYPES.has(type as ProviderType)) {
    return { errorCode: 'PROVIDER_TYPE_UNSUPPORTED', status: 400 };
  }

  const defaultModel = input.defaultModel;
  if (typeof defaultModel !== 'string' || defaultModel.trim() === '') {
    return { errorCode: 'PROVIDER_MODEL_FORBIDDEN', status: 403 };
  }

  const allowedModels = ALLOWED_MODELS[type as EphemeralProviderConfig['type']] ?? [];
  if (!allowedModels.includes(defaultModel)) {
    return { errorCode: 'PROVIDER_MODEL_FORBIDDEN', status: 403 };
  }

  const now = Date.now();
  const config: ProviderConfig = {
    id: 'ephemeral-byo',
    name: defaultName(type as EphemeralProviderConfig['type']),
    type: type as EphemeralProviderConfig['type'],
    apiKey: input.apiKey.trim(),
    defaultModel,
    enabled: true,
    isDefault: true,
    hasApiKey: true,
    createdAt: now,
    updatedAt: now,
  };

  return { config, provider: createProvider(config) };
}
