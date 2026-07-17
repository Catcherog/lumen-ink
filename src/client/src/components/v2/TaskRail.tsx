import type { ElementType } from 'react';
import type { RetouchTool } from '../../../../shared/types';
import {
  FolderOpen,
  User,
  Palette,
  Sparkles,
  ScanFace,
  Download,
} from 'lucide-react';

interface TaskItem {
  id: RetouchTool;
  label: string;
  icon: ElementType;
}

const TASKS: TaskItem[] = [
  { id: 'face', label: '项目', icon: FolderOpen },
  { id: 'face', label: '人物', icon: User },
  { id: 'color', label: '色彩', icon: Palette },
  { id: 'remove', label: '清理', icon: Sparkles },
  { id: 'repair', label: '局部', icon: ScanFace },
  { id: 'export', label: '导出', icon: Download },
];

interface TaskRailProps {
  activeTool: RetouchTool;
  onToolChange: (tool: RetouchTool) => void;
}

export default function TaskRail({ activeTool, onToolChange }: TaskRailProps) {
  return (
    <nav className="w-[72px] flex-shrink-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-1 overflow-y-auto">
      {TASKS.map((task) => {
        const Icon = task.icon;
        const isActive = activeTool === task.id;
        return (
          <button
            key={task.label}
            type="button"
            onClick={() => onToolChange(task.id)}
            className={`
              w-full flex flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-inset
              ${isActive
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'}
            `}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-none">{task.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
