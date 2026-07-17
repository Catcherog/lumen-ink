import type { EditRecipe } from '../../../../../shared/types';
import ProtectionsPanel from './ProtectionsPanel';

interface RecipePanelProps {
  recipe: EditRecipe;
  onChange: (next: EditRecipe) => void;
  disabled?: boolean;
}

const FORMAT_OPTIONS: Array<{ value: 'jpeg' | 'png' | 'webp'; label: string }> = [
  { value: 'jpeg', label: 'JPEG（有损，体积小）' },
  { value: 'png', label: 'PNG（无损，体积大）' },
  { value: 'webp', label: 'WebP（现代格式，平衡）' },
];

/**
 * 导出任务面板（taskId='export'）。
 *
 * 选择输出格式与质量；保护项保留（导出通常不应改变画面内容，
 * 但 Provider 仍可能做轻微锐化，故保留保护项以约束行为）。
 */
export default function ExportPanel({ recipe, onChange, disabled }: RecipePanelProps) {
  const setFormat = (outputFormat: 'jpeg' | 'png' | 'webp') => {
    onChange({ ...recipe, auxiliary: { ...recipe.auxiliary, outputFormat } });
  };

  const setQuality = (outputQuality: number) => {
    onChange({ ...recipe, auxiliary: { ...recipe.auxiliary, outputQuality } });
  };

  const setProtections = (protections: EditRecipe['protections']) => {
    onChange({ ...recipe, protections });
  };

  return (
    <div className="space-y-4" data-recipe-panel="export">
      <section>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          输出格式
        </label>
        <div className="space-y-1.5" role="radiogroup" aria-label="输出格式" data-format-group>
          {FORMAT_OPTIONS.map((opt) => {
            const active = recipe.auxiliary.outputFormat === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors
                  ${active
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}
                  ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={opt.value}
                  checked={active}
                  onChange={() => setFormat(opt.value)}
                  disabled={disabled}
                  className="w-3 h-3"
                  data-format-option={opt.value}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <label className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          <span>输出质量</span>
          <span className="text-gray-700 dark:text-gray-300">{recipe.auxiliary.outputQuality}%</span>
        </label>
        <input
          type="range"
          min={50}
          max={100}
          value={recipe.auxiliary.outputQuality}
          onChange={(e) => setQuality(Number(e.target.value))}
          disabled={disabled}
          className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50"
          data-quality-slider
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
