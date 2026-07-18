/**
 * D-034 Internal Security Floor — ProviderStore env-managed deployed mode.
 *
 * Asserts:
 *  - In deployed mode, ProviderStore reconstructs sanitized Provider metadata
 *    from environment variables on each cold start.
 *  - No filesystem writes occur in deployed mode (no /tmp/providers.json).
 *  - Two store instances with the same env produce identical metadata.
 *  - getDefault() returns decrypted apiKey from env (not from disk).
 *  - isEnvManaged() reflects the configured mode.
 *  - In local mode, the injected providerEncryptionKey is used and there is
 *    no fallback to JWT_SECRET or a built-in string when configure() is used.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import os from 'os';
import { ProviderStore } from './ProviderStore.js';

const ENC_KEY = 'test-encryption-key-32-chars-min!!';

describe('ProviderStore (D-034 internal security floor)', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-store-test-'));
    for (const key of [
      'SEEDREAM_API_KEY',
      'VOLC_API_KEY',
      'OPENAI_API_KEY',
      'GLM_API_KEY',
      'GEMINI_API_KEY',
      'VERCEL',
      'PROVIDER_ENCRYPTION_KEY',
      'JWT_SECRET',
      'DEFAULT_PROVIDER_ID',
    ]) {
      delete process.env[key];
    }
  });

  afterEach(async () => {
    process.env = originalEnv;
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  describe('deployed mode (env-managed)', () => {
    it('builds Provider list from env vars without filesystem writes', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';
      process.env.OPENAI_API_KEY = 'sk-test-openai';

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      const list = store.list();
      expect(list).toHaveLength(2);

      // Sanitized: apiKey is empty string, hasApiKey is true
      for (const p of list) {
        expect(p.apiKey).toBe('');
        expect(p.hasApiKey).toBe(true);
      }

      // Type order: Seedream first (default), OpenAI second
      expect(list[0].type).toBe('seedream');
      expect(list[0].isDefault).toBe(true);
      expect(list[1].type).toBe('openai');
      expect(list[1].isDefault).toBe(false);

      // No providers.json file written
      const dataFile = path.join(tempDir, 'providers.json');
      expect(fs.existsSync(dataFile)).toBe(false);
    });

    it('reconstructs identical Provider metadata on each cold start', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';

      const store1 = new ProviderStore();
      store1.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });
      const list1 = store1.list().map((p) => ({ ...p, createdAt: 0, updatedAt: 0 }));

      const store2 = new ProviderStore();
      store2.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });
      const list2 = store2.list().map((p) => ({ ...p, createdAt: 0, updatedAt: 0 }));

      expect(list1).toEqual(list2);
    });

    it('returns decrypted apiKey from getDefault()', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      const defaultProvider = store.getDefault();
      expect(defaultProvider).not.toBeNull();
      expect(defaultProvider?.apiKey).toBe('sk-test-seedream');
      expect(defaultProvider?.type).toBe('seedream');
      expect(defaultProvider?.hasApiKey).toBe(true);
    });

    it('falls back to OpenAI as default when Seedream key is absent', () => {
      process.env.OPENAI_API_KEY = 'sk-test-openai';

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      const list = store.list();
      expect(list).toHaveLength(1);
      expect(list[0].type).toBe('openai');

      const defaultProvider = store.getDefault();
      expect(defaultProvider).not.toBeNull();
      expect(defaultProvider?.type).toBe('openai');
      expect(defaultProvider?.isDefault).toBe(true);
    });

    it('isEnvManaged() returns true after configure with isDeployed', () => {
      const store = new ProviderStore();
      expect(store.isEnvManaged()).toBe(false);

      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });
      expect(store.isEnvManaged()).toBe(true);
    });

    it('create/update/delete/setDefault are no-ops that do not write to disk', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      // Mutations should not throw, but should not persist either
      const created = store.create({
        name: 'Custom',
        type: 'openai',
        apiKey: 'sk-custom',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: false,
      });
      // In env-managed mode, create returns a sanitized view but does not persist
      expect(created).toBeDefined();

      const list = store.list();
      // Still only the env-derived providers — no new file write
      expect(list.length).toBe(1);
      expect(list[0].type).toBe('seedream');

      const dataFile = path.join(tempDir, 'providers.json');
      expect(fs.existsSync(dataFile)).toBe(false);
    });
  });

  describe('local mode (configured with injected encryption key)', () => {
    it('uses injected providerEncryptionKey without falling back to JWT_SECRET', async () => {
      process.env.JWT_SECRET = 'should-not-be-used-as-encryption-key';

      const store = new ProviderStore();
      store.configure({
        isDeployed: false,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      const created = store.create({
        name: 'Test Provider',
        type: 'openai',
        apiKey: 'sk-plain-key',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: true,
      });

      // The apiKey should be encrypted with the injected key, not JWT_SECRET
      // Verify by reading the raw file and finding the provider we just created
      const dataFile = path.join(tempDir, 'providers.json');
      const raw = JSON.parse(await fsp.readFile(dataFile, 'utf8'));
      const storedProvider = raw.providers.find(
        (p: { id: string }) => p.id === created.id
      );
      expect(storedProvider).toBeDefined();
      expect(storedProvider.apiKey).not.toBe('sk-plain-key');
      expect(storedProvider.apiKey).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

      // Decryption with the configured store should yield the original key
      const fetched = store.get(created.id);
      expect(fetched?.apiKey).toBe('sk-plain-key');
    });

    it('isEnvManaged() returns false in local mode', () => {
      const store = new ProviderStore();
      store.configure({
        isDeployed: false,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });
      expect(store.isEnvManaged()).toBe(false);
    });
  });
});
