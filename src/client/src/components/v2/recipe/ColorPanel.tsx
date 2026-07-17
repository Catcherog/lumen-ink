import type { EditRecipe } from '../../../../../shared/types';
import ProtectionsPanel from './ProtectionsPanel';

interface RecipePanelProps {
  recipe: EditRecipe;
  onChange: (next: EditRecipe) => void;
  disabled?: boolean;
}

/**
 * 色彩任务面板（taskId='color'）。
 *
 * 不编辑人像参数（默认全 off，避免污染色彩调整）。
 * 主要输入为补充要求；保护项可调。
 */
export default function ColorPanel({ recipe, onChange, disabled }: RecipePanelProps) {
  const setDescription = (description: string) => {
    onChange({ ...recipe, auxiliary: { ...recipe.auxiliary, description } });
  };

  const setProtections = (protections: EditRecipe['protections']) => {
    onChange({ ...recipe, protections });
  };

  return (
    <div className="space-y-4" data-recipe-panel="color">
      <section>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          色彩调整描述
        </label>
        <textarea
          value={recipe.auxiliary.description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled}
          placeholder="如：低饱和暖调、暗部偏青、高光偏暖、整体更通透..."
          rows={5}
          className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none disabled:opacity-50"
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
