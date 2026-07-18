import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createEditRouter } from './routes/edit.js';
import authRouter from './routes/auth.js';
import providersRouter from './routes/providers.js';
import detectRouter from './routes/detect.js';
import { createProjectsRouter } from './routes/projects.js';
import { createJobsRouter } from './routes/jobs.js';
import { authMiddleware } from './middleware/auth.js';
import { providerStore } from './services/providers/ProviderStore.js';
import { createLocalPersistence } from './infrastructure/persistence/local.js';
import { createLocalJobExecutor } from './infrastructure/executor/local.js';
import { ProjectService } from './services/ProjectService.js';
import { GenerationService } from './services/GenerationService.js';

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

process.env.JWT_SECRET ??= 'lumen-ink-secret';
process.env.AUTH_PASSWORD ??= 'changeme';
if (!process.env.SEEDREAM_API_KEY && !process.env.DEFAULT_PROVIDER_ID) {
  console.warn('[ENV] SEEDREAM_API_KEY 未配置，默认 Seedream Provider 将没有 API Key');
}

// PERSIST-001: local file-backed persistence for PoC / dev / tests.
// Production (Vercel) should inject a CloudBase adapter before going live.
// The root defaults to `src/server/data/` (gitignored) and may be overridden
// via PERSISTENCE_ROOT for operators who prefer a different absolute path.
const persistenceRoot =
  process.env.PERSISTENCE_ROOT ?? path.join(__dirname, 'data');
const persistenceDeps = createLocalPersistence({ rootDir: persistenceRoot });
const jobExecutor = createLocalJobExecutor();
const projectService = new ProjectService(persistenceDeps, jobExecutor);
const generationService = new GenerationService(persistenceDeps, jobExecutor);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
      hasSeedreamKey: !!process.env.SEEDREAM_API_KEY,
      hasOpenaiKey: !!process.env.OPENAI_API_KEY,
      hasGlmKey: !!process.env.GLM_API_KEY,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasEncryptionKey: !!process.env.PROVIDER_ENCRYPTION_KEY,
    },
    providers,
  });
});

app.use('/api/auth', authRouter);
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
