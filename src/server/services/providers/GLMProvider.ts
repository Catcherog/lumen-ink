import type { ImageProvider, GenerateParams, EditParams, ChatParams, EditResult } from './ImageProvider.js';
import type { ProviderConfig } from 'shared/types.js';

const GLM_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

export class GLMProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private get apiKey(): string {
    return this.config.apiKey || process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY || '';
  }

  private get baseUrl(): string {
    return this.config.baseUrl || GLM_API_BASE;
  }

  private base64ToDataUrl(base64: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64}`;
  }

  async generate(params: GenerateParams): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 GLM API Key'), { status: 401 });
    }

    let fullPrompt = params.prompt;
    if (params.referenceImages && params.referenceImages.length > 0) {
      fullPrompt += `\n\n（参考 ${params.referenceImages.length} 张参考图进行创作）`;
    }

    const body: Record<string, unknown> = {
      model: params.model,
      prompt: fullPrompt,
      size: '1280x1280',
      quality: params.model === 'glm-image' ? 'hd' : 'standard',
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
      console.error('GLM Image API error:', response.status, errorText);
      throw Object.assign(new Error(`GLM API 错误: ${response.status}`), { status: response.status });
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

    throw new Error('GLM API 未返回图片数据');
  }

  async edit(_params: EditParams): Promise<EditResult> {
    throw new Error('GLM Provider 暂不支持图像编辑接口，请使用 generate 或 chat');
  }

  async chat(params: ChatParams): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 GLM API Key'), { status: 401 });
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

    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: params.prompt },
    ];

    if (params.image && params.mimeType) {
      userContent.push({
        type: 'image_url',
        image_url: { url: this.base64ToDataUrl(params.image, params.mimeType) },
      });
    }

    if (params.referenceImages) {
      for (const ref of params.referenceImages) {
        userContent.push({
          type: 'image_url',
          image_url: { url: this.base64ToDataUrl(ref.data, ref.mimeType) },
        });
      }
    }

    messages.push({
      role: 'user',
      content: userContent,
    });

    const body = {
      model: params.model,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GLM Chat API error:', response.status, errorText);
      throw Object.assign(new Error(`GLM API 错误: ${response.status}`), { status: response.status });
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

    throw new Error('GLM API 未返回有效响应');
  }
}
