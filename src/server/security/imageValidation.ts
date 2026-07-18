/**
 * D-034 Internal Security Floor — Server-side image decode and size validation.
 *
 * Every image entering the system (Project upload, /api/edit, /api/detect)
 * must pass through `validateImageBytes` before being written to ObjectStore
 * or forwarded to a Provider. This guards against:
 *  - MIME spoofing (declared image/png but actual image/jpeg)
 *  - Decompression bombs (small bytes, huge pixel count)
 *  - Oversized payloads (> 20 MiB per decoded image)
 *  - Malformed/truncated bytes that would crash downstream consumers
 *  - Unsupported formats (gif/bmp/tiff that downstream can't process)
 *
 * Stable error codes are thrown so route handlers can map them to HTTP 400/413
 * without echoing image bytes or base64.
 */

import sharp from 'sharp';

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ValidatedImage {
  /** Re-encoded image bytes (sharp may rotate/normalize). */
  bytes: Uint8Array;
  /** Canonical MIME type derived from the decoded format. */
  mimeType: SupportedImageMime;
  width: number;
  height: number;
  /** Original byte length of the input (before re-encoding). */
  sizeBytes: number;
}

export interface ValidationLimits {
  /** Max input byte size (default 20 MiB). */
  maxBytes?: number;
  /** Max decoded pixel count (default 40,000,000 = 40 MP). */
  maxPixels?: number;
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20 MiB
const DEFAULT_MAX_PIXELS = 40_000_000; // 40 MP

const FORMAT_TO_MIME: Record<string, SupportedImageMime> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const SUPPORTED_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/**
 * Validate image bytes by decoding with sharp. Returns canonical metadata
 * and re-encoded bytes, or throws a stable `INVALID_IMAGE_*` error code.
 */
export async function validateImageBytes(
  bytes: Uint8Array | Buffer,
  declaredMimeType: string,
  limits?: ValidationLimits
): Promise<ValidatedImage> {
  const maxBytes = limits?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxPixels = limits?.maxPixels ?? DEFAULT_MAX_PIXELS;
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  // 1. Size check BEFORE any decode work (cheap guard against oversized input)
  if (buffer.length > maxBytes) {
    throw new Error('INVALID_IMAGE_TOO_LARGE');
  }

  // 2. Declared MIME must be one of the supported set
  if (!SUPPORTED_MIMES.has(declaredMimeType)) {
    throw new Error('INVALID_IMAGE_UNSUPPORTED_FORMAT');
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new Error('INVALID_IMAGE_MALFORMED');
  }

  // 3. sharp couldn't determine the format (not an image at all)
  if (!metadata.format) {
    throw new Error('INVALID_IMAGE_MALFORMED');
  }

  const decodedMime = FORMAT_TO_MIME[metadata.format];
  if (!decodedMime) {
    throw new Error('INVALID_IMAGE_UNSUPPORTED_FORMAT');
  }

  // 4. Declared MIME must match the decoded format
  if (decodedMime !== declaredMimeType) {
    throw new Error('INVALID_IMAGE_MIME_MISMATCH');
  }

  // 5. Dimensions must be positive
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error('INVALID_IMAGE_MALFORMED');
  }

  // 6. Pixel count guard (decompression bomb defense)
  if (width * height > maxPixels) {
    throw new Error('INVALID_IMAGE_TOO_MANY_PIXELS');
  }

  // 7. Full decode succeeds (catches truncated/corrupt payloads that pass
  //    metadata but fail on actual pixel extraction)
  let reencoded: Buffer;
  try {
    reencoded = await sharp(buffer).rotate().toBuffer();
  } catch {
    throw new Error('INVALID_IMAGE_DECODE_FAILED');
  }

  return {
    bytes: new Uint8Array(reencoded),
    mimeType: decodedMime,
    width,
    height,
    sizeBytes: buffer.length,
  };
}

/**
 * Map a validation error code to an HTTP status. Returns 400 for format/
 * mismatch/malformed errors, 413 for size/pixel overflow.
 */
export function imageValidationHttpStatus(errorCode: string): number {
  if (errorCode === 'INVALID_IMAGE_TOO_LARGE' || errorCode === 'INVALID_IMAGE_TOO_MANY_PIXELS') {
    return 413;
  }
  return 400;
}
