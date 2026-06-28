import type { ImageProvider, GenerateParams, EditParams, ChatParams, EditResult } from './ImageProvider.js';
import type { ProviderConfig } from 'shared/types.js';

const SEEDREAM_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const FETCH_TIMEOUT = 50000;

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

  private async callGenerations(body: Record<string, unknown>): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 Seedream API Key'), { status: 401 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
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
        throw Object.assign(new Error('Seedream API 请求超时（超过50秒），请稍后重试'), { status: 504 });
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

    const body: Record<string, unknown> = {
      model: params.model || 'doubao-seedream-4-5-251128',
      prompt: fullPrompt,
      size: '2K',
      response_format: 'url',
      watermark: false,
      stream: false,
    };

    return this.callGenerations(body);
  }

  async edit(params: EditParams): Promise<EditResult> {
    let prompt = this.buildPrompt({ prompt: params.prompt, regions: params.regions });
    if (params.referenceImages && params.referenceImages.length > 0) {
      prompt += `\n\n（参考 ${params.referenceImages.length} 张参考图进行创作）`;
    }

    const body: Record<string, unknown> = {
      model: params.model || 'doubao-seedream-4-5-251128',
      prompt,
      size: '2K',
      response_format: 'url',
      watermark: false,
      stream: false,
      sequential_image_generation: 'disabled',
    };

    if (params.image && params.mimeType) {
      body.image = this.base64ToDataUrl(params.image, params.mimeType);
    }

    return this.callGenerations(body);
  }

  async chat(_params: ChatParams): Promise<EditResult> {
    throw new Error('Seedream Provider 不支持对话模式，请使用 generate 或 edit');
  }
}
