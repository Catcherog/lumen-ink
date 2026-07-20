/**
 * D-034 Internal Security Floor — ProviderStore with env-managed deployed mode.
 *
 * Two operating modes:
 *  - Local (default): encrypted file-backed store at `dataDir/providers.json`.
 *    API keys are encrypted with `providerEncryptionKey` (configured) or
 *    fall back to `PROVIDER_ENCRYPTION_KEY` / `JWT_SECRET` env vars only when
 *    `configure()` has not been called (legacy singleton compatibility).
 *  - Deployed (env-managed): Provider metadata is reconstructed from env vars
 *    on each cold start. No filesystem reads or writes. Mutating operations
 *    (create/update/delete/setDefault) are no-ops that return a sanitized view
 *    but do not persist. Provider CRUD routes return HTTP 403 with
 *    `PROVIDER_CONFIG_ENV_MANAGED` in this mode.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { ProviderConfig } from 'shared/types.js';
import { redactError } from '../../security/redaction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === 'lumen-ink') {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const projectRoot = findProjectRoot(__dirname);
// D-011 (HARDEN-001B): Production Provider configuration must NOT depend on
// `/tmp`. In deployed (env-managed) mode, ProviderStore reconstructs Provider
// metadata from environment variables on each cold start and performs zero
// filesystem operations (see loadFromEnv / save no-op). The dataDir below is
// only used in local/test mode where the operator has approved a persistent
// path; VERCEL must switch to env-managed mode via runtime config, not rely
// on a /tmp fallback that disappears between cold starts.
const DEFAULT_DATA_DIR = path.join(projectRoot, 'src', 'server', 'data');
const DEFAULT_DATA_FILE = path.join(DEFAULT_DATA_DIR, 'providers.json');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export interface ProviderStoreConfig {
  isDeployed: boolean;
  providerEncryptionKey: string;
  /** Optional override for the data directory (used in tests). */
  dataDir?: string;
}

function encrypt(plainText: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedText: string, key: Buffer): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted API key format');
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function isEncrypted(value: string): boolean {
  return value.includes(':') && value.split(':').length === 3;
}

interface StoreData {
  providers: ProviderConfig[];
}

// Stable IDs for env-managed providers so multiple cold starts produce
// identical metadata (tested by ProviderStore.test.ts).
const ENV_SEEDREAM_ID = 'env-seedream';
const ENV_OPENAI_ID = 'env-openai';

export class ProviderStore {
  private providers: ProviderConfig[] = [];
  private loaded = false;
  private config: ProviderStoreConfig | null = null;

  /**
   * Configure the store with injected runtime config. Resets any cached
   * state so the next access reloads using the new config.
   */
  configure(config: ProviderStoreConfig): void {
    this.config = config;
    this.loaded = false;
    this.providers = [];
  }

  /** True when the store is env-managed (deployed mode). */
  isEnvManaged(): boolean {
    return this.config?.isDeployed ?? false;
  }

  private getDataDir(): string {
    return this.config?.dataDir ?? DEFAULT_DATA_DIR;
  }

  private getDataFile(): string {
    return path.join(this.getDataDir(), 'providers.json');
  }

  private getEncryptionKey(): Buffer {
    const configuredKey = this.config?.providerEncryptionKey;
    if (configuredKey) {
      return crypto.createHash('sha256').update(configuredKey).digest();
    }
    // Backwards-compat fallback for the unconfigured singleton (e.g. tests
    // that import `providerStore` directly without calling configure()).
    // Per D-034, production code MUST call configure() with an injected key.
    const envKey = process.env.PROVIDER_ENCRYPTION_KEY;
    if (envKey) {
      return crypto.createHash('sha256').update(envKey).digest();
    }
    const jwtSecret = process.env.JWT_SECRET || 'lumen-ink-secret';
    return crypto.createHash('sha256').update(jwtSecret).digest();
  }

  private ensureDataDir(): void {
    const dataDir = this.getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private load(): void {
    if (this.loaded) return;
    if (this.config?.isDeployed) {
      this.loadFromEnv();
    } else {
      this.loadFromFile();
    }
    this.loaded = true;
  }

  /**
   * Deployed-mode loader: reconstruct sanitized Provider metadata from env
   * vars. Never reads or writes the filesystem.
   */
  private loadFromEnv(): void {
    const providers: ProviderConfig[] = [];
    const now = Date.now();

    const seedreamKey = process.env.SEEDREAM_API_KEY || process.env.VOLC_API_KEY;
    if (seedreamKey) {
      providers.push({
        id: ENV_SEEDREAM_ID,
        name: '即梦 Seedream',
        type: 'seedream',
        apiKey: seedreamKey, // held in memory only; list() sanitizes
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        defaultModel: 'doubao-seedream-4-5-251128',
        enabled: true,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      providers.push({
        id: ENV_OPENAI_ID,
        name: 'GPT OpenAI',
        type: 'openai',
        apiKey: openaiKey,
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: !seedreamKey, // default only when Seedream is absent
        createdAt: now,
        updatedAt: now,
      });
    }

    this.providers = providers;
    // IMPORTANT: do NOT call save() — env-managed stores never write to disk.
  }

  private loadFromFile(): void {
    this.ensureDataDir();
    const dataFile = this.getDataFile();
    if (fs.existsSync(dataFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(dataFile, 'utf8')) as StoreData;
        this.providers = data.providers || [];
      } catch (error) {
        // D-034 Task 7: use redactError so the log never echoes file
        // contents (which may contain encrypted apiKeys or paths).
        // HARDEN-001B AC-B05: serialize the structured log as JSON so the
        // redacted errorCode is actually visible in the console output
        // (console.error on a Record<string, unknown> prints [object Object]).
        const redacted = redactError(error, { errorCode: 'PROVIDER_STORE_LOAD_FAILED' });
        console.error(
          '[ProviderStore] Failed to load providers.json',
          JSON.stringify(redacted.log)
        );
        this.providers = [];
      }
    }
    this.seedDefaults();
    this.ensureDefault();
  }

  private save(): void {
    // No-op in env-managed mode — env vars are the source of truth.
    if (this.config?.isDeployed) return;
    this.ensureDataDir();
    fs.writeFileSync(this.getDataFile(), JSON.stringify({ providers: this.providers }, null, 2));
  }

  private ensureDefault(): void {
    const enabled = this.providers.filter(p => p.enabled);
    if (enabled.length === 0) return;
    const hasDefault = enabled.some(p => p.isDefault);
    if (!hasDefault) {
      enabled[0].isDefault = true;
    }
  }

  private seedDefaults(): void {
    const now = Date.now();
    let changed = false;

    // 首次启动（无任何 Provider）：预置 Seedream（默认）+ OpenAI 两个 Provider
    if (this.providers.length === 0) {
      const seedreamApiKey = process.env.SEEDREAM_API_KEY || process.env.VOLC_API_KEY;
      const key = this.getEncryptionKey();
      this.providers.push({
        id: crypto.randomUUID(),
        name: '即梦 Seedream',
        type: 'seedream',
        apiKey: seedreamApiKey ? encrypt(seedreamApiKey, key) : '',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        defaultModel: 'doubao-seedream-4-5-251128',
        enabled: true,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });

      const openaiApiKey = process.env.OPENAI_API_KEY;
      this.providers.push({
        id: crypto.randomUUID(),
        name: 'GPT OpenAI',
        type: 'openai',
        apiKey: openaiApiKey ? encrypt(openaiApiKey, key) : '',
        baseUrl: '',
        defaultModel: 'gpt-image-2',
        enabled: true,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      });

      changed = true;
      console.log('[ProviderStore] Seeded default providers: Seedream (default) + OpenAI');
    }

    if (changed) this.save();
  }

  private decryptConfig(config: ProviderConfig): ProviderConfig {
    if (!config.apiKey) {
      return { ...config, apiKey: '', hasApiKey: false };
    }
    // Env-managed providers hold the raw apiKey in memory (no encryption);
    // file-backed providers hold an encrypted blob. Detect and handle both.
    if (!isEncrypted(config.apiKey)) {
      return { ...config, hasApiKey: true };
    }
    return {
      ...config,
      apiKey: decrypt(config.apiKey, this.getEncryptionKey()),
      hasApiKey: true,
    };
  }

  list(): ProviderConfig[] {
    this.load();
    return this.providers.map((p) => {
      const { apiKey: _apiKey, ...rest } = p;
      return { ...rest, apiKey: '', hasApiKey: !!p.apiKey } as ProviderConfig;
    });
  }

  get(id: string): ProviderConfig | null {
    this.load();
    const found = this.providers.find((p) => p.id === id);
    return found ? this.decryptConfig(found) : null;
  }

  getDefault(): ProviderConfig | null {
    this.load();
    const defaultId = process.env.DEFAULT_PROVIDER_ID;
    let found: ProviderConfig | undefined;

    if (defaultId) {
      found = this.providers.find((p) => p.enabled && p.id === defaultId);
    }
    if (!found) {
      found = this.providers.find((p) => p.enabled && p.isDefault);
    }
    if (!found) {
      found = this.providers.find((p) => p.enabled);
    }

    return found ? this.decryptConfig(found) : null;
  }

  create(config: Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>): ProviderConfig {
    this.load();
    // In env-managed mode, return a sanitized view without persisting.
    if (this.config?.isDeployed) {
      return this.sanitizeView(config);
    }
    const now = Date.now();
    const provider: ProviderConfig = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    if (provider.apiKey) {
      provider.apiKey = encrypt(provider.apiKey, this.getEncryptionKey());
    }

    if (provider.isDefault) {
      this.providers.forEach((p) => (p.isDefault = false));
    }

    this.providers.push(provider);
    this.ensureDefault();
    this.save();
    return this.decryptConfig(provider);
  }

  update(id: string, config: Partial<ProviderConfig>): ProviderConfig | null {
    this.load();
    if (this.config?.isDeployed) {
      const existing = this.providers.find((p) => p.id === id);
      return existing ? this.sanitizeView(existing) : null;
    }
    const index = this.providers.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const existing = this.providers[index];
    const updated: ProviderConfig = {
      ...existing,
      ...config,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    if (config.apiKey !== undefined) {
      if (config.apiKey && !isEncrypted(config.apiKey)) {
        updated.apiKey = encrypt(config.apiKey, this.getEncryptionKey());
      } else if (config.apiKey === '') {
        updated.apiKey = '';
      }
    } else {
      updated.apiKey = existing.apiKey;
    }

    if (updated.isDefault) {
      this.providers.forEach((p, i) => {
        if (i !== index) p.isDefault = false;
      });
    }

    this.providers[index] = updated;
    this.ensureDefault();
    this.save();
    return this.decryptConfig(updated);
  }

  delete(id: string): boolean {
    this.load();
    if (this.config?.isDeployed) {
      // No-op in env-managed mode
      return this.providers.some((p) => p.id === id);
    }
    const index = this.providers.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.providers.splice(index, 1);
    this.ensureDefault();
    this.save();
    return true;
  }

  setDefault(id: string): ProviderConfig | null {
    this.load();
    if (this.config?.isDeployed) {
      const existing = this.providers.find((p) => p.id === id);
      return existing ? this.sanitizeView(existing) : null;
    }
    const index = this.providers.findIndex((p) => p.id === id);
    if (index === -1) return null;

    // 设为默认时自动启用该 Provider
    this.providers[index].enabled = true;

    this.providers.forEach((p, i) => {
      p.isDefault = i === index;
      if (i === index) p.updatedAt = Date.now();
    });
    this.save();
    return this.decryptConfig(this.providers[index]);
  }

  /**
   * Build a sanitized view of a ProviderConfig for env-managed mode returns.
   * The apiKey is wiped; hasApiKey reflects whether a key is present.
   */
  private sanitizeView(config: Partial<ProviderConfig>): ProviderConfig {
    const { apiKey: _apiKey, ...rest } = config as ProviderConfig;
    return {
      ...rest,
      apiKey: '',
      hasApiKey: !!config.apiKey,
    } as ProviderConfig;
  }
}

export const providerStore = new ProviderStore();
