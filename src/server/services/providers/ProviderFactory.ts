import { providerStore } from './ProviderStore.js';
import type { ImageProvider } from './ImageProvider.js';
import { GLMProvider } from './GLMProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import type { ProviderConfig, ProviderType } from 'shared/types.js';

function createProvider(config: ProviderConfig): ImageProvider {
  switch (config.type) {
    case 'glm':
      return new GLMProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'jimeng':
      throw new Error('Jimeng Provider 尚未实现');
    case 'custom':
      throw new Error('Custom Provider 尚未实现');
    default:
      throw new Error(`不支持的 Provider 类型: ${(config as { type: string }).type}`);
  }
}

export function getProvider(providerId?: string): ImageProvider | null {
  let config: ProviderConfig | null = providerId ? providerStore.get(providerId) : null;
  if (!config) {
    config = providerStore.getDefault();
  }
  if (!config || !config.enabled) {
    return null;
  }
  return createProvider(config);
}

export function getProviderOperationType(
  type: ProviderType,
  model: string
): 'generate' | 'edit' | 'chat' {
  switch (type) {
    case 'glm':
      if (model === 'cogview-4-250304' || model === 'glm-image') return 'generate';
      if (model === 'glm-4.6v') return 'chat';
      return 'generate';
    case 'openai':
      if (model === 'gpt-image-2') return 'edit';
      if (model.startsWith('dall-e') || model.startsWith('gpt-image')) return 'generate';
      return 'chat';
    case 'jimeng':
    case 'custom':
    default:
      return 'edit';
  }
}
