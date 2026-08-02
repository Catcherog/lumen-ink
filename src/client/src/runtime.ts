import axios from 'axios';
import type {
  EphemeralProviderConfig,
  PublicRuntimeConfig,
  ProviderConfig,
} from '../../shared/types';

export type ClientRuntimeConfig = PublicRuntimeConfig;

export const DEFAULT_EPHEMERAL_PROVIDER: EphemeralProviderConfig = {
  type: 'seedream',
  apiKey: '',
  defaultModel: 'doubao-seedream-4-5-251128',
};

export function isEphemeralDemo(config?: ClientRuntimeConfig): boolean {
  return config?.runtimeMode === 'ephemeral-demo';
}

export function toEphemeralProviderView(config: EphemeralProviderConfig): ProviderConfig {
  const now = Date.now();
  return {
    id: 'ephemeral-byo',
    name: `${config.type === 'seedream' ? '即梦 Seedream' : config.type.toUpperCase()}（本次会话）`,
    type: config.type,
    apiKey: '',
    defaultModel: config.defaultModel,
    enabled: true,
    isDefault: true,
    hasApiKey: Boolean(config.apiKey),
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadRuntimeConfig(): Promise<ClientRuntimeConfig> {
  const response = await axios.get('/api/runtime', { timeout: 5000 });
  const config = response.data as Partial<ClientRuntimeConfig>;
  if (
    (config.runtimeMode !== 'persistent' && config.runtimeMode !== 'ephemeral-demo') ||
    (config.persistence !== 'enabled' && config.persistence !== 'disabled') ||
    (config.auth !== 'password' && config.auth !== 'disabled') ||
    !config.features ||
    typeof config.features.manualDownload !== 'boolean'
  ) {
    throw new Error('RUNTIME_CONFIG_INVALID');
  }
  return config as ClientRuntimeConfig;
}
