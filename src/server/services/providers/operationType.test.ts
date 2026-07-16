import { describe, it, expect } from 'vitest';
import { getProviderOperationType } from './operationType';

describe('getProviderOperationType', () => {
  it('returns "generate" for GLM image models', () => {
    expect(getProviderOperationType('glm', 'cogview-4-250304')).toBe('generate');
    expect(getProviderOperationType('glm', 'glm-image')).toBe('generate');
  });

  it('returns "chat" for GLM vision model', () => {
    expect(getProviderOperationType('glm', 'glm-4.6v')).toBe('chat');
  });

  it('returns "edit" for OpenAI gpt-image-2', () => {
    expect(getProviderOperationType('openai', 'gpt-image-2')).toBe('edit');
  });

  it('returns "generate" for OpenAI DALL-E models', () => {
    expect(getProviderOperationType('openai', 'dall-e-3')).toBe('generate');
  });

  it('returns "chat" for OpenAI text models', () => {
    expect(getProviderOperationType('openai', 'gpt-4o')).toBe('chat');
  });

  it('returns "edit" for Gemini providers', () => {
    expect(getProviderOperationType('gemini', 'gemini-2.0-flash')).toBe('edit');
  });

  it('returns "edit" for Seedream providers', () => {
    expect(getProviderOperationType('seedream', 'seedream-3.0')).toBe('edit');
  });

  it('returns "edit" for unsupported provider types', () => {
    expect(getProviderOperationType('jimeng', 'any-model')).toBe('edit');
    expect(getProviderOperationType('custom', 'any-model')).toBe('edit');
  });
});
