import type {
  EditorState,
  HistoryEntry,
  CompiledPrompt,
  EditRecipe,
} from '../../../../shared/types';
import { V2_TASK_META, V2_TASK_EDITABLE } from '../../../../shared/types';
import RecipePanel from './recipe/RecipePanel';
import CompiledPromptPreview from './recipe/CompiledPromptPreview';
import HistoryPanel from '../HistoryPanel';
import { Sparkles, Loader2, History } from 'lucide-react';

interface ContextPanelProps {
  /** 当前任务对应的 Recipe（由 AppV2 根据 activeTask 选取） */
  recipe: EditRecipe;
  /** Recipe 变更回调（写回 AppV2 的 recipeBook） */
  onRecipeChange: (next: EditRecipe) => void;
  /** 编译后的 Prompt（由 AppV2 在每次 recipe 变更时重新编译） */
  compiled: CompiledPrompt;
  /** 当前 EditorState（用于 isLoading / history / currentImage） */
  state: EditorState;
  /** 主 CTA：触发 compilePrompt → submitEdit 闭环 */
  onSubmit: () => void;
  /** 历史回调（可选，未传则不渲染历史区） */
  onRestoreHistory?: (entry: HistoryEntry, index: number) => void;
  onViewHistory?: (entry: HistoryEntry) => void;
  onDeleteHistory?: (id: string) => void;
}

/**
 * V2 右栏上下文面板（FLOW-001 重写版本）。
 *
 * 设计要点（任务规格第 4 项）：
 * - 删除临时债务提示与旧 ParamPanel / PromptInput / 应用 / 提交入口；
 * - 只保留一个真实"生成预览"主 CTA（disabled 当 !canSubmit）；
 * - Recipe 编辑区由 RecipePanel 根据 taskId 自动分派；
 * - 完整 Prompt 默认折叠只读（CompiledPromptPreview）；
 * - History 区保留为只读记录，不影响主操作。
 */
export default function ContextPanel({
  recipe,
  onRecipeChange,
  compiled,
  state,
  onSubmit,
  onRestoreHistory,
  onViewHistory,
  onDeleteHistory,
}: ContextPanelProps) {
  const meta = V2_TASK_META[recipe.taskId];
  const editable = V2_TASK_EDITABLE[recipe.taskId];
  const hasCurrentImage = !!(state.currentImage || state.currentImageUrl);
  const canSubmit = editable && hasCurrentImage && !state.isLoading;

  const showHistory = !!onRestoreHistory && state.history.length > 0;

  return (
    <aside
      className="w-[360px] flex-shrink-0 h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      data-context-panel
      data-task-id={recipe.taskId}
    >
      {/* 任务标题 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{meta.title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{meta.description}</p>
        </div>
      </div>

      {/* Recipe 编辑区（可滚动） */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <RecipePanel
          recipe={recipe}
          onChange={onRecipeChange}
          disabled={state.isLoading || !editable}
        />

        {/* 折叠只读编译 Prompt */}
        <div className="mt-4">
          <CompiledPromptPreview compiled={compiled} />
        </div>

        {/* 历史记录（只读，不影响主操作） */}
        {showHistory && (
          <section className="mt-5">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              编辑历史
            </h3>
            <HistoryPanel
              history={state.history}
              onRestore={onRestoreHistory!}
              onView={onViewHistory}
              onDelete={onDeleteHistory}
              currentImage={state.currentImage}
              currentImageUrl={state.currentImageUrl}
            />
          </section>
        )}
      </div>

      {/* 单一"生成预览"主 CTA */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label={state.isLoading ? '生成中' : '生成预览'}
          data-cta="generate-preview"
          className={`
            w-full py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2
            ${canSubmit
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'}
          `}
        >
          {state.isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              生成中
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              生成预览
            </>
          )}
        </button>
        {!editable && (
          <p className="mt-1.5 text-[11px] text-center text-gray-400 dark:text-gray-500">
            当前任务不发起编辑，请切换到其他任务
          </p>
        )}
        {editable && !hasCurrentImage && (
          <p className="mt-1.5 text-[11px] text-center text-gray-400 dark:text-gray-500">
            请先上传图片再生成预览
          </p>
        )}
      </div>
    </aside>
  );
}
