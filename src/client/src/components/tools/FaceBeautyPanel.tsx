import { useState } from 'react';
import type { ToolPanelProps } from './types';
import { Sparkles, Check } from 'lucide-react';

interface FaceParams {
  skinBrightness: number;
  smoothing: number;
  faceSlim: number;
  eyeEnlarge: number;
  blemish: number;
  sculptLight: number;
}

type PresetKey = 'natural' | 'refined' | 'premium';
type ActivePreset = PresetKey | 'custom';

const PHOTO_ANCHOR = '85mm人像镜头，柔光箱布光，柯达Portra 400胶片模拟';

const PRESETS: Record<PresetKey, FaceParams> = {
  natural: { skinBrightness: 20, smoothing: 20, faceSlim: 20, eyeEnlarge: 10, blemish: 30, sculptLight: 20 },
  refined: { skinBrightness: 50, smoothing: 40, faceSlim: 50, eyeEnlarge: 40, blemish: 50, sculptLight: 50 },
  premium: { skinBrightness: 80, smoothing: 60, faceSlim: 80, eyeEnlarge: 60, blemish: 80, sculptLight: 70 },
};

const SLIDERS: Array<{ key: keyof FaceParams; label: string }> = [
  { key: 'skinBrightness', label: '肤色提亮' },
  { key: 'smoothing', label: '磨皮强度' },
  { key: 'faceSlim', label: '瘦脸' },
  { key: 'eyeEnlarge', label: '大眼' },
  { key: 'blemish', label: '去瑕疵' },
  { key: 'sculptLight', label: '立体光影' },
];

function skinBrightnessPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '肤色轻微提亮';
  if (value < 60) return '肤色提亮半档';
  if (value < 85) return '肤色明显提亮一档';
  return '肤色提亮一档半';
}

function smoothingPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '轻微软化并均匀肤色，保留毛孔';
  if (value < 60) return '均匀肤色并柔化轻微瑕疵，保留真实纹理';
  if (value < 85) return '中度磨皮并均匀肤色，保留皮肤纹理';
  return '较强磨皮同时尽量保留毛孔细节';
}

function faceSlimPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '脸型轻微收紧';
  if (value < 60) return '下颌线轻微收紧，脸型更精致';
  if (value < 85) return '瘦脸一档，轮廓更精致';
  return '瘦脸一档半';
}

function eyeEnlargePhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '双眼自然提亮';
  if (value < 60) return '自然放大双眼';
  if (value < 85) return '明显放大双眼';
  return '显著放大双眼';
}

function blemishPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '去除少量明显瑕疵';
  if (value < 60) return '去除痘印与暗沉';
  if (value < 85) return '去除多数面部瑕疵';
  return '彻底清理瑕疵';
}

function sculptLightPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '保留并轻微强化面部立体光影';
  if (value < 60) return '增强面部立体光影';
  if (value < 85) return '明显增强面部立体光影';
  return '强烈增强面部立体光影';
}

function buildPrompt(params: FaceParams): string {
  const parts = [
    skinBrightnessPhrase(params.skinBrightness),
    smoothingPhrase(params.smoothing),
    faceSlimPhrase(params.faceSlim),
    eyeEnlargePhrase(params.eyeEnlarge),
    blemishPhrase(params.blemish),
    sculptLightPhrase(params.sculptLight),
  ].filter(Boolean);

  const modify = parts.length > 0 ? `【修改】${parts.join('，')}。` : '【修改】保持整体自然优化。';

  return [
    '【保留】保留本人特征与五官辨识度，保持原始构图和背景不变，保留真实皮肤纹理与毛孔。',
    modify,
    `【风格】韩系高级奶油肌，${PHOTO_ANCHOR}。`,
    '【限制】不要网红脸，不要塑料皮，不要假白，不要过度磨皮，不要柔焦糊脸，不要改变五官比例。',
  ].join('\n');
}

export default function FaceBeautyPanel({ state, onSubmit }: ToolPanelProps) {
  const [params, setParams] = useState<FaceParams>({ ...PRESETS.natural });
  const [activePreset, setActivePreset] = useState<ActivePreset>('natural');

  const update = (key: keyof FaceParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setActivePreset('custom');
  };

  const applyPreset = (preset: 'natural' | 'refined' | 'premium') => {
    setParams({ ...PRESETS[preset] });
    setActivePreset(preset);
  };

  const handleApply = () => {
    const prompt = buildPrompt(params);
    onSubmit(prompt, { tool: 'face', params: { ...params, preset: activePreset === 'custom' ? undefined : activePreset } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Sparkles className="w-4 h-4 text-rose-500" />
        人脸美化参数
      </div>

      <div className="flex gap-2">
        {(['natural', 'refined', 'premium'] as PresetKey[]).map((preset) => (
          <button
            key={preset}
            onClick={() => applyPreset(preset)}
            className={`
              flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs rounded-lg border transition-colors
              ${activePreset === preset
                ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}
            `}
          >
            {activePreset === preset && <Check className="w-3 h-3" />}
            {preset === 'natural' && '自然'}
            {preset === 'refined' && '精致'}
            {preset === 'premium' && '高定'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {SLIDERS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-700 dark:text-gray-300">{label}</label>
              <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{params[key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={params[key]}
              onChange={(e) => update(key, Number(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleApply}
        disabled={state.isLoading}
        className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        {state.isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            处理中
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            应用
          </>
        )}
      </button>
    </div>
  );
}
