import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { loadRuntimeConfig } from './runtime';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

const mockedGet = axios.get as unknown as ReturnType<typeof vi.fn>;

describe('client runtime gate contract', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('loads the public runtime descriptor before rendering the editor', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        runtimeMode: 'ephemeral-demo',
        persistence: 'disabled',
        auth: 'disabled',
        features: {
          authentication: false,
          persistence: false,
          cloudHistory: false,
          manualDownload: true,
        },
      },
    });

    await expect(loadRuntimeConfig()).resolves.toMatchObject({
      runtimeMode: 'ephemeral-demo',
      persistence: 'disabled',
      auth: 'disabled',
    });
    expect(mockedGet).toHaveBeenCalledWith('/api/runtime', { timeout: 5000 });
  });

  it('fails closed on an incomplete descriptor', async () => {
    mockedGet.mockResolvedValueOnce({ data: { runtimeMode: 'ephemeral-demo' } });

    await expect(loadRuntimeConfig()).rejects.toThrow('RUNTIME_CONFIG_INVALID');
  });
});
