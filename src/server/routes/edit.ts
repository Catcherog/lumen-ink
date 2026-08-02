/**
 * PERSIST-001 Task 7 — controlled /api/edit compatibility layer.
 *
 * Two request shapes are accepted:
 *
 * 1. Legacy synchronous shape (no `projectId` in body):
 *      { prompt, image?, mimeType?, referenceImages?, history?,
 *        providerId?, model?, regions?, outputSize? }
 *    Delegates to the existing ProviderFactory pipeline and returns the
 *    classic EditResponse:
 *      { success, imageData?, imageUrl?, mimeType?, text?, meta? }
 *    No deprecation header is emitted on this path.
 *
 * 2. V2 compatibility shape (`projectId` present in body):
 *      { projectId, prompt, inputVersionId?, providerId?, model?,
 *        outputSize?, recipe? }
 *    Delegates to `generationService.createJob` and returns:
 *      { success: true, jobId, status, deprecatedSyncRoute: true }
 *    with response headers:
 *      Deprecation: true
 *      Link: </api/projects/:id/jobs>; rel="successor-version"
 *    Status code is 202 Accepted (the Job is queued, not yet complete).
 *
 * Mixed input (projectId + any of image/mimeType/referenceImages/history/
 * regions) is rejected with 400 — callers must pick one shape.
 *
 * The V2 path requires an `Idempotency-Key` header, consistent with the
 * canonical `/api/projects/:id/jobs` endpoint. Replaying the same key
 * returns the original Job without enqueuing twice.
 */

import { Router, Request, Response } from 'express';
import { getProvider, getProviderOperationType } from '../services/providers/ProviderFactory.js';
import type { EditRequest, EditResponse, EditResult } from 'shared/types.js';
import type { GenerationService } from '../services/GenerationService.js';
import {
  createEphemeralProvider,
  type EphemeralProviderResult,
} from '../services/providers/ephemeral.js';
import { DomainError, isDomainError } from '../domain/errors.js';
import type { DomainErrorCode } from '../domain/errors.js';
import { validateImageBytes, imageValidationHttpStatus } from '../security/imageValidation.js';
import { redactError, redactString } from '../security/redaction.js';

export interface EditRouterOptions {
  runtimeMode?: import('shared/types.js').RuntimeMode;
  ephemeralProviderFactory?: (input: unknown) => EphemeralProviderResult;
}

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

function sendEphemeralError(
  res: Response,
  errorCode: string,
  status: number
): void {
  const redacted = redactError(new Error(errorCode), { errorCode, httpStatus: status });
  res.status(status).json({
    success: false,
    errorCode,
    message: redacted.publicMessage,
    requestId: redacted.diagnosticId,
  });
}

function classifyEphemeralError(error: unknown): { errorCode: string; status: number } {
  const err = error as { status?: number; message?: string; name?: string };
  const message = err?.message?.toLowerCase() ?? '';
  if (err?.status === 401) return { errorCode: 'PROVIDER_AUTH_FAILED', status: 401 };
  if (err?.status === 403) return { errorCode: 'PROVIDER_MODEL_FORBIDDEN', status: 403 };
  if (err?.status === 429) return { errorCode: 'PROVIDER_RATE_LIMITED', status: 429 };
  if (
    err?.status === 504 ||
    err?.name === 'AbortError' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('超时')
  ) {
    return { errorCode: 'PROVIDER_TIMEOUT', status: 504 };
  }
  if (
    message.includes('fetch failed') ||
    message.includes('econn') ||
    message.includes('network') ||
    message.includes('网络')
  ) {
    return { errorCode: 'PROVIDER_NETWORK', status: 502 };
  }
  if (typeof err?.status === 'number' && err.status >= 500) {
    return { errorCode: 'PROVIDER_UNAVAILABLE', status: 502 };
  }
  return { errorCode: 'PROVIDER_UNAVAILABLE', status: 502 };
}

/**
 * V2 compatibility request body. The `projectId` field is the discriminator
 * that selects the V2 path; all other V2 fields are optional except `prompt`.
 */
interface V2CompatRequest extends EditRequest {
  projectId?: string;
  inputVersionId?: string;
  recipe?: unknown;
}

export function createEditRouter(
  generationService?: GenerationService,
  options: EditRouterOptions = {}
): Router {
  const router = Router();
  const isEphemeralDemo = options.runtimeMode === 'ephemeral-demo';
  const ephemeralProviderFactory =
    options.ephemeralProviderFactory ?? createEphemeralProvider;

  router.post('/', async (req: Request, res: Response) => {
    const body = req.body as V2CompatRequest;

    // --- V2 compatibility path -------------------------------------------
    if (body && body.projectId) {
      if (isEphemeralDemo) {
        sendEphemeralError(res, 'PERSISTENCE_DISABLED', 409);
        return;
      }
      if (!generationService) {
        sendEphemeralError(res, 'PERSISTENCE_DISABLED', 409);
        return;
      }
      // Reject mixed input: legacy-only fields cannot be combined with the
      // project-aware path. Callers must choose one shape.
      const legacyFields: string[] = [];
      if (body.image) legacyFields.push('image');
      if (body.mimeType) legacyFields.push('mimeType');
      if (body.referenceImages && body.referenceImages.length) legacyFields.push('referenceImages');
      if (body.history && body.history.length) legacyFields.push('history');
      if (body.regions && body.regions.length) legacyFields.push('regions');
      if (legacyFields.length > 0) {
        res.status(400).json({
          success: false,
          error:
            `V2 兼容路径不接受 ${legacyFields.join(', ')}，` +
            `请改用 POST /api/projects/${body.projectId}/jobs 并在 body 中只传 prompt/inputVersionId/recipe`,
        } as EditResponse);
        return;
      }

      if (!body.prompt) {
        res.status(400).json({
          success: false,
          error: '缺少必要参数：prompt',
        } as EditResponse);
        return;
      }

      const idempotencyKey = req.get('Idempotency-Key');
      if (!idempotencyKey) {
        res.status(400).json({
          success: false,
          error: 'V2 兼容路径需要 Idempotency-Key 请求头（与 /api/projects/:id/jobs 一致）',
        } as EditResponse);
        return;
      }

      try {
        const job = await generationService.createJob({
          projectId: body.projectId,
          prompt: body.prompt,
          inputVersionId: body.inputVersionId,
          providerId: body.providerId,
          model: body.model,
          outputSize: body.outputSize,
          idempotencyKey,
          recipe: body.recipe,
        });

        // Mark the response as deprecated and point clients to the
        // canonical endpoint. The `Deprecation` header follows the
        // IETF draft (https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header)
        // and `Link: rel="successor-version"` is the standard hint.
        res.setHeader('Deprecation', 'true');
        res.setHeader(
          'Link',
          `</api/projects/${body.projectId}/jobs>; rel="successor-version"`
        );
        res.status(202).json({
          success: true,
          jobId: job.id,
          status: job.status,
          deprecatedSyncRoute: true,
        });
      } catch (err) {
        if (isDomainError(err)) {
          sendDomainError(res, err);
          return;
        }
        const redacted = redactError(err, { errorCode: 'V2_COMPAT_FAILED' });
        console.error('[routes.edit] V2 compat failed', redacted.log);
        res.status(500).json({
          success: false,
          error: redacted.publicMessage,
          diagnosticId: redacted.diagnosticId,
        } as EditResponse);
      }
      return;
    }

    // --- Legacy synchronous path -----------------------------------------
    try {
      const { prompt, image, mimeType, model, referenceImages, history, providerId, regions, outputSize } =
        body;

      if (!prompt) {
        res.status(400).json({
          success: false,
          error: '缺少必要参数：prompt',
        } as EditResponse);
        return;
      }

      let provider: ReturnType<typeof getProvider>;
      if (isEphemeralDemo) {
        const ephemeralInput = body.provider
          ? { ...body.provider, defaultModel: model || body.provider.defaultModel }
          : body.provider;
        const ephemeralResult = ephemeralProviderFactory(ephemeralInput);
        if (!('provider' in ephemeralResult)) {
          sendEphemeralError(res, ephemeralResult.errorCode, ephemeralResult.status);
          return;
        }
        provider = ephemeralResult.provider;
      } else {
        provider = getProvider(providerId);
      }
      if (!provider) {
        if (isEphemeralDemo) {
          sendEphemeralError(res, 'PROVIDER_KEY_MISSING', 400);
          return;
        }
        res.status(400).json({
          success: false,
          error: '未找到可用的 Provider，请先在 API 设置中配置',
        } as EditResponse);
        return;
      }

      const selectedModel = model || provider.config.defaultModel;
      const operationType = getProviderOperationType(provider.config.type, selectedModel);

      if (operationType === 'chat' && (!image || !mimeType)) {
        res.status(400).json({
          success: false,
          error: '图像理解模型需要上传图片',
        } as EditResponse);
        return;
      }

      // D-034 Task 6: validate any base64 image before forwarding to Provider.
      // This guards against MIME spoofing, decompression bombs, oversized
      // payloads, and malformed/truncated bytes that could crash downstream.
      let validatedImageBase64 = image;
      let validatedMimeType = mimeType;
      if (image) {
        try {
          const imageBytes = Buffer.from(image, 'base64');
          const validated = await validateImageBytes(imageBytes, mimeType || 'image/jpeg');
          // Re-encode validated (sanitized) bytes for the Provider — sharp
          // may rotate/normalize, so we pass the cleaned bytes forward.
          validatedImageBase64 = Buffer.from(validated.bytes).toString('base64');
          validatedMimeType = validated.mimeType;
        } catch (err) {
          const code = err instanceof Error ? err.message : 'INVALID_IMAGE_MALFORMED';
          const httpStatus = imageValidationHttpStatus(code);
          if (isEphemeralDemo) {
            const errorCode =
              httpStatus === 413 || code.includes('TOO_LARGE')
                ? 'EDIT_IMAGE_TOO_LARGE'
                : 'EDIT_INPUT_INVALID';
            sendEphemeralError(res, errorCode, httpStatus);
            return;
          }
          res.status(httpStatus).json({
            success: false,
            error: `图片校验失败: ${code}`,
          } as EditResponse);
          return;
        }
      }

      let result: EditResult;
      switch (operationType) {
        case 'generate':
          result = await provider.generate({ prompt, referenceImages, model: selectedModel, outputSize });
          break;
        case 'edit':
          result = await provider.edit({
            prompt,
            image: validatedImageBase64 || '',
            mimeType: validatedMimeType || 'image/jpeg',
            referenceImages,
            model: selectedModel,
            regions,
            outputSize,
          });
          break;
        case 'chat':
          result = await provider.chat({
            prompt,
            image: validatedImageBase64,
            mimeType: validatedMimeType,
            referenceImages,
            history,
            model: selectedModel,
          });
          break;
        default:
          throw new Error(`不支持的模型: ${selectedModel}`);
      }

      if (!result.imageData && !result.imageUrl && !result.text) {
        if (isEphemeralDemo) {
          sendEphemeralError(res, 'EDIT_RESPONSE_INVALID', 502);
          return;
        }
        throw new Error('PROVIDER_EMPTY_RESULT');
      }

      res.json({
        success: true,
        imageData: result.imageData,
        imageUrl: result.imageUrl,
        mimeType: result.mimeType,
        text: result.text,
        meta: {
          providerName: provider.config.name,
          providerType: provider.config.type,
          model: selectedModel,
          operationType,
        },
      } as EditResponse);
    } catch (error: unknown) {
      if (isEphemeralDemo) {
        const classified = classifyEphemeralError(error);
        sendEphemeralError(res, classified.errorCode, classified.status);
        return;
      }
      const redacted = redactError(error, { errorCode: 'LEGACY_EDIT_FAILED' });
      console.error('[routes.edit] legacy path failed', redacted.log);

      const err = error as { status?: number; message?: string; response?: { data?: { error?: string; message?: string } } };
      // upstreamMsg is scrubbed via redactString before being shown to the
      // client — never echo raw upstream error text.
      const rawUpstream = err.response?.data?.error || err.response?.data?.message || err.message || '';
      const upstreamMsg = rawUpstream ? redactString(rawUpstream) : '';

      // API Key 无效或已过期
      if (err.status === 401 || err.status === 403) {
        res.status(401).json({
          success: false,
          error: `API Key 无效或已过期${upstreamMsg ? `（${upstreamMsg}）` : '（请检查 Vercel 环境变量是否设置了 SEEDREAM_API_KEY）'}`,
        } as EditResponse);
        return;
      }

      // 额度耗尽
      if (err.status === 429 || err.message?.includes('quota') || err.message?.includes('额度')) {
        res.status(429).json({
          success: false,
          error: `额度已用尽${upstreamMsg ? `（${upstreamMsg}）` : ''}`,
        } as EditResponse);
        return;
      }

      // 请求超时
      if (err.status === 504 || err.message?.includes('超时')) {
        res.status(504).json({
          success: false,
          error: `请求超时${upstreamMsg ? `（${upstreamMsg}）` : '（API 响应过慢，请稍后重试）'}`,
        } as EditResponse);
        return;
      }

      // 服务不可用
      if (err.status && err.status >= 500) {
        res.status(502).json({
          success: false,
          error: `服务暂时不可用${upstreamMsg ? `（${upstreamMsg}）` : ''}`,
        } as EditResponse);
        return;
      }

      res.status(500).json({
        success: false,
        error: upstreamMsg || '编辑请求失败',
      } as EditResponse);
    }
  });

  return router;
}

export default createEditRouter;
