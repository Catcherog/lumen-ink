import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// axios 默认导出 mock：仅拦截 post，避免触发真实 /api/edit
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from 'axios';
import useEditor from './useEditor';
import { defaultRecipe, compilePrompt } from '../utils/recipe';
import type { EditorAction } from '../../../shared/types';

// ===== 测试工具 =====

const mockedAxiosPost = axios.post as unknown as ReturnType<typeof vi.fn>;

function makeFile(name: string, type: string): File {
  return new File(['dummy'], name, { type });
}

/**
 * 模拟 Provider 返回的 SET_RESULT。
 * 与 useEditor.submitEdit 内部 dispatch 的 payload 形态保持一致。
 */
function makeSetResultAction(payload: {
  imageData?: string;
  imageUrl?: string;
  text?: string;
  mimeType: string;
}): EditorAction {
  return {
    type: 'SET_RESULT',
    payload: {
      imageData: payload.imageData,
      imageUrl: payload.imageUrl,
      text: payload.text,
      mimeType: payload.mimeType,
      history: [],
      meta: {
        providerName: 'TestProvider',
        providerType: 'test',
        model: 'test-model',
        operationType: 'edit',
      },
    },
  };
}

beforeEach(() => {
  mockedAxiosPost.mockReset();
  mockedAxiosPost.mockResolvedValue({ data: { success: true, imageData: 'next-base64' } });
  localStorage.clear();
});

// ===== 测试 =====

describe('useEditor (FLOW-001 P0-01-R2 / P0-02-VERIFY-R2)', () => {
  describe('P0-01-R2: SET_RESULT URL-only 状态不变量（真实复现）', () => {
    it('旧 base64 + URL-only SET_RESULT 后 currentImage=null, currentImageUrl=新 URL', async () => {
      const { result } = renderHook(() => useEditor());

      // Step 1: 模拟上传图片，currentImage = 'old-base64'
      await act(async () => {
        result.current.uploadImage({
          base64: 'old-base64-data',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });
      expect(result.current.state.currentImage).toBe('old-base64-data');
      expect(result.current.state.currentImageUrl).toBeNull();

      // Step 2: 模拟 Provider 返回 URL-only 结果（首轮 P0-01 真实复现路径）
      await act(async () => {
        result.current.dispatch(
          makeSetResultAction({
            imageUrl: 'https://cdn.example.com/result.png',
            mimeType: 'image/png',
          }),
        );
      });

      // 不变量：旧 base64 必须被清空，避免下次 submitEdit 携带
      expect(result.current.state.currentImage).toBeNull();
      expect(result.current.state.currentImageUrl).toBe('https://cdn.example.com/result.png');
    });

    it('URL-only SET_RESULT 后 submitEdit 请求不含旧 base64', async () => {
      const { result } = renderHook(() => useEditor());

      // 上传 → 旧 base64
      await act(async () => {
        result.current.uploadImage({
          base64: 'old-base64-data',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });

      // URL-only SET_RESULT（真实"旧 base64 + 新 URL"状态）
      await act(async () => {
        result.current.dispatch(
          makeSetResultAction({
            imageUrl: 'https://cdn.example.com/result.png',
            mimeType: 'image/png',
          }),
        );
      });

      // submitEdit：模拟 ContextPanel/AppV2 在 canSubmit 通过后调用
      await act(async () => {
        await result.current.submitEdit('test prompt');
      });

      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      const [, requestBody] = mockedAxiosPost.mock.calls[0];
      // 不发送旧 base64
      expect(requestBody.image).toBeUndefined();
    });
  });

  describe('SET_RESULT 四种结果分支无输入源错位', () => {
    it('base64-only：currentImage = 新 base64, currentImageUrl = null', async () => {
      const { result } = renderHook(() => useEditor());
      await act(async () => {
        result.current.uploadImage({
          base64: 'old-base64',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });
      await act(async () => {
        result.current.dispatch(
          makeSetResultAction({
            imageData: 'new-base64-data',
            mimeType: 'image/png',
          }),
        );
      });
      expect(result.current.state.currentImage).toBe('new-base64-data');
      expect(result.current.state.currentImageUrl).toBeNull();
    });

    it('新 base64 + URL：currentImage = 新 base64, currentImageUrl = 新 URL', async () => {
      const { result } = renderHook(() => useEditor());
      await act(async () => {
        result.current.uploadImage({
          base64: 'old-base64',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });
      await act(async () => {
        result.current.dispatch(
          makeSetResultAction({
            imageData: 'new-base64-data',
            imageUrl: 'https://cdn.example.com/result.png',
            mimeType: 'image/png',
          }),
        );
      });
      expect(result.current.state.currentImage).toBe('new-base64-data');
      expect(result.current.state.currentImageUrl).toBe('https://cdn.example.com/result.png');
    });

    it('URL-only：清空旧 base64, currentImageUrl = 新 URL', async () => {
      const { result } = renderHook(() => useEditor());
      await act(async () => {
        result.current.uploadImage({
          base64: 'old-base64',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });
      await act(async () => {
        result.current.dispatch(
          makeSetResultAction({
            imageUrl: 'https://cdn.example.com/result.png',
            mimeType: 'image/png',
          }),
        );
      });
      expect(result.current.state.currentImage).toBeNull();
      expect(result.current.state.currentImageUrl).toBe('https://cdn.example.com/result.png');
    });

    it('text-only：保留既有 currentImage/currentImageUrl（chat 模型可继续编辑）', async () => {
      const { result } = renderHook(() => useEditor());
      await act(async () => {
        result.current.uploadImage({
          base64: 'old-base64',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });
      await act(async () => {
        result.current.dispatch(
          makeSetResultAction({
            text: 'image description',
            mimeType: 'text/plain',
          }),
        );
      });
      // text-only 保留既有 canvas，用户可继续基于原图编辑
      expect(result.current.state.currentImage).toBe('old-base64');
      expect(result.current.state.currentImageUrl).toBeNull();
      expect(result.current.state.resultText).toBe('image description');
    });
  });

  describe('P0-02-VERIFY-R2: 参考图 submitEdit / /api/edit payload 一致性', () => {
    it('设置 N=2 张参考图后 submitEdit payload referenceImages 长度 = 2', async () => {
      const { result } = renderHook(() => useEditor());
      await act(async () => {
        result.current.uploadImage({
          base64: 'fake-base64',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });

      const refs = [
        { base64: 'ref1-base64', mimeType: 'image/png' },
        { base64: 'ref2-base64', mimeType: 'image/jpeg' },
      ];
      await act(async () => {
        result.current.setReferenceImages(refs);
      });
      expect(result.current.state.referenceImages).toHaveLength(2);

      // 显式传 referenceImages（与 AppV2.handleGeneratePreview 一致）
      await act(async () => {
        await result.current.submitEdit('test prompt', {
          referenceImages: result.current.state.referenceImages,
        });
      });

      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      const [, body] = mockedAxiosPost.mock.calls[0];
      expect(body.referenceImages).toHaveLength(2);
      expect(body.referenceImages[0]).toEqual({ data: 'ref1-base64', mimeType: 'image/png' });
      expect(body.referenceImages[1]).toEqual({ data: 'ref2-base64', mimeType: 'image/jpeg' });
    });

    it('N=0 时 submitEdit payload 不含 referenceImages 字段', async () => {
      const { result } = renderHook(() => useEditor());
      await act(async () => {
        result.current.uploadImage({
          base64: 'fake-base64',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });

      await act(async () => {
        await result.current.submitEdit('test prompt');
      });

      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      const [, body] = mockedAxiosPost.mock.calls[0];
      expect(body.referenceImages).toBeUndefined();
    });

    it('编译 Prompt 含"参考 N 张" + history params.recipe.auxiliary.referenceImageCount=N + payload referenceImages 长度=N', async () => {
      const { result } = renderHook(() => useEditor());
      await act(async () => {
        result.current.uploadImage({
          base64: 'fake-base64',
          mimeType: 'image/jpeg',
          file: makeFile('a.jpg', 'image/jpeg'),
        });
      });

      const N = 3;
      const refs = Array.from({ length: N }, (_, i) => ({
        base64: `ref${i}-base64`,
        mimeType: 'image/png',
      }));
      await act(async () => {
        result.current.setReferenceImages(refs);
      });

      // 复刻 AppV2.handleGeneratePreview 闭环：compilePrompt + submitEdit + params.recipe
      const recipe = {
        ...defaultRecipe('subject'),
        auxiliary: {
          ...defaultRecipe('subject').auxiliary,
          referenceImageCount: N,
        },
      };
      const compiled = compilePrompt(recipe);

      await act(async () => {
        await result.current.submitEdit(compiled.prompt, {
          tool: recipe.tool ?? undefined,
          params: { recipe, compiledVersion: compiled.version },
          referenceImages: result.current.state.referenceImages,
        });
      });

      expect(mockedAxiosPost).toHaveBeenCalledTimes(1);
      const [, body] = mockedAxiosPost.mock.calls[0];
      // 1. 编译 Prompt 含【参考图】段，"参考 N 张参考图进行创作"
      expect(body.prompt).toContain(`【参考图】参考 ${N} 张参考图进行创作`);
      // 2. 实际 payload referenceImages 长度 = N
      expect(body.referenceImages).toHaveLength(N);
      // 3. history params.recipe.auxiliary.referenceImageCount = N
      //    （params 不在请求 body，存储在 history entry 中）
      expect(result.current.state.history).toHaveLength(1);
      const lastEntry = result.current.state.history[0];
      const recipeInParams = (
        lastEntry.params as { recipe: { auxiliary: { referenceImageCount: number } } } | undefined
      )?.recipe;
      expect(recipeInParams?.auxiliary.referenceImageCount).toBe(N);
      // 三层均为 N，无错位
    });
  });
});
