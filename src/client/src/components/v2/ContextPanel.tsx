import type { Dispatch } from 'react';
import type {
  EditorState,
  EditorAction,
  ReferenceImage,
  RetouchTool,
  HistoryEntry,
  Region,
} from '../../../../shared/types';
import ParamPanel from '../ParamPanel';
import { AlertTriangle } from 'lucide-react';

interface ContextPanelProps {
  tool: RetouchTool;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onSubmit: (prompt: string, options?: {
    tool?: RetouchTool;
    params?: Record<string, unknown>;
    regions?: Region[];
    referenceImages?: ReferenceImage[];
  }) => void;
  onSelectTemplate?: (prompt: string) => void;
  onRestoreHistory?: (entry: HistoryEntry, index: number) => void;
  onViewHistory?: (entry: HistoryEntry) => void;
  onDeleteHistory?: (id: string) => void;
  externalPrompt?: string;
  onPromptConsumed?: () => void;
  onPromptChange?: (prompt: string) => void;
}

export default function ContextPanel(props: ContextPanelProps) {
  return (
    <aside className="w-[360px] flex-shrink-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 bg-amber-50/50 dark:bg-amber-900/10">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          此区域为 FLOW-001 临时兼容区：当前“应用/提交”按钮与参数面板将在配方模型完成后收敛为单一“生成预览”操作。
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <ParamPanel {...props} />
      </div>
    </aside>
  );
}
