import { useState, useRef, useCallback } from 'react';
import { downloadImage } from '../utils/image';

interface ResultViewerProps {
  originalImage?: string | null;
  resultImage?: string | null; // base64
  resultImageUrl?: string | null; // GLM URL
  resultText?: string | null; // 文本结果（glm-4.6v）
  resultMimeType?: string;
}

export default function ResultViewer({
  originalImage,
  resultImage,
  resultImageUrl,
  resultText,
  resultMimeType = 'image/png',
}: ResultViewerProps) {
  const [viewMode, setViewMode] = useState<'result' | 'original' | 'compare'>('result');
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const hasResult = !!(resultImage || resultImageUrl || resultText);
  const hasOriginal = !!originalImage;

  // 获取结果图片的 src
  const getResultSrc = (): string | null => {
    if (resultImage) {
      return `data:${resultMimeType};base64,${resultImage}`;
    }
    if (resultImageUrl) {
      return resultImageUrl;
    }
    return null;
  };

  const resultSrc = getResultSrc();
  const displaySrc = viewMode === 'original' ? (originalImage ? `data:image/png;base64,${originalImage}` : null) : resultSrc;

  const handleDownload = () => {
    if (resultImage) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadImage(resultImage, resultMimeType, `glm-edit-${timestamp}.png`);
    } else if (resultImageUrl) {
      // 如果是 URL，直接在新窗口打开
      window.open(resultImageUrl, '_blank');
    }
  };

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  // 无内容时的空状态
  if (!displaySrc && !resultText) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-gray-400 text-sm">输入指令开始生成</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {hasResult && (
          <>
            <button
              onClick={() => setViewMode('result')}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                viewMode === 'result' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {resultText ? 'AI 回复' : '生成结果'}
            </button>
            {hasOriginal && (
              <button
                onClick={() => setViewMode('original')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  viewMode === 'original' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                原图
              </button>
            )}
            {hasOriginal && resultSrc && (
              <button
                onClick={() => setViewMode('compare')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  viewMode === 'compare' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                对比
              </button>
            )}
          </>
        )}
        {hasResult && (resultImage || resultImageUrl) && (
          <button
            onClick={handleDownload}
            className="ml-auto px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            {resultImageUrl ? '查看原图' : '下载结果'}
          </button>
        )}
      </div>

      {/* Text result (glm-4.6v) */}
      {viewMode === 'result' && resultText && !resultSrc && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{resultText}</p>
          </div>
        </div>
      )}

      {/* Image Display */}
      {resultSrc && viewMode === 'compare' && hasOriginal ? (
        <div
          ref={containerRef}
          className="relative w-full bg-gray-50 rounded-xl border border-gray-200 overflow-hidden cursor-col-resize select-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
        >
          {/* Result image (full width, behind) */}
          <img
            src={resultSrc}
            alt="生成结果"
            className="w-full h-auto max-h-[600px] object-contain block"
            draggable={false}
          />

          {/* Original image (clipped) */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ width: `${sliderPosition}%` }}
          >
            <img
              src={`data:image/png;base64,${originalImage}`}
              alt="原图"
              className="w-full h-auto max-h-[600px] object-contain block"
              style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100%' }}
              draggable={false}
            />
          </div>

          {/* Slider line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
            style={{ left: `${sliderPosition}%` }}
          >
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center"
              onMouseDown={handleMouseDown}
              onTouchStart={handleMouseDown}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </div>
          </div>

          {/* Labels */}
          <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 text-white text-xs rounded">原图</div>
          <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">结果</div>
        </div>
      ) : displaySrc ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-2">
          <img
            src={displaySrc}
            alt={viewMode === 'result' ? '生成结果' : '原图'}
            className="w-full h-auto max-h-[600px] object-contain rounded-lg"
          />
        </div>
      ) : null}
    </div>
  );
}
