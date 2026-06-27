import type { ImageProvider, GenerateParams, EditParams, ChatParams, EditResult } from './ImageProvider.js';
import type { ProviderConfig } from 'shared/types.js';

const SEEDREAM_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

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

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const buffer = Buffer.from(base64, 'base64');
    return new Blob([buffer], { type: mimeType });
  }

  private stripDataUrl(image: string): string {
    if (image.startsWith('data:')) {
      return image.split(',')[1] || image;
    }
    return image;
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
          errorJson.error.message.includes('Unauthorized')
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

  async generate(params: GenerateParams): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 Seedream API Key'), { status: 401 });
    }

    let fullPrompt = params.prompt;
    if (params.referenceImages && params.referenceImages.length > 0) {
      fullPrompt += `\n\n（参考 ${params.referenceImages.length} 张参考图进行创作）`;
    }

    const body: Record<string, unknown> = {
      model: params.model,
      prompt: fullPrompt,
      size: '1024x1024',
    };

    const response = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Seedream Image API error:', response.status, errorText);
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

  async edit(params: EditParams): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 Seedream API Key'), { status: 401 });
    }

    const imageBase64 = this.stripDataUrl(params.image);
    const formData = new FormData();
    formData.append('model', params.model || 'seedream-4.5');
    formData.append('prompt', this.buildEditPrompt(params));
    formData.append('image', this.base64ToBlob(imageBase64, params.mimeType), 'image.png');

    if (params.referenceImages && params.referenceImages.length > 0) {
      for (let i = 0; i < params.referenceImages.length; i++) {
        const ref = params.referenceImages[i];
        formData.append(
          'reference',
          this.base64ToBlob(this.stripDataUrl(ref.data), ref.mimeType),
          `reference-${i}.png`
        );
      }
    }

    const response = await fetch(`${this.baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData as unknown as BodyInit,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Seedream Edit API error:', response.status, errorText);
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

  private buildEditPrompt(params: EditParams): string {
    let prompt = params.prompt;
    if (params.regions && params.regions.length > 0) {
      const regionDesc = params.regions
        .map((r, i) => `区域${i + 1}: [x=${r.x}, y=${r.y}, w=${r.width}, h=${r.height}${r.label ? `, label=${r.label}` : ''}]`)
        .join('; ');
      prompt += `\n\n仅修改以下区域，保持其他部分不变：${regionDesc}`;
    }
    return prompt;
  }

  async chat(_params: ChatParams): Promise<EditResult> {
    throw new Error('Seedream Provider 不支持对话模式，请使用 generate 或 edit');
  }
}
