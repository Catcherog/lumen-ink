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
 * 人物任务面板（taskId='subject'）。
 *
 * 渲染 6 个人像五档参数 + 补充要求 + 保护项。
 * 任何修改都通过 `onChange` 写回父级 Recipe 状态，本组件无内部状态。
 */
export default function PortraitPanel({ recipe, onChange, disabled }: RecipePanelProps) {
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
    <div className="space-y-4" data-recipe-panel="subject">
      <section>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">人像精修参数</h3>
        <div className="space-y-2">
          {paramKeys.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">
                {PORTRAIT_PARAM_LABELS[key]}
              </span>
              <TierSelect
                name={`portrait-${key}`}
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
          placeholder="如：保留雀斑、不要过度磨皮、强调眼神光..."
          rows={3}
          className="w-full px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none disabled:opacity-50"
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
