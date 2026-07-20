/**
 * HARDEN-001B: D-011 Provider Key migration off /tmp.
 *
 * Asserts the full set of D-011 invariants:
 *  - AC-B01: Production code contains no `/tmp` reference in DEFAULT_DATA_DIR,
 *            regardless of VERCEL env var.
 *  - AC-B02: Deployed (env-managed) mode performs zero filesystem operations
 *            (no existsSync / mkdirSync / readFileSync / writeFileSync).
 *  - AC-B03: Deployed mode cold start does not create any directory or file.
 *  - AC-B04: Provider Key is never returned to frontend (apiKey always '').
 *  - AC-B05: Error logs are redacted and never leak apiKey.
 *  - AC-B06: CRUD in env-managed mode performs no fs writes.
 *  - AC-B07: Local mode delete removes provider from file (cleanup behavior).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import os from 'os';
import { ProviderStore } from './ProviderStore.js';

const ENC_KEY = 'test-encryption-key-32-chars-min!!';

describe('HARDEN-001B: D-011 Provider Key migration off /tmp', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harden-001b-'));
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
    vi.restoreAllMocks();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  describe('AC-B01: DEFAULT_DATA_DIR does not reference /tmp', () => {
    it('does not contain /tmp when VERCEL env is unset', async () => {
      // ARRANGE: VERCEL not set
      // ACT: Read ProviderStore source to inspect DEFAULT_DATA_DIR
      const sourcePath = path.resolve(
        __dirname,
        './ProviderStore.ts'
      ).replace(/\\.test\./, '.');
      const source = await fsp.readFile(sourcePath, 'utf8');

      // ASSERT: source must not contain a /tmp literal branch
      // (the test source itself uses os.tmpdir() for its own scratch dir,
      //  but the ProviderStore.ts source must not reference /tmp directly)
      expect(source).not.toMatch(/path\.join\s*\(\s*['"`]\/tmp['"`]/);
      expect(source).not.toMatch(/['"`]\/tmp\/lumen-ink-data['"`]/);
    });

    it('does not contain /tmp when VERCEL=1 env is set', async () => {
      process.env.VERCEL = '1';
      const sourcePath = path.resolve(
        __dirname,
        './ProviderStore.ts'
      ).replace(/\\.test\./, '.');
      const source = await fsp.readFile(sourcePath, 'utf8');

      // ASSERT: regardless of env, the source code must not branch on VERCEL
      // to pick /tmp as the data dir
      expect(source).not.toMatch(/process\.env\.VERCEL\s*\?\s*path\.join\s*\(\s*['"`]\/tmp['"`]/);
    });
  });

  describe('AC-B02: deployed mode performs zero fs operations', () => {
    it('never calls fs.existsSync / mkdirSync / readFileSync / writeFileSync on list()', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';

      const existsSyncSpy = vi.spyOn(fs, 'existsSync');
      const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync');
      const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      store.list();

      expect(existsSyncSpy).not.toHaveBeenCalled();
      expect(mkdirSyncSpy).not.toHaveBeenCalled();
      expect(readFileSyncSpy).not.toHaveBeenCalled();
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });

    it('never calls fs methods on get / getDefault / create / update / delete / setDefault', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';
      process.env.OPENAI_API_KEY = 'sk-test-openai';

      const existsSyncSpy = vi.spyOn(fs, 'existsSync');
      const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync');
      const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      // Exercise every CRUD path
      store.list();
      store.get('env-seedream');
      store.getDefault();
      store.create({
        name: 'Custom',
        type: 'openai',
        apiKey: 'sk-custom',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: false,
      });
      store.update('env-seedream', { name: 'Updated' });
      store.setDefault('env-openai');
      store.delete('env-seedream');

      expect(existsSyncSpy).not.toHaveBeenCalled();
      expect(mkdirSyncSpy).not.toHaveBeenCalled();
      expect(readFileSyncSpy).not.toHaveBeenCalled();
      expect(writeFileSyncSpy).not.toHaveBeenCalled();
    });
  });

  describe('AC-B03: deployed mode cold start does not create any directory or file', () => {
    it('does not create the dataDir or providers.json on cold start', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';

      // Use a subdir under tempDir that does not yet exist
      const freshDataDir = path.join(tempDir, 'fresh-subdir');

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: freshDataDir,
      });

      store.list();
      store.getDefault();

      // The fresh subdir must not have been created
      expect(fs.existsSync(freshDataDir)).toBe(false);
      expect(fs.existsSync(path.join(freshDataDir, 'providers.json'))).toBe(false);
    });
  });

  describe('AC-B04: Provider Key never returned to frontend', () => {
    it('list() returns apiKey="" and hasApiKey=true for all providers', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';
      process.env.OPENAI_API_KEY = 'sk-test-openai';

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      const list = store.list();
      for (const p of list) {
        expect(p.apiKey).toBe('');
        expect(p.hasApiKey).toBe(true);
      }
    });

    it('create() in env-managed mode returns sanitized view (apiKey="")', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      const created = store.create({
        name: 'Custom',
        type: 'openai',
        apiKey: 'sk-super-secret-key',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: false,
      });

      expect(created.apiKey).toBe('');
      expect(created.hasApiKey).toBe(true);
    });
  });

  describe('AC-B05: error logs are redacted and never leak apiKey', () => {
    it('loadFromFile failure logs redacted message without file contents', () => {
      // Write a corrupt providers.json to trigger load failure
      const dataFile = path.join(tempDir, 'providers.json');
      fs.writeFileSync(dataFile, '{ this is not valid JSON {{{');

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = new ProviderStore();
      store.configure({
        isDeployed: false,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      store.list();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logged = consoleErrorSpy.mock.calls[0].join(' ');
      // Must NOT echo the raw file content
      expect(logged).not.toContain('this is not valid JSON');
      // Must contain a redacted error code
      expect(logged).toContain('PROVIDER_STORE_LOAD_FAILED');
    });
  });

  describe('AC-B06: CRUD in env-managed mode does not create providers.json file', () => {
    it('after create/update/delete/setDefault, no providers.json file exists', () => {
      process.env.SEEDREAM_API_KEY = 'sk-test-seedream';

      const store = new ProviderStore();
      store.configure({
        isDeployed: true,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      store.create({
        name: 'Custom',
        type: 'openai',
        apiKey: 'sk-custom',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: false,
      });
      store.update('env-seedream', { name: 'Updated' });
      store.setDefault('env-seedream');
      store.delete('env-seedream');

      expect(fs.existsSync(path.join(tempDir, 'providers.json'))).toBe(false);
    });
  });

  describe('AC-B07: local mode delete removes provider from file (cleanup behavior)', () => {
    it('delete() removes the provider from providers.json', async () => {
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

      const dataFile = path.join(tempDir, 'providers.json');
      const before = JSON.parse(await fsp.readFile(dataFile, 'utf8'));
      expect(before.providers.find((p: { id: string }) => p.id === created.id)).toBeDefined();

      const deleted = store.delete(created.id);
      expect(deleted).toBe(true);

      const after = JSON.parse(await fsp.readFile(dataFile, 'utf8'));
      expect(after.providers.find((p: { id: string }) => p.id === created.id)).toBeUndefined();
    });

    it('delete() on non-existent id returns false and does not modify file', async () => {
      const store = new ProviderStore();
      store.configure({
        isDeployed: false,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir,
      });

      store.create({
        name: 'Test Provider',
        type: 'openai',
        apiKey: 'sk-plain-key',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: true,
      });

      const dataFile = path.join(tempDir, 'providers.json');
      const before = JSON.parse(await fsp.readFile(dataFile, 'utf8'));

      const deleted = store.delete('non-existent-id');
      expect(deleted).toBe(false);

      const after = JSON.parse(await fsp.readFile(dataFile, 'utf8'));
      expect(after.providers).toEqual(before.providers);
    });
  });

  describe('AC-B08: local mode with VERCEL=1 env still uses non-/tmp dataDir', () => {
    it('when VERCEL=1 but isDeployed=false, writeFileSync is not called with /tmp path', () => {
      // Simulate a misconfiguration: VERCEL env set but local mode requested.
      // Per D-011, even in this misconfigured state, code must not write to /tmp.
      process.env.VERCEL = '1';

      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

      const store = new ProviderStore();
      store.configure({
        isDeployed: false,
        providerEncryptionKey: ENC_KEY,
        dataDir: tempDir, // explicit override → should be respected
      });

      store.create({
        name: 'Test Provider',
        type: 'openai',
        apiKey: 'sk-plain-key',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: true,
      });

      // All writeFileSync calls must target tempDir, never /tmp/lumen-ink-data
      for (const call of writeFileSyncSpy.mock.calls) {
        const filePath = String(call[0]);
        expect(filePath).not.toContain('/tmp/lumen-ink-data');
        expect(filePath).toContain(tempDir);
      }
    });
  });
});
