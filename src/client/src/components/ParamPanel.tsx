import type { Dispatch, ElementType } from 'react';
import type { EditorState, EditorAction, ReferenceImage, RetouchTool, HistoryEntry, Region } from '../../../shared/types';
import PromptInput from './PromptInput';
import ReferenceImages from './ReferenceImages';
import TemplatePanel from './TemplatePanel';
import HistoryPanel from './HistoryPanel';
import ToolPanel from './tools/ToolPanel';
import { Smile, Palette, Droplets, Wand2, Eraser, Download, Layers, History } from 'lucide-react';

const TOOL_META: Record<RetouchTool, { title: string; description: string; icon: ElementType; color: string }> = {
  face: { title: '修脸', description: '磨皮、瘦脸、五官精修与自然美颜', icon: Smile, color: 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' },
  color: { title: '调色', description: '曝光、色温、HSL 与色调曲线', icon: Palette, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  liquify: { title: '液化', description: '重塑轮廓、推脸、瘦身与局部变形', icon: Droplets, color: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800' },
  repair: { title: '修复', description: '祛痘、祛斑、祛皱与局部修补', icon: Wand2, color: 'text-violet-500 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800' },
  remove: { title: '消除', description: '去除杂物、路人、水印与背景干扰', icon: Eraser, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' },
  export: { title: '导出', description: '格式选择、质量压缩与批量导出', icon: Download, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
};

interface ParamPanelProps {
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
  externalPrompt?: string;
  onPromptConsumed?: () => void;
}

export default function ParamPanel({
  tool,
  state,
  dispatch,
  onSubmit,
  onSelectTemplate,
  onRestoreHistory,
  externalPrompt,
  onPromptConsumed,
}: ParamPanelProps) {
  const meta = TOOL_META[tool];
  const Icon = meta.icon;

  const handleSubmit = (prompt: string, options?: {
    tool?: RetouchTool;
    params?: Record<string, unknown>;
    regions?: Region[];
    referenceImages?: ReferenceImage[];
  }) => {
    onSubmit(prompt, {
      tool: state.selectedTool,
      ...options,
      referenceImages: options?.referenceImages || state.referenceImages,
    });
  };

  const isChatModel = state.selectedModel === 'glm-4.6v';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
        <div className={`p-2 rounded-lg border ${meta.color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{meta.title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Tool-specific panel */}
        <ToolPanel
          tool={tool}
          state={state}
          dispatch={dispatch}
          onSubmit={handleSubmit}
          externalPrompt={externalPrompt}
          onPromptConsumed={onPromptConsumed}
        />

        {/* Prompt */}
        <section>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            {isChatModel ? '分析指令' : '生成指令'}
          </h3>
          <PromptInput
            onSubmit={handleSubmit}
            isLoading={state.isLoading}
            externalPrompt={externalPrompt}
            onPromptConsumed={onPromptConsumed}
            placeholder={isChatModel ? '输入分析指令，如：描述这张图片的内容...' : '输入编辑指令，如：面部精修，保持自然质感...'}
          />
        </section>

        {/* Reference images */}
        <section>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">参考图</h3>
          <ReferenceImages
            images={state.referenceImages}
            onImagesChange={(images) => dispatch({ type: 'SET_REFERENCE_IMAGES', payload: images })}
          />
        </section>

        {/* Templates */}
        {onSelectTemplate && (
          <section>
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">提示词模板</h3>
            <TemplatePanel onSelectTemplate={onSelectTemplate} tool={tool} />
          </section>
        )}

        {/* History */}
        {onRestoreHistory && (
          <section>
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              编辑历史
            </h3>
            <HistoryPanel
              history={state.history}
              onRestore={onRestoreHistory}
              currentImage={state.currentImage}
              currentImageUrl={state.currentImageUrl}
            />
          </section>
        )}
      </div>
    </div>
  );
}
