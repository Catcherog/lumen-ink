import { useState, type ElementType } from 'react';
import {
  FolderOpen,
  User,
  Palette,
  Sparkles,
  ScanFace,
  Download,
} from 'lucide-react';
import type { V2TaskId } from '../../../../shared/types';
import { V2_TASK_META } from '../../../../shared/types';

/**
 * V2 任务栏（FLOW-001 起为受控组件）。
 *
 * 设计要点（D-020 / D-026）：
 * - `V2TaskId` 与底层 `RetouchTool` 解耦；点击标签不会改变 `state.selectedTool`。
 * - 真实「任务 → 工具 / Recipe」映射由 `V2_TASK_TOOL_MAP` 提供，AppV2 在 CTA 触发时使用。
 * - 任意时刻最多一个标签高亮（由 `activeTask` 唯一决定）。
 *
 * 受控使用：父组件传入 `activeTask` + `onSelectTask`。
 * 非受控兼容：未传 props 时回退到内部 `useState`（用于隔离测试）。
 */
interface TaskItem {
  id: V2TaskId;
  label: string;
  icon: ElementType;
}

const TASKS: TaskItem[] = [
  { id: 'project', label: V2_TASK_META.project.title, icon: FolderOpen },
  { id: 'subject', label: V2_TASK_META.subject.title, icon: User },
  { id: 'color', label: V2_TASK_META.color.title, icon: Palette },
  { id: 'cleanup', label: V2_TASK_META.cleanup.title, icon: Sparkles },
  { id: 'local', label: V2_TASK_META.local.title, icon: ScanFace },
  { id: 'export', label: V2_TASK_META.export.title, icon: Download },
];

interface TaskRailProps {
  /** 受控选中态；未传时使用内部状态 */
  activeTask?: V2TaskId;
  onSelectTask?: (task: V2TaskId) => void;
}

export default function TaskRail({ activeTask, onSelectTask }: TaskRailProps) {
  // 非受控回退：仅在没有受控 props 时启用，保证测试与隔离使用可行。
  // 受控时该 state 不参与渲染判定（active 优先取 activeTask）。
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
    <nav
      aria-label="V2 任务栏"
      className="w-16 xl:w-[72px] flex-shrink-0 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-1 overflow-y-auto"
    >
      {TASKS.map((task) => {
        const Icon = task.icon;
        const isActive = active === task.id;
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => handleClick(task.id)}
            aria-current={isActive ? 'true' : undefined}
            aria-pressed={isActive}
            data-v2-task-id={task.id}
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
