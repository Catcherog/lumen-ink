import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { CompiledPrompt } from '../../../../../shared/types';

interface CompiledPromptPreviewProps {
  compiled: CompiledPrompt;
}

/**
 * 折叠只读的编译 Prompt 预览。
 *
 * 默认折叠以避免视觉噪音；展开后显示完整 Prompt 文本（只读 textarea）。
 * 显示编译器版本与对应 task/tool，方便排查。
 */
export default function CompiledPromptPreview({ compiled }: CompiledPromptPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 overflow-hidden"
      data-compiled-prompt-preview
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="compiled-prompt-body"
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <FileText className="w-3.5 h-3.5" />
        <span>编译后 Prompt（v{compiled.version}，只读）</span>
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
          {compiled.recipe.taskId} · {compiled.recipe.tool ?? 'none'}
        </span>
      </button>
      {open && (
        <textarea
          id="compiled-prompt-body"
          data-testid="compiled-prompt-body"
          readOnly
          value={compiled.prompt}
          rows={10}
          className="w-full px-3 pb-3 text-[11px] leading-relaxed font-mono text-gray-700 dark:text-gray-300 bg-transparent border-0 resize-none focus:outline-none"
          data-compiled-prompt-body
        />
      )}
    </div>
  );
}
