import type { ProviderType } from 'shared/types.js';

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
    case 'gemini':
      return 'edit';
    case 'seedream':
      return 'edit';
    case 'jimeng':
    case 'custom':
    default:
      return 'edit';
  }
}
