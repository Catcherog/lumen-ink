import type { ImageProvider, GenerateParams, EditParams, ChatParams, EditResult } from './ImageProvider.js';
import type { ProviderConfig } from 'shared/types.js';
import sharp from 'sharp';

const SEEDREAM_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
// Vercel maxDuration = 90s，超时阈值必须 < 90s 才能保证我们抛出友好错误而非被 Vercel 网关杀成空 504
// 留 10s 余量给响应回传 + JSON 解析
const FETCH_TIMEOUT = 80000;
const FETCH_TIMEOUT_HIGH_RES = 80000; // 4k 等高分辨率模式（Vercel 90s 上限封顶，无法延长）

export class SeedreamProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private get apiKey(): string {
    return this.config.apiKey || process.env.SEEDREAM_API_KEY || process.env.VOLC_API_KEY || '';
  }

  private get baseUrl(): string {
    return this.config.baseUrl || SEEDREAM_API_BASE;
  }

  private stripDataUrl(image: string): string {
    if (image.startsWith('data:')) {
      return image.split(',')[1] || image;
    }
    return image;
  }

  private base64ToDataUrl(base64: string, mimeType: string): string {
    const clean = this.stripDataUrl(base64);
    return `data:${mimeType};base64,${clean}`;
  }

  private async compressImage(image: string, mimeType: string, maxEdge = 2048): Promise<{ image: string; mimeType: string }> {
    const clean = this.stripDataUrl(image);
    const buffer = Buffer.from(clean, 'base64');
    const metadata = await sharp(buffer).metadata();
    const { width = 0, height = 0 } = metadata;
    const longestEdge = Math.max(width, height);

    if (longestEdge <= maxEdge) {
      return { image, mimeType };
    }

    const scale = maxEdge / longestEdge;
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const outBuffer = await sharp(buffer)
      .resize({ width: targetWidth, height: targetHeight, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    return { image: outBuffer.toString('base64'), mimeType: 'image/jpeg' };
  }

  private parseError(status: number, errorText: string): { message: string; status: number } {
    let message = `Seedream API 错误: ${status}`;
    let isApiKeyError = false;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        message += ` - ${errorJson.error.message}`;
        if (
          errorJson.error.message.includes('API key') ||
          errorJson.error.message.includes('Invalid token') ||
          errorJson.error.message.includes('认证失败') ||
          errorJson.error.message.includes('Unauthorized') ||
          errorJson.error.message.includes('AccessDenied')
        ) {
          isApiKeyError = true;
        }
      }
    } catch {
      if (errorText) {
        message += ` - ${errorText.slice(0, 300)}`;
        if (errorText.includes('API key') || errorText.includes('Invalid token')) {
          isApiKeyError = true;
        }
      }
    }
    return { message, status: isApiKeyError ? 401 : status };
  }

  private buildPrompt(params: { prompt: string; regions?: Array<{ x: number; y: number; width: number; height: number; label?: string }> }): string {
    let prompt = params.prompt;
    if (params.regions && params.regions.length > 0) {
      const regionDesc = params.regions
        .map((r, i) => `区域${i + 1}: [x=${r.x}, y=${r.y}, w=${r.width}, h=${r.height}${r.label ? `, label=${r.label}` : ''}]`)
        .join('; ');
      prompt += `\n\n仅修改以下区域，保持其他部分不变：${regionDesc}`;
    }
    return prompt;
  }

  /**
   * 规范化输出尺寸：doubao-seedream-4-5 仅支持 2K/4K 档位（1K 只有 4.0 支持），
   * 且 API 要求档位字符串大写。1K 自动升级到 2K。
   * 返回 [用于请求体的 size 字段, 用于超时判定的内部标记]。
   */
  private normalizeSize(size: '1k' | '2k' | '4k' | undefined): { apiSize: '2K' | '4K'; internal: '1k' | '2k' | '4k' } {
    const internal = size || '2k';
    if (internal === '4k') {
      return { apiSize: '4K', internal: '4k' };
    }
    return { apiSize: '2K', internal }; // '1k' / '2k' / undefined 都映射到 2K
  }

  private async callGenerations(body: Record<string, unknown>, size: '1k' | '2k' | '4k' = '1k'): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 Seedream API Key'), { status: 401 });
    }

    const timeout = size === '4k' ? FETCH_TIMEOUT_HIGH_RES : FETCH_TIMEOUT;
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if ((err as Error).name === 'AbortError') {
        const elapsed = Date.now() - startTime;
        throw Object.assign(new Error(`Seedream API 请求超时（耗时 ${elapsed}ms，size=${size}），建议切换为 1k 出图或稍后重试`), { status: 504 });
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Seedream API error:', response.status, errorText);
      const errMsg = this.parseError(response.status, errorText);
      throw Object.assign(new Error(errMsg.message), { status: errMsg.status });
    }

    const data = (await response.json()) as {
      data: Array<{ url?: string; b64_json?: string }>;
    };

    if (data.data && data.data[0]) {
      const result = data.data[0];
      return {
        imageUrl: result.url,
        imageData: result.b64_json,
        mimeType: 'image/png',
      };
    }

    throw new Error('Seedream API 未返回图片数据');
  }

  async generate(params: GenerateParams): Promise<EditResult> {
    let fullPrompt = this.buildPrompt({ prompt: params.prompt });
    if (params.referenceImages && params.referenceImages.length > 0) {
      fullPrompt += `\n\n（参考 ${params.referenceImages.length} 张参考图进行创作）`;
    }

    const { apiSize, internal } = this.normalizeSize(params.outputSize);
    if (internal === '4k') {
      console.warn('[Seedream] 4k mode enabled, timeout extended to 80s (capped by Vercel)');
    }

    const body: Record<string, unknown> = {
      model: params.model || 'doubao-seedream-4-5-251128',
      prompt: fullPrompt,
      size: apiSize,
      response_format: 'url',
      watermark: false,
      stream: false,
    };

    return this.callGenerations(body, internal);
  }

  async edit(params: EditParams): Promise<EditResult> {
    let prompt = this.buildPrompt({ prompt: params.prompt, regions: params.regions });
    if (params.referenceImages && params.referenceImages.length > 0) {
      prompt += `\n\n（参考 ${params.referenceImages.length} 张参考图进行创作）`;
    }

    const { apiSize, internal } = this.normalizeSize(params.outputSize);
    if (internal === '4k') {
      console.warn('[Seedream] 4k mode enabled, timeout extended to 80s (capped by Vercel)');
    }

    const body: Record<string, unknown> = {
      model: params.model || 'doubao-seedream-4-5-251128',
      prompt,
      size: apiSize,
      response_format: 'url',
      watermark: false,
      stream: false,
      sequential_image_generation: 'disabled',
    };

    if (params.image && params.mimeType) {
      const compressed = await this.compressImage(params.image, params.mimeType);
      body.image = this.base64ToDataUrl(compressed.image, compressed.mimeType);
    }

    return this.callGenerations(body, internal);
  }

  async chat(_params: ChatParams): Promise<EditResult> {
    throw new Error('Seedream Provider 不支持对话模式，请使用 generate 或 edit');
  }
}
