import { Router } from 'express';
import {
  toPublicRuntimeConfig,
  type RuntimeConfig,
} from '../config/runtime.js';

export function createRuntimeRouter(config: RuntimeConfig): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(toPublicRuntimeConfig(config));
  });

  return router;
}
