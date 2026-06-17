import { Router, Request, Response } from 'express';
import { editImage } from '../services/glm.js';
import type { EditRequest, EditResponse } from '../../shared/types.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, image, mimeType, model, referenceImages, history } = req.body as EditRequest;

    if (!prompt) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数：prompt',
      } as EditResponse);
      return;
    }

    // 文生图模型不需要上传图片，图像理解模型需要图片
    const selectedModel = model || 'cogview-4-250304';
    const isChatModel = selectedModel === 'glm-4.6v';

    if (isChatModel && (!image || !mimeType)) {
      res.status(400).json({
        success: false,
        error: '图像理解模型需要上传图片',
      } as EditResponse);
      return;
    }

    const result = await editImage({
      prompt,
      imageData: image || '',
      mimeType: mimeType || 'image/jpeg',
      model: selectedModel,
      referenceImages,
      history,
    });

    res.json({
      success: true,
      imageData: result.imageData,
      imageUrl: result.imageUrl,
      mimeType: result.mimeType,
      text: result.text,
    } as EditResponse);
  } catch (error: unknown) {
    console.error('Edit error:', error);

    const err = error as { status?: number; message?: string };

    // 额度耗尽
    if (err.status === 429 || err.message?.includes('quota') || err.message?.includes('额度')) {
      res.status(429).json({
        success: false,
        error: 'API 调用额度已用尽，请稍后重试',
      } as EditResponse);
      return;
    }

    // 服务不可用
    if (err.status && err.status >= 500) {
      res.status(502).json({
        success: false,
        error: 'GLM 服务暂时不可用，请稍后重试',
      } as EditResponse);
      return;
    }

    res.status(500).json({
      success: false,
      error: err.message || '编辑请求失败',
    } as EditResponse);
  }
});

export default router;
