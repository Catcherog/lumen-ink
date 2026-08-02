import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { ImageProvider } from '../services/providers/ImageProvider.js';
import { createEditRouter } from './edit.js';

function makeProvider(): ImageProvider {
  return {
    config: {
      id: 'ephemeral-byo',
      name: '即梦 Seedream',
      type: 'seedream',
      apiKey: 'byo-key-that-must-not-escape',
      defaultModel: 'doubao-seedream-4-5-251128',
      enabled: true,
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    generate: vi.fn(async () => ({ imageData: 'result-base64', mimeType: 'image/png' })),
    edit: vi.fn(async () => ({ imageData: 'result-base64', mimeType: 'image/png' })),
    chat: vi.fn(async () => ({ text: 'result-text' })),
  } as ImageProvider;
}

function buildApp(provider?: ImageProvider) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/edit', createEditRouter(undefined, {
    runtimeMode: 'ephemeral-demo',
    ...(provider
      ? { ephemeralProviderFactory: () => ({ provider, config: provider.config }) }
      : {}),
  }));
  return app;
}

describe('ephemeral-demo /api/edit', () => {
  it('rejects a request without a BYO key without waiting on auth or persistence', async () => {
    const response = await request(buildApp())
      .post('/api/edit')
      .send({
        prompt: 'brighten the portrait',
        provider: {
          type: 'seedream',
          defaultModel: 'doubao-seedream-4-5-251128',
          apiKey: '',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      errorCode: 'PROVIDER_KEY_MISSING',
    });
  });

  it('uses only the request-scoped provider and never returns its key', async () => {
    const provider = makeProvider();
    const response = await request(buildApp(provider))
      .post('/api/edit')
      .send({
        prompt: 'brighten the portrait',
        model: 'doubao-seedream-4-5-251128',
        provider: {
          type: 'seedream',
          defaultModel: 'doubao-seedream-4-5-251128',
          apiKey: 'byo-key-that-must-not-escape',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      imageData: 'result-base64',
      mimeType: 'image/png',
    });
    expect(provider.edit).toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('byo-key-that-must-not-escape');
  });

  it('rejects project-shaped requests instead of touching persistence', async () => {
    const response = await request(buildApp(makeProvider()))
      .post('/api/edit')
      .send({ projectId: 'project-should-not-be-used', prompt: 'no persistence' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      errorCode: 'PERSISTENCE_DISABLED',
    });
  });

  it('forwards only the newly selected provider key to the provider factory', async () => {
    const provider = makeProvider();
    const providerFactory = vi.fn(() => ({ provider, config: provider.config }));
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/edit', createEditRouter(undefined, {
      runtimeMode: 'ephemeral-demo',
      ephemeralProviderFactory: providerFactory,
    }));

    await request(app)
      .post('/api/edit')
      .send({
        prompt: 'use the new provider',
        provider: {
          type: 'gemini',
          defaultModel: 'gemini-2.5-flash-image',
          apiKey: 'sk-gemini-new',
        },
      });

    expect(providerFactory).toHaveBeenCalledWith({
      type: 'gemini',
      defaultModel: 'gemini-2.5-flash-image',
      apiKey: 'sk-gemini-new',
    });
  });
});
