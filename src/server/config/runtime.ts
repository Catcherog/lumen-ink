/**
 * D-034 Internal Security Floor — Runtime configuration loader.
 *
 * In deployed mode (VERCEL=1 or NODE_ENV=production), this loader fails fast
 * with a stable error code when any required secret is missing or weak. It
 * NEVER assigns default secrets to `process.env`; defaults are only used in
 * local/test mode.
 *
 * Required in deployed persistent mode:
 *  - AUTH_PASSWORD (>= 12 chars)
 *  - JWT_SECRET (>= 32 chars)
 *  - PROVIDER_ENCRYPTION_KEY (>= 32 chars)
 *  - CORS_ALLOWLIST (at least one exact origin)
 *  - At least one of SEEDREAM_API_KEY / VOLC_API_KEY / OPENAI_API_KEY must be
 *    non-empty so a default Provider has credentials.
 *
 * In local/test mode, safe defaults are used so `npm run dev` and `vitest`
 * work without real secrets.
 */

export interface RuntimeConfig {
  /** Explicit runtime branch. The default is persistent for compatibility. */
  runtimeMode: import('shared/types.js').RuntimeMode;
  /** Whether durable persistence services are available to the app. */
  persistence: import('shared/types.js').PersistenceMode;
  /** Whether password/JWT authentication is available to the app. */
  authMode: import('shared/types.js').AuthMode;
  /** True when running on Vercel or with NODE_ENV=production. */
  isDeployed: boolean;
  /** True when Provider create/update/delete routes must return 403. */
  providerEnvManaged: boolean;
  authPassword: string;
  jwtSecret: string;
  providerEncryptionKey: string;
  /** Exact origin strings allowed by CORS. */
  corsAllowlist: string[];
  /** Max request body size in bytes (default 20 MiB). */
  maxUploadBytes: number;
  /** Max decoded image pixel count (default 40 MP). */
  maxImagePixels: number;
  /** Login throttle window in milliseconds (default 15 minutes). */
  loginWindowMs: number;
}

const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MiB
const DEFAULT_MAX_IMAGE_PIXELS = 40_000_000; // 40 MP
const DEFAULT_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const MIN_PASSWORD_LENGTH = 12;
const MIN_SECRET_LENGTH = 32;

const LOCAL_DEFAULTS = {
  authPassword: 'changeme',
  jwtSecret: 'lumen-ink-local-dev-secret-32chars!!',
  providerEncryptionKey: 'lumen-ink-local-dev-enc-key-32chars',
  corsAllowlist: ['http://localhost:5173', 'http://localhost:3001'],
};

export type EnvSource = Record<string, string | undefined>;

/**
 * Load runtime configuration from the given env source (defaults to
 * `process.env`). Throws a stable error code in deployed mode when any
 * required secret is missing or weak.
 */
export function loadRuntimeConfig(env: EnvSource = process.env): RuntimeConfig {
  const isDeployed = env.VERCEL === '1' || env.NODE_ENV === 'production';
  const runtimeMode = parseRuntimeMode(env.LUMEN_RUNTIME_MODE);

  if (runtimeMode === 'ephemeral-demo') {
    return loadEphemeralConfig(env, isDeployed);
  }

  if (isDeployed) {
    return loadDeployedConfig(env);
  }
  return loadLocalConfig(env);
}

function parseRuntimeMode(raw: string | undefined): RuntimeConfig['runtimeMode'] {
  if (!raw || raw === 'persistent') return 'persistent';
  if (raw === 'ephemeral-demo') return 'ephemeral-demo';
  throw new Error(
    `LUMEN_RUNTIME_MODE_INVALID: ${raw}. Allowed: persistent | ephemeral-demo`
  );
}

function assertEphemeralDisabledValue(
  env: EnvSource,
  key: 'PERSISTENCE_BACKEND' | 'AUTH_MODE',
  expectedError: string
): void {
  const value = env[key];
  if (value !== undefined && value !== '' && value !== 'disabled') {
    throw new Error(expectedError);
  }
}

function loadEphemeralConfig(env: EnvSource, isDeployed: boolean): RuntimeConfig {
  assertEphemeralDisabledValue(
    env,
    'PERSISTENCE_BACKEND',
    'EPHEMERAL_PERSISTENCE_MUST_BE_DISABLED'
  );
  assertEphemeralDisabledValue(env, 'AUTH_MODE', 'EPHEMERAL_AUTH_MUST_BE_DISABLED');

  const corsAllowlist = parseCorsAllowlist(env.CORS_ALLOWLIST);
  if (isDeployed && corsAllowlist.length === 0) {
    throw new Error('CORS_ALLOWLIST_REQUIRED');
  }

  return {
    runtimeMode: 'ephemeral-demo',
    persistence: 'disabled',
    authMode: 'disabled',
    isDeployed,
    providerEnvManaged: false,
    authPassword: '',
    jwtSecret: '',
    providerEncryptionKey: '',
    corsAllowlist:
      corsAllowlist.length > 0 ? corsAllowlist : LOCAL_DEFAULTS.corsAllowlist,
    maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
    maxImagePixels: DEFAULT_MAX_IMAGE_PIXELS,
    loginWindowMs: DEFAULT_LOGIN_WINDOW_MS,
  };
}

function loadDeployedConfig(env: EnvSource): RuntimeConfig {
  // AUTH_PASSWORD
  const authPassword = env.AUTH_PASSWORD;
  if (!authPassword) {
    throw new Error('AUTH_PASSWORD_REQUIRED');
  }
  if (authPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error('AUTH_PASSWORD_TOO_SHORT');
  }

  // JWT_SECRET
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET_REQUIRED');
  }
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error('JWT_SECRET_TOO_SHORT');
  }

  // PROVIDER_ENCRYPTION_KEY
  const providerEncryptionKey = env.PROVIDER_ENCRYPTION_KEY;
  if (!providerEncryptionKey) {
    throw new Error('PROVIDER_ENCRYPTION_KEY_REQUIRED');
  }
  if (providerEncryptionKey.length < MIN_SECRET_LENGTH) {
    throw new Error('PROVIDER_ENCRYPTION_KEY_TOO_SHORT');
  }

  // CORS_ALLOWLIST
  const corsAllowlist = parseCorsAllowlist(env.CORS_ALLOWLIST);
  if (corsAllowlist.length === 0) {
    throw new Error('CORS_ALLOWLIST_REQUIRED');
  }

  // At least one Provider credential must be present
  const hasSeedreamKey = !!(env.SEEDREAM_API_KEY || env.VOLC_API_KEY);
  const hasOpenaiKey = !!env.OPENAI_API_KEY;
  if (!hasSeedreamKey && !hasOpenaiKey) {
    throw new Error('DEFAULT_PROVIDER_CREDENTIAL_REQUIRED');
  }

  return {
    runtimeMode: 'persistent',
    persistence: 'enabled',
    authMode: 'password',
    isDeployed: true,
    providerEnvManaged: true,
    authPassword,
    jwtSecret,
    providerEncryptionKey,
    corsAllowlist,
    maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
    maxImagePixels: DEFAULT_MAX_IMAGE_PIXELS,
    loginWindowMs: DEFAULT_LOGIN_WINDOW_MS,
  };
}

function loadLocalConfig(env: EnvSource): RuntimeConfig {
  const corsAllowlist = parseCorsAllowlist(env.CORS_ALLOWLIST);
  return {
    runtimeMode: 'persistent',
    persistence: 'enabled',
    authMode: 'password',
    isDeployed: false,
    providerEnvManaged: false,
    authPassword: env.AUTH_PASSWORD ?? LOCAL_DEFAULTS.authPassword,
    jwtSecret: env.JWT_SECRET ?? LOCAL_DEFAULTS.jwtSecret,
    providerEncryptionKey:
      env.PROVIDER_ENCRYPTION_KEY ?? LOCAL_DEFAULTS.providerEncryptionKey,
    corsAllowlist:
      corsAllowlist.length > 0 ? corsAllowlist : LOCAL_DEFAULTS.corsAllowlist,
    maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES,
    maxImagePixels: DEFAULT_MAX_IMAGE_PIXELS,
    loginWindowMs: DEFAULT_LOGIN_WINDOW_MS,
  };
}

export function toPublicRuntimeConfig(
  config: RuntimeConfig
): import('shared/types.js').PublicRuntimeConfig {
  const ephemeral = config.runtimeMode === 'ephemeral-demo';
  return {
    runtimeMode: config.runtimeMode,
    persistence: config.persistence,
    auth: config.authMode,
    features: {
      authentication: !ephemeral,
      persistence: !ephemeral,
      cloudHistory: !ephemeral,
      manualDownload: true,
    },
  };
}

function parseCorsAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Array.from(new Set(parts));
}
