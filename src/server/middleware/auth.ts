import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'gemini-image-editor-secret';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'changeme';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function login(password: string): string | null {
  if (password === AUTH_PASSWORD) {
    return jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '7d' });
  }
  return null;
}
