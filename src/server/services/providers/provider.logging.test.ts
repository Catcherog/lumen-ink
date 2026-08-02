import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeedreamProvider } from './SeedreamProvider.js';

describe('Provider upstream error logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not print an upstream body that echoes the request-scoped key', async () => {
    const sessionKey = 'session-key-should-not-escape';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: sessionKey } }), { status: 401 }))
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new SeedreamProvider({
      id: 'ephemeral-byo',
      name: 'ephemeral',
      type: 'seedream',
      apiKey: sessionKey,
      defaultModel: 'doubao-seedream-4-5-251128',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(provider.generate({ prompt: 'test', model: 'doubao-seedream-4-5-251128' }))
      .rejects.toMatchObject({ status: 401 });

    const logText = errorSpy.mock.calls.flat().map((value) => String(value)).join(' ');
    expect(logText).not.toContain(sessionKey);
    expect(logText).toContain('401');
  });
});
