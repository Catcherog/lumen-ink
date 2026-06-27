import { Router, Request, Response } from 'express';
import { providerStore } from '../services/providers/ProviderStore.js';
import type { ProviderConfig } from 'shared/types.js';

const router = Router();

function sanitize(config: ProviderConfig): ProviderConfig {
  const { apiKey: _apiKey, hasApiKey: _existing, ...rest } = config;
  return { ...rest, apiKey: '', hasApiKey: _existing ?? !!_apiKey } as ProviderConfig;
}

router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(providerStore.list().map(sanitize));
  } catch (error) {
    console.error('List providers error:', error);
    res.status(500).json({ error: '获取 Provider 列表失败' });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, type, apiKey, baseUrl, defaultModel, enabled, isDefault } = req.body as Partial<ProviderConfig>;

    if (!name || !type || !defaultModel) {
      res.status(400).json({ error: '缺少必要参数：name, type, defaultModel' });
      return;
    }

    const provider = providerStore.create({
      name,
      type,
      apiKey,
      baseUrl,
      defaultModel,
      enabled: enabled ?? true,
      isDefault,
    } as Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt'>);

    res.status(201).json(sanitize(provider));
  } catch (error: unknown) {
    console.error('Create provider error:', error);
    const err = error as { message?: string };
    res.status(500).json({ error: err.message || '创建 Provider 失败' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, type, apiKey, baseUrl, defaultModel, enabled, isDefault } = req.body as Partial<ProviderConfig>;

    const updated = providerStore.update(id, {
      name,
      type,
      apiKey,
      baseUrl,
      defaultModel,
      enabled,
      isDefault,
    });

    if (!updated) {
      res.status(404).json({ error: 'Provider 不存在' });
      return;
    }

    res.json(sanitize(updated));
  } catch (error: unknown) {
    console.error('Update provider error:', error);
    const err = error as { message?: string };
    res.status(500).json({ error: err.message || '更新 Provider 失败' });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = providerStore.delete(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Provider 不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete provider error:', error);
    const err = error as { message?: string };
    res.status(500).json({ error: err.message || '删除 Provider 失败' });
  }
});

router.patch('/:id/default', (req: Request, res: Response) => {
  try {
    const updated = providerStore.setDefault(req.params.id as string);
    if (!updated) {
      res.status(404).json({ error: 'Provider 不存在' });
      return;
    }
    res.json(sanitize(updated));
  } catch (error: unknown) {
    console.error('Set default provider error:', error);
    const err = error as { message?: string };
    res.status(500).json({ error: err.message || '设置默认 Provider 失败' });
  }
});

export default router;
