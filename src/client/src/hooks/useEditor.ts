import { useReducer, useCallback, useEffect } from 'react';
import axios from 'axios';
import { serializeError } from '../utils/error';
import type {
  EditorState,
  EditorAction,
  ReferenceImage,
  HistoryEntry,
  RetouchTool,
  Region,
  EphemeralProviderConfig,
} from '../../../shared/types';

const loadSavedHistory = (): HistoryEntry[] => {
  try {
    const saved = localStorage.getItem('edit_history');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // localStorage might be corrupted, ignore
  }
  return [];
};

const initialState: EditorState = {
  originalImage: null,
  originalMimeType: 'image/jpeg',
  currentImage: null,
  currentImageUrl: null,
  currentMimeType: 'image/jpeg',
  resultImage: null,
  resultImageUrl: null,
  resultText: null,
  resultMimeType: 'image/png',
  isLoading: false,
  error: null,
  selectedModel: 'cogview-4-250304',
  history: [],
  referenceImages: [],
  selectedTool: 'face',
  selectedProvider: null,
  showApiSettings: false,
};

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'UPLOAD_IMAGE':
      return {
        ...state,
        originalImage: action.payload.base64,
        originalMimeType: action.payload.mimeType,
        currentImage: action.payload.base64,
        currentImageUrl: null,
        currentMimeType: action.payload.mimeType,
        history: [],
        referenceImages: [],
        error: null,
      };
    case 'SET_MODEL':
      return { ...state, selectedModel: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_RESULT': {
      // P0-01-R2: 维护"当前画布输入"不变量，避免 URL-only 结果保留旧 base64。
      // - base64 结果：currentImage = 新 base64；currentImageUrl = 同时返回的 URL 或 null
      // - URL-only 结果：清空旧 base64，currentImage = null，currentImageUrl = 新 URL
      // - text-only 结果：保留既有 currentImage/currentImageUrl（chat 模型可继续基于原图编辑）
      const hasImageData = !!action.payload.imageData;
      const hasImageUrl = !!action.payload.imageUrl;
      let nextCurrentImage: string | null;
      let nextCurrentImageUrl: string | null;
      let nextCurrentMimeType: string;
      if (hasImageData) {
        nextCurrentImage = action.payload.imageData ?? null;
        nextCurrentImageUrl = hasImageUrl ? action.payload.imageUrl ?? null : null;
        nextCurrentMimeType = action.payload.mimeType;
      } else if (hasImageUrl) {
        // URL-only 图片结果：清空旧 base64，避免下次 submitEdit 携带旧图
        nextCurrentImage = null;
        nextCurrentImageUrl = action.payload.imageUrl ?? null;
        nextCurrentMimeType = action.payload.mimeType;
      } else {
        // text-only 或空结果：保留既有 canvas，用户可继续基于原图编辑
        nextCurrentImage = state.currentImage;
        nextCurrentImageUrl = state.currentImageUrl;
        nextCurrentMimeType = state.currentMimeType;
      }
      return {
        ...state,
        resultImage: action.payload.imageData || null,
        resultImageUrl: action.payload.imageUrl || null,
        resultText: action.payload.text || null,
        resultMimeType: action.payload.mimeType,
        currentImage: nextCurrentImage,
        currentImageUrl: nextCurrentImageUrl,
        currentMimeType: nextCurrentMimeType,
        history: action.payload.history,
        lastCallMeta: action.payload.meta,
      };
    }
    case 'SET_CURRENT_IMAGE':
      return {
        ...state,
        currentImage: action.payload.image || null,
        currentImageUrl: action.payload.imageUrl || null,
        currentMimeType: action.payload.mimeType,
      };
    case 'SET_REFERENCE_IMAGES':
      return { ...state, referenceImages: action.payload };
    case 'RESTORE_FROM_HISTORY':
      return {
        ...state,
        currentImage: action.payload.entry.resultImage || null,
        currentImageUrl: action.payload.entry.resultImageUrl || null,
        currentMimeType: action.payload.entry.resultMimeType || 'image/png',
        history: state.history.slice(0, action.payload.index),
      };
    case 'VIEW_HISTORY': {
      // 仅切换当前查看的图片，不修改 history 数组
      return {
        ...state,
        currentImage: action.payload.entry.resultImage || null,
        currentImageUrl: action.payload.entry.resultImageUrl || null,
        currentMimeType: action.payload.entry.resultMimeType || 'image/png',
      };
    }
    case 'DELETE_HISTORY': {
      // 删除单条历史，若删除的是当前查看项则切换到最近一条
      const newHistory = state.history.filter(h => h.id !== action.payload.id);
      const deletedEntry = state.history.find(h => h.id === action.payload.id);
      const isCurrentViewed = deletedEntry
        ? (deletedEntry.resultImage === state.currentImage || deletedEntry.resultImageUrl === state.currentImageUrl)
        : false;
      let newCurrentImage = state.currentImage;
      let newCurrentImageUrl = state.currentImageUrl;
      let newCurrentMimeType = state.currentMimeType;
      if (isCurrentViewed && newHistory.length > 0) {
        const latest = newHistory[newHistory.length - 1];
        newCurrentImage = latest.resultImage || null;
        newCurrentImageUrl = latest.resultImageUrl || null;
        newCurrentMimeType = latest.resultMimeType || 'image/png';
      } else if (isCurrentViewed) {
        newCurrentImage = state.originalImage;
        newCurrentImageUrl = null;
        newCurrentMimeType = state.originalMimeType;
      }
      return {
        ...state,
        history: newHistory,
        currentImage: newCurrentImage,
        currentImageUrl: newCurrentImageUrl,
        currentMimeType: newCurrentMimeType,
      };
    }
    case 'LOAD_HISTORY':
      return { ...state, history: action.payload };
    case 'SET_TOOL':
      return { ...state, selectedTool: action.payload };
    case 'SET_PROVIDER':
      return { ...state, selectedProvider: action.payload };
    case 'SET_SHOW_API_SETTINGS':
      return { ...state, showApiSettings: action.payload };
    default:
      return state;
  }
}

export interface UseEditorOptions {
  /** Disable all local history reads/writes for the ephemeral public demo. */
  persistHistory?: boolean;
  /** Request-scoped BYO provider sent only to the ephemeral edit route. */
  ephemeralProvider?: EphemeralProviderConfig;
}

export default function useEditor(options: UseEditorOptions = {}) {
  const persistHistory = options.persistHistory ?? true;
  const ephemeralProvider = options.ephemeralProvider;
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load saved history on mount
  useEffect(() => {
    if (!persistHistory) return;
    const saved = loadSavedHistory();
    if (saved.length > 0) {
      dispatch({ type: 'LOAD_HISTORY', payload: saved });
    }
  }, [persistHistory]);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (!persistHistory) return;
    if (state.history.length > 0) {
      try {
        // Save a lightweight version without base64 image data,
        // but keep tool/params/providerId/regions for history restoration.
        const lightweightHistory = state.history.map(item => ({
          id: item.id,
          prompt: item.prompt,
          tool: item.tool,
          params: item.params,
          providerId: item.providerId,
          regions: item.regions,
          resultImageUrl: item.resultImageUrl,
          resultMimeType: item.resultMimeType,
          text: item.text,
          timestamp: item.timestamp,
        }));
        localStorage.setItem('edit_history', JSON.stringify(lightweightHistory));
      } catch {
        // localStorage might be full, ignore
      }
    } else {
      localStorage.removeItem('edit_history');
    }
  }, [persistHistory, state.history]);

  const uploadImage = useCallback((data: { base64: string; mimeType: string; file: File }) => {
    dispatch({ type: 'UPLOAD_IMAGE', payload: { base64: data.base64, mimeType: data.mimeType } });
  }, []);

  const setModel = useCallback((model: string) => {
    dispatch({ type: 'SET_MODEL', payload: model });
  }, []);

  const setReferenceImages = useCallback((images: ReferenceImage[]) => {
    dispatch({ type: 'SET_REFERENCE_IMAGES', payload: images });
  }, []);

  const setTool = useCallback((tool: RetouchTool) => {
    dispatch({ type: 'SET_TOOL', payload: tool });
  }, []);

  const setProvider = useCallback((providerId: string | null) => {
    dispatch({ type: 'SET_PROVIDER', payload: providerId });
  }, []);

  const setShowApiSettings = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_API_SETTINGS', payload: show });
  }, []);

  const submitEdit = useCallback(async (prompt: string, options?: {
    tool?: RetouchTool;
    params?: Record<string, unknown>;
    regions?: Region[];
    referenceImages?: ReferenceImage[];
  }) => {
    // 文生图模型不需要图片，图像理解模型需要图片
    const isChatModel = state.selectedModel === 'glm-4.6v';
    if (isChatModel && !state.currentImage) {
      dispatch({ type: 'SET_ERROR', payload: '请先上传图片' });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const referenceImages = options?.referenceImages || state.referenceImages;
      const response = await axios.post('/api/edit', {
        prompt,
        image: state.currentImage || undefined,
        mimeType: state.currentMimeType,
        model: state.selectedModel,
        providerId: state.selectedProvider || undefined,
        regions: options?.regions,
        referenceImages: referenceImages.length > 0
          ? referenceImages.map(img => ({ data: img.base64, mimeType: img.mimeType }))
          : undefined,
        provider: ephemeralProvider,
      }, {
        timeout: 100000,
      });

      if (response.data.success) {
        const hasImage = response.data.imageData || response.data.imageUrl;
        const newHistoryEntry: HistoryEntry = {
          id: Date.now().toString(),
          prompt,
          tool: options?.tool,
          params: options?.params,
          providerId: state.selectedProvider || undefined,
          regions: options?.regions,
          resultImage: response.data.imageData,
          resultImageUrl: response.data.imageUrl,
          resultMimeType: response.data.mimeType || 'image/png',
          text: response.data.text,
          timestamp: Date.now(),
        };

        dispatch({
          type: 'SET_RESULT',
          payload: {
            imageData: response.data.imageData,
            imageUrl: response.data.imageUrl,
            text: response.data.text,
            mimeType: response.data.mimeType || (hasImage ? 'image/png' : 'text/plain'),
            history: [...state.history, newHistoryEntry],
            meta: response.data.meta,
          },
        });
      } else {
        const errorPayload = typeof response.data.message === 'string'
          ? response.data.message
          : typeof response.data.error === 'string'
            ? response.data.error
          : serializeError(response.data.error);
        dispatch({ type: 'SET_ERROR', payload: errorPayload || '编辑失败' });
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      const responseData = axiosErr.response?.data as {
        message?: string;
        error?: string;
        errorCode?: string;
      } | undefined;
      const responseErrorText = responseData?.message || responseData?.error || serializeError(responseData) || '';
      if (axiosErr.response?.status === 401 || axiosErr.response?.status === 403) {
        if (responseData?.errorCode || responseErrorText.includes('API Key') || responseErrorText.includes('Key')) {
          dispatch({ type: 'SET_ERROR', payload: 'API Key 无效或已过期' });
        } else {
          dispatch({ type: 'SET_ERROR', payload: '登录已过期，请重新登录' });
        }
      } else if (axiosErr.response?.status === 429) {
        dispatch({ type: 'SET_ERROR', payload: '该 API 额度已用尽，请切换 Provider 或稍后重试' });
      } else if (responseErrorText) {
        dispatch({ type: 'SET_ERROR', payload: responseErrorText });
      } else {
        dispatch({ type: 'SET_ERROR', payload: serializeError(err) || '网络错误，请检查连接后重试' });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [ephemeralProvider, state.currentImage, state.currentMimeType, state.selectedModel, state.selectedProvider, state.history, state.referenceImages]);

  const restoreFromHistory = useCallback((entry: HistoryEntry, index: number) => {
    dispatch({
      type: 'RESTORE_FROM_HISTORY',
      payload: { entry, index },
    });
  }, []);

  const viewHistory = useCallback((entry: HistoryEntry) => {
    dispatch({ type: 'VIEW_HISTORY', payload: { entry } });
  }, []);

  const deleteHistory = useCallback((id: string) => {
    dispatch({ type: 'DELETE_HISTORY', payload: { id } });
  }, []);

  const importExternalResult = useCallback((data: { base64: string; mimeType: string; prompt: string }) => {
    const newHistoryEntry: HistoryEntry = {
      id: Date.now().toString(),
      prompt: data.prompt,
      tool: 'manual',
      providerId: 'manual-gemini',
      resultImage: data.base64,
      resultMimeType: data.mimeType,
      timestamp: Date.now(),
    };

    dispatch({
      type: 'SET_RESULT',
      payload: {
        imageData: data.base64,
        imageUrl: undefined,
        text: undefined,
        mimeType: data.mimeType,
        history: [...state.history, newHistoryEntry],
        meta: {
          providerName: '手动工作流（Gemini 网页版）',
          providerType: 'manual',
          model: 'gemini-web-manual',
          operationType: 'manual',
        },
      },
    });
  }, [state.history]);

  return {
    state,
    dispatch,
    uploadImage,
    setModel,
    submitEdit,
    restoreFromHistory,
    viewHistory,
    deleteHistory,
    setReferenceImages,
    setTool,
    setProvider,
    setShowApiSettings,
    importExternalResult,
  };
}
