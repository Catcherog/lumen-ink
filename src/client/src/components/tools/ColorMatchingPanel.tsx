import { useState } from 'react';
import type { ToolPanelProps } from './types';
import ReferenceImages from '../ReferenceImages';
import { Palette, Check } from 'lucide-react';

export default function ColorMatchingPanel({ state, onSubmit }: ToolPanelProps) {
  const [referenceImages, setReferenceImages] = useState(state.referenceImages.slice(0, 1));
  const [description, setDescription] = useState('');

  const hasReference = referenceImages.length > 0;

  const buildPrompt = (): string => {
    const styleAnchor = '85mm人像镜头，富士Pro 400H胶片模拟，低饱和高级色调，自然光影';
    const refClause = hasReference
      ? '参考上传的参考图，将整体色调、光影与质感调整至参考图风格。'
      : '根据以下文字描述调整整体色调与光影。';

    const modify = description.trim()
      ? `【修改】${refClause}补充要求：${description.trim()}。`
      : `【修改】${refClause}`;

    return [
      '【保留】保留原图人物特征、五官、姿势、构图、光影结构与细节不变。',
      modify,
      `【风格】${styleAnchor}。`,
      '【限制】不要改变人物五官和姿势，不要重绘背景，不要过度风格化，不要丢失原图细节。',
    ].join('\n');
  };

  const handleApply = () => {
    const prompt = buildPrompt();
    onSubmit(prompt, {
      tool: 'color',
      params: { description: description.trim(), hasReference },
      referenceImages: hasReference ? referenceImages : undefined,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Palette className="w-4 h-4 text-amber-500" />
        追色参考
      </div>

      <section>
        <h3 className="text-xs text-gray-500 dark:text-gray-400 mb-2">参考图（单张）</h3>
        <ReferenceImages images={referenceImages} onImagesChange={setReferenceImages} />
      </section>

      <section>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          补充描述（可选）
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={hasReference
            ? '例如：希望暗部偏青、高光偏暖、整体更通透...'
            : '例如：低饱和暖调、暗部偏青、电影感胶片色...'}
          rows={4}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
      </section>

      <button
        onClick={handleApply}
        disabled={state.isLoading}
        className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        {state.isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            处理中
          </>
        ) : (
          <>
            <Check className="w-4 h-4" />
            应用
          </>
        )}
      </button>
    </div>
  );
}
