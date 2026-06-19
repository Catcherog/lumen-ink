import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiModel } from 'shared/types.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function editImage(params: {
  prompt: string;
  imageData: string; // base64
  mimeType: string;
  model: GeminiModel;
  referenceImages?: Array<{ data: string; mimeType: string }>;
  history?: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text?: string;
      inlineData?: { mimeType: string; data: string };
    }>;
  }>;
}): Promise<{ imageData?: string; mimeType?: string; text?: string }> {
  const model = genAI.getGenerativeModel({
    model: params.model,
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
    } as any,
  });

  // Build contents for multi-turn or single-turn
  let contents: any[] = [];

  if (params.history && params.history.length > 0) {
    // Multi-turn: use history + new user message
    contents = params.history.map(turn => ({
      role: turn.role,
      parts: turn.parts,
    }));
    // Add current user message
    const currentParts: any[] = [{ text: params.prompt }];
    currentParts.push({
      inlineData: { mimeType: params.mimeType, data: params.imageData },
    });
    if (params.referenceImages) {
      for (const ref of params.referenceImages) {
        currentParts.push({
          inlineData: { mimeType: ref.mimeType, data: ref.data },
        });
      }
    }
    contents.push({ role: 'user', parts: currentParts });
  } else {
    // Single-turn: just the current request
    const parts: any[] = [{ text: params.prompt }];
    parts.push({
      inlineData: { mimeType: params.mimeType, data: params.imageData },
    });
    if (params.referenceImages) {
      for (const ref of params.referenceImages) {
        parts.push({
          inlineData: { mimeType: ref.mimeType, data: ref.data },
        });
      }
    }
    contents = [{ role: 'user', parts }];
  }

  const result = await model.generateContent({ contents });
  const response = result.response;

  let imageData: string | undefined;
  let mimeType: string | undefined;
  let text: string | undefined;

  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType;
      } else if (part.text) {
        text = part.text;
      }
    }
  }

  return { imageData, mimeType, text };
}
