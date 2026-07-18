import { Router, Request, Response } from 'express';
import type { Region } from 'shared/types.js';
import { validateImageBytes, imageValidationHttpStatus } from '../security/imageValidation.js';

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

router.post('/people', async (req: Request, res: Response) => {
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

    // D-034 Task 6: validate the base64 image with sharp before using its
    // dimensions. This subsumes the hand-rolled PNG/JPEG/WebP header
    // parsers and rejects malformed/oversized/spoofed payloads.
    let width: number;
    let height: number;
    try {
      const imageBytes = Buffer.from(image, 'base64');
      const validated = await validateImageBytes(imageBytes, mimeType || 'image/jpeg');
      width = validated.width;
      height = validated.height;
    } catch (err) {
      const code = err instanceof Error ? err.message : 'INVALID_IMAGE_MALFORMED';
      const httpStatus = imageValidationHttpStatus(code);
      res.status(httpStatus).json({
        success: false,
        regions: [],
        error: `图片校验失败: ${code}`,
      } as DetectPeopleResponse);
      return;
    }

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
