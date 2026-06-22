import type { ToolPanelProps } from './types';
import type { RetouchTool } from '../../../../shared/types';
import FaceBeautyPanel from './FaceBeautyPanel';
import ColorMatchingPanel from './ColorMatchingPanel';
import LiquifyPanel from './LiquifyPanel';
import { useState } from 'react';
import { Wand2, Eraser, Download, Play } from 'lucide-react';

interface PanelWrapperProps extends ToolPanelProps {
  tool: RetouchTool;
}

function RepairToolPanel({ onSubmit }: ToolPanelProps) {
  const [strength, setStrength] = useState(70);

  const handleApply = () => {
    onSubmit(`局部修复：祛痘祛斑祛皱，修复强度${strength}`, {
      tool: 'repair',
      params: { strength },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Wand2 className="w-4 h-4 text-violet-500" />
        局部修复
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">修复强度</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{strength}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
          className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
        />
      </div>
      <button
        type="button"
        onClick={handleApply}
        className="w-full px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
      >
        <Play className="w-4 h-4" />
        应用修复
      </button>
    </div>
  );
}

function RemoveToolPanel({ onSubmit }: ToolPanelProps) {
  const handleApply = () => {
    onSubmit('去除画面中的杂物、路人或水印，保持画面自然', {
      tool: 'remove',
      params: {},
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Eraser className="w-4 h-4 text-emerald-500" />
        消除
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        在画布上框选需要消除的区域后点击应用。当前为占位实现，区域选择将在后续模块接入。
      </p>
      <button
        type="button"
        onClick={handleApply}
        className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
      >
        <Play className="w-4 h-4" />
        应用消除
      </button>
    </div>
  );
}

function ExportToolPanel({ onSubmit }: ToolPanelProps) {
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [quality, setQuality] = useState(90);

  const handleApply = () => {
    onSubmit(`导出图片：格式${format.toUpperCase()}，质量${quality}%`, {
      tool: 'export',
      params: { format, quality },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Download className="w-4 h-4 text-blue-500" />
        导出
      </div>
      <div className="space-y-1.5">
        <span className="text-xs text-gray-600 dark:text-gray-400">输出格式</span>
        <div className="flex gap-2">
          {(['jpeg', 'png', 'webp'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                format === f
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">质量</span>
          <span className="text-gray-900 dark:text-gray-100 font-medium">{quality}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
          className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
      </div>
      <button
        type="button"
        onClick={handleApply}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <Play className="w-4 h-4" />
        应用导出
      </button>
    </div>
  );
}

export default function ToolPanel({ tool, ...panelProps }: PanelWrapperProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4">
      {tool === 'face' && <FaceBeautyPanel {...panelProps} />}
      {tool === 'color' && <ColorMatchingPanel {...panelProps} />}
      {tool === 'liquify' && <LiquifyPanel {...panelProps} />}
      {tool === 'repair' && <RepairToolPanel {...panelProps} />}
      {tool === 'remove' && <RemoveToolPanel {...panelProps} />}
      {tool === 'export' && <ExportToolPanel {...panelProps} />}
    </div>
  );
}
