import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { AuthThrottle } from '../security/authThrottle.js';
import type { RuntimeConfig } from '../config/runtime.js';
import { createAuthRouter } from './auth.js';

const ephemeralConfig: RuntimeConfig = {
  runtimeMode: 'ephemeral-demo',
  persistence: 'disabled',
  authMode: 'disabled',
  isDeployed: true,
  providerEnvManaged: false,
  authPassword: '',
  jwtSecret: '',
  providerEncryptionKey: '',
  corsAllowlist: ['https://demo.example.com'],
  maxUploadBytes: 20 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  loginWindowMs: 15 * 60 * 1000,
};

describe('ephemeral-demo /api/auth', () => {
  it('returns a fast structured disabled response without invoking a throttle', async () => {
    const throttle = {
      isBlocked: vi.fn(),
      recordFailure: vi.fn(),
      recordSuccess: vi.fn(),
    } as unknown as AuthThrottle;
    const app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter({ config: ephemeralConfig, throttle }));

    const response = await request(app).post('/api/auth').send({ password: 'should-not-be-read' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      errorCode: 'AUTH_DISABLED_IN_EPHEMERAL_MODE',
      message: '临时展示模式不启用登录',
    });
    expect(response.body).not.toHaveProperty('token');
    expect(throttle.isBlocked).not.toHaveBeenCalled();
    expect(throttle.recordFailure).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain('should-not-be-read');
  });
});
