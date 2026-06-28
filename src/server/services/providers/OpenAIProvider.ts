import type { ImageProvider, GenerateParams, EditParams, ChatParams, EditResult } from './ImageProvider.js';
import type { ProviderConfig } from 'shared/types.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const FETCH_TIMEOUT = 50000;

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if ((err as Error).name === 'AbortError') {
      throw Object.assign(new Error('API 请求超时（超过50秒），请稍后重试'), { status: 504 });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export class OpenAIProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private get apiKey(): string {
    return this.config.apiKey;
  }

  private get baseUrl(): string {
    return this.config.baseUrl || OPENAI_API_BASE;
  }

  private base64ToDataUrl(base64: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64}`;
  }

  private parseError(status: number, errorText: string): { message: string; status: number } {
    let message = `OpenAI API 错误: ${status}`;
    let isApiKeyError = false;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        message += ` - ${errorJson.error.message}`;
        if (
          errorJson.error.message.includes('Incorrect API key') ||
          errorJson.error.message.includes('Invalid API key') ||
          errorJson.error.message.includes('API key') ||
          errorJson.error.code === 'invalid_api_key' ||
          errorJson.error.code === 'invalid_api_key'
        ) {
          isApiKeyError = true;
        }
      }
    } catch {
      if (errorText) {
        message += ` - ${errorText.slice(0, 300)}`;
        if (errorText.includes('Incorrect API key') || errorText.includes('Invalid API key')) {
          isApiKeyError = true;
        }
      }
    }
    return { message, status: isApiKeyError ? 401 : status };
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

  async generate(params: GenerateParams): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 OpenAI API Key'), { status: 401 });
    }

    const body = {
      model: params.model || 'dall-e-3',
      prompt: params.prompt,
      n: 1,
      size: '1024x1024',
    };

    const response = await fetchWithTimeout(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Image API error:', response.status, errorText);
      const errMsg = this.parseError(response.status, errorText);
      throw Object.assign(new Error(errMsg.message), { status: errMsg.status });
    }

    const data = (await response.json()) as {
      data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
    };

    if (data.data && data.data[0]) {
      const result = data.data[0];
      return {
        imageUrl: result.url,
        imageData: result.b64_json,
        mimeType: 'image/png',
      };
    }

    throw new Error('OpenAI API 未返回图片数据');
  }

  async edit(params: EditParams): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 OpenAI API Key'), { status: 401 });
    }

    const imageBase64 = this.stripDataUrl(params.image);
    const formData = new FormData();
    formData.append('model', params.model || 'gpt-image-2');
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

    const response = await fetchWithTimeout(`${this.baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData as unknown as BodyInit,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Edit API error:', response.status, errorText);
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

    throw new Error('OpenAI API 未返回图片数据');
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

  async chat(params: ChatParams): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 OpenAI API Key'), { status: 401 });
    }

    const messages: Array<Record<string, unknown>> = [];

    if (params.history && params.history.length > 0) {
      for (const turn of params.history) {
        messages.push({
          role: turn.role,
          content: turn.content,
        });
      }
    }

    const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: params.prompt }];

    if (params.image && params.mimeType) {
      userContent.push({
        type: 'image_url',
        image_url: { url: this.base64ToDataUrl(this.stripDataUrl(params.image), params.mimeType) },
      });
    }

    if (params.referenceImages) {
      for (const ref of params.referenceImages) {
        userContent.push({
          type: 'image_url',
          image_url: { url: this.base64ToDataUrl(this.stripDataUrl(ref.data), ref.mimeType) },
        });
      }
    }

    messages.push({
      role: 'user',
      content: userContent,
    });

    const body = {
      model: params.model || 'gpt-4o',
      messages,
      max_tokens: 2048,
    };

    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Chat API error:', response.status, errorText);
      const errMsg = this.parseError(response.status, errorText);
      throw Object.assign(new Error(errMsg.message), { status: errMsg.status });
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: { content: string };
      }>;
    };

    if (data.choices && data.choices[0]) {
      return {
        text: data.choices[0].message.content,
        mimeType: 'text/plain',
      };
    }

    throw new Error('OpenAI API 未返回有效响应');
  }
}
