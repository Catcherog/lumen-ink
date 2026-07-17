import type { EditRecipe } from '../../../../../shared/types';
import { V2_TASK_META } from '../../../../../shared/types';
import { FolderOpen } from 'lucide-react';

interface RecipePanelProps {
  recipe: EditRecipe;
  onChange: (next: EditRecipe) => void;
  disabled?: boolean;
}

/**
 * 项目任务面板（taskId='project'）。
 *
 * `project` 任务不发起编辑（V2_TASK_EDITABLE.project === false）。
 * 面板仅展示项目元信息提示，不渲染任何可编辑字段。
 * `onChange` 与 `disabled` 接受但忽略，保持接口一致。
 */
export default function ProjectPanel({ recipe }: RecipePanelProps) {
  const meta = V2_TASK_META.project;
  return (
    <div
      className="space-y-3 text-center py-6"
      data-recipe-panel="project"
      data-task-id={recipe.taskId}
    >
      <div className="inline-flex p-3 rounded-full bg-gray-100 dark:bg-gray-800">
        <FolderOpen className="w-6 h-6 text-gray-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{meta.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
          {meta.description}
        </p>
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed px-4">
        切换到其他任务标签即可开始精修。本任务不发起编辑，无需生成预览。
      </p>
    </div>
  );
}
