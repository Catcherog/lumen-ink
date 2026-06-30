import type { HistoryEntry, RetouchTool } from '../../../shared/types';
import { Smile, Palette, Droplets, Wand2, Eraser, Download, ExternalLink, Trash2, RotateCcw, type LucideIcon } from 'lucide-react';

const TOOL_META: Record<RetouchTool, { label: string; icon: LucideIcon; color: string }> = {
  face: { label: '修脸', icon: Smile, color: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' },
  color: { label: '调色', icon: Palette, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  liquify: { label: '液化', icon: Droplets, color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800' },
  repair: { label: '修复', icon: Wand2, color: 'text-violet-500 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800' },
  remove: { label: '消除', icon: Eraser, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
  export: { label: '导出', icon: Download, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  manual: { label: '手动', icon: ExternalLink, color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' },
};

const PARAM_LABELS: Record<string, string> = {
  smoothing: '磨皮',
  slimming: '瘦脸',
  whitening: '美白',
  skinBrightness: '肤色提亮',
  faceSlim: '瘦脸',
  eyeEnlarge: '大眼',
  blemish: '去瑕疵',
  sculptLight: '立体光影',
  exposure: '曝光',
  contrast: '对比度',
  saturation: '饱和度',
  temperature: '色温',
  description: '补充描述',
  hasReference: '参考图',
  bodySlim: '瘦身',
  faceSmall: '小脸',
  jawLine: '下颌线收紧',
  noseShrink: '鼻翼缩小',
  philtrumShort: '人中缩短',
  shoulderNarrow: '肩部收窄',
  bodyShape: '身形微调',
  strength: '强度',
  preset: '预设',
  format: '格式',
  quality: '质量',
};

interface HistoryPanelProps {
  history: HistoryEntry[];
  onRestore: (entry: HistoryEntry, index: number) => void;
  onView?: (entry: HistoryEntry) => void;        // 仅查看，不截断历史
  onDelete?: (id: string) => void;                // 删除单条
  currentImage?: string | null;
  currentImageUrl?: string | null;
}

function formatParamsSummary(params?: Record<string, unknown>): string | null {
  if (!params || Object.keys(params).length === 0) return null;
  const entries = Object.entries(params)
    .slice(0, 3)
    .map(([key, value]) => `${PARAM_LABELS[key] || key} ${value}`);
  return entries.join(', ');
}

export default function HistoryPanel({ history, onRestore, onView, onDelete, currentImage, currentImageUrl }: HistoryPanelProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        <p>暂无历史记录</p>
        <p className="mt-1 text-xs">生成后历史记录将显示在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((entry, index) => {
        const toolMeta = entry.tool ? TOOL_META[entry.tool] : null;
        const ToolIcon = toolMeta?.icon;
        const isActive = entry.resultImage
          ? entry.resultImage === currentImage
          : entry.resultImageUrl
            ? entry.resultImageUrl === currentImageUrl
            : false;
        const paramsSummary = formatParamsSummary(entry.params);

        return (
          <div
            key={entry.id}
            className={`
              flex flex-col p-2 rounded-lg transition-colors
              ${isActive
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'}
            `}
          >
            <div
              className="flex gap-3 cursor-pointer"
              onClick={() => (onView ? onView(entry) : onRestore(entry, index))}
            >
              {entry.resultImage ? (
                <img
                  src={`data:${entry.resultMimeType || 'image/png'};base64,${entry.resultImage}`}
                  alt={`生成 ${index + 1}`}
                  className="w-12 h-12 object-cover rounded-md flex-shrink-0"
                />
              ) : entry.resultImageUrl ? (
                <img
                  src={entry.resultImageUrl}
                  alt={`生成 ${index + 1}`}
                  className="w-12 h-12 object-cover rounded-md flex-shrink-0"
                />
              ) : entry.text ? (
                <div className="w-12 h-12 rounded-md flex-shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-md flex-shrink-0 bg-gray-100 dark:bg-gray-800" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {ToolIcon && (
                    <div className={`p-0.5 rounded border ${toolMeta.color}`}>
                      <ToolIcon className="w-3 h-3" />
                    </div>
                  )}
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {toolMeta ? toolMeta.label : `第 ${index + 1} 轮`}
                  </span>
                </div>
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{entry.prompt}</p>
                {paramsSummary && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{paramsSummary}</p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRestore(entry, index); }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="恢复到此处（会截断后续历史）"
                >
                  <RotateCcw className="w-3 h-3" />
                  恢复到此处
                </button>
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="删除此条历史"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
