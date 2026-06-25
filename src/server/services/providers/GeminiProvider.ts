import type { ImageProvider, GenerateParams, EditParams, ChatParams, EditResult } from './ImageProvider.js';
import type { ProviderConfig } from 'shared/types.js';

const GOOGLE_AI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const VERTEX_AI_BASE = 'https://aiplatform.googleapis.com/v1';

type ApiMode = 'google-ai' | 'vertex-ai';

export class GeminiProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private get apiKey(): string {
    return this.config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  }

  private get apiMode(): ApiMode {
    const baseUrl = (this.config.baseUrl || '').toLowerCase();
    if (baseUrl.includes('aiplatform.googleapis.com') || baseUrl.includes('vertex')) {
      return 'vertex-ai';
    }
    return 'google-ai';
  }

  private get baseUrl(): string {
    if (this.config.baseUrl) {
      return this.config.baseUrl.replace(/\/$/, '');
    }
    return this.apiMode === 'vertex-ai' ? VERTEX_AI_BASE : GOOGLE_AI_BASE;
  }

  private buildModelPath(model: string): string {
    if (this.apiMode === 'vertex-ai') {
      if (this.baseUrl.includes('/projects/')) {
        return `${this.baseUrl}/publishers/google/models/${model}:generateContent`;
      }
      return `${this.baseUrl}/publishers/google/models/${model}:generateContent`;
    }
    return `${this.baseUrl}/models/${model}:generateContent`;
  }

  private stripDataUrl(image: string): string {
    if (image.startsWith('data:')) {
      return image.split(',')[1] || image;
    }
    return image;
  }

  private async callGemini(
    model: string,
    parts: Array<Record<string, unknown>>,
    systemInstruction?: string
  ): Promise<EditResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw Object.assign(new Error('未配置 Gemini API Key'), { status: 401 });
    }

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const url = `${this.buildModelPath(model)}?key=${apiKey}`;
    console.log('[GeminiProvider] Calling API:', this.apiMode, url.split('?')[0]);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      let errorMessage = `Gemini API 错误: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage += ` - ${errorJson.error.message}`;
        }
      } catch {
        if (errorText) {
          errorMessage += ` - ${errorText.slice(0, 300)}`;
        }
      }
      throw Object.assign(new Error(errorMessage), { status: response.status });
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
          }>;
        };
      }>;
    };

    if (data.candidates && data.candidates[0]?.content?.parts) {
      let imageData: string | undefined;
      let mimeType: string | undefined;
      let text: string | undefined;

      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData) {
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType;
        } else if (part.text) {
          text = part.text;
        }
      }

      if (imageData || text) {
        return { imageData, mimeType, text };
      }
    }

    throw new Error('Gemini API 未返回有效数据');
  }

  private getDefaultModel(): string {
    return 'gemini-2.5-flash-image';
  }

  async generate(params: GenerateParams): Promise<EditResult> {
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];

    if (params.referenceImages && params.referenceImages.length > 0) {
      for (const ref of params.referenceImages) {
        parts.push({
          inlineData: { mimeType: ref.mimeType, data: this.stripDataUrl(ref.data) },
        });
      }
    }

    return this.callGemini(params.model || this.getDefaultModel(), parts);
  }

  async edit(params: EditParams): Promise<EditResult> {
    if (!params.image) {
      return this.generate({ prompt: params.prompt, referenceImages: params.referenceImages, model: params.model });
    }

    const parts: Array<Record<string, unknown>> = [];

    parts.push({
      inlineData: { mimeType: params.mimeType, data: this.stripDataUrl(params.image) },
    });

    if (params.referenceImages && params.referenceImages.length > 0) {
      for (const ref of params.referenceImages) {
        parts.push({
          inlineData: { mimeType: ref.mimeType, data: this.stripDataUrl(ref.data) },
        });
      }
    }

    let prompt = params.prompt;
    if (params.regions && params.regions.length > 0) {
      const regionDesc = params.regions
        .map((r, i) => `区域${i + 1}: [x=${r.x}, y=${r.y}, w=${r.width}, h=${r.height}${r.label ? `, label=${r.label}` : ''}]`)
        .join('; ');
      prompt += `\n\n仅修改以下区域，保持其他部分不变：${regionDesc}`;
    }

    parts.push({ text: prompt });

    return this.callGemini(params.model || this.getDefaultModel(), parts);
  }

  async chat(params: ChatParams): Promise<EditResult> {
    const parts: Array<Record<string, unknown>> = [{ text: params.prompt }];

    if (params.image && params.mimeType) {
      parts.push({
        inlineData: { mimeType: params.mimeType, data: this.stripDataUrl(params.image) },
      });
    }

    if (params.referenceImages) {
      for (const ref of params.referenceImages) {
        parts.push({
          inlineData: { mimeType: ref.mimeType, data: this.stripDataUrl(ref.data) },
        });
      }
    }

    return this.callGemini(params.model || this.getDefaultModel(), parts);
  }
}
