import type { ProtectionItems } from '../../../../../shared/types';
import { PROTECTION_LABELS } from '../../../../../shared/types';

interface ProtectionsPanelProps {
  value: ProtectionItems;
  onChange: (next: ProtectionItems) => void;
  disabled?: boolean;
}

/**
 * 保护项面板（FLOW-001 任务规格：5 项保护，默认开启）。
 *
 * 渲染 5 个开关：身份、构图、皮肤纹理、服装、背景。
 * 开关状态直接写入 Recipe.protections；编译器会确保所有项（无论开关）都出现在 Prompt 中。
 */
export default function ProtectionsPanel({ value, onChange, disabled }: ProtectionsPanelProps) {
  const keys = Object.keys(PROTECTION_LABELS) as Array<keyof ProtectionItems>;

  const toggle = (key: keyof ProtectionItems) => {
    if (disabled) return;
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div className="space-y-1.5" data-protections-panel>
      {keys.map((key) => {
        const enabled = value[key];
        return (
          <label
            key={key}
            className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors
              ${enabled
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-900/10'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}
              ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
          >
            <span className="text-gray-700 dark:text-gray-300">{PROTECTION_LABELS[key]}</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                toggle(key);
              }}
              data-protection-key={key}
              className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                  enabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        );
      })}
    </div>
  );
}
