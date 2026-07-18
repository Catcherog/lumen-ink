/**
 * PERSIST-001 Job API routes.
 *
 * Mounted under `/api/jobs` with `authMiddleware`. Endpoints:
 *  - GET    /api/jobs/:id                       fetch a Job by id
 *  - POST   /api/jobs/:id/cancel                cancel a queued/active Job
 *  - POST   /api/jobs/:id/retry                 retry a failed Job
 *
 * Job creation lives under `/api/projects/:id/jobs` (RESTful) and is
 * exposed via `createProjectJobsRouter` so the Project router can mount
 * it as a sub-route. Both routers share the same `GenerationService`.
 *
 * Idempotency:
 *  - POST /api/projects/:id/jobs requires an `Idempotency-Key` header.
 *    The same key returns the original Job without enqueuing twice.
 *
 * Domain failures are returned as `{ errorCode, message, diagnosticId }`.
 */

import { Router, Request, Response } from 'express';
import type { GenerationService } from '../services/GenerationService.js';
import { DomainError, isDomainError } from '../domain/errors.js';
import type { DomainErrorCode } from '../domain/errors.js';

function statusForCode(code: DomainErrorCode): number {
  switch (code) {
    case 'PROJECT_NOT_FOUND':
    case 'VERSION_NOT_FOUND':
    case 'ASSET_NOT_FOUND':
    case 'JOB_NOT_FOUND':
      return 404;
    case 'ILLEGAL_JOB_TRANSITION':
    case 'JOB_NOT_RETRYABLE':
    case 'INVALID_RECIPE':
    case 'UPLOAD_INVALID':
    case 'IDEMPOTENCY_CONFLICT':
    case 'JOB_NOT_CLAIMED_BY_CALLER':
    case 'JOB_LEASE_EXPIRED':
      return 409;
    case 'UPLOAD_TOO_LARGE':
    case 'UPLOAD_DECODE_FAILED':
    case 'UPLOAD_PIXEL_LIMIT':
      return 422;
    case 'PROVIDER_TIMEOUT':
      return 504;
    case 'PROVIDER_QUOTA':
      return 429;
    case 'PROVIDER_NETWORK':
      return 502;
    case 'SAVE_FAILED':
      return 500;
    default:
      return 500;
  }
}

function sendDomainError(res: Response, err: DomainError): void {
  res.status(statusForCode(err.code)).json({
    errorCode: err.code,
    message: err.message,
    diagnosticId: err.diagnosticId,
  });
}

/**
 * Job creation body. The `inputVersionId` is optional; when omitted the
 * Project's `activeVersionId` is used as the input.
 */
interface CreateJobBody {
  prompt?: string;
  inputVersionId?: string;
  providerId?: string;
  model?: string;
  outputSize?: '1k' | '2k' | '4k';
  recipe?: unknown;
}

/**
 * Factory: build a jobs router bound to the supplied GenerationService.
 * Handles GET / POST cancel / POST retry on `/api/jobs/:id`.
 */
export function createJobsRouter(generationService: GenerationService): Router {
  const router = Router();

  // GET /api/jobs/:id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      // Read-only fetch: we go through the repository via the service so
      // the API stays decoupled from the persistence layer. We expose a
      // minimal `getJob` shim that loads via the underlying deps.
      const jobId = String(req.params.id);
      const job = await generationService.getJob(jobId);
      if (!job) {
        res.status(404).json({
          errorCode: 'JOB_NOT_FOUND',
          message: `JOB_NOT_FOUND: ${jobId}`,
          diagnosticId: 'routes.jobs.get',
        });
        return;
      }
      res.json(job);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      console.error('[routes.jobs] GET /:id failed', err);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.jobs.get',
      });
    }
  });

  // POST /api/jobs/:id/cancel
  router.post('/:id/cancel', async (req: Request, res: Response) => {
    try {
      const job = await generationService.cancelJob(String(req.params.id));
      res.json(job);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      console.error('[routes.jobs] cancel failed', err);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.jobs.cancel',
      });
    }
  });

  // POST /api/jobs/:id/retry
  router.post('/:id/retry', async (req: Request, res: Response) => {
    try {
      const { job, parentJob } = await generationService.retryJob(String(req.params.id));
      res.status(201).json({ job, parentJob });
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      console.error('[routes.jobs] retry failed', err);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.jobs.retry',
      });
    }
  });

  return router;
}

/**
 * Mount Job creation/listing routes on the given router. These routes are
 * designed to be mounted as `/:id/jobs` on the projects router so that
 * `:id` is available as a route param (Express 4 does not propagate mount
 * path params to sub-routers).
 */
export function mountProjectJobsRoutes(
  router: Router,
  generationService: GenerationService
): void {
  // POST /:id/jobs
  router.post('/:id/jobs', async (req: Request, res: Response) => {
    try {
      const idempotencyKey = req.get('Idempotency-Key');
      if (!idempotencyKey) {
        res.status(400).json({
          errorCode: 'INVALID_RECIPE',
          message: 'INVALID_RECIPE: 缺少 Idempotency-Key 请求头',
          diagnosticId: 'client-input',
        });
        return;
      }

      const body = req.body as CreateJobBody;
      if (!body?.prompt) {
        res.status(400).json({
          errorCode: 'INVALID_RECIPE',
          message: 'INVALID_RECIPE: 缺少 prompt',
          diagnosticId: 'client-input',
        });
        return;
      }

      const projectId = String(req.params.id);
      const job = await generationService.createJob({
        projectId,
        prompt: body.prompt,
        inputVersionId: body.inputVersionId,
        providerId: body.providerId,
        model: body.model,
        outputSize: body.outputSize,
        idempotencyKey,
        recipe: body.recipe,
      });

      res.status(201).json(job);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      console.error('[routes.jobs] create failed', err);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.jobs.create',
      });
    }
  });

  // GET /:id/jobs — list active Jobs for the Project.
  router.get('/:id/jobs', async (req: Request, res: Response) => {
    try {
      const jobs = await generationService.listJobsByProject(String(req.params.id));
      res.json(jobs);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      console.error('[routes.jobs] list failed', err);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.jobs.list',
      });
    }
  });
}
