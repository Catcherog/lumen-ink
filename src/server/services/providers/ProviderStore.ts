import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import type { ProviderConfig } from 'shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === 'gemini-image-editor') {
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
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'glm-image-editor-data')
  : path.join(projectRoot, 'src', 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'providers.json');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const envKey = process.env.PROVIDER_ENCRYPTION_KEY;
  if (envKey) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  const jwtSecret = process.env.JWT_SECRET || 'gemini-image-editor-secret';
  return crypto.createHash('sha256').update(jwtSecret).digest();
}

function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted API key format');
  }
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function isEncrypted(value: string): boolean {
  return value.includes(':') && value.split(':').length === 3;
}

interface StoreData {
  providers: ProviderConfig[];
}

export class ProviderStore {
  private providers: ProviderConfig[] = [];
  private loaded = false;

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): void {
    if (this.loaded) return;
    this.ensureDataDir();
    if (fs.existsSync(DATA_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as StoreData;
        this.providers = data.providers || [];
      } catch (error) {
        console.error('[ProviderStore] Failed to load providers.json:', error);
        this.providers = [];
      }
    }
    this.loaded = true;
    this.seedDefaults();
    this.ensureDefault();
  }

  private save(): void {
    this.ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify({ providers: this.providers }, null, 2));
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
      this.providers.push({
        id: crypto.randomUUID(),
        name: '即梦 Seedream',
        type: 'seedream',
        apiKey: seedreamApiKey ? encrypt(seedreamApiKey) : '',
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
        apiKey: openaiApiKey ? encrypt(openaiApiKey) : '',
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
    return {
      ...config,
      apiKey: config.apiKey ? decrypt(config.apiKey) : '',
      hasApiKey: !!config.apiKey,
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
    const now = Date.now();
    const provider: ProviderConfig = {
      ...config,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    if (provider.apiKey) {
      provider.apiKey = encrypt(provider.apiKey);
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
        updated.apiKey = encrypt(config.apiKey);
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
    const index = this.providers.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.providers.splice(index, 1);
    this.ensureDefault();
    this.save();
    return true;
  }

  setDefault(id: string): ProviderConfig | null {
    this.load();
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
}

export const providerStore = new ProviderStore();
