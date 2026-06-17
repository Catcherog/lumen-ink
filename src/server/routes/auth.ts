import { Router, Request, Response } from 'express';
import { login } from '../middleware/auth.js';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const { password } = req.body as { password: string };
  if (!password) {
    res.status(400).json({ error: '请输入密码' });
    return;
  }

  const token = login(password);
  if (token) {
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

export default router;
