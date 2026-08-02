import type { ToolPanelProps } from './types';
import type { RetouchTool } from '../../../../shared/types';
import FaceBeautyPanel from './FaceBeautyPanel';
import ColorMatchingPanel from './ColorMatchingPanel';
import LiquifyPanel from './LiquifyPanel';
import { useState } from 'react';
import { Wand2, Eraser, Download, Play, AlertCircle } from 'lucide-react';
import { exportCurrentResult, localExportErrorMessage } from '../../features/editor-ux/localExport';
import { TOOL_CAPABILITIES } from '../../features/editor-ux/modelCapabilities';
import { normalizeSemanticLevel, semanticLevelLabel } from '../../features/editor-ux/semanticLevels';

const IDENTITY_ANCHOR = '参考图中的同一人，严格保留其面部骨骼结构、五官比例与辨识度，仅作为身份识别参考';
const STYLE_ANCHOR = '85mm f/1.4人像镜头，柔光箱45度主光，反光板补光，自然光比';
const QUALITY_ANCHOR = '五官端正，手指正确，无畸变，无水印，无文字';

interface PanelWrapperProps extends ToolPanelProps {
  tool: RetouchTool;
}

function RepairToolPanel({ onSubmit }: ToolPanelProps) {
  const [strength, setStrength] = useState(75);

  const handleApply = () => {
    const prompt = [
      `【身份锚定】${IDENTITY_ANCHOR}。`,
      '【保留】保留本人特征、五官辨识度、原始构图背景不变。',
      `【修改】局部修复：祛痘祛斑祛皱，频率分离修复，修复强度${strength}。`,
      `【限制】${STYLE_ANCHOR}。不要过度磨皮，不要改变五官比例，保持真实皮肤纹理。${QUALITY_ANCHOR}。`,
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
          <span className="text-gray-900 dark:text-gray-100 font-medium">{semanticLevelLabel(strength)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={25}
          value={strength}
          onChange={(e) => setStrength(normalizeSemanticLevel(Number(e.target.value)))}
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

function RemoveToolPanel() {
  const capability = TOOL_CAPABILITIES.remove;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Eraser className="w-4 h-4 text-emerald-500" />
        消除
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        {capability.reason}
      </p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="需要先接入区域蒙版选择"
        className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-lg text-sm font-medium cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Eraser className="w-4 h-4" />
        功能开发中
      </button>
    </div>
  );
}

function ExportToolPanel({ state }: ToolPanelProps) {
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [quality, setQuality] = useState(90);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const imageData = state.resultImage || state.currentImage;
  const imageUrl = state.resultImageUrl || state.currentImageUrl;
  const sourceMimeType = state.resultImage || state.resultImageUrl
    ? state.resultMimeType
    : state.currentMimeType;
  const canExport = !!(imageData || imageUrl) && !state.isLoading && !isExporting;

  const handleApply = async () => {
    if (!canExport) return;
    setExportError(null);
    setIsExporting(true);
    try {
      await exportCurrentResult({ imageData, imageUrl, sourceMimeType, format, quality });
    } catch (error) {
      setExportError(localExportErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Download className="w-4 h-4 text-blue-500" />
        本地导出
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        在浏览器本地编码，不会提交新的 AI 编辑请求。
      </p>
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
          min={50}
          max={100}
          step={5}
          value={quality}
          onChange={(e) => setQuality(Number(e.target.value))}
          className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
      </div>
      {exportError && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {exportError}
        </p>
      )}
      <button
        type="button"
        onClick={() => void handleApply()}
        disabled={!canExport}
        className="w-full px-4 py-2 bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        <Download className="w-4 h-4" />
        {isExporting ? '编码中…' : '导出到本地'}
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
      {tool === 'remove' && <RemoveToolPanel />}
      {tool === 'export' && <ExportToolPanel {...panelProps} />}
    </div>
  );
}
