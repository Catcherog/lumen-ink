import { Router, Request, Response } from 'express';
import { getProvider, getProviderOperationType } from '../services/providers/ProviderFactory.js';
import type { EditRequest, EditResponse, EditResult } from 'shared/types.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, image, mimeType, model, referenceImages, history, providerId, regions } =
      req.body as EditRequest;

    if (!prompt) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数：prompt',
      } as EditResponse);
      return;
    }

    const provider = getProvider(providerId);
    if (!provider) {
      res.status(400).json({
        success: false,
        error: '未找到可用的 Provider，请先在 API 设置中配置',
      } as EditResponse);
      return;
    }

    const selectedModel = model || provider.config.defaultModel;
    const operationType = getProviderOperationType(provider.config.type, selectedModel);

    if (operationType === 'chat' && (!image || !mimeType)) {
      res.status(400).json({
        success: false,
        error: '图像理解模型需要上传图片',
      } as EditResponse);
      return;
    }

    let result: EditResult;
    switch (operationType) {
      case 'generate':
        result = await provider.generate({ prompt, referenceImages, model: selectedModel });
        break;
      case 'edit':
        result = await provider.edit({
          prompt,
          image: image || '',
          mimeType: mimeType || 'image/jpeg',
          referenceImages,
          model: selectedModel,
          regions,
        });
        break;
      case 'chat':
        result = await provider.chat({
          prompt,
          image,
          mimeType,
          referenceImages,
          history,
          model: selectedModel,
        });
        break;
      default:
        throw new Error(`不支持的模型: ${selectedModel}`);
    }

    res.json({
      success: true,
      imageData: result.imageData,
      imageUrl: result.imageUrl,
      mimeType: result.mimeType,
      text: result.text,
      meta: {
        providerName: provider.config.name,
        providerType: provider.config.type,
        model: selectedModel,
        operationType,
      },
    } as EditResponse);
  } catch (error: unknown) {
    console.error('Edit error:', error);

    const err = error as { status?: number; message?: string };

    // API Key 无效或已过期
    if (err.status === 401 || err.status === 403) {
      res.status(401).json({
        success: false,
        error: 'API Key 无效或已过期',
      } as EditResponse);
      return;
    }

    // 额度耗尽
    if (err.status === 429 || err.message?.includes('quota') || err.message?.includes('额度')) {
      res.status(429).json({
        success: false,
        error: '额度已用尽',
      } as EditResponse);
      return;
    }

    // 服务不可用
    if (err.status && err.status >= 500) {
      res.status(502).json({
        success: false,
        error: '服务暂时不可用',
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
