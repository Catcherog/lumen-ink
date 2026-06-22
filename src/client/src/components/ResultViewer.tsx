import { useState, useRef, useCallback, useEffect } from 'react';
import { downloadImage } from '../utils/image';
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
}

type ViewMode = 'result' | 'original' | 'compare';
type CompareMode = 'slider' | 'split';
type ZoomMode = 'fit' | '1:1' | 'fullscreen';

export default function ResultViewer({
  originalImage,
  originalMimeType = 'image/png',
  resultImage,
  resultImageUrl,
  resultText,
  resultMimeType = 'image/png',
  isLoading = false,
  onImageUpload,
}: ResultViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('result');
  const [compareMode, setCompareMode] = useState<CompareMode>('slider');
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [sliderPosition, setSliderPosition] = useState(50);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const hasResult = !!(resultImage || resultImageUrl || resultText);
  const hasOriginal = !!originalImage;

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
  const displaySrc = viewMode === 'original' ? originalSrc : resultSrc;

  // Sync fullscreen state with browser events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setZoomMode(document.fullscreenElement ? 'fullscreen' : 'fit');
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  const handleOpenOriginal = () => {
    if (originalSrc) {
      window.open(originalSrc, '_blank');
    }
  };

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const updateSlider = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    updateSlider(e.clientX);
  }, [updateSlider]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    updateSlider(e.touches[0].clientX);
  }, [updateSlider]);

  const imgContainerClasses = (() => {
    if (zoomMode === '1:1') {
      return 'w-auto h-auto max-w-none max-h-none object-contain';
    }
    return 'w-full h-full max-w-full max-h-full object-contain';
  })();

  // 无内容时的空状态
  if (!displaySrc && !resultText && !isLoading) {
    return (
      <div className="w-full h-full flex flex-col bg-white dark:bg-gray-900">
        <div className="flex-1 flex flex-col items-center justify-center p-8">
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
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-wrap">
        {hasResult && (
          <>
            <button
              onClick={() => setViewMode('result')}
              title="生成结果"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                viewMode === 'result'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {resultText ? 'AI 回复' : '结果'}
            </button>
            {hasOriginal && (
              <button
                onClick={() => setViewMode('original')}
                title="原图"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                  viewMode === 'original'
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
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                  viewMode === 'compare'
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

        {viewMode === 'compare' && hasOriginal && resultSrc && (
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={() => setCompareMode('slider')}
              title="滑块对比"
              className={`p-1.5 rounded-md transition-colors ${
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
              className={`p-1.5 rounded-md transition-colors ${
                compareMode === 'split'
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setZoomMode(zoomMode === '1:1' ? 'fit' : '1:1')}
            title={zoomMode === '1:1' ? '适应屏幕' : '1:1 缩放'}
            className={`p-1.5 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 ${
              zoomMode === '1:1' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            title="全屏"
            className={`p-1.5 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 ${
              zoomMode === 'fullscreen' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : ''
            }`}
          >
            {zoomMode === 'fullscreen' ? <Minimize className="w-3.5 h-3.5" /> : <Fullscreen className="w-3.5 h-3.5" />}
          </button>
          {hasOriginal && (
            <button
              onClick={handleOpenOriginal}
              title="在新标签页打开原图"
              className="p-1.5 rounded-md transition-colors text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {hasResult && (resultImage || resultImageUrl) && (
            <button
              onClick={handleDownload}
              title={resultImageUrl ? '查看原图' : '下载结果'}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{resultImageUrl ? '查看原图' : '下载结果'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden bg-gray-100 dark:bg-black">
        {viewMode === 'result' && resultText && !resultSrc && (
          <div className="absolute inset-0 overflow-auto p-6">
            <div className="max-w-3xl mx-auto bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{resultText}</p>
            </div>
          </div>
        )}

        {resultSrc && viewMode === 'compare' && hasOriginal ? (
          <div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
          >
            {compareMode === 'slider' ? (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <img
                  src={resultSrc}
                  alt="生成结果"
                  className="absolute inset-0 m-auto max-w-full max-h-full object-contain"
                  draggable={false}
                />
                <img
                  src={originalSrc || undefined}
                  alt="原图"
                  className="absolute inset-0 m-auto max-w-full max-h-full object-contain"
                  style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                  draggable={false}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-col-resize"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                  >
                    <ArrowLeftRight className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
                <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 text-white text-xs rounded">原图</div>
                <div className="absolute top-3 right-3 px-2 py-1 bg-black/50 text-white text-xs rounded">结果</div>
              </div>
            ) : (
              <div className="w-full h-full flex">
                <div className="flex-1 h-full flex items-center justify-center overflow-hidden border-r border-white/20">
                  <img
                    src={originalSrc || undefined}
                    alt="原图"
                    className="max-w-full max-h-full object-contain"
                    draggable={false}
                  />
                  <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 text-white text-xs rounded">原图</div>
                </div>
                <div className="flex-1 h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={resultSrc}
                    alt="生成结果"
                    className="max-w-full max-h-full object-contain"
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
              alt={viewMode === 'result' ? '生成结果' : '原图'}
              className={imgContainerClasses}
              draggable={false}
            />
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
      </div>
    </div>
  );
}
