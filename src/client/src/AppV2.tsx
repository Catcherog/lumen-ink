import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import LoginPage from './components/LoginPage';
import ErrorBoundary from './components/ErrorBoundary';
import ResultViewer from './components/ResultViewer';
import ApiSettingsModal from './components/ApiSettingsModal';
import EphemeralProviderSettings from './components/EphemeralProviderSettings';
import EditorHeader from './components/v2/EditorHeader';
import TaskRail from './components/v2/TaskRail';
import ContextPanel from './components/v2/ContextPanel';
import VersionStrip from './components/v2/VersionStrip';
import JobStatusPanel from './components/v2/JobStatusPanel';
import LegacyHistoryImport from './components/v2/LegacyHistoryImport';
import useEditor from './hooks/useEditor';
import { useProject } from './hooks/useProject';
import { serializeError } from './utils/error';
import { exportCurrentResult, localExportErrorMessage } from './features/editor-ux/localExport';
import { defaultRecipeBook, compilePrompt } from './utils/recipe';
import { createProject } from './api/projects';
import type { ProviderConfig, V2TaskId, EditRecipe } from '../../shared/types';
import type { EphemeralProviderConfig } from '../../shared/types';
import type { UploadFn, ImportResult } from './utils/legacyHistory';
import {
  DEFAULT_EPHEMERAL_PROVIDER,
  isEphemeralDemo,
  toEphemeralProviderView,
  type ClientRuntimeConfig,
} from './runtime';

type ViewMode = 'result' | 'original' | 'compare';

function stripExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

export default function AppV2({ runtimeConfig }: { runtimeConfig?: ClientRuntimeConfig }) {
  const ephemeralDemo = isEphemeralDemo(runtimeConfig);
  const [token, setToken] = useState<string | null>(() => (
    ephemeralDemo ? null : localStorage.getItem('auth_token')
  ));
  const [darkMode, setDarkMode] = useState(false);
  const [ephemeralProvider, setEphemeralProvider] = useState<EphemeralProviderConfig>(DEFAULT_EPHEMERAL_PROVIDER);
  const [providers, setProviders] = useState<ProviderConfig[]>(() => (
    ephemeralDemo ? [toEphemeralProviderView(DEFAULT_EPHEMERAL_PROVIDER)] : []
  ));
  const [projectName, setProjectName] = useState('未命名项目');
  const [viewMode, setViewMode] = useState<ViewMode>('result');

  // FLOW-001: activeTask + recipeBook 提升到 AppV2 顶层
  // - 切换任务标签互不影响（每个任务独立 Recipe）
  // - CTA 触发时统一 compilePrompt → submitEdit 闭环
  const [activeTask, setActiveTask] = useState<V2TaskId>('project');
  const [recipeBook, setRecipeBook] = useState<Record<V2TaskId, EditRecipe>>(() => defaultRecipeBook());

  // PERSIST-001: server-backed Project/Version/Job state.
  // - useProject is the long-term truth; useEditor's viewer state is derived
  //   from snapshot + viewedVersionId when a Project is loaded.
  // - viewedVersionId: when null, the viewer shows the active Version's URL.
  const [viewedVersionId, setViewedVersionId] = useState<string | null>(null);
  const project = useProject();

  // PERSIST-001 Task 10: legacy history explicit-import modal. The modal
  // is opened from EditorHeader ("导入旧历史") when localStorage contains
  // legacy `edit_history` entries. The upload callback wraps the V2
  // createProject API so each recovered base64 becomes a new Project.
  const [legacyImportOpen, setLegacyImportOpen] = useState(false);
  const legacyUpload = useCallback<UploadFn>(async (entry) => {
    // Convert the recovered base64 back to a File so the V2 createProject
    // API accepts it as a normal image upload.
    const byteString = atob(entry.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const file = new File([bytes], `legacy-${entry.id}.png`, { type: entry.mimeType });
    await createProject(file, entry.prompt || `导入 ${new Date(entry.timestamp).toLocaleString()}`);
  }, []);

  const currentRecipe = recipeBook[activeTask];
  const compiled = useMemo(() => compilePrompt(currentRecipe), [currentRecipe]);

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
    setReferenceImages,
  } = useEditor({
    persistHistory: !ephemeralDemo,
    ephemeralProvider: ephemeralDemo ? ephemeralProvider : undefined,
  });

  const visibleProviders = useMemo(
    () => (ephemeralDemo ? [toEphemeralProviderView(ephemeralProvider)] : providers),
    [ephemeralDemo, ephemeralProvider, providers],
  );

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
    if (ephemeralDemo || !token) return;
    try {
      const res = await axios.get('/api/providers');
      const list = Array.isArray(res.data) ? res.data : [];
      setProviders(list);
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: serializeError(err) || '加载 Provider 列表失败' });
    }
  }, [ephemeralDemo, token, dispatch]);

  useEffect(() => {
    if (ephemeralDemo || !token) return;
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
  }, [ephemeralDemo, token, dispatch]);

  const prevShowApiSettings = useRef(state.showApiSettings);
  useEffect(() => {
    if (prevShowApiSettings.current && !state.showApiSettings) {
      loadProviders();
    }
    prevShowApiSettings.current = state.showApiSettings;
  }, [state.showApiSettings, loadProviders]);

  useEffect(() => {
    if (!ephemeralDemo) return;
    if (state.selectedProvider !== 'ephemeral-byo') {
      setProvider('ephemeral-byo');
    }
    if (state.selectedModel !== ephemeralProvider.defaultModel) {
      setModel(ephemeralProvider.defaultModel);
    }
  }, [ephemeralDemo, ephemeralProvider, state.selectedModel, state.selectedProvider, setModel, setProvider]);

  // Auto-select default/first enabled provider when list or selection changes
  const prevDefaultRef = useRef<string | null>(null);
  useEffect(() => {
    const enabledProviders = visibleProviders.filter((p) => p.enabled);
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
  }, [visibleProviders, state.selectedProvider, setProvider]);

  // Auto-set model only when provider actually switches
  const prevProviderRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state.selectedProvider) return;
    if (prevProviderRef.current !== state.selectedProvider) {
      prevProviderRef.current = state.selectedProvider;
      const provider = visibleProviders.find((p) => p.id === state.selectedProvider);
      if (provider) {
        setModel(provider.defaultModel);
      }
    }
  }, [state.selectedProvider, visibleProviders, setModel]);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
  };

  const handleImageUpload = useCallback(async (data: { base64: string; mimeType: string; file: File }) => {
    const accepted = uploadImage(data);
    if (!accepted) return;
    setProjectName(stripExtension(data.file.name) || '未命名项目');
    setViewedVersionId(null);
    if (ephemeralDemo) return;
    // PERSIST-001: upload to server FIRST so the Project + V0 are durably
    // stored. The viewer continues to use the base64 from the file picker
    // for instant display (no fetch round-trip).
    try {
      await project.upload(data.file, stripExtension(data.file.name) || '未命名项目');
    } catch (err) {
      // Server upload failed; surface the error but keep the local viewer
      // state so the user can retry. The error is already in project.error.
      dispatch({ type: 'SET_ERROR', payload: serializeError(err) || '项目上传失败' });
    }
  }, [ephemeralDemo, uploadImage, project, dispatch]);

  // FLOW-001: Recipe 变更写回 recipeBook[activeTask]
  const handleRecipeChange = useCallback((next: EditRecipe) => {
    setRecipeBook((prev) => ({ ...prev, [activeTask]: next }));
  }, [activeTask]);

  // FLOW-001 + PERSIST-001: 单一 CTA → compilePrompt → V2 Job creation (or legacy submitEdit)
  // - 当 useProject.snapshot 存在（V2 模式）：通过 /api/projects/:id/jobs 创建 Job，
  //   轮询成功后 snapshot 自动刷新，viewer 切换到新 Version 的 signed URL。
  // - 当 snapshot 不存在（legacy 模式）：回退到 /api/edit 同步路径。
  // - P0-01 防御仅在 legacy 路径生效；V2 路径由服务端从 ObjectStore 取 bytes，
  //   不依赖请求体中的 base64，天然避免旧 base64 问题。
  // - P0-02：显式传递 referenceImages，保证编译 Prompt、Recipe 计数与请求 payload 一致
  const handleGeneratePreview = useCallback(() => {
    if (currentRecipe.taskId === 'export') {
      const imageData = state.resultImage || state.currentImage;
      const imageUrl = state.resultImageUrl || state.currentImageUrl;
      const sourceMimeType = state.resultImage || state.resultImageUrl
        ? state.resultMimeType
        : state.currentMimeType;
      void exportCurrentResult({
        imageData,
        imageUrl,
        sourceMimeType,
        format: currentRecipe.auxiliary.outputFormat,
        quality: currentRecipe.auxiliary.outputQuality,
      }).catch((error) => {
        dispatch({ type: 'SET_ERROR', payload: localExportErrorMessage(error) });
      });
      return;
    }

    const result = compilePrompt(currentRecipe);

    // V2 path: server-backed Project exists. Ephemeral-demo never reaches
    // project/job endpoints; it uses the request-scoped synchronous route.
    if (!ephemeralDemo && project.snapshot) {
      const idempotencyKey = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      void project.generate({
        prompt: result.prompt,
        idempotencyKey,
        inputVersionId: project.activeVersion?.id,
        providerId: state.selectedProvider || undefined,
        model: state.selectedModel,
        recipe: currentRecipe,
      });
      return;
    }

    // Legacy path: no server Project, fall back to synchronous /api/edit
    // P0-01 防御性检查：可提交判定已在 ContextPanel 完成，此处再校验避免任何路径绕过
    if (!state.currentImage) {
      dispatch({ type: 'SET_ERROR', payload: '当前结果为 URL，无法继续编辑，请下载后重新上传' });
      return;
    }
    submitEdit(result.prompt, {
      tool: currentRecipe.tool ?? undefined,
      params: { recipe: currentRecipe, compiledVersion: result.version },
      regions: currentRecipe.auxiliary.regions.length > 0
        ? currentRecipe.auxiliary.regions
        : undefined,
      referenceImages: state.referenceImages.length > 0
        ? state.referenceImages
        : undefined,
    });
  }, [currentRecipe, ephemeralDemo, submitEdit, state.currentImage, state.currentImageUrl, state.currentMimeType, state.resultImage, state.resultImageUrl, state.resultMimeType, state.referenceImages, state.selectedProvider, state.selectedModel, dispatch, project]);

  // PERSIST-001: Viewer sync — when a V2 Job succeeds, the snapshot refreshes
  // with a new activeVersion. We auto-switch the viewer to the new Version's
  // signed URL and reset viewedVersionId so the user sees the latest result.
  // Tracks the last synced resultVersionId to avoid re-dispatching on every render.
  const lastSyncedResultIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (ephemeralDemo) return;
    const job = project.activeJob;
    const snapshot = project.snapshot;
    if (!job || !snapshot) return;
    if (job.status !== 'succeeded' || !job.resultVersionId) return;
    if (lastSyncedResultIdRef.current === job.resultVersionId) return;

    const version = snapshot.versions.find((v) => v.id === job.resultVersionId);
    if (!version) return; // snapshot not yet refreshed
    const asset = snapshot.assets.find((a) => a.id === version.assetId);
    if (!asset) return;
    const signedUrl = snapshot.signedUrls[asset.storageKey];
    if (!signedUrl) return;

    lastSyncedResultIdRef.current = job.resultVersionId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: auto-switch viewer to the newly-succeeded Version
    setViewedVersionId(job.resultVersionId);
    dispatch({
      type: 'SET_RESULT',
      payload: {
        imageUrl: signedUrl,
        mimeType: asset.mimeType,
        history: state.history, // preserve legacy history
      },
    });
  }, [ephemeralDemo, project.activeJob, project.snapshot, dispatch, state.history]);

  // PERSIST-001: When the user clicks a Version chip, switch the viewer to
  // that Version's signed URL without dispatching SET_RESULT (which would
  // append to history). Use SET_CURRENT_IMAGE so the next edit cycle uses
  // the viewed Version as input.
  const handleViewVersion = useCallback((versionId: string) => {
    setViewedVersionId(versionId);
    const snapshot = project.snapshot;
    if (!snapshot) return;
    const version = snapshot.versions.find((v) => v.id === versionId);
    if (!version) return;
    const asset = snapshot.assets.find((a) => a.id === version.assetId);
    if (!asset) return;
    const signedUrl = snapshot.signedUrls[asset.storageKey];
    if (!signedUrl) return;
    dispatch({
      type: 'SET_CURRENT_IMAGE',
      payload: { imageUrl: signedUrl, mimeType: asset.mimeType },
    });
  }, [project.snapshot, dispatch]);

  const handleActivateVersion = useCallback(async (versionId: string) => {
    await project.activate(versionId);
    setViewedVersionId(versionId);
  }, [project]);

  const handleApproveVersion = useCallback(async (versionId: string) => {
    await project.approve(versionId);
  }, [project]);

  const handleCancelJob = useCallback(async (jobId: string) => {
    void jobId; // jobId accepted for API symmetry; cancel uses activeJob internally
    await project.cancel();
  }, [project]);

  const handleRetryJob = useCallback(async (jobId: string) => {
    void jobId; // jobId accepted for API symmetry; retry uses activeJob internally
    await project.retry();
  }, [project]);

  // Surface useProject errors alongside useEditor errors
  const displayError = state.error || (project.error ? project.error.message : null);

  const handleClearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
    project.clearError();
  }, [dispatch, project]);

  // 顶栏对比/导出：连接 ResultViewer 的真实能力（受控 viewMode + downloadImage 工具）
  // canExport 必须与 handleExport 支持的结果类型完全一致（仅 base64 / URL），
  // 纯文本结果（response.data.text）不接入导出 handler，因此不计入 canExport。
  const hasOriginal = !!state.originalImage;
  const canCompare = hasOriginal && !!(state.resultImage || state.resultImageUrl);
  const canExport = !!(state.resultImage || state.resultImageUrl || state.currentImage || state.currentImageUrl);

  const handleCompare = useCallback(() => {
    if (!canCompare) return;
    setViewMode('compare');
  }, [canCompare]);

  const handleExport = useCallback(async () => {
    if (!canExport) return;
    const exportRecipe = recipeBook.export;
    const imageData = state.resultImage || state.currentImage;
    const imageUrl = state.resultImageUrl || state.currentImageUrl;
    const sourceMimeType = state.resultImage || state.resultImageUrl
      ? state.resultMimeType
      : state.currentMimeType;
    try {
      await exportCurrentResult({
        imageData,
        imageUrl,
        sourceMimeType,
        format: exportRecipe.auxiliary.outputFormat,
        quality: exportRecipe.auxiliary.outputQuality,
      });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: localExportErrorMessage(error) });
    }
  }, [canExport, recipeBook.export, state.resultImage, state.resultImageUrl, state.resultMimeType, state.currentImage, state.currentImageUrl, state.currentMimeType, dispatch]);

  if (!ephemeralDemo && !token) {
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
            onLogout={ephemeralDemo ? undefined : handleLogout}
            onSettings={() => setShowApiSettings(true)}
            onImportLegacy={ephemeralDemo ? undefined : () => setLegacyImportOpen(true)}
            onCompare={handleCompare}
            onExport={handleExport}
            canCompare={canCompare}
            canExport={canExport}
          />

          {ephemeralDemo && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
              临时展示模式：不登录、不保存项目或历史。请先在设置中输入自己的 Provider Key，结果可手动下载。
            </div>
          )}

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <TaskRail
              activeTask={activeTask}
              onSelectTask={setActiveTask}
            />

            <main className="flex-1 min-w-0 min-h-0 relative flex flex-col bg-white dark:bg-gray-900">
              {displayError && (
                <div
                  role="alert"
                  className="flex-shrink-0 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-red-600 dark:text-red-300 break-words flex-1 min-w-0">
                      {typeof displayError === 'string' ? displayError : serializeError(displayError)}
                    </p>
                    <button
                      type="button"
                      onClick={handleClearError}
                      aria-label="关闭错误提示"
                      className="flex-shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-200 text-lg leading-none mt-0.5"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

              {/* PERSIST-001: Job status overlay — shown when a V2 Job is active */}
              {!ephemeralDemo && (
                <JobStatusPanel
                  job={project.activeJob}
                  onCancel={handleCancelJob}
                  onRetry={handleRetryJob}
                />
              )}

              <ResultViewer
                originalImage={state.originalImage}
                originalMimeType={state.originalMimeType}
                resultImage={state.resultImage}
                resultImageUrl={state.resultImageUrl}
                resultText={state.resultText}
                resultMimeType={state.resultMimeType}
                isLoading={state.isLoading || project.isLoading}
                onImageUpload={handleImageUpload}
                lastCallMeta={state.lastCallMeta}
                lastPrompt={state.history.length > 0 ? state.history[state.history.length - 1].prompt : null}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            </main>

            <ContextPanel
              recipe={currentRecipe}
              onRecipeChange={handleRecipeChange}
              compiled={compiled}
              state={state}
              onSubmit={handleGeneratePreview}
              referenceImages={state.referenceImages}
              onReferenceImagesChange={setReferenceImages}
              onRestoreHistory={ephemeralDemo ? undefined : restoreFromHistory}
              onViewHistory={ephemeralDemo ? undefined : viewHistory}
              onDeleteHistory={ephemeralDemo ? undefined : deleteHistory}
            />
          </div>

          {/* PERSIST-001: Server-backed Version strip — replaces placeholder */}
          {!ephemeralDemo && (
            <VersionStrip
              snapshot={project.snapshot}
              viewedVersionId={viewedVersionId}
              onViewVersion={handleViewVersion}
              onActivate={handleActivateVersion}
              onApprove={handleApproveVersion}
            />
          )}
        </div>
      </ErrorBoundary>

      {ephemeralDemo ? (
        <EphemeralProviderSettings
          isOpen={state.showApiSettings}
          value={ephemeralProvider}
          onChange={setEphemeralProvider}
          onClose={() => setShowApiSettings(false)}
        />
      ) : (
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
      )}

      {!ephemeralDemo && legacyImportOpen && (
        <LegacyHistoryImport
          upload={legacyUpload}
          onImported={(result: ImportResult) => {
            // The modal displays its own result summary; we only surface
            // a soft error if any imports failed so the user knows to
            // retry. Newly-imported Projects are not auto-loaded here —
            // a future ROUTING task will add a projects-list view.
            if (result.failed > 0) {
              dispatch({
                type: 'SET_ERROR',
                payload: `${result.failed} 条记录导入失败，已保留在 edit_history 中，可重试`,
              });
            }
          }}
          onClose={() => setLegacyImportOpen(false)}
        />
      )}
    </div>
  );
}
