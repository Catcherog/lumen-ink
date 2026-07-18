/**
 * D-034 Internal Security Floor — Express entrypoint with injected runtime config.
 *
 * Startup order:
 *  1. Load `.env` (local dev only; Vercel injects env vars directly).
 *  2. `loadRuntimeConfig()` — fails fast in deployed mode if any required
 *     secret is missing or weak. Never assigns default secrets to process.env.
 *  3. Configure `providerStore` with the injected encryption key and mode.
 *  4. Build persistence adapter + throttle from the frozen contracts.
 *  5. Wire CORS allowlist, auth middleware, auth router with throttle.
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createEditRouter } from './routes/edit.js';
import { createAuthRouter } from './routes/auth.js';
import providersRouter from './routes/providers.js';
import detectRouter from './routes/detect.js';
import { createProjectsRouter } from './routes/projects.js';
import { createJobsRouter } from './routes/jobs.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { providerStore } from './services/providers/ProviderStore.js';
import { createLocalPersistence } from './infrastructure/persistence/local.js';
import { createLocalJobExecutor } from './infrastructure/executor/local.js';
import { ProjectService } from './services/ProjectService.js';
import { GenerationService } from './services/GenerationService.js';
import { loadRuntimeConfig } from './config/runtime.js';
import { createAuthThrottle } from './security/authThrottle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findFileUpwards(startDir: string, filename: string, maxDepth = 5): string | null {
  let dir = startDir;
  for (let i = 0; i < maxDepth; i++) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envPath = findFileUpwards(__dirname, '.env');
if (envPath) {
  dotenv.config({ path: envPath });
}
dotenv.config();

// D-034: Load runtime config with fail-fast in deployed mode. Never assign
// default secrets to process.env — local mode uses safe defaults internally.
const runtimeConfig = loadRuntimeConfig();

// Configure ProviderStore with injected encryption key and mode flag. In
// deployed mode this switches to env-managed (no filesystem reads/writes).
providerStore.configure({
  isDeployed: runtimeConfig.providerEnvManaged,
  providerEncryptionKey: runtimeConfig.providerEncryptionKey,
});

if (!runtimeConfig.isDeployed && !process.env.SEEDREAM_API_KEY && !process.env.DEFAULT_PROVIDER_ID) {
  console.warn('[ENV] SEEDREAM_API_KEY 未配置，默认 Seedream Provider 将没有 API Key');
}

// PERSIST-001: local file-backed persistence for PoC / dev / tests.
// Production (Vercel) should inject a CloudBase adapter before going live.
const persistenceRoot =
  process.env.PERSISTENCE_ROOT ?? path.join(__dirname, 'data');
const persistenceDeps = createLocalPersistence({ rootDir: persistenceRoot });
const jobExecutor = createLocalJobExecutor();
const projectService = new ProjectService(persistenceDeps, jobExecutor);
const generationService = new GenerationService(persistenceDeps, jobExecutor);

// D-034: Durable login throttle backed by the frozen AuthThrottleRepository.
const authThrottle = createAuthThrottle({
  repo: persistenceDeps.authThrottle,
  jwtSecret: runtimeConfig.jwtSecret,
  windowMs: runtimeConfig.loginWindowMs,
  maxFailures: 5,
});

const app = express();

// D-034: Allowlist-based CORS. Requests with no Origin (same-process tests,
// health tooling) are allowed; configured origins are allowed; all others
// are rejected.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || runtimeConfig.corsAllowlist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: false,
  })
);
app.use(express.json({ limit: runtimeConfig.maxUploadBytes }));

app.get('/api/health', (_req, res) => {
  const providers = providerStore.list().map((p) => ({
    name: p.name,
    type: p.type,
    enabled: p.enabled,
    isDefault: p.isDefault,
    hasApiKey: p.hasApiKey,
    defaultModel: p.defaultModel,
  }));
  res.json({
    status: 'ok',
    env: {
      isVercel: !!process.env.VERCEL,
      isDeployed: runtimeConfig.isDeployed,
      providerEnvManaged: runtimeConfig.providerEnvManaged,
      hasSeedreamKey: !!process.env.SEEDREAM_API_KEY,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      hasGlmKey: !!process.env.GLM_API_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasJwtSecret: !!runtimeConfig.jwtSecret,
      hasEncryptionKey: !!runtimeConfig.providerEncryptionKey,
      corsAllowlistConfigured: runtimeConfig.corsAllowlist.length > 0,
    },
    providers,
  });
});

// Auth router does NOT use authMiddleware (it issues tokens, not verifies them).
app.use('/api/auth', createAuthRouter({ config: runtimeConfig, throttle: authThrottle }));

// All routes below require a valid JWT.
const authMiddleware = createAuthMiddleware({
  authPassword: runtimeConfig.authPassword,
  jwtSecret: runtimeConfig.jwtSecret,
});

app.use('/api/providers', authMiddleware, providersRouter);
app.use('/api/edit', authMiddleware, createEditRouter(generationService));
app.use('/api/detect', authMiddleware, detectRouter);
app.use(
  '/api/projects',
  authMiddleware,
  createProjectsRouter({ projectService, generationService })
);
app.use('/api/jobs', authMiddleware, createJobsRouter(generationService));

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    const indexFile = path.join(publicDir, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      res.status(404).json({ error: 'Not Found' });
    }
  });
}

app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
