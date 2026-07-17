import type { EditRecipe, PortraitParams } from '../../../../../shared/types';
import { PORTRAIT_PARAM_LABELS } from '../../../../../shared/types';
import TierSelect from './TierSelect';
import ProtectionsPanel from './ProtectionsPanel';

interface RecipePanelProps {
  recipe: EditRecipe;
  onChange: (next: EditRecipe) => void;
  disabled?: boolean;
}

/**
 * 局部任务面板（taskId='local'）。
 *
 * 与 PortraitPanel 共用人像五档参数（默认值由 defaultRecipe('local') 提供），
 * 但描述文案侧重"液化塑形 / 局部调整"。修改通过 `onChange` 写回 Recipe。
 */
export default function LocalPanel({ recipe, onChange, disabled }: RecipePanelProps) {
  const setPortraitField = (key: keyof PortraitParams, value: PortraitParams[keyof PortraitParams]) => {
    onChange({ ...recipe, portrait: { ...recipe.portrait, [key]: value } });
  };

  const setDescription = (description: string) => {
    onChange({ ...recipe, auxiliary: { ...recipe.auxiliary, description } });
  };

  const setProtections = (protections: EditRecipe['protections']) => {
    onChange({ ...recipe, protections });
  };

  const paramKeys = Object.keys(PORTRAIT_PARAM_LABELS) as Array<keyof PortraitParams>;

  return (
    <div className="space-y-4" data-recipe-panel="local">
      <section>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">局部塑形参数</h3>
        <div className="space-y-2">
          {paramKeys.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">
                {PORTRAIT_PARAM_LABELS[key]}
              </span>
              <TierSelect
                name={`local-${key}`}
                value={recipe.portrait[key]}
                onChange={(tier) => setPortraitField(key, tier)}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          补充要求（可选）
        </label>
        <textarea
          value={recipe.auxiliary.description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled}
          placeholder="如：下颌线再收紧一点、肩部稍微下沉..."
          rows={3}
          className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none disabled:opacity-50"
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
