import type { EditRecipe } from '../../../../../shared/types';
import ProtectionsPanel from './ProtectionsPanel';

interface RecipePanelProps {
  recipe: EditRecipe;
  onChange: (next: EditRecipe) => void;
  disabled?: boolean;
}

/**
 * 清理任务面板（taskId='cleanup'）。
 *
 * 主要输入为补充要求（要清理什么：杂物、瑕疵、路人、水印...）。
 * 保护项可调，但默认仍开启身份/构图等。
 */
export default function CleanupPanel({ recipe, onChange, disabled }: RecipePanelProps) {
  const setDescription = (description: string) => {
    onChange({ ...recipe, auxiliary: { ...recipe.auxiliary, description } });
  };

  const setProtections = (protections: EditRecipe['protections']) => {
    onChange({ ...recipe, protections });
  };

  return (
    <div className="space-y-4" data-recipe-panel="cleanup">
      <section>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          清理目标描述
        </label>
        <textarea
          value={recipe.auxiliary.description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled}
          placeholder="如：去除画面左侧杂物、清理面部痘印、移除背景路人..."
          rows={5}
          className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none disabled:opacity-50"
          data-recipe-description
        />
      </section>

      <section>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">保护项</h3>
        <ProtectionsPanel
          value={recipe.protections}
          onChange={setProtections}
          disabled={disabled}
        />
      </section>
    </div>
  );
}
