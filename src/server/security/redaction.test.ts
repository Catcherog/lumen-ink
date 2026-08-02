/**
 * D-034 Internal Security Floor — Redaction of errors, logs, and responses.
 *
 * Asserts `redactError`:
 *  - Generates a stable UUID diagnosticId for correlation.
 *  - Strips `sk-*` API keys, Bearer tokens, JWTs, base64 payloads, and
 *    connection URLs with embedded credentials from error messages.
 *  - Recursively scrubs `apiKey`-like fields from nested error.response.data.
 *  - Preserves allowlisted metadata (errorCode, httpStatus, providerType).
 *  - Returns user-safe Chinese publicMessage text.
 *  - Never copies arbitrary error objects into the log record.
 */

import { describe, it, expect } from 'vitest';
import { redactError, redactString, redactValue } from './redaction.js';

describe('redactError (D-034 internal security floor)', () => {
  it('generates a UUID diagnosticId for correlation', () => {
    const result = redactError(new Error('test'));
    expect(result.diagnosticId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('redacts sk-* API keys from error messages', () => {
    const result = redactError(new Error('Request failed with key sk-test-secret-12345'));
    const serialized = JSON.stringify(result.log);
    expect(serialized).not.toContain('sk-test-secret-12345');
    expect(serialized).toContain('[REDACTED:apikey]');
  });

  it('redacts Bearer tokens', () => {
    const result = redactError(
      new Error('Authorization: Bearer eyJhbGci.short')
    );
    const serialized = JSON.stringify(result.log);
    expect(serialized).not.toContain('Bearer eyJhbGci');
    expect(serialized).not.toContain('eyJhbGci.short');
  });

  it('redacts full JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = redactError(new Error(`Token: ${jwt}`));
    expect(JSON.stringify(result.log)).not.toContain(jwt);
  });

  it('redacts base64 image data URIs', () => {
    const b64 = 'data:image/png;base64,' + 'A'.repeat(200);
    const result = redactError(new Error(`Image payload: ${b64}`));
    expect(JSON.stringify(result.log)).not.toContain(b64);
    expect(JSON.stringify(result.log)).not.toContain('AAAA');
  });

  it('redacts long base64 strings (>= 100 chars)', () => {
    const longB64 = 'Q'.repeat(150);
    const result = redactError(new Error(`data=${longB64}`));
    expect(JSON.stringify(result.log)).not.toContain(longB64);
  });

  it('redacts connection URLs with embedded credentials', () => {
    const result = redactError(
      new Error('postgres://user:secretpass@host:5432/db')
    );
    const serialized = JSON.stringify(result.log);
    expect(serialized).not.toContain('secretpass');
  });

  it('preserves errorCode and httpStatus in log', () => {
    const result = redactError(new Error('test'), {
      errorCode: 'PROVIDER_TIMEOUT',
      httpStatus: 504,
    });
    expect(result.log.errorCode).toBe('PROVIDER_TIMEOUT');
    expect(result.log.httpStatus).toBe(504);
  });

  it('preserves providerType and operationType when provided', () => {
    const result = redactError(new Error('test'), {
      providerType: 'seedream',
      operationType: 'edit',
    });
    expect(result.log.providerType).toBe('seedream');
    expect(result.log.operationType).toBe('edit');
  });

  it('returns user-safe Chinese publicMessage', () => {
    const result = redactError(new Error('test'), {
      errorCode: 'PROVIDER_TIMEOUT',
    });
    expect(result.publicMessage).toBe('请求超时，请稍后重试');
  });

  it('returns generic Chinese publicMessage for unknown errors', () => {
    const result = redactError(new Error('test'));
    expect(result.publicMessage).toBe('处理请求时发生未知错误');
  });

  it('returns stable public messages for ephemeral demo error codes', () => {
    const expected: Record<string, string> = {
      PROVIDER_KEY_MISSING: '请先配置当前会话的 API Key',
      PROVIDER_AUTH_FAILED: 'API Key 无效或已过期',
      PROVIDER_MODEL_FORBIDDEN: '当前模型或 Endpoint 没有权限',
      PROVIDER_RATE_LIMITED: 'Provider 请求受限，请稍后重试',
      PROVIDER_UNAVAILABLE: 'Provider 服务暂时不可用，请稍后重试',
      PROVIDER_NETWORK: '无法连接 Provider 服务，请检查网络后重试',
      EDIT_INPUT_INVALID: '编辑输入无效，请检查图片和参数',
      EDIT_IMAGE_TOO_LARGE: '图片过大，请压缩后重试',
      EDIT_RESPONSE_INVALID: 'Provider 返回了无法识别的结果',
      AUTH_DISABLED_IN_EPHEMERAL_MODE: '临时展示模式不启用登录',
      PERSISTENCE_DISABLED: '临时展示模式不保存项目或历史',
    };

    for (const [errorCode, message] of Object.entries(expected)) {
      expect(redactError(new Error(errorCode), { errorCode }).publicMessage).toBe(message);
    }
  });

  it('redacts apiKey fields in nested error.response.data', () => {
    const error = new Error('upstream failure') as Error & {
      response?: { status?: number; data?: unknown };
    };
    error.response = {
      status: 401,
      data: {
        apiKey: 'sk-secret-key-123',
        providerName: 'test-provider',
        nested: { token: 'Bearer abc.def.ghi', ok: true },
      },
    };
    const result = redactError(error);
    const serialized = JSON.stringify(result.log);
    expect(serialized).not.toContain('sk-secret-key-123');
    expect(serialized).not.toContain('Bearer abc.def.ghi');
    expect(serialized).toContain('test-provider');
    expect(result.log.upstreamStatus).toBe(401);
  });

  it('does not copy arbitrary non-allowlisted error properties into log', () => {
    const error = new Error('test') as Error & {
      config?: { headers: Record<string, string> };
      body?: unknown;
    };
    error.config = { headers: { Authorization: 'Bearer secret.jwt.token' } };
    error.body = { image: 'base64data'.repeat(50) };
    const result = redactError(error);
    const logKeys = Object.keys(result.log);
    expect(logKeys).not.toContain('config');
    expect(logKeys).not.toContain('body');
  });

  it('scrubs stack traces from the log record', () => {
    const error = new Error('test failure');
    error.stack = 'Error: test failure\n    at /secret/path/file.ts:1:1\n    at sk-leak-in-stack';
    const result = redactError(error);
    const serialized = JSON.stringify(result.log);
    expect(serialized).not.toContain('/secret/path/file.ts');
    expect(serialized).not.toContain('sk-leak-in-stack');
  });
});

describe('redactString', () => {
  it('returns the same string when no sensitive data is present', () => {
    expect(redactString('hello world')).toBe('hello world');
  });

  it('redacts multiple occurrences of sk- keys', () => {
    const result = redactString('keys: sk-aaa and sk-bbb');
    expect(result).toBe('keys: [REDACTED:apikey] and [REDACTED:apikey]');
  });
});

describe('redactValue', () => {
  it('recursively redacts objects with sensitive keys', () => {
    const input = {
      apiKey: 'sk-secret',
      token: 'Bearer x.y.z',
      safe: { name: 'ok', password: 'leaked' },
    };
    const result = redactValue(input) as Record<string, unknown>;
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    const nested = result.safe as Record<string, unknown>;
    expect(nested.name).toBe('ok');
    expect(nested.password).toBe('[REDACTED]');
  });

  it('redacts strings inside arrays', () => {
    const input = ['sk-secret', 'safe-text', 'Bearer x.y.z'];
    const result = redactValue(input) as unknown[];
    expect(result[0]).toBe('[REDACTED:apikey]');
    expect(result[1]).toBe('safe-text');
    expect(result[2]).toBe('[REDACTED:bearer]');
  });

  it('passes through primitives', () => {
    expect(redactValue(42)).toBe(42);
    expect(redactValue(true)).toBe(true);
    expect(redactValue(null)).toBe(null);
  });
});
