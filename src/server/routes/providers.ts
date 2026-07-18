import { Router, Request, Response } from 'express';
import { providerStore } from '../services/providers/ProviderStore.js';
import type { ProviderConfig } from 'shared/types.js';
import { redactError } from '../security/redaction.js';

const router = Router();

function sanitize(config: ProviderConfig): ProviderConfig {
  const { apiKey: _apiKey, hasApiKey: _existing, ...rest } = config;
  return { ...rest, apiKey: '', hasApiKey: _existing ?? !!_apiKey } as ProviderConfig;
}

/** Reject mutating routes when the ProviderStore is env-managed (deployed mode). */
function envManagedGuard(req: Request, res: Response): boolean {
  if (providerStore.isEnvManaged()) {
    res.status(403).json({ error: 'PROVIDER_CONFIG_ENV_MANAGED' });
    return true;
  }
  return false;
}

router.get('/', (_req: Request, res: Response) => {
  try {
    res.json(providerStore.list().map(sanitize));
  } catch (error) {
    const redacted = redactError(error, { errorCode: 'PROVIDER_LIST_FAILED' });
    console.error('[routes.providers] list failed', redacted.log);
    res.status(500).json({ error: redacted.publicMessage, diagnosticId: redacted.diagnosticId });
  }
});

router.post('/', (req: Request, res: Response) => {
  if (envManagedGuard(req, res)) return;
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
    const redacted = redactError(error, { errorCode: 'PROVIDER_CREATE_FAILED' });
    console.error('[routes.providers] create failed', redacted.log);
    res.status(500).json({ error: redacted.publicMessage, diagnosticId: redacted.diagnosticId });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  if (envManagedGuard(req, res)) return;
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
    const redacted = redactError(error, { errorCode: 'PROVIDER_UPDATE_FAILED' });
    console.error('[routes.providers] update failed', redacted.log);
    res.status(500).json({ error: redacted.publicMessage, diagnosticId: redacted.diagnosticId });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  if (envManagedGuard(req, res)) return;
  try {
    const deleted = providerStore.delete(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Provider 不存在' });
      return;
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const redacted = redactError(error, { errorCode: 'PROVIDER_DELETE_FAILED' });
    console.error('[routes.providers] delete failed', redacted.log);
    res.status(500).json({ error: redacted.publicMessage, diagnosticId: redacted.diagnosticId });
  }
});

router.patch('/:id/default', (req: Request, res: Response) => {
  if (envManagedGuard(req, res)) return;
  try {
    const updated = providerStore.setDefault(req.params.id as string);
    if (!updated) {
      res.status(404).json({ error: 'Provider 不存在' });
      return;
    }
    res.json(sanitize(updated));
  } catch (error: unknown) {
    const redacted = redactError(error, { errorCode: 'PROVIDER_SET_DEFAULT_FAILED' });
    console.error('[routes.providers] set default failed', redacted.log);
    res.status(500).json({ error: redacted.publicMessage, diagnosticId: redacted.diagnosticId });
  }
});

export default router;
