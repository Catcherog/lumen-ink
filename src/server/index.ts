import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import editRouter from './routes/edit.js';
import authRouter from './routes/auth.js';
import providersRouter from './routes/providers.js';
import detectRouter from './routes/detect.js';
import { authMiddleware } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 尝试从多个位置加载 .env 文件
dotenv.config({ path: path.join(__dirname, '../../.env') }); // 项目根目录
dotenv.config({ path: path.join(__dirname, '../.env') }); // src 目录
dotenv.config(); // 当前目录

// 关键环境变量兜底与校验，避免未配置时产生未处理异常导致 500
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

// 静态文件托管（前端构建产物，仅本地开发用）
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// SPA 回退：非 /api 路径都返回 index.html（仅本地开发用）
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

export default app;

// 只在非 Vercel 环境下启动服务器（Vercel 用 serverless function）
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
