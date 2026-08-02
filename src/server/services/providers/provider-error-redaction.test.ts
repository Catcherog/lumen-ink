import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig, ProviderType } from 'shared/types.js';
import { GLMProvider } from './GLMProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { SeedreamProvider } from './SeedreamProvider.js';
import type { ImageProvider } from './ImageProvider.js';

const SENSITIVE_ERROR = 'upstream failure Bearer live-token-123 sk-live-provider-key';

function makeConfig(type: ProviderType, defaultModel: string): ProviderConfig {
  return {
    id: 'ephemeral-byo',
    name: 'BYO Provider',
    type,
    apiKey: 'byo-provider-key',
    defaultModel,
    enabled: true,
    isDefault: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

const providers: Array<[string, ImageProvider, string]> = [
  ['OpenAI', new OpenAIProvider(makeConfig('openai', 'gpt-image-2')), 'generate'],
  ['Gemini', new GeminiProvider(makeConfig('gemini', 'gemini-2.5-flash-image')), 'generate'],
  ['GLM', new GLMProvider(makeConfig('glm', 'cogview-4-250304')), 'generate'],
  ['Seedream', new SeedreamProvider(makeConfig('seedream', 'doubao-seedream-4-5-251128')), 'generate'],
];

describe('Provider upstream error logs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => SENSITIVE_ERROR,
    })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(providers)('%s redacts upstream error text before logging', async (_name, provider) => {
    await expect(provider.generate({ prompt: 'test prompt' })).rejects.toBeDefined();

    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .map(String)
      .join(' ');

    expect(logged).not.toContain(SENSITIVE_ERROR);
    expect(logged).not.toContain('live-token-123');
    expect(logged).not.toContain('sk-live-provider-key');
  });
});
