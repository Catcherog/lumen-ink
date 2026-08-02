import { describe, expect, it } from 'vitest';
import { createEphemeralProvider } from './ephemeral.js';

describe('createEphemeralProvider', () => {
  it('creates a request-scoped provider without touching ProviderStore', () => {
    const result = createEphemeralProvider({
      type: 'seedream',
      apiKey: 'byo-seedream-key',
      defaultModel: 'doubao-seedream-4-5-251128',
    });

    expect('provider' in result).toBe(true);
    if (!('provider' in result)) return;
    expect(result.provider.config.type).toBe('seedream');
    expect(result.provider.config.apiKey).toBe('byo-seedream-key');
    expect(result.provider.config.id).toBe('ephemeral-byo');
  });

  it('rejects a missing key with a stable error code', () => {
    expect(createEphemeralProvider({
      type: 'seedream',
      apiKey: ' ',
      defaultModel: 'doubao-seedream-4-5-251128',
    })).toEqual({ errorCode: 'PROVIDER_KEY_MISSING', status: 400 });
  });

  it('rejects unsupported providers and models before any upstream call', () => {
    expect(createEphemeralProvider({
      type: 'custom',
      apiKey: 'byo-key',
      defaultModel: 'custom-model',
    })).toEqual({ errorCode: 'PROVIDER_TYPE_UNSUPPORTED', status: 400 });

    expect(createEphemeralProvider({
      type: 'seedream',
      apiKey: 'byo-key',
      defaultModel: 'not-a-seedream-model',
    })).toEqual({ errorCode: 'PROVIDER_MODEL_FORBIDDEN', status: 403 });
  });
});
