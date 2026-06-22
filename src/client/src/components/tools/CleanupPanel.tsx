import { useState, useMemo } from 'react';
import type { ToolPanelProps } from './types';
import type { Region } from '../../../../shared/types';
import CanvasRegionSelector from './CanvasRegionSelector';
import { Wand2, Check, MousePointer2, Paintbrush } from 'lucide-react';

type Mode = 'auto' | 'manual';
type SelectionMode = 'rect' | 'brush';

export default function CleanupPanel({ state, onSubmit }: ToolPanelProps) {
  const [mode, setMode] = useState<Mode>('auto');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('rect');
  const [brushSize, setBrushSize] = useState(40);
  const [regions, setRegions] = useState<Region[]>([]);
  const [description, setDescription] = useState('');

  const imageSrc = useMemo(() => {
    if (!state.currentImage) return undefined;
    return `data:${state.currentMimeType};base64,${state.currentImage}`;
  }, [state.currentImage, state.currentMimeType]);

  const buildPrompt = (): string => {
    const modify = mode === 'manual' && regions.length > 0
      ? `【修改】仅修复已选定的区域（背景穿帮/杂物）${description.trim() ? `，${description.trim()}` : ''}，与周围环境自然融合。`
      : '【修改】自动识别并修复背景穿帮与杂物，保持画面自然。';

    return [
      '【保留】保持人物主体、未选定区域、整体构图和背景结构不变。',
      modify,
      '【风格】无痕迹修复，与周围环境光影和纹理自然融合。',
      '【限制】不要改变人物，不要重绘未选定区域，不要改变光影，不要留下修复痕迹。',
    ].join('\n');
  };

  const handleApply = () => {
    const prompt = buildPrompt();
    onSubmit(prompt, {
      tool: 'repair',
      params: { mode, selectionMode, description: description.trim() },
      regions: mode === 'manual' ? regions : undefined,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Wand2 className="w-4 h-4 text-violet-500" />
        背景穿帮修复
      </div>

      <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setMode('auto')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            mode === 'auto'
              ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          自动修复
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          手动选择
        </button>
      </div>

      {mode === 'manual' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setSelectionMode('rect')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs rounded-lg border transition-colors ${
                selectionMode === 'rect'
                  ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              框选
            </button>
            <button
              onClick={() => setSelectionMode('brush')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs rounded-lg border transition-colors ${
                selectionMode === 'brush'
                  ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              <Paintbrush className="w-3.5 h-3.5" />
              涂抹
            </button>
          </div>

          {selectionMode === 'brush' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-700 dark:text-gray-300">笔刷大小</label>
                <span className="text-xs text-gray-500 dark:text-gray-400">{brushSize}</span>
              </div>
              <input
                type="range"
                min={10}
                max={120}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
            </div>
          )}

          <CanvasRegionSelector
            imageSrc={imageSrc}
            regions={regions}
            onChange={setRegions}
            mode={selectionMode}
            brushSize={brushSize}
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
          placeholder={mode === 'auto' ? '例如：去除背景支架、电线...' : '例如：去除支架'}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </section>

      <button
        onClick={handleApply}
        disabled={state.isLoading || (mode === 'manual' && regions.length === 0)}
        className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        {state.isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            处理中
          </>
        ) : (
          <>
            <Check className="w-4 h-4" />
            应用
          </>
        )}
      </button>
    </div>
  );
}
