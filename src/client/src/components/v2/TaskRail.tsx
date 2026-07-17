import { useState } from 'react';
import type { ElementType } from 'react';
import {
  FolderOpen,
  User,
  Palette,
  Sparkles,
  ScanFace,
  Download,
} from 'lucide-react';

/**
 * V2 任务栏标签 ID。
 *
 * 注意：这是 V2 展示层独立的选择状态，与底层 `RetouchTool` 解耦。
 * UI-001 仅做结构外壳，真实「任务 → 工具 / Recipe」映射在 FLOW-001 实现。
 * 任意时刻最多一个标签高亮，点击标签不会改变 `state.selectedTool`。
 */
export type V2TaskId = 'project' | 'subject' | 'color' | 'cleanup' | 'local' | 'export';

interface TaskItem {
  id: V2TaskId;
  label: string;
  icon: ElementType;
}

const TASKS: TaskItem[] = [
  { id: 'project', label: '项目', icon: FolderOpen },
  { id: 'subject', label: '人物', icon: User },
  { id: 'color', label: '色彩', icon: Palette },
  { id: 'cleanup', label: '清理', icon: Sparkles },
  { id: 'local', label: '局部', icon: ScanFace },
  { id: 'export', label: '导出', icon: Download },
];

interface TaskRailProps {
  /**
   * 可选的受控选中态。若不传，TaskRail 内部自管理。
   * 任意时刻仅一个 V2TaskId 高亮，与底层 RetouchTool 无关。
   */
  activeTask?: V2TaskId;
  onSelectTask?: (task: V2TaskId) => void;
}

export default function TaskRail({ activeTask, onSelectTask }: TaskRailProps) {
  const [internalActive, setInternalActive] = useState<V2TaskId>('project');
  const active = activeTask ?? internalActive;

  const handleClick = (task: V2TaskId) => {
    if (onSelectTask) {
      onSelectTask(task);
    } else {
      setInternalActive(task);
    }
  };

  return (
    <nav className="w-[72px] flex-shrink-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-1 overflow-y-auto">
      {TASKS.map((task) => {
        const Icon = task.icon;
        const isActive = active === task.id;
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => handleClick(task.id)}
            aria-current={isActive ? 'true' : undefined}
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
