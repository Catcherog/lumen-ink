import { providerStore } from './ProviderStore.js';
import type { ImageProvider } from './ImageProvider.js';
import { GLMProvider } from './GLMProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { SeedreamProvider } from './SeedreamProvider.js';
import type { ProviderConfig, ProviderType } from 'shared/types.js';
import { getProviderOperationType } from './operationType.js';

export { getProviderOperationType };

function createProvider(config: ProviderConfig): ImageProvider {
  switch (config.type) {
    case 'glm':
      return new GLMProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'seedream':
      return new SeedreamProvider(config);
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
