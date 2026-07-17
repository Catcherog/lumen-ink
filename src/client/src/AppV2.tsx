import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import ResultViewer from './components/ResultViewer';
import ApiSettingsModal from './components/ApiSettingsModal';
import EditorHeader from './components/v2/EditorHeader';
import TaskRail from './components/v2/TaskRail';
import ContextPanel from './components/v2/ContextPanel';
import VersionStripPlaceholder from './components/v2/VersionStripPlaceholder';
import useEditor from './hooks/useEditor';
import { serializeError } from './utils/error';
import { downloadImage } from './utils/image';
import type { ProviderConfig } from '../../shared/types';

type ViewMode = 'result' | 'original' | 'compare';

function stripExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

export default function AppV2() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [darkMode, setDarkMode] = useState(false);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [templatePrompt, setTemplatePrompt] = useState<string | undefined>(undefined);
  const [projectName, setProjectName] = useState('未命名项目');
  const [viewMode, setViewMode] = useState<ViewMode>('result');

  const {
    state,
    dispatch,
    uploadImage,
    submitEdit,
    restoreFromHistory,
    viewHistory,
    deleteHistory,
    setProvider,
    setModel,
    setShowApiSettings,
  } = useEditor();

  // Set axios default auth header when token changes + handle auth 401 globally
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }

    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          const errData = error.response.data;
          const errMsg = typeof errData?.error === 'string' ? errData.error : '';
          const isApiKeyError = errMsg.includes('API Key') || errMsg.includes('Key 无效');
          if (!isApiKeyError) {
            localStorage.removeItem('auth_token');
            setToken(null);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [token]);

  const loadProviders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/providers');
      const list = Array.isArray(res.data) ? res.data : [];
      setProviders(list);
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: serializeError(err) || '加载 Provider 列表失败' });
    }
  }, [token, dispatch]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/api/providers');
        if (cancelled) return;
        setProviders(Array.isArray(res.data) ? res.data : []);
      } catch (err: unknown) {
        if (cancelled) return;
        dispatch({ type: 'SET_ERROR', payload: serializeError(err) || '加载 Provider 列表失败' });
      }
    })();
    return () => { cancelled = true; };
  }, [token, dispatch]);

  const prevShowApiSettings = useRef(state.showApiSettings);
  useEffect(() => {
    if (prevShowApiSettings.current && !state.showApiSettings) {
      loadProviders();
    }
    prevShowApiSettings.current = state.showApiSettings;
  }, [state.showApiSettings, loadProviders]);

  // Auto-select default/first enabled provider when list or selection changes
  const prevDefaultRef = useRef<string | null>(null);
  useEffect(() => {
    const enabledProviders = providers.filter((p) => p.enabled);
    if (enabledProviders.length === 0) return;
    const currentId = state.selectedProvider;
    const defaultProvider = enabledProviders.find((p) => p.isDefault) || enabledProviders[0];
    const newDefaultId = defaultProvider?.id || null;

    if (newDefaultId && prevDefaultRef.current !== null && prevDefaultRef.current !== newDefaultId) {
      prevDefaultRef.current = newDefaultId;
      if (newDefaultId !== currentId) {
        setProvider(newDefaultId);
      }
      return;
    }
    prevDefaultRef.current = newDefaultId;

    if (currentId && enabledProviders.some((p) => p.id === currentId)) return;
    if (defaultProvider && defaultProvider.id !== currentId) {
      setProvider(defaultProvider.id);
    }
  }, [providers, state.selectedProvider, setProvider]);

  // Auto-set model only when provider actually switches
  const prevProviderRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state.selectedProvider) return;
    if (prevProviderRef.current !== state.selectedProvider) {
      prevProviderRef.current = state.selectedProvider;
      const provider = providers.find((p) => p.id === state.selectedProvider);
      if (provider) {
        setModel(provider.defaultModel);
      }
    }
  }, [state.selectedProvider, providers, setModel]);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
  };

  const handleImageUpload = useCallback((data: { base64: string; mimeType: string; file: File }) => {
    setProjectName(stripExtension(data.file.name) || '未命名项目');
    uploadImage(data);
  }, [uploadImage]);

  const handleSelectTemplate = (prompt: string) => {
    setTemplatePrompt(prompt);
  };

  const handlePromptConsumed = () => {
    setTemplatePrompt(undefined);
  };

  // 顶栏对比/导出：连接 ResultViewer 的真实能力（受控 viewMode + downloadImage 工具）
  // canExport 必须与 handleExport 支持的结果类型完全一致（仅 base64 / URL），
  // 纯文本结果（response.data.text）不接入导出 handler，因此不计入 canExport。
  const hasOriginal = !!state.originalImage;
  const canCompare = hasOriginal && !!(state.resultImage || state.resultImageUrl);
  const canExport = !!(state.resultImage || state.resultImageUrl);

  const handleCompare = useCallback(() => {
    if (!canCompare) return;
    setViewMode('compare');
  }, [canCompare]);

  const handleExport = useCallback(() => {
    if (!canExport) return;
    // 与 ResultViewer.handleDownload 同源：base64 走 downloadImage，URL 走新标签页
    if (state.resultImage) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadImage(state.resultImage, state.resultMimeType, `lumen-ink-${timestamp}.png`);
    } else if (state.resultImageUrl) {
      window.open(state.resultImageUrl, '_blank');
    }
  }, [canExport, state.resultImage, state.resultImageUrl, state.resultMimeType]);

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const displayProjectName = state.currentImage || state.currentImageUrl ? projectName : '未命名项目';

  return (
    <div className={darkMode ? 'dark' : ''}>
      <ErrorBoundary>
        <div className="flex flex-col h-[100dvh] bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden">
          <EditorHeader
            projectName={displayProjectName}
            darkMode={darkMode}
            onToggleTheme={() => setDarkMode((v) => !v)}
            onLogout={handleLogout}
            onSettings={() => setShowApiSettings(true)}
            onCompare={handleCompare}
            onExport={handleExport}
            canCompare={canCompare}
            canExport={canExport}
          />

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <TaskRail />

            <main className="flex-1 min-w-0 min-h-0 relative flex flex-col bg-white dark:bg-gray-900">
              {state.error && (
                <div className="absolute top-3 left-3 right-3 z-20">
                  <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 shadow-sm">
                    <p className="text-sm text-red-600 dark:text-red-300">
                      {typeof state.error === 'string' ? state.error : serializeError(state.error)}
                    </p>
                  </div>
                </div>
              )}

              <ResultViewer
                originalImage={state.originalImage}
                originalMimeType={state.originalMimeType}
                resultImage={state.resultImage}
                resultImageUrl={state.resultImageUrl}
                resultText={state.resultText}
                resultMimeType={state.resultMimeType}
                isLoading={state.isLoading}
                onImageUpload={handleImageUpload}
                lastCallMeta={state.lastCallMeta}
                lastPrompt={state.history.length > 0 ? state.history[state.history.length - 1].prompt : null}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            </main>

            <ContextPanel
              tool={state.selectedTool}
              state={state}
              dispatch={dispatch}
              onSubmit={submitEdit}
              onSelectTemplate={handleSelectTemplate}
              onRestoreHistory={restoreFromHistory}
              onViewHistory={viewHistory}
              onDeleteHistory={deleteHistory}
              externalPrompt={templatePrompt}
              onPromptConsumed={handlePromptConsumed}
            />
          </div>

          <VersionStripPlaceholder />
        </div>
      </ErrorBoundary>

      <ApiSettingsModal
        isOpen={state.showApiSettings}
        onClose={() => setShowApiSettings(false)}
        onProvidersChanged={(savedProviderId?: string) => {
          loadProviders();
          if (savedProviderId) {
            setProvider(savedProviderId);
          }
        }}
      />
    </div>
  );
}
