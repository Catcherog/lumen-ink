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

const IDENTITY_ANCHOR = '参考图中的同一人，严格保留其面部骨骼结构、眼型、鼻型、唇形、下颌线，仅作为身份识别参考，不复制背景服装姿势';

const STYLE_ANCHOR = '85mm f/1.4人像镜头，柔光箱45度主光，反光板补光，眼神光保留，柯达Portra 400胶片模拟，自然肤色还原';

const QUALITY_ANCHOR = '五官端正，手指正确，无畸变，无水印，无文字';

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
  if (value < 30) return '肤色轻微提亮，D&B中性灰微调';
  if (value < 60) return '肤色提亮半档，曲线中间调上提';
  if (value < 85) return '肤色明显提亮一档，色相统一';
  return '肤色提亮一档半，明度层级丰富';
}

function smoothingPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '低频磨皮，保留高频纹理与毛孔';
  if (value < 60) return 'Portraiture级别中度磨皮，均匀肤色保留真实纹理';
  if (value < 85) return '中度磨皮并均匀肤色，保留皮肤纹理';
  return '较强磨皮同时尽量保留毛孔细节';
}

function faceSlimPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '液化轻微推下颌线，保持骨骼辨识度';
  if (value < 60) return '液化适度收紧下颌线，脸型更精致';
  if (value < 85) return '液化瘦脸一档，轮廓更精致';
  return '液化瘦脸一档半';
}

function eyeEnlargePhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '眼神光增强，眼白微提';
  if (value < 60) return '自然放大双眼，瞳孔细节保留';
  if (value < 85) return '明显放大双眼，虹膜清晰';
  return '显著放大双眼';
}

function blemishPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '去除少量明显瑕疵，污点修复';
  if (value < 60) return '去除痘印与暗沉，频率分离修复';
  if (value < 85) return '去除多数面部瑕疵';
  return '彻底清理瑕疵';
}

function sculptLightPhrase(value: number): string {
  if (value <= 0) return '';
  if (value < 30) return '保留并轻微强化面部立体光影，中性灰微调';
  if (value < 60) return '增强面部立体光影，明暗对比适中';
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
    `【身份锚定】${IDENTITY_ANCHOR}。`,
    '【保留】保留本人五官辨识度，保持原始构图和背景不变，保留真实皮肤纹理与毛孔。',
    modify,
    `【限制】${STYLE_ANCHOR}。不要网红脸，不要塑料皮，不要假白，不要过度磨皮，不要柔焦糊脸，不要改变五官比例。${QUALITY_ANCHOR}。`,
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
