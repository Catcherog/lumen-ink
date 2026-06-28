import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import Toolbar from './components/Toolbar';
import ParamPanel from './components/ParamPanel';
import ResultViewer from './components/ResultViewer';
import ApiSettingsButton from './components/ApiSettingsButton';
import ApiSettingsModal from './components/ApiSettingsModal';
import ManualWorkflowDialog from './components/ManualWorkflowDialog';
import useEditor from './hooks/useEditor';
import { serializeError } from './utils/error';
import type { ProviderConfig } from '../../shared/types';
import { PROVIDER_MODELS } from '../../shared/types';
import type { ProviderModelOption } from '../../shared/types';
import { Sun, Moon, LogOut, PanelRightOpen, PanelRightClose, Image as ImageIcon } from 'lucide-react';

const CAPABILITY_ICONS: Record<string, string> = {
  generation: '🎨',
  edit: '✏️',
  chat: '💬',
};

function formatModelLabel(model: ProviderModelOption): string {
  if (!model.capabilities || model.capabilities.length === 0) {
    return model.label;
  }
  const icons = model.capabilities.map((cap) => CAPABILITY_ICONS[cap] || '').join(' ');
  return `${model.label} ${icons}`.trim();
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [darkMode, setDarkMode] = useState(false);
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [showMobileRightPanel, setShowMobileRightPanel] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [templatePrompt, setTemplatePrompt] = useState<string | undefined>(undefined);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [manualWorkflowOpen, setManualWorkflowOpen] = useState(false);
  const [promptInput, setPromptInput] = useState('');

  const {
    state,
    dispatch,
    uploadImage,
    submitEdit,
    restoreFromHistory,
    setTool,
    setProvider,
    setModel,
    setShowApiSettings,
    importExternalResult,
  } = useEditor();

  const handlePromptChange = useCallback((value: string) => {
    setPromptInput(value);
  }, []);

  const handleExportToGemini = useCallback(() => {
    setManualWorkflowOpen(true);
  }, []);

  const handleManualImport = useCallback((data: { base64: string; mimeType: string; prompt: string }) => {
    importExternalResult(data);
    setManualWorkflowOpen(false);
  }, [importExternalResult]);

  const handleManualDialogClose = useCallback(() => {
    setManualWorkflowOpen(false);
  }, []);

  // Set axios default auth header when token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const loadProviders = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/providers');
      const list = Array.isArray(res.data) ? res.data : [];
      setProviders(list);
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: serializeError(err) || '加载 Provider 列表失败' });
    }
  };

  useEffect(() => {
    loadProviders();
  }, [token]);

  const prevShowApiSettings = useRef(state.showApiSettings);
  useEffect(() => {
    if (prevShowApiSettings.current && !state.showApiSettings) {
      loadProviders();
    }
    prevShowApiSettings.current = state.showApiSettings;
  }, [state.showApiSettings]);

  // Auto-select default/first enabled provider when list or selection changes
  const prevDefaultRef = useRef<string | null>(null);
  useEffect(() => {
    const enabledProviders = providers.filter((p) => p.enabled);
    if (enabledProviders.length === 0) return;
    const currentId = state.selectedProvider;
    const defaultProvider = enabledProviders.find((p) => p.isDefault) || enabledProviders[0];
    const newDefaultId = defaultProvider?.id || null;

    // 检测默认 Provider 是否变更（兜底：即使没有显式回传 savedProviderId，也能切换到新默认）
    if (newDefaultId && prevDefaultRef.current !== null && prevDefaultRef.current !== newDefaultId) {
      prevDefaultRef.current = newDefaultId;
      if (newDefaultId !== currentId) {
        setProvider(newDefaultId);
      }
      return;
    }
    prevDefaultRef.current = newDefaultId;

    // 当前未选或已失效时，选默认
    if (currentId && enabledProviders.some((p) => p.id === currentId)) return;
    if (defaultProvider && defaultProvider.id !== currentId) {
      setProvider(defaultProvider.id);
    }
  }, [providers, state.selectedProvider, setProvider]);

  // Auto-set model only when provider actually switches (not on providers list refresh)
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

  const selectedProviderConfig = providers.find((p) => p.id === state.selectedProvider);
  const availableModels = selectedProviderConfig ? (PROVIDER_MODELS[selectedProviderConfig.type] || []) : [];

  // Responsive desktop detection
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
  };

  const handleSelectTemplate = (prompt: string) => {
    setTemplatePrompt(prompt);
    if (!isDesktop) {
      setShowMobileRightPanel(true);
    }
  };

  const handlePromptConsumed = () => {
    setTemplatePrompt(undefined);
  };

  // Not logged in — show login page
  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <ErrorBoundary>
        <div className="flex flex-col h-[100dvh] bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden">
          {/* Header */}
          <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                <ImageIcon className="w-5 h-5" />
              </div>
              <h1 className="text-base lg:text-lg font-bold text-gray-900 dark:text-gray-100 hidden sm:block">光砚</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Provider selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline">Provider：</label>
                <div className="relative">
                  <select
                    value={state.selectedProvider || ''}
                    onChange={(e) => setProvider(e.target.value || null)}
                    className="pl-3 pr-8 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none"
                  >
                    <option value="">选择 Provider</option>
                    {providers
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Model selector */}
              {availableModels.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline">模型：</label>
                  <div className="relative">
                    <select
                      value={state.selectedModel}
                      onChange={(e) => setModel(e.target.value)}
                      className="pl-3 pr-8 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none max-w-[180px]"
                    >
                      {availableModels.map((m) => (
                        <option key={m.value} value={m.value}>{formatModelLabel(m)}</option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              <ApiSettingsButton onClick={() => setShowApiSettings(true)} />

              <button
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? '浅色模式' : '深色模式'}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                onClick={handleLogout}
                title="退出登录"
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Main workspace */}
          <div className="flex flex-1 overflow-hidden min-h-0">
            {/* Left toolbar */}
            <Toolbar
              activeTool={state.selectedTool}
              onToolChange={setTool}
              expanded={isDesktop && toolbarExpanded}
              onToggleExpand={isDesktop ? () => setToolbarExpanded(v => !v) : undefined}
              onExportToGemini={handleExportToGemini}
              hasImage={!!(state.currentImage || state.currentImageUrl)}
              className={`flex-shrink-0 min-h-0 ${isDesktop && toolbarExpanded ? 'w-52' : 'w-14'}`}
            />

            {/* Center canvas */}
            <main className="flex-1 min-w-0 min-h-0 relative flex flex-col">
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
                onImageUpload={uploadImage}
                lastCallMeta={state.lastCallMeta}
              />

              {/* Mobile right panel drawer */}
              {!isDesktop && showMobileRightPanel && (
                <>
                  <div
                    className="absolute inset-0 bg-black/30 z-30"
                    onClick={() => setShowMobileRightPanel(false)}
                  />
                  <div className="absolute bottom-0 inset-x-0 h-[75vh] z-40 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-sm font-medium">参数与提示词</span>
                      <button
                        onClick={() => setShowMobileRightPanel(false)}
                        className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                      >
                        <PanelRightClose className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <ParamPanel
                        tool={state.selectedTool}
                        state={state}
                        dispatch={dispatch}
                        onSubmit={submitEdit}
                        onSelectTemplate={handleSelectTemplate}
                        onRestoreHistory={restoreFromHistory}
                        externalPrompt={templatePrompt}
                        onPromptConsumed={handlePromptConsumed}
                        onPromptChange={handlePromptChange}
                      />
                    </div>
                  </div>
                </>
              )}
            </main>

            {/* Right panel — desktop */}
            <div className="hidden lg:flex w-80 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 min-h-0 overflow-hidden">
              <ParamPanel
                tool={state.selectedTool}
                state={state}
                dispatch={dispatch}
                onSubmit={submitEdit}
                onSelectTemplate={handleSelectTemplate}
                onRestoreHistory={restoreFromHistory}
                externalPrompt={templatePrompt}
                onPromptConsumed={handlePromptConsumed}
                onPromptChange={handlePromptChange}
              />
            </div>
          </div>

          {/* Mobile right panel toggle */}
          {!isDesktop && (
            <button
              onClick={() => setShowMobileRightPanel(true)}
              className="fixed bottom-4 right-4 z-20 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
              title="打开参数面板"
            >
              <PanelRightOpen className="w-5 h-5" />
            </button>
          )}
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

      <ManualWorkflowDialog
        isOpen={manualWorkflowOpen}
        onClose={handleManualDialogClose}
        onImport={handleManualImport}
        currentImage={state.currentImage}
        currentImageUrl={state.currentImageUrl}
        currentMimeType={state.currentMimeType}
        currentPrompt={promptInput}
      />
    </div>
  );
}
