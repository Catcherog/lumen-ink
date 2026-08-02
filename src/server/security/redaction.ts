/**
 * D-034 Internal Security Floor — Allowlist-based structured redaction.
 *
 * Every error that escapes a route handler or service must pass through
 * `redactError` before being logged or returned to the client. This guards
 * against leaking:
 *  - API keys (sk-* patterns, raw keys in nested objects)
 *  - Bearer tokens / JWTs (Authorization headers, signed tokens)
 *  - Base64 image payloads (data URIs and long base64 strings)
 *  - Connection URLs with embedded credentials
 *  - Stack traces that may contain sensitive file paths
 *  - Arbitrary error properties (only allowlisted fields are retained)
 *
 * The returned `RedactedError` has three parts:
 *  - `diagnosticId`: a stable UUID for correlating client reports with logs
 *  - `publicMessage`: user-safe Chinese text (no internal details)
 *  - `log`: structured record with only allowlisted metadata + scrubbed strings
 */

export interface RedactionContext {
  errorCode?: string;
  httpStatus?: number;
  providerType?: string;
  operationType?: string;
}

export interface RedactedError {
  diagnosticId: string;
  publicMessage: string;
  log: Record<string, unknown>;
}

/**
 * Sensitive string patterns that must be scrubbed from any logged text.
 * Order matters: more specific patterns first.
 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Data URIs with base64 payload (e.g. data:image/png;base64,AAAA...)
  { pattern: /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, replacement: '[REDACTED:data-uri]' },
  // Bearer tokens (Authorization: Bearer xxx)
  { pattern: /Bearer\s+[A-Za-z0-9_.-]+/gi, replacement: '[REDACTED:bearer]' },
  // JWT tokens (three base64 segments separated by dots, total >= 20 chars)
  { pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '[REDACTED:jwt]' },
  // API keys with sk- prefix
  { pattern: /sk-[A-Za-z0-9_-]+/g, replacement: '[REDACTED:apikey]' },
  // Connection URLs with embedded credentials: scheme://user:pass@host
  { pattern: /([a-z][a-z0-9+.-]*):\/\/([^:/\s]+):([^@/\s]+)@/gi, replacement: '$1://[REDACTED:user]:[REDACTED:pass]@' },
  // Long base64 strings (>= 100 chars) — likely image bytes or encrypted blobs
  { pattern: /[A-Za-z0-9+/]{100,}={0,2}/g, replacement: '[REDACTED:base64]' },
];

/**
 * Object keys whose values must always be redacted, regardless of content.
 * Matched case-insensitively.
 */
const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'secret',
  'password',
  'passwd',
  'token',
  'authorization',
  'auth',
  'cookie',
  'set-cookie',
  'privatekey',
  'private_key',
  'jwt',
  'jwtsecret',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'bearer',
]);

/**
 * Scrub sensitive patterns from a string. Returns a new string with all
 * matches replaced by `[REDACTED:*]` markers.
 */
export function redactString(value: string): string {
  let result = value;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Recursively redact sensitive values from an unknown input.
 *  - Strings are scrubbed with `redactString`.
 *  - Objects are walked; sensitive keys become `[REDACTED]`.
 *  - Arrays are mapped element-wise.
 *  - Primitives are passed through unchanged.
 */
export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = redactValue(v);
      }
    }
    return result;
  }
  return value;
}

/**
 * Generate a UUID v4 diagnosticId. Uses crypto.randomUUID when available
 * (Node 19+); falls back to a manual RFC 4122 v4 construction.
 */
function generateDiagnosticId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 v4: set version and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/**
 * Map a stable errorCode to a user-safe Chinese public message.
 * Never echoes internal details, paths, or upstream messages.
 */
function getPublicMessage(errorCode: string | undefined): string {
  switch (errorCode) {
    case 'PROVIDER_TIMEOUT':
      return '请求超时，请稍后重试';
    case 'PROVIDER_QUOTA':
      return '额度已用尽，请联系管理员';
    case 'PROVIDER_NETWORK':
      return '服务暂时不可用，请稍后重试';
    case 'UPLOAD_TOO_LARGE':
      return '上传文件过大，请压缩后重试';
    case 'UPLOAD_PIXEL_LIMIT':
      return '图片像素数超出限制，请缩小后重试';
    case 'UPLOAD_DECODE_FAILED':
      return '无法解码图片，请检查文件格式';
    case 'UPLOAD_INVALID':
      return '上传文件无效，请检查格式';
    case 'PROJECT_NOT_FOUND':
    case 'VERSION_NOT_FOUND':
    case 'ASSET_NOT_FOUND':
    case 'JOB_NOT_FOUND':
      return '请求的资源不存在';
    case 'ILLEGAL_JOB_TRANSITION':
    case 'JOB_NOT_RETRYABLE':
      return '当前状态不允许该操作';
    case 'INVALID_RECIPE':
      return '编辑参数无效，请检查后重试';
    case 'IDEMPOTENCY_CONFLICT':
      return '请求冲突，请勿重复提交';
    case 'SAVE_FAILED':
      return '保存失败，请稍后重试';
    case 'PROVIDER_CONFIG_ENV_MANAGED':
      return 'Provider 配置由环境变量管理，无法通过 API 修改';
    case 'PROVIDER_KEY_MISSING':
      return '请先配置当前会话的 API Key';
    case 'PROVIDER_TYPE_UNSUPPORTED':
      return '当前 Provider 类型不支持';
    case 'PROVIDER_AUTH_FAILED':
      return 'API Key 无效或已过期';
    case 'PROVIDER_MODEL_FORBIDDEN':
      return '当前模型或 Endpoint 没有权限';
    case 'PROVIDER_RATE_LIMITED':
      return 'Provider 请求受限，请稍后重试';
    case 'PROVIDER_UNAVAILABLE':
      return 'Provider 服务暂时不可用，请稍后重试';
    case 'EDIT_INPUT_INVALID':
      return '编辑输入无效，请检查图片和参数';
    case 'EDIT_IMAGE_TOO_LARGE':
      return '图片过大，请压缩后重试';
    case 'EDIT_RESPONSE_INVALID':
      return 'Provider 返回了无法识别的结果';
    case 'AUTH_DISABLED_IN_EPHEMERAL_MODE':
      return '临时展示模式不启用登录';
    case 'PERSISTENCE_DISABLED':
      return '临时展示模式不保存项目或历史';
    default:
      return '处理请求时发生未知错误';
  }
}

/**
 * Redact an unknown error into a structured, safe-to-log record.
 *
 * Only allowlisted error properties are copied (name, message, code, status).
 * The message is scrubbed with `redactString`. Nested `error.response.data`
 * is walked with `redactValue` so upstream payloads are sanitized.
 * Stack traces are NEVER included in the log record.
 */
export function redactError(error: unknown, context?: RedactionContext): RedactedError {
  const diagnosticId = generateDiagnosticId();
  const err = error as Error & {
    code?: string;
    status?: number;
    statusCode?: number;
    response?: { status?: number; data?: unknown };
  };

  const errorCode = context?.errorCode || err.code || 'UNKNOWN';
  const httpStatus = context?.httpStatus ?? err.status ?? err.statusCode;

  const log: Record<string, unknown> = {
    diagnosticId,
    errorCode,
    errorName: err?.name ?? (typeof err === 'string' ? 'String' : 'Unknown'),
  };

  if (httpStatus !== undefined) {
    log.httpStatus = httpStatus;
  }
  if (context?.providerType) {
    log.providerType = context.providerType;
  }
  if (context?.operationType) {
    log.operationType = context.operationType;
  }

  // Scrub the error message — never copy raw.
  const rawMessage = typeof err === 'string' ? err : (err?.message ?? String(error));
  log.errorMessage = redactString(rawMessage);

  // Walk upstream response data (e.g. axios error.response.data) so leaked
  // keys/tokens inside provider error bodies are sanitized.
  if (err?.response) {
    if (typeof err.response.status === 'number') {
      log.upstreamStatus = err.response.status;
    }
    if (err.response.data !== undefined) {
      log.upstreamData = redactValue(err.response.data);
    }
  }

  // Explicitly DO NOT copy:
  //  - err.stack (may contain sensitive file paths / env values)
  //  - err.config (may contain Authorization headers)
  //  - err.body / err.request (may contain base64 images or form data)
  //  - any other own-properties not in ALLOWED_ERROR_PROPS

  return {
    diagnosticId,
    publicMessage: getPublicMessage(errorCode),
    log,
  };
}
