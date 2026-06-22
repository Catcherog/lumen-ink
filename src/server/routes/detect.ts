import { Router, Request, Response } from 'express';
import type { Region } from 'shared/types.js';

const router = Router();

interface DetectPeopleRequest {
  image: string;
  mimeType: string;
}

interface DetectPeopleResponse {
  success: boolean;
  regions: Region[];
  error?: string;
}

function getImageDimensions(base64: string): { width: number; height: number } | null {
  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length < 24) return null;

    // PNG: IHDR chunk starts at offset 16, width/height are big-endian 4 bytes each
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // JPEG: scan SOF markers
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }

        const marker = buffer[offset + 1];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0xd8 || marker === 0x00) {
          offset++;
          continue;
        }

        const length = buffer.readUInt16BE(offset + 2);
        if (length < 2 || offset + length >= buffer.length) break;

        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        offset += 2 + length;
      }
    }

    // WebP (VP8)
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      if (
        buffer[12] === 0x56 &&
        buffer[13] === 0x50 &&
        buffer[14] === 0x38 &&
        buffer[15] === 0x20
      ) {
        const width = buffer.readUInt32LE(26) & 0x3fff;
        const height = buffer.readUInt32LE(30) & 0x3fff;
        return { width, height };
      }
      if (
        buffer[12] === 0x56 &&
        buffer[13] === 0x50 &&
        buffer[14] === 0x38 &&
        buffer[15] === 0x4c
      ) {
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function generateMockRegions(width: number, height: number): Region[] {
  const pad = 10;

  const region1: Region = {
    x: Math.floor(width * (2 / 3)),
    y: Math.floor(height * (1 / 4)),
    width: Math.floor(width / 3) - pad,
    height: Math.floor(height / 2),
    label: '路人 1',
  };

  const region2: Region = {
    x: pad,
    y: Math.floor(height * (3 / 4)),
    width: Math.floor(width / 4),
    height: Math.floor(height / 4) - pad,
    label: '路人 2',
  };

  const region3: Region = {
    x: Math.floor(width * (1 / 3)),
    y: pad,
    width: Math.floor(width / 4),
    height: Math.floor(height / 8),
    label: '路人 3',
  };

  return [region1, region2, region3]
    .map((r) => ({
      ...r,
      x: clamp(r.x, 0, width - 1),
      y: clamp(r.y, 0, height - 1),
      width: clamp(r.width, 1, width - r.x),
      height: clamp(r.height, 1, height - r.y),
    }))
    .filter((r) => r.width > 0 && r.height > 0);
}

router.post('/people', (req: Request, res: Response) => {
  try {
    const { image, mimeType } = req.body as DetectPeopleRequest;

    if (!image) {
      res.status(400).json({
        success: false,
        regions: [],
        error: '缺少必要参数：image',
      } as DetectPeopleResponse);
      return;
    }

    const dims = getImageDimensions(image);
    const width = dims?.width ?? 1920;
    const height = dims?.height ?? 1080;

    const regions = generateMockRegions(width, height);

    console.log(`[detect/people] mimeType=${mimeType || 'unknown'} dims=${width}x${height} regions=${regions.length}`);

    res.json({
      success: true,
      regions,
    } as DetectPeopleResponse);
  } catch (error: unknown) {
    console.error('Detect people error:', error);
    const err = error as { message?: string };
    res.status(500).json({
      success: false,
      regions: [],
      error: err.message || '路人检测失败',
    } as DetectPeopleResponse);
  }
});

export default router;
