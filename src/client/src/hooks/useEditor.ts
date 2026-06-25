import { useReducer, useCallback, useEffect } from 'react';
import axios from 'axios';
import { serializeError } from '../utils/error';
import type { EditorState, EditorAction, ReferenceImage, HistoryEntry, RetouchTool, Region } from '../../../shared/types';

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
    case 'SET_RESULT':
      return {
        ...state,
        resultImage: action.payload.imageData || null,
        resultImageUrl: action.payload.imageUrl || null,
        resultText: action.payload.text || null,
        resultMimeType: action.payload.mimeType,
        currentImage: action.payload.imageData || state.currentImage,
        currentImageUrl: action.payload.imageUrl || null,
        currentMimeType: action.payload.mimeType,
        history: action.payload.history,
      };
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

export default function useEditor() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load saved history on mount
  useEffect(() => {
    const saved = loadSavedHistory();
    if (saved.length > 0) {
      dispatch({ type: 'LOAD_HISTORY', payload: saved });
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
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
  }, [state.history]);

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
          },
        });
      } else {
        const errorPayload = typeof response.data.error === 'string'
          ? response.data.error
          : serializeError(response.data.error);
        dispatch({ type: 'SET_ERROR', payload: errorPayload || '编辑失败' });
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      const responseErrorText = serializeError(axiosErr.response?.data) || '';
      if (axiosErr.response?.status === 401 || axiosErr.response?.status === 403) {
        if (responseErrorText.includes('API Key') || responseErrorText.includes('Key')) {
          dispatch({ type: 'SET_ERROR', payload: 'API Key 无效或已过期' });
        } else {
          dispatch({ type: 'SET_ERROR', payload: '登录已过期，请重新登录' });
        }
      } else if (axiosErr.response?.status === 429) {
        dispatch({ type: 'SET_ERROR', payload: '该 API 额度已用尽，请切换 Provider 或稍后重试' });
      } else if (axiosErr.response?.data) {
        dispatch({ type: 'SET_ERROR', payload: serializeError(axiosErr.response.data) });
      } else {
        dispatch({ type: 'SET_ERROR', payload: serializeError(err) || '网络错误，请检查连接后重试' });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentImage, state.currentMimeType, state.selectedModel, state.selectedProvider, state.history, state.referenceImages]);

  const restoreFromHistory = useCallback((entry: HistoryEntry, index: number) => {
    dispatch({
      type: 'RESTORE_FROM_HISTORY',
      payload: { entry, index },
    });
  }, []);

  return {
    state,
    dispatch,
    uploadImage,
    setModel,
    submitEdit,
    restoreFromHistory,
    setReferenceImages,
    setTool,
    setProvider,
    setShowApiSettings,
  };
}
