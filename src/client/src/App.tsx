import { useState, useEffect } from 'react';
import axios from 'axios';
import ImageUploader from './components/ImageUploader';
import PromptInput from './components/PromptInput';
import ResultViewer from './components/ResultViewer';
import ReferenceImages from './components/ReferenceImages';
import TemplatePanel from './components/TemplatePanel';
import HistoryPanel from './components/HistoryPanel';
import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import useEditor from './hooks/useEditor';
import { GLM_MODELS } from '../../shared/types';
import type { GLMModel } from '../../shared/types';

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [showHistory, setShowHistory] = useState(false);
  const { state, uploadImage, setModel, submitEdit, restoreFromHistory, setReferenceImages } = useEditor();
  const [templatePrompt, setTemplatePrompt] = useState<string | undefined>(undefined);

  // Set axios default auth header when token changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

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
  };

  const handlePromptConsumed = () => {
    setTemplatePrompt(undefined);
  };

  const currentModelInfo = GLM_MODELS.find(m => m.id === state.selectedModel);
  const isChatModel = state.selectedModel === 'glm-4.6v';

  // Not logged in — show login page
  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile history toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="编辑历史"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <h1 className="text-lg lg:text-xl font-bold text-gray-900">GLM 图像编辑器</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Model selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 hidden sm:inline">模型：</label>
              <div className="relative">
                <select
                  value={state.selectedModel}
                  onChange={(e) => setModel(e.target.value as GLMModel)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none pr-8"
                >
                  {GLM_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {/* Dropdown arrow */}
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="退出登录"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
        {/* Model description bar */}
        {currentModelInfo && (
          <div className="max-w-7xl mx-auto mt-1">
            <p className="text-xs text-gray-400">{currentModelInfo.description}</p>
          </div>
        )}
      </header>

      {/* Mobile history drawer overlay */}
      {showHistory && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setShowHistory(false)}
        />
      )}

      {/* Mobile history drawer */}
      <div className={`
        lg:hidden fixed top-0 left-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-200
        ${showHistory ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">编辑历史</h2>
          <button
            onClick={() => setShowHistory(false)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          <HistoryPanel
            history={state.history}
            onRestore={restoreFromHistory}
            currentImage={state.currentImage}
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-4 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* History panel - desktop only */}
          <div className="hidden lg:block lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sticky top-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">编辑历史</h2>
              <HistoryPanel
                history={state.history}
                onRestore={restoreFromHistory}
                currentImage={state.currentImage}
              />
            </div>
          </div>

          {/* Left: Upload + Input */}
          <div className="lg:col-span-5 space-y-4">
            {/* 图像理解模型需要上传图片，文生图模型可选 */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">
                {isChatModel ? '上传图片（必填）' : '上传图片（可选，用于参考）'}
              </h2>
              <ImageUploader
                onImageUpload={uploadImage}
                currentImage={state.originalImage}
                label={isChatModel ? '点击或拖拽上传要分析的图片' : '点击或拖拽上传参考图（可选）'}
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">参考图</h2>
              <ReferenceImages
                images={state.referenceImages}
                onImagesChange={setReferenceImages}
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">
                {isChatModel ? '分析指令' : '生成指令'}
              </h2>
              <PromptInput
                onSubmit={submitEdit}
                isLoading={state.isLoading}
                externalPrompt={templatePrompt}
                onPromptConsumed={handlePromptConsumed}
                placeholder={isChatModel ? '输入分析指令，如：描述这张图片的内容...' : '输入生成指令，如：一只可爱的小猫咪...'}
              />
            </div>

            {state.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm text-red-600">{state.error}</p>
              </div>
            )}
          </div>

          {/* Right: Templates + Result */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">提示词模板</h2>
              <TemplatePanel onSelectTemplate={handleSelectTemplate} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-medium text-gray-700 mb-3">结果</h2>
              <ResultViewer
                originalImage={state.originalImage}
                resultImage={state.resultImage}
                resultImageUrl={state.resultImageUrl}
                resultText={state.resultText}
                resultMimeType={state.resultMimeType}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}
