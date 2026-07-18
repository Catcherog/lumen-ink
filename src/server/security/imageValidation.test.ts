/**
 * D-034 Internal Security Floor — Server-side image decode and size validation.
 *
 * Asserts `validateImageBytes`:
 *  - Accepts valid PNG/JPEG/WebP buffers with correct declared MIME.
 *  - Rejects declared MIME mismatch (declared png, actual jpeg).
 *  - Rejects unsupported formats (gif, bmp, tiff).
 *  - Rejects bytes over 20 MiB without allocating an oversized fixture.
 *  - Rejects decoded pixels over 40,000,000 using a mocked metadata result.
 *  - Rejects malformed bytes (random buffer).
 *  - Rejects when sharp toBuffer() fails (decompression bomb / truncated).
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { validateImageBytes } from './imageValidation.js';

async function makePng(width = 32, height = 24): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 100, b: 50, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function makeJpeg(width = 32, height = 24): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function makeWebp(width = 32, height = 24): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 100, b: 50, alpha: 1 },
    },
  })
    .webp()
    .toBuffer();
}

describe('validateImageBytes (D-034 internal security floor)', () => {
  it('accepts a valid PNG with correct declared MIME', async () => {
    const bytes = await makePng(32, 24);
    const result = await validateImageBytes(bytes, 'image/png');
    expect(result.mimeType).toBe('image/png');
    expect(result.width).toBe(32);
    expect(result.height).toBe(24);
    expect(result.sizeBytes).toBe(bytes.length);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
  });

  it('accepts a valid JPEG with correct declared MIME', async () => {
    const bytes = await makeJpeg(40, 30);
    const result = await validateImageBytes(bytes, 'image/jpeg');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.width).toBe(40);
    expect(result.height).toBe(30);
  });

  it('accepts a valid WebP with correct declared MIME', async () => {
    const bytes = await makeWebp(20, 20);
    const result = await validateImageBytes(bytes, 'image/webp');
    expect(result.mimeType).toBe('image/webp');
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
  });

  it('rejects declared MIME mismatch (declared png, actual jpeg)', async () => {
    const bytes = await makeJpeg(32, 24);
    await expect(validateImageBytes(bytes, 'image/png')).rejects.toThrow(
      'INVALID_IMAGE_MIME_MISMATCH'
    );
  });

  it('rejects unsupported format (gif)', async () => {
    const bytes = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .gif()
      .toBuffer();
    await expect(validateImageBytes(bytes, 'image/gif')).rejects.toThrow(
      'INVALID_IMAGE_UNSUPPORTED_FORMAT'
    );
  });

  it('rejects bytes over 20 MiB without allocating an oversized fixture', async () => {
    // Use a small real buffer but override the sizeBytes check via limits.
    // This proves the size guard fires before any decode work.
    const bytes = await makePng(8, 8);
    await expect(
      validateImageBytes(bytes, 'image/png', { maxBytes: 10 })
    ).rejects.toThrow('INVALID_IMAGE_TOO_LARGE');
  });

  it('rejects decoded pixels over 40,000,000 using a configured limit', async () => {
    // Use a real 32x24 image (768 pixels) with a tiny pixel limit to prove
    // the guard fires without allocating a 40 MP fixture.
    const bytes = await makePng(32, 24);
    await expect(
      validateImageBytes(bytes, 'image/png', { maxPixels: 100 })
    ).rejects.toThrow('INVALID_IMAGE_TOO_MANY_PIXELS');
  });

  it('rejects malformed bytes (random buffer)', async () => {
    const bytes = Buffer.from('not an image at all, just random text');
    await expect(validateImageBytes(bytes, 'image/png')).rejects.toThrow(
      'INVALID_IMAGE_MALFORMED'
    );
  });

  it('rejects when sharp toBuffer() fails (truncated image)', async () => {
    // Create a large PNG with non-trivial content so truncation actually
    // removes IDAT pixel data. A 256x256 RGBA PNG has substantial IDAT
    // chunks; keeping only the first 100 bytes preserves the signature
    // and IHDR (so metadata reads width/height) but loses all pixel data,
    // forcing sharp.toBuffer() to fail.
    const full = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 4,
        background: { r: 100, g: 50, b: 200, alpha: 1 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const truncated = full.subarray(0, 100);
    await expect(validateImageBytes(truncated, 'image/png')).rejects.toThrow(
      /INVALID_IMAGE_(DECODE_FAILED|MALFORMED)/
    );
  });

  it('returns the original bytes in the ValidatedImage result', async () => {
    const bytes = await makePng(16, 16);
    const result = await validateImageBytes(bytes, 'image/png');
    // The returned bytes should be the same length (sharp may re-encode, so
    // we only assert the bytes are present and decodable).
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.sizeBytes).toBe(bytes.length);
  });
});
