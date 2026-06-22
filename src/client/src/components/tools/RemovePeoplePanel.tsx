import { useState, useMemo } from 'react';
import axios from 'axios';
import type { ToolPanelProps } from './types';
import type { Region } from '../../../../shared/types';
import CanvasRegionSelector from './CanvasRegionSelector';
import { Eraser, Check, ScanSearch, AlertCircle } from 'lucide-react';

type Mode = 'auto' | 'manual';

interface DetectResponse {
  success: boolean;
  regions: Region[];
  error?: string;
}

export default function RemovePeoplePanel({ state, onSubmit }: ToolPanelProps) {
  const [mode, setMode] = useState<Mode>('auto');
  const [manualRegions, setManualRegions] = useState<Region[]>([]);
  const [detectedRegions, setDetectedRegions] = useState<Region[]>([]);
  const [selectedDetectedIds, setSelectedDetectedIds] = useState<Set<number>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const imageSrc = useMemo(() => {
    if (!state.currentImage) return undefined;
    return `data:${state.currentMimeType};base64,${state.currentImage}`;
  }, [state.currentImage, state.currentMimeType]);

  const activeRegions = useMemo(() => {
    if (mode === 'manual') return manualRegions;
    return detectedRegions.filter((_, i) => selectedDetectedIds.has(i));
  }, [mode, manualRegions, detectedRegions, selectedDetectedIds]);

  const buildPrompt = (): string => {
    const regionDesc =
      activeRegions.length > 0
        ? `（共 ${activeRegions.length} 个区域）`
        : '';
    const modify =
      mode === 'manual' && activeRegions.length > 0
        ? `【修改】去除已框选区域内的指定人物${regionDesc}${description.trim() ? `（${description.trim()}）` : ''}，并用周围环境自然填充。`
        : mode === 'auto' && activeRegions.length > 0
          ? `【修改】自动识别并去除以下候选区域内的路人${regionDesc}${description.trim() ? `（${description.trim()}）` : ''}，并用周围环境自然填充。`
          : '【修改】自动识别并去除画面中的路人，用周围环境自然填充。';

    return [
      '【保留】保留其他人物主体、建筑、背景构图与整体光影不变。',
      modify,
      '【风格】自然填充，与被去除区域周围环境无缝衔接。',
      '【限制】不要改变保留的人物和背景结构，不要留下拼接痕迹，不要扭曲透视。',
    ].join('\n');
  };

  const handleDetect = async () => {
    if (!state.currentImage) {
      setDetectError('请先上传图片');
      return;
    }

    setIsDetecting(true);
    setDetectError(null);

    try {
      const { data } = await axios.post<DetectResponse>('/api/detect/people', {
        image: state.currentImage,
        mimeType: state.currentMimeType,
      });

      if (data.success) {
        setDetectedRegions(data.regions);
        setSelectedDetectedIds(new Set(data.regions.map((_, i) => i)));
      } else {
        setDetectError(data.error || '路人识别失败');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络错误';
      setDetectError(message);
    } finally {
      setIsDetecting(false);
    }
  };

  const toggleDetectedRegion = (index: number) => {
    setSelectedDetectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleApply = () => {
    const prompt = buildPrompt();
    onSubmit(prompt, {
      tool: 'remove',
      params: { mode, description: description.trim() },
      regions: activeRegions,
    });
  };

  const canApply =
    !state.isLoading &&
    (mode === 'auto' || (mode === 'manual' && manualRegions.length > 0));

  const switchMode = (next: Mode) => {
    setMode(next);
    setDetectError(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Eraser className="w-4 h-4 text-emerald-500" />
        路人去除
      </div>

      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => switchMode('auto')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            mode === 'auto'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          自动识别路人
        </button>
        <button
          onClick={() => switchMode('manual')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          手动框选
        </button>
      </div>

      {mode === 'auto' && (
        <div className="space-y-3">
          {!state.currentImage ? (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              请先上传图片
            </div>
          ) : (
            <button
              onClick={handleDetect}
              disabled={isDetecting || state.isLoading}
              className="w-full py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-900 dark:text-gray-100 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isDetecting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
                  识别中
                </>
              ) : (
                <>
                  <ScanSearch className="w-3.5 h-3.5" />
                  识别路人
                </>
              )}
            </button>
          )}

          {detectError && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {detectError}
            </div>
          )}

          {detectedRegions.length > 0 && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                已识别 {detectedRegions.length} 个候选区域，取消勾选可排除：
              </p>
              <div className="space-y-2">
                {detectedRegions.map((region, index) => (
                  <label
                    key={index}
                    className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDetectedIds.has(index)}
                      onChange={() => toggleDetectedRegion(index)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="flex-1">{region.label || `区域 ${index + 1}`}</span>
                    <span className="text-gray-400 dark:text-gray-500">
                      {Math.round(region.x)},{Math.round(region.y)} {Math.round(region.width)}×{Math.round(region.height)}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {imageSrc && detectedRegions.length > 0 && (
            <CanvasRegionSelector
              imageSrc={imageSrc}
              regions={activeRegions}
              onChange={() => {}}
              mode="rect"
              readOnly
            />
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            在画布上框选需要去除的路人区域
          </p>
          <CanvasRegionSelector
            imageSrc={imageSrc}
            regions={manualRegions}
            onChange={setManualRegions}
            mode="rect"
          />
        </div>
      )}

      <section>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          补充描述（可选）
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={mode === 'auto' ? '例如：穿红色上衣的路人' : '例如：右侧穿白鞋的路人'}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </section>

      <button
        onClick={handleApply}
        disabled={!canApply}
        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        {state.isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            处理中
          </>
        ) : (
          <>
            <Check className="w-4 h-4" />
            {mode === 'auto' ? '确认并去除' : '应用'}
          </>
        )}
      </button>
    </div>
  );
}
