import { useReducer, useCallback, useEffect } from 'react';
import axios from 'axios';
import type { GLMModel } from '../../../shared/types';

interface ReferenceImage {
  base64: string;
  mimeType: string;
}

interface HistoryItem {
  id: string;
  prompt: string;
  resultImageUrl?: string;
  resultImage?: string; // base64
  resultMimeType?: string;
  text?: string;
  timestamp: number;
}

interface EditorState {
  originalImage: string | null;
  originalMimeType: string;
  currentImage: string | null;
  currentImageUrl: string | null;
  currentMimeType: string;
  resultImage: string | null;
  resultImageUrl: string | null;
  resultText: string | null;
  resultMimeType: string;
  isLoading: boolean;
  error: string | null;
  selectedModel: GLMModel;
  history: HistoryItem[];
  referenceImages: ReferenceImage[];
}

type EditorAction =
  | { type: 'UPLOAD_IMAGE'; payload: { base64: string; mimeType: string } }
  | { type: 'SET_MODEL'; payload: GLMModel }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RESULT'; payload: { imageData?: string; imageUrl?: string; text?: string; mimeType: string; history: HistoryItem[] } }
  | { type: 'SET_REFERENCE_IMAGES'; payload: ReferenceImage[] }
  | { type: 'RESTORE_FROM_HISTORY'; payload: { image?: string; imageUrl?: string; mimeType: string; historyIndex: number } }
  | { type: 'LOAD_HISTORY'; payload: HistoryItem[] };

// Load saved history from localStorage (exclude image data to save space)
const loadSavedHistory = (): HistoryItem[] => {
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
  history: loadSavedHistory(),
  referenceImages: [],
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
    case 'SET_REFERENCE_IMAGES':
      return { ...state, referenceImages: action.payload };
    case 'RESTORE_FROM_HISTORY':
      return {
        ...state,
        currentImage: action.payload.image || null,
        currentImageUrl: action.payload.imageUrl || null,
        currentMimeType: action.payload.mimeType,
        history: state.history.slice(0, action.payload.historyIndex),
      };
    case 'LOAD_HISTORY':
      return { ...state, history: action.payload };
    default:
      return state;
  }
}

export default function useEditor() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (state.history.length > 0) {
      try {
        // Save a lightweight version without base64 image data
        const lightweightHistory = state.history.map(item => ({
          id: item.id,
          prompt: item.prompt,
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

  const setModel = useCallback((model: GLMModel) => {
    dispatch({ type: 'SET_MODEL', payload: model });
  }, []);

  const setReferenceImages = useCallback((images: ReferenceImage[]) => {
    dispatch({ type: 'SET_REFERENCE_IMAGES', payload: images });
  }, []);

  const submitEdit = useCallback(async (prompt: string) => {
    // 文生图模型不需要图片，图像理解模型需要图片
    const isChatModel = state.selectedModel === 'glm-4.6v';
    if (isChatModel && !state.currentImage) {
      dispatch({ type: 'SET_ERROR', payload: '请先上传图片' });
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const response = await axios.post('/api/edit', {
        prompt,
        image: state.currentImage || undefined,
        mimeType: state.currentMimeType,
        model: state.selectedModel,
        referenceImages: state.referenceImages.length > 0
          ? state.referenceImages.map(img => ({ data: img.base64, mimeType: img.mimeType }))
          : undefined,
      });

      if (response.data.success) {
        const hasImage = response.data.imageData || response.data.imageUrl;
        const newHistoryEntry: HistoryItem = {
          id: Date.now().toString(),
          prompt,
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
        dispatch({ type: 'SET_ERROR', payload: response.data.error || '编辑失败' });
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
      if (axiosErr.response?.status === 401) {
        dispatch({ type: 'SET_ERROR', payload: '登录已过期，请重新登录' });
      } else if (axiosErr.response?.status === 429) {
        dispatch({ type: 'SET_ERROR', payload: 'API 调用额度已用尽，请稍后重试' });
      } else if (axiosErr.response?.data?.error) {
        dispatch({ type: 'SET_ERROR', payload: axiosErr.response.data.error });
      } else {
        dispatch({ type: 'SET_ERROR', payload: '网络错误，请检查连接后重试' });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentImage, state.currentMimeType, state.selectedModel, state.history, state.referenceImages]);

  const restoreFromHistory = useCallback((entry: HistoryItem, index: number) => {
    dispatch({
      type: 'RESTORE_FROM_HISTORY',
      payload: {
        image: entry.resultImage,
        imageUrl: entry.resultImageUrl,
        mimeType: entry.resultMimeType || 'image/png',
        historyIndex: index,
      },
    });
  }, []);

  return {
    state,
    uploadImage,
    setModel,
    submitEdit,
    restoreFromHistory,
    setReferenceImages,
  };
}
