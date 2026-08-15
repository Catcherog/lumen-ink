/**
 * PERSIST-001 Project and Version API routes.
 *
 * Mounted under `/api/projects` with `authMiddleware`. Endpoints:
 *  - POST   /api/projects               upload a new Project + V0
 *  - GET    /api/projects/:id           fetch Project snapshot
 *  - DELETE /api/projects/:id           cascade delete Project + assets + objects
 *  - POST   /api/projects/:id/versions/:vid/activate   set active pointer
 *  - POST   /api/projects/:id/versions/:vid/approve    set approved pointer
 *
 * Domain failures are returned as `{ errorCode, message, diagnosticId }`
 * with the appropriate HTTP status. The route NEVER returns object storage
 * keys or Provider credentials — signed URLs are exposed only via the
 * snapshot's `signedUrls` map and are short-lived (15 min by default).
 *
 * COMPAT (BUSOS-P5-03): `signedUrls` is keyed by the public, stable
 * `asset.id`. The asset's `storageKey` is redacted in the response and is
 * NEVER a key in `signedUrls`. (Pre-P5-03 the map was keyed by the real
 * storageKey, but because `storageKey` is redacted in the external payload,
 * no external caller could ever resolve it — so this is a fix, not a
 * breaking change for working consumers. Known in-repo consumer
 * `src/client/src/AppV2.tsx` was updated to read `signedUrls[asset.id]`.)
 */

import { Router, Request, Response } from 'express';
import type { ProjectService, ProjectSnapshot } from '../services/ProjectService.js';
import type { GenerationService } from '../services/GenerationService.js';
import { DomainError, isDomainError } from '../domain/errors.js';
import type { DomainErrorCode } from '../domain/errors.js';
import { mountProjectJobsRoutes } from './jobs.js';
import { redactError } from '../security/redaction.js';

/**
 * Map a stable DomainErrorCode to an HTTP status. The mapping is fixed so
 * callers can rely on it across versions.
 */
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
 * Replace the storage key with a redacted form. The storage key itself is
 * NOT a secret (it's an opaque identifier the client already knows from
 * asset metadata); we redact it here as a defense-in-depth measure so a
 * logged response body cannot leak the on-disk layout. The signed URL
 * remains the only bearer of access to object bytes.
 */
function redactKey(storageKey: string): string {
  const parts = storageKey.split('/');
  const last = parts[parts.length - 1];
  return `redacted://${last}`;
}

/**
 * Factory: build a projects router bound to the supplied services. The
 * services are injected via a container so tests can swap adapters
 * without touching the route code.
 */
export function createProjectsRouter(deps: {
  projectService: ProjectService;
  generationService: GenerationService;
}): Router {
  const router = Router();
  const { projectService } = deps;

  // POST /api/projects
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, imageBase64, mimeType } = req.body as {
        name?: string;
        imageBase64?: string;
        mimeType?: string;
      };

      if (!name || !imageBase64 || !mimeType) {
        res.status(400).json({
          errorCode: 'UPLOAD_INVALID',
          message: 'UPLOAD_INVALID: 缺少 name / imageBase64 / mimeType',
          diagnosticId: 'client-input',
        });
        return;
      }

      let bytes: Buffer;
      try {
        bytes = Buffer.from(imageBase64, 'base64');
      } catch {
        res.status(400).json({
          errorCode: 'UPLOAD_INVALID',
          message: 'UPLOAD_INVALID: imageBase64 不是合法的 base64',
          diagnosticId: 'client-input',
        });
        return;
      }

      const snapshot = await projectService.createProject({
        workspaceId: 'default',
        name,
        bytes,
        mimeType,
      });

      const sanitized: ProjectSnapshot = {
        project: snapshot.project,
        assets: snapshot.assets.map((a) => ({ ...a, storageKey: redactKey(a.storageKey) })),
        versions: snapshot.versions,
        activeVersion: snapshot.activeVersion,
        approvedVersion: snapshot.approvedVersion,
        signedUrls: snapshot.signedUrls,
      };

      res.status(201).json(sanitized);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      // HARDEN-001C (AC-C10/C14): route raw errors through redactError so
      // secrets / stacks / upstream payloads are scrubbed before logging.
      const redacted = redactError(err, { errorCode: 'SAVE_FAILED' });
      console.error('[routes.projects] POST / failed', redacted.log);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.projects.post',
      });
    }
  });

  // GET /api/projects/:id
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const snapshot = await projectService.getProjectSnapshot(String(req.params.id));
      const sanitized: ProjectSnapshot = {
        project: snapshot.project,
        assets: snapshot.assets.map((a) => ({ ...a, storageKey: redactKey(a.storageKey) })),
        versions: snapshot.versions,
        activeVersion: snapshot.activeVersion,
        approvedVersion: snapshot.approvedVersion,
        signedUrls: snapshot.signedUrls,
      };
      res.json(sanitized);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      const redacted = redactError(err, { errorCode: 'SAVE_FAILED' });
      console.error('[routes.projects] GET /:id failed', redacted.log);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.projects.get',
      });
    }
  });

  // DELETE /api/projects/:id
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const result = await projectService.deleteProject(String(req.params.id));
      res.json(result);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      const redacted = redactError(err, { errorCode: 'SAVE_FAILED' });
      console.error('[routes.projects] DELETE /:id failed', redacted.log);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.projects.delete',
      });
    }
  });

  // POST /api/projects/:id/versions/:vid/activate
  router.post('/:id/versions/:vid/activate', async (req: Request, res: Response) => {
    try {
      const project = await projectService.activateVersion(
        String(req.params.id),
        String(req.params.vid)
      );
      res.json(project);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      const redacted = redactError(err, { errorCode: 'SAVE_FAILED' });
      console.error('[routes.projects] activate failed', redacted.log);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.projects.activate',
      });
    }
  });

  // POST /api/projects/:id/versions/:vid/approve
  router.post('/:id/versions/:vid/approve', async (req: Request, res: Response) => {
    try {
      const project = await projectService.approveVersion(
        String(req.params.id),
        String(req.params.vid)
      );
      res.json(project);
    } catch (err) {
      if (isDomainError(err)) {
        sendDomainError(res, err);
        return;
      }
      const redacted = redactError(err, { errorCode: 'SAVE_FAILED' });
      console.error('[routes.projects] approve failed', redacted.log);
      res.status(500).json({
        errorCode: 'SAVE_FAILED',
        message: err instanceof Error ? err.message : 'unknown error',
        diagnosticId: 'routes.projects.approve',
      });
    }
  });

  // Mount Job creation/listing routes as /:id/jobs on this router so the
  // `:id` route param is available (Express 4 does not propagate mount
  // path params to sub-routers).
  mountProjectJobsRoutes(router, deps.generationService);

  return router;
}
