import type { ToolPanelProps } from './types';
import type { RetouchTool } from '../../../../shared/types';
import FaceBeautyPanel from './FaceBeautyPanel';
import ColorMatchingPanel from './ColorMatchingPanel';
import LiquifyPanel from './LiquifyPanel';
import { useState } from 'react';
import { Wand2, Eraser, Download, Play } from 'lucide-react';

const IDENTITY_ANCHOR = '参考图中的同一人，严格保留其面部骨骼结构、五官比例与辨识度，仅作为身份识别参考';
const LIGHTING_ANCHOR = '柔光箱45度主光，反光板补光，自然光比';
const QUALITY_ANCHOR = '五官端正，手指正确，无畸变，无水印，无文字';

interface PanelWrapperProps extends ToolPanelProps {
  tool: RetouchTool;
}

function RepairToolPanel({ onSubmit }: ToolPanelProps) {
  const [strength, setStrength] = useState(70);

  const handleApply = () => {
    const prompt = [
      `【身份锚定】${IDENTITY_ANCHOR}。`,
      '【保留】保留本人特征、五官辨识度、原始构图背景不变。',
      `【修改】局部修复：祛痘祛斑祛皱，频率分离修复，修复强度${strength}。`,
      `【光影镜头】${LIGHTING_ANCHOR}。`,
      '【风格】自然修复质感，85mm f/1.4人像镜头。',
      `【限制】不要过度磨皮，不要改变五官比例，保持真实皮肤纹理。${QUALITY_ANCHOR}。`,
    ].join('\n');
    onSubmit(prompt, {
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
    const prompt = [
      `【身份锚定】${IDENTITY_ANCHOR}。`,
      '【保留】保留主体人物特征、五官、姿势、构图不变。',
      '【修改】去除画面中的杂物、路人或水印，保持画面自然。',
      `【光影镜头】${LIGHTING_ANCHOR}。`,
      '【风格】自然修复，内容感知填充，85mm f/1.4人像镜头。',
      `【限制】不要改变主体人物，不要扭曲背景纹理。${QUALITY_ANCHOR}。`,
    ].join('\n');
    onSubmit(prompt, {
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
    const prompt = [
      `【身份锚定】${IDENTITY_ANCHOR}。`,
      '【保留】保留原图所有细节、构图、光影不变。',
      `【修改】导出优化：格式${format.toUpperCase()}，质量${quality}%，锐化输出。`,
      `【光影镜头】${LIGHTING_ANCHOR}。`,
      '【风格】高质量输出，85mm f/1.4人像镜头。',
      `【限制】不要改变画面内容，不要压缩失真。${QUALITY_ANCHOR}。`,
    ].join('\n');
    onSubmit(prompt, {
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
