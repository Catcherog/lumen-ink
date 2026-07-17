import type { Tier } from '../../../../../shared/types';
import { TIER_ORDER, TIER_LABELS } from '../../../../../shared/types';

interface TierSelectProps {
  value: Tier;
  onChange: (tier: Tier) => void;
  disabled?: boolean;
  /** 用于唯一化 radio name，避免多个 TierSelect 互斥 */
  name: string;
}

/**
 * 五档单选组件（D-005 决策）。
 *
 * 渲染 off / light / natural / obvious / strong 五个 radio chip，
 * 任意时刻只有一个高亮。无提交按钮，仅修改父级 recipe state。
 */
export default function TierSelect({ value, onChange, disabled, name }: TierSelectProps) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5"
      data-tier-select={name}
    >
      {TIER_ORDER.map((tier) => {
        const active = tier === value;
        return (
          <button
            key={tier}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(tier)}
            data-tier={tier}
            className={`
              flex-1 px-1.5 py-1 text-[11px] rounded-md transition-colors
              ${active
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 font-medium shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            `}
          >
            {TIER_LABELS[tier]}
          </button>
        );
      })}
    </div>
  );
}
