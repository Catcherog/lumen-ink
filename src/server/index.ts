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
import { createWorkerRouter } from './routes/worker.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { providerStore } from './services/providers/ProviderStore.js';
import { getProvider } from './services/providers/ProviderFactory.js';
import { selectPersistenceByEnv, type CloudBasePersistenceDeps } from './infrastructure/persistence/index.js';
import {
  createLocalJobExecutor,
  createWorkerJobExecutor,
  type WorkerExecutor,
} from './infrastructure/executor/index.js';
import { ProjectService } from './services/ProjectService.js';
import { GenerationService } from './services/GenerationService.js';
import { loadRuntimeConfig } from './config/runtime.js';
import { createAuthThrottle } from './security/authThrottle.js';
import type { GenerationJob, JobExecutor } from './domain/persistence.js';

/**
 * PERSIST-001 P0-01: production providerFactory for the worker executor.
 *
 * Resolves the Provider via ProviderStore using `job.providerId` (or the
 * default), converts the frozen input bytes to base64, calls provider.edit(),
 * and converts the result back to bytes. Throws classified errors that
 * GenerationService.executeJob maps to stable DomainErrorCode values.
 */
async function productionProviderFactory(
  job: GenerationJob,
  input: { bytes: Uint8Array; mimeType: string }
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const provider = getProvider(job.providerId ?? undefined);
  if (!provider) {
    throw new Error(
      `PROVIDER_NOT_FOUND: 无法解析 Provider ${job.providerId ?? '(default)'}`
    );
  }
  const base64 = Buffer.from(input.bytes).toString('base64');
  const result = await provider.edit({
    prompt: job.prompt,
    image: base64,
    mimeType: input.mimeType,
    model: job.model ?? provider.config.defaultModel,
  });
  if (!result.imageData) {
    throw new Error(
      'PROVIDER_EMPTY_RESULT: Provider 返回空结果（无 imageData）'
    );
  }
  const resultBytes = Buffer.from(result.imageData, 'base64');
  return {
    bytes: new Uint8Array(resultBytes),
    mimeType: result.mimeType ?? input.mimeType,
  };
}

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

// PERSIST-001 P0-01: select persistence adapter by deployment mode.
// Deployed mode (VERCEL=1) uses CloudBase PostgreSQL + PG Storage with
// fail-fast config validation. Local mode uses the file-backed adapter.
const persistenceDeps = selectPersistenceByEnv();

// In deployed mode, the CloudBase adapter must be initialized before any
// method is invoked. Top-level await is safe in ESM and runs once per cold
// start. If ensureReady() throws, the boot fails fast with a stable error.
if (runtimeConfig.isDeployed) {
  const cloudBaseDeps = persistenceDeps as CloudBasePersistenceDeps;
  await cloudBaseDeps.ensureReady();
}

// PERSIST-001 P0-01: in deployed mode, use the real worker executor that
// actually invokes GenerationService.executeJob (with polling + sweeper
// recovery). In local/dev mode, the local no-op executor is sufficient —
// Jobs are executed manually in tests or via the legacy /api/edit path.
let workerExecutor: WorkerExecutor | null = null;
let jobExecutor: JobExecutor;
if (runtimeConfig.isDeployed) {
  workerExecutor = createWorkerJobExecutor({
    deps: persistenceDeps,
    providerFactory: productionProviderFactory,
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 100),
    leaseSeconds: Number(process.env.WORKER_LEASE_SECONDS ?? 60),
    sweeperIntervalMs: Number(process.env.WORKER_SWEEPER_INTERVAL_MS ?? 500),
  });
  jobExecutor = workerExecutor.executor;
  workerExecutor.start();
} else {
  jobExecutor = createLocalJobExecutor();
}

const projectService = new ProjectService(persistenceDeps, jobExecutor);
const generationService = new GenerationService(persistenceDeps, jobExecutor);

// Graceful shutdown: stop the worker timers so the process can exit cleanly.
if (workerExecutor) {
  const shutdown = () => {
    try {
      workerExecutor?.stop();
    } catch {
      // Best-effort during shutdown.
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

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

// D-034 Task 7: Health endpoint returns ONLY {"status":"ok"}.
// No environment-variable presence, Provider names/configuration, model
// names, default flags, or key presence. Internal diagnostics should
// use authenticated admin endpoints or server logs — never the public
// health probe.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
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

// PERSIST-001 P0-01C: explicit worker-recovery endpoint for Vercel Cron.
// Auth uses CRON_SECRET bearer token, NOT the user JWT middleware, because
// cron ticks have no user session. Disabled (503) when CRON_SECRET is unset.
app.use(
  '/api/worker',
  createWorkerRouter({
    deps: persistenceDeps,
    providerFactory: productionProviderFactory,
    leaseSeconds: Number(process.env.WORKER_LEASE_SECONDS ?? 60),
  })
);

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
