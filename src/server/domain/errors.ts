/**
 * PERSIST-001 stable domain errors.
 *
 * Errors are surfaced to API callers as `{ errorCode, message, diagnosticId }`.
 * The `errorCode` is the stable machine-readable identifier; `message` is
 * user-safe Chinese text; `diagnosticId` is a UUID for log correlation.
 *
 * Internal callers can read `cause` for diagnostic context that must NOT be
 * serialized to public responses (see `src/server/security/redaction.ts`).
 */

export type DomainErrorCode =
  | 'ILLEGAL_JOB_TRANSITION'
  | 'JOB_NOT_FOUND'
  | 'JOB_NOT_CLAIMED_BY_CALLER'
  | 'JOB_LEASE_EXPIRED'
  | 'JOB_NOT_RETRYABLE'
  | 'PROJECT_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'ASSET_NOT_FOUND'
  | 'INVALID_RECIPE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_QUOTA'
  | 'PROVIDER_NETWORK'
  | 'SAVE_FAILED'
  | 'UPLOAD_INVALID'
  | 'UPLOAD_TOO_LARGE'
  | 'UPLOAD_DECODE_FAILED'
  | 'UPLOAD_PIXEL_LIMIT';

export interface DomainErrorOptions {
  code: DomainErrorCode;
  message: string;
  cause?: unknown;
  diagnosticId?: string;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly diagnosticId: string;
  readonly cause?: unknown;

  constructor(input: DomainErrorOptions) {
    super(input.message);
    this.name = 'DomainError';
    this.code = input.code;
    this.diagnosticId = input.diagnosticId ?? generateDiagnosticId();
    if (input.cause !== undefined) {
      this.cause = input.cause;
    }
    // Restore prototype chain after Error subclassing in TS target ES2022.
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  toJSON(): { code: DomainErrorCode; message: string; diagnosticId: string } {
    return { code: this.code, message: this.message, diagnosticId: this.diagnosticId };
  }
}

export function generateDiagnosticId(): string {
  // RFC4122 v4 UUID; falls back to Math.random when crypto is unavailable.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Set version (4) and variant (10xx) bits per RFC4122 §4.4.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
