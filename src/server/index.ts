import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import editRouter from './routes/edit.js';
import authRouter from './routes/auth.js';
import providersRouter from './routes/providers.js';
import detectRouter from './routes/detect.js';
import { authMiddleware } from './middleware/auth.js';

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

process.env.JWT_SECRET ??= 'gemini-image-editor-secret';
process.env.AUTH_PASSWORD ??= 'changeme';
if (!process.env.GLM_API_KEY && !process.env.ZHIPU_API_KEY && !process.env.DEFAULT_PROVIDER_ID) {
  console.warn('[ENV] GLM_API_KEY / ZHIPU_API_KEY / DEFAULT_PROVIDER_ID 未配置，系统启动后可能没有可用的默认 Provider');
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/providers', authMiddleware, providersRouter);
app.use('/api/edit', authMiddleware, editRouter);
app.use('/api/detect', authMiddleware, detectRouter);

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
