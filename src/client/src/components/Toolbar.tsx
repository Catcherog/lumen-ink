import type { ElementType } from 'react';
import type { RetouchTool } from '../../../shared/types';
import { Smile, Palette, Droplets, Wand2, Eraser, Download, PanelLeftOpen, PanelLeftClose, ExternalLink } from 'lucide-react';

const TOOLS: Array<{ id: RetouchTool; label: string; icon: ElementType }> = [
  { id: 'face', label: '修脸', icon: Smile },
  { id: 'color', label: '调色', icon: Palette },
  { id: 'liquify', label: '液化', icon: Droplets },
  { id: 'repair', label: '修复', icon: Wand2 },
  { id: 'remove', label: '消除', icon: Eraser },
  { id: 'export', label: '导出', icon: Download },
];

interface ToolbarProps {
  activeTool: RetouchTool;
  onToolChange: (tool: RetouchTool) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  onExportToGemini?: () => void;
  hasImage?: boolean;
}

export default function Toolbar({
  activeTool,
  onToolChange,
  expanded = false,
  onToggleExpand,
  orientation = 'vertical',
  className = '',
  onExportToGemini,
  hasImage = false,
}: ToolbarProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`
        flex bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 min-h-0
        ${isVertical ? 'flex-col border-r h-full' : 'flex-row border-b items-center'}
        ${className}
      `}
    >
      <div className={`flex ${isVertical ? 'flex-col flex-1 py-2 gap-1 overflow-y-auto' : 'flex-row px-2 gap-1 overflow-x-auto'} min-w-0`}>
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              title={tool.label}
              className={`
                group flex items-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400
                ${isVertical ? 'mx-2 px-2 py-2.5 justify-start' : 'px-3 py-2 justify-center'}
                ${isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'}
              `}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {expanded && isVertical && (
                <span className="ml-3 text-sm font-medium whitespace-nowrap">{tool.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {onExportToGemini && (
        <div className={isVertical ? 'p-2 border-t border-gray-200 dark:border-gray-700' : 'px-2'}>
          <button
            onClick={onExportToGemini}
            disabled={!hasImage}
            title={hasImage ? '导出到 Gemini 网页版手动生图' : '请先上传图片'}
            className={`
              flex items-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400
              ${isVertical ? 'mx-2 px-2 py-2.5 justify-start w-[calc(100%-1rem)]' : 'px-3 py-2 justify-center'}
              ${hasImage
                ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'}
            `}
          >
            <ExternalLink className="w-5 h-5 flex-shrink-0" />
            {expanded && isVertical && (
              <span className="ml-3 text-sm font-medium whitespace-nowrap">导出到 Gemini</span>
            )}
          </button>
        </div>
      )}

      {isVertical && onToggleExpand && (
        <div className="p-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onToggleExpand}
            title={expanded ? '收起工具栏' : '展开工具栏'}
            className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {expanded ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
          </button>
        </div>
      )}
    </div>
  );
}
