import { useState, useRef, useCallback, useEffect } from 'react';
import { downloadImage, validateImageFile, fileToBase64 } from '../utils/image';
import ImageUploader from './ImageUploader';
import {
  Eye,
  Image as ImageIcon,
  Columns,
  ArrowLeftRight,
  ZoomIn,
  Fullscreen,
  Minimize,
  Download,
  ExternalLink,
  Loader2,
  Upload,
  Copy,
} from 'lucide-react';

interface ResultViewerProps {
  originalImage?: string | null;
  originalMimeType?: string;
  resultImage?: string | null; // base64
  resultImageUrl?: string | null; // GLM URL
  resultText?: string | null; // 文本结果（glm-4.6v）
  resultMimeType?: string;
  isLoading?: boolean;
  onImageUpload?: (data: { base64: string; mimeType: string; file: File }) => void;
  lastCallMeta?: {
    providerName: string;
    providerType: string;
    model: string;
    operationType: string;
  } | null;
  lastPrompt?: string | null; // 最近一次生成的提示词，用于"复制提示词"功能
  /**
   * 受控视图模式（V2 顶栏对比入口使用）。
   * 若提供，则与 `onViewModeChange` 一起接管内部 viewMode；
   * 未提供时回退到内部 useState，保持 Legacy App.tsx 行为不变。
   */
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

type ViewMode = 'result' | 'original' | 'compare';
type CompareMode = 'slider' | 'split';
type ZoomMode = 'fit' | '1:1' | 'fullscreen';

export interface Size {
  width: number;
  height: number;
}

/**
 * Pure function: calculate the largest size that fits `source` inside
 * `container` while preserving aspect ratio (CSS object-contain equivalent).
 * When `allowUpscale` is false (default), the result is never larger than
 * the source's natural dimensions.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function calculateContainSize(
  source: Size,
  container: Size,
  allowUpscale = false,
): Size {
  if (
    source.width <= 0 ||
    source.height <= 0 ||
    container.width <= 0 ||
    container.height <= 0
  ) {
    return { width: 0, height: 0 };
  }

  const rawScale = Math.min(
    container.width / source.width,
    container.height / source.height,
  );

  const scale = allowUpscale ? rawScale : Math.min(1, rawScale);

  return {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  };
}

export default function ResultViewer({
  originalImage,
  originalMimeType = 'image/png',
  resultImage,
  resultImageUrl,
  resultText,
  resultMimeType = 'image/png',
  isLoading = false,
  onImageUpload,
  lastCallMeta,
  lastPrompt,
  viewMode: controlledViewMode,
  onViewModeChange,
}: ResultViewerProps) {
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('result');
  const isControlled = controlledViewMode !== undefined;
  const viewMode = isControlled ? controlledViewMode : internalViewMode;
  const setViewMode = (mode: ViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
    if (!isControlled) {
      setInternalViewMode(mode);
    }
  };
  const [compareMode, setCompareMode] = useState<CompareMode>('slider');
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragOver, setIsDragOver] = useState(false);
  const [imageMenu, setImageMenu] = useState<{ x: number; y: number } | null>(null);
  const [naturalImageSize, setNaturalImageSize] = useState<Size>({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const compareStageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragging = useRef(false);

  const hasResult = !!(resultImage || resultImageUrl || resultText);
  const hasOriginal = !!originalImage;

  const handleFileSelect = useCallback(async (file: File) => {
    if (!onImageUpload) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      return;
    }
    const base64 = await fileToBase64(file);
    onImageUpload({ base64, mimeType: file.type, file });
  }, [onImageUpload]);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  const getResultSrc = (): string | null => {
    if (resultImage) {
      return `data:${resultMimeType};base64,${resultImage}`;
    }
    if (resultImageUrl) {
      return resultImageUrl;
    }
    return null;
  };

  const getOriginalSrc = (): string | null => {
    if (originalImage) {
      return `data:${originalMimeType};base64,${originalImage}`;
    }
    return null;
  };

  const resultSrc = getResultSrc();
  const originalSrc = getOriginalSrc();
  const effectiveViewMode = !resultSrc && hasOriginal ? 'original' : viewMode;
  const displaySrc = effectiveViewMode === 'original' ? originalSrc : resultSrc;

  // Sync fullscreen state with browser events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setZoomMode(document.fullscreenElement ? 'fullscreen' : 'fit');
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Track canvas container size via ResizeObserver for explicit contain stage sizing
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setContainerSize({ width: cr.width, height: cr.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleOriginalImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNaturalImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      }
    },
    [],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && wrapperRef.current) {
        await wrapperRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen errors
    }
  }, []);

  const handleDownload = () => {
    if (resultImage) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadImage(resultImage, resultMimeType, `glm-edit-${timestamp}.png`);
    } else if (resultImageUrl) {
      window.open(resultImageUrl, '_blank');
    }
  };

  const handleOpenInNewTab = () => {
    if (displaySrc) {
      window.open(displaySrc, '_blank');
    }
  };

  const handleCopyPrompt = async () => {
    if (lastPrompt) {
      try {
        await navigator.clipboard.writeText(lastPrompt);
      } catch {
        // Ignore clipboard errors
      }
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    // 仅在结果模式（非对比模式）下点击图片触发浮层菜单
    if (effectiveViewMode !== 'result') return;
    e.stopPropagation();
    // 将视口坐标换算为相对画布容器的坐标，以便 absolute 定位浮层
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;
    setImageMenu({ x, y });
  };

  // 点击浮层外部或按 ESC 关闭浮层
  useEffect(() => {
    if (!imageMenu) return;
    const handleClickOutside = () => {
      setImageMenu(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setImageMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [imageMenu]);

  const handleMenuClick = (action: () => void) => {
    setImageMenu(null);
    action();
  };

  const handleOpenOriginal = () => {
    if (originalSrc) {
      window.open(originalSrc, '_blank');
    }
  };

  const updateSlider = useCallback((clientX: number) => {
    if (!compareStageRef.current) return;
    const rect = compareStageRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateSlider(e.clientX);
  }, [updateSlider]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    updateSlider(e.clientX);
  }, [updateSlider]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore release errors
    }
  }, []);

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleSliderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSliderPosition((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSliderPosition((prev) => Math.min(100, prev + 1));
    }
  }, []);

  const imgContainerClasses = (() => {
    if (zoomMode === '1:1') {
      return 'block w-auto h-auto max-w-none max-h-none object-contain';
    }
    return 'block w-auto h-auto max-w-full max-h-full object-contain';
  })();

  // 无内容时的空状态标志
  const isEmptyState = !displaySrc && !resultText && !isLoading;

  // RF-01: Explicit contain-size calculation for the compare stage.
  // The stage uses the original image's natural dimensions and the canvas
  // container's observed size to compute the exact contain box. This ensures
  // the slider's 0%–100% range maps precisely to the visible image area,
  // not to surrounding whitespace.
  const stageSize = calculateContainSize(naturalImageSize, containerSize);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full min-h-0 flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-nowrap overflow-x-auto">
        {(hasResult || hasOriginal) && (
          <>
            {hasResult && (
              <button
                onClick={() => setViewMode('result')}
                title="生成结果"
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                  effectiveViewMode === 'result'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {resultText ? 'AI 回复' : '结果'}
              </button>
            )}
            {hasOriginal && (
              <button
                onClick={() => setViewMode('original')}
                title="原图"
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                  effectiveViewMode === 'original'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                原图
              </button>
            )}
            {hasOriginal && resultSrc && (
              <button
                onClick={() => setViewMode('compare')}
                title="对比"
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                  effectiveViewMode === 'compare'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                对比
              </button>
            )}
          </>
        )}

        {effectiveViewMode === 'compare' && hasOriginal && resultSrc && (
          <div className="flex items-center gap-1 ml-1 flex-shrink-0">
            <button
              onClick={() => setCompareMode('slider')}
              title="滑块对比"
              className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                compareMode === 'slider'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCompareMode('split')}
              title="分屏对比"
              className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                compareMode === 'split'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          {onImageUpload && (
            <button
              onClick={handleUploadClick}
              title="上传/替换图片"
              className="flex-shrink-0 p-1.5 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setZoomMode(zoomMode === '1:1' ? 'fit' : '1:1')}
            title={zoomMode === '1:1' ? '适应屏幕' : '1:1 缩放'}
            className={`flex-shrink-0 p-1.5 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 ${
              zoomMode === '1:1' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            title="全屏"
            className={`flex-shrink-0 p-1.5 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 ${
              zoomMode === 'fullscreen' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            {zoomMode === 'fullscreen' ? <Minimize className="w-3.5 h-3.5" /> : <Fullscreen className="w-3.5 h-3.5" />}
          </button>
          {hasOriginal && (
            <button
              onClick={handleOpenOriginal}
              title="在新标签页打开原图"
              className="flex-shrink-0 p-1.5 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {hasResult && (resultImage || resultImageUrl) && (
            <button
              onClick={handleDownload}
              title={resultImageUrl ? '查看原图' : '下载结果'}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{resultImageUrl ? '查看原图' : '下载结果'}</span>
            </button>
          )}
          {lastCallMeta && (
            <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 hidden lg:inline">
              via {lastCallMeta.providerName} · {lastCallMeta.model} · {lastCallMeta.operationType}
            </span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`flex-1 min-h-0 relative overflow-hidden bg-gray-100 dark:bg-black ${onImageUpload ? 'cursor-default' : ''}`}
        onDrop={onImageUpload ? handleCanvasDrop : undefined}
        onDragOver={onImageUpload ? handleCanvasDragOver : undefined}
        onDragLeave={onImageUpload ? handleCanvasDragLeave : undefined}
      >
        {isDragOver && onImageUpload && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-500/20 border-4 border-dashed border-blue-500 pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-xl px-6 py-4 shadow-xl text-center">
              <Upload className="w-10 h-10 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">拖放图片到此处上传</p>
            </div>
          </div>
        )}

        {effectiveViewMode === 'result' && resultText && !resultSrc && (
          <div className="absolute inset-0 overflow-auto p-6">
            <div className="max-w-3xl mx-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{resultText}</p>
            </div>
          </div>
        )}

        {resultSrc && effectiveViewMode === 'compare' && hasOriginal ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden select-none">
            {compareMode === 'slider' ? (
              <div
                ref={compareStageRef}
                data-testid="compare-stage"
                className="relative"
                style={{
                  width: stageSize.width > 0 ? `${stageSize.width}px` : undefined,
                  height: stageSize.height > 0 ? `${stageSize.height}px` : undefined,
                  touchAction: 'none',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onLostPointerCapture={handlePointerCancel}
              >
                {/* Result overlay: fills the stage, contained */}
                <img
                  src={resultSrc}
                  alt="生成结果"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
                {/* Original overlay: clipped by slider position */}
                <img
                  src={originalSrc || undefined}
                  alt="原图"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                  draggable={false}
                  onLoad={handleOriginalImageLoad}
                />
                {/* Slider line + handle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-col-resize pointer-events-none"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div
                    role="slider"
                    aria-label="对比滑块位置"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(sliderPosition)}
                    tabIndex={0}
                    onKeyDown={handleSliderKeyDown}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center pointer-events-auto cursor-col-resize focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
                <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 text-white text-xs rounded pointer-events-none">原图</div>
                <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 text-white text-xs rounded pointer-events-none">结果</div>
              </div>
            ) : (
              <div className="w-full h-full flex">
                <div className="flex-1 h-full flex items-center justify-center overflow-hidden border-r border-white/20">
                  <img
                    src={originalSrc || undefined}
                    alt="原图"
                    className="block max-w-full max-h-full object-contain"
                    draggable={false}
                  />
                  <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 text-white text-xs rounded">原图</div>
                </div>
                <div className="flex-1 h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={resultSrc}
                    alt="生成结果"
                    className="block max-w-full max-h-full object-contain"
                    draggable={false}
                  />
                  <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 text-white text-xs rounded">结果</div>
                </div>
              </div>
            )}
          </div>
        ) : displaySrc ? (
          <div
            className={`absolute inset-0 flex items-center justify-center ${
              zoomMode === '1:1' ? 'overflow-auto' : 'overflow-hidden'
            }`}
          >
            <img
              src={displaySrc || undefined}
              alt={effectiveViewMode === 'result' ? '生成结果' : '原图'}
              className={`${imgContainerClasses} ${
                effectiveViewMode === 'result' ? 'cursor-pointer' : ''
              }`}
              draggable={false}
              onClick={effectiveViewMode === 'result' ? handleImageClick : undefined}
            />
          </div>
        ) : isEmptyState ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-md">
              {onImageUpload ? (
                <ImageUploader
                  onImageUpload={onImageUpload}
                  currentImage={null}
                  label="拖放图片到画布或点击上传"
                />
              ) : (
                <div className="text-center text-gray-400 text-sm">画布为空</div>
              )}
            </div>
          </div>
        ) : null}

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-10">
            <Loader2 className="w-10 h-10 text-white animate-spin mb-4" />
            <div className="w-48 h-1.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full animate-pulse" style={{ width: '40%' }} />
            </div>
            <p className="mt-3 text-sm text-white">处理中，请稍候…</p>
          </div>
        )}

        {/* 图片点击交互菜单 */}
        {imageMenu && (
          <div
            className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
            style={{ top: imageMenu.y, left: imageMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
              onClick={() => handleMenuClick(toggleFullscreen)}
            >
              <Fullscreen className="w-4 h-4" />
              查看大图
            </div>
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
              onClick={() => handleMenuClick(handleDownload)}
            >
              <Download className="w-4 h-4" />
              下载
            </div>
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
              onClick={() => handleMenuClick(handleOpenInNewTab)}
            >
              <ExternalLink className="w-4 h-4" />
              在新标签页打开
            </div>
            {lastPrompt && (
              <div
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
                onClick={() => handleMenuClick(handleCopyPrompt)}
              >
                <Copy className="w-4 h-4" />
                复制提示词
              </div>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
