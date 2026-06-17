/**
 * GLM (智谱AI) API 服务
 * 支持文生图 (cogview-4 / glm-image) 和图像理解 (glm-4.6v)
 */

const GLM_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

interface GLMEditParams {
  prompt: string;
  imageData: string; // base64
  mimeType: string;
  model: string;
  referenceImages?: Array<{ data: string; mimeType: string }>;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: { url: string };
    }>;
  }>;
}

interface GLMEditResult {
  imageData?: string; // base64
  imageUrl?: string;
  mimeType?: string;
  text?: string;
}

/**
 * 将 base64 转为 data URL
 */
function base64ToDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * 文生图：调用 cogview-4 或 glm-image
 */
async function generateImage(params: GLMEditParams): Promise<GLMEditResult> {
  const apiKey = process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY || '';
  if (!apiKey) {
    throw new Error('未配置 GLM_API_KEY 环境变量');
  }

  // 构建提示词：如果有上传图片，将图片描述融入提示词
  let fullPrompt = params.prompt;

  // 如果有参考图，在提示词中说明
  if (params.referenceImages && params.referenceImages.length > 0) {
    fullPrompt += `\n\n（参考 ${params.referenceImages.length} 张参考图进行创作）`;
  }

  const body: Record<string, unknown> = {
    model: params.model,
    prompt: fullPrompt,
    size: '1280x1280',
    quality: params.model === 'glm-image' ? 'hd' : 'standard',
  };

  const response = await fetch(`${GLM_API_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('GLM Image API error:', response.status, errorText);
    if (response.status === 429) {
      throw Object.assign(new Error('API 调用额度已用尽'), { status: 429 });
    }
    throw Object.assign(new Error(`GLM API 错误: ${response.status}`), { status: response.status });
  }

  const data = await response.json() as {
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

/**
 * 图像理解/编辑：调用 glm-4.6v 多模态对话
 */
async function chatWithImage(params: GLMEditParams): Promise<GLMEditResult> {
  const apiKey = process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY || '';
  if (!apiKey) {
    throw new Error('未配置 GLM_API_KEY 环境变量');
  }

  // 构建 messages
  const messages: Array<Record<string, unknown>> = [];

  // 如果有历史对话，添加到 messages
  if (params.history && params.history.length > 0) {
    for (const turn of params.history) {
      messages.push({
        role: turn.role,
        content: turn.content,
      });
    }
  }

  // 当前用户消息：文本 + 图片
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: params.prompt },
  ];

  // 添加主图
  userContent.push({
    type: 'image_url',
    image_url: { url: base64ToDataUrl(params.imageData, params.mimeType) },
  });

  // 添加参考图
  if (params.referenceImages) {
    for (const ref of params.referenceImages) {
      userContent.push({
        type: 'image_url',
        image_url: { url: base64ToDataUrl(ref.data, ref.mimeType) },
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

  const response = await fetch(`${GLM_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('GLM Chat API error:', response.status, errorText);
    if (response.status === 429) {
      throw Object.assign(new Error('API 调用额度已用尽'), { status: 429 });
    }
    throw Object.assign(new Error(`GLM API 错误: ${response.status}`), { status: response.status });
  }

  const data = await response.json() as {
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

/**
 * 主入口：根据模型类型路由到对应 API
 */
export async function editImage(params: GLMEditParams): Promise<GLMEditResult> {
  const modelConfig = {
    'cogview-4-250304': { type: 'generation' as const },
    'glm-image': { type: 'generation' as const },
    'glm-4.6v': { type: 'chat' as const },
  };

  const config = modelConfig[params.model as keyof typeof modelConfig];

  if (!config) {
    throw new Error(`不支持的模型: ${params.model}`);
  }

  if (config.type === 'generation') {
    return generateImage(params);
  } else {
    return chatWithImage(params);
  }
}
