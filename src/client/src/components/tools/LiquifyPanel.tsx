import { useState } from 'react';
import type { ToolPanelProps } from './types';
import { Droplets, Check } from 'lucide-react';

type LiquifyFeature = 'faceSmall' | 'jawLine' | 'noseShrink' | 'philtrumShort' | 'shoulderNarrow' | 'bodyShape';

interface FeatureState {
  enabled: boolean;
  strength: number;
}

const IDENTITY_ANCHOR = '参考图中的同一人，严格保留其面部骨骼结构、五官比例与辨识度，仅作为身份识别参考';
const PHOTO_ANCHOR = '85mm f/1.4人像镜头，柔光箱45度主光，自然肤色还原';
const LIGHTING_ANCHOR = '柔光箱45度主光，反光板补光，自然光比，轮廓光保留';
const QUALITY_ANCHOR = '五官端正，手指正确，无畸变，无水印，无文字';

const FEATURES: Array<{ key: LiquifyFeature; label: string }> = [
  { key: 'faceSmall', label: '小脸' },
  { key: 'jawLine', label: '下颌线收紧' },
  { key: 'noseShrink', label: '鼻翼缩小' },
  { key: 'philtrumShort', label: '人中缩短' },
  { key: 'shoulderNarrow', label: '肩部收窄' },
  { key: 'bodyShape', label: '身形微调' },
];

const LABEL_PHRASES: Record<LiquifyFeature, string> = {
  faceSmall: '小脸',
  jawLine: '下颌线收紧',
  noseShrink: '鼻翼缩小',
  philtrumShort: '人中缩短',
  shoulderNarrow: '肩部收窄',
  bodyShape: '身形微调',
};

function intensityAdjective(value: number): string {
  if (value < 30) return '液化轻微';
  if (value < 55) return '液化适度';
  if (value < 80) return '液化明显';
  return '液化大幅';
}

function buildPrompt(features: Record<LiquifyFeature, FeatureState>): string {
  const activeParts = FEATURES
    .filter(({ key }) => features[key].enabled)
    .map(({ key }) => {
      const adj = intensityAdjective(features[key].strength);
      return `${adj}${LABEL_PHRASES[key]}`;
    });

  const modify = activeParts.length > 0
    ? `【修改】${activeParts.join('，')}，保持自然比例。`
    : '【修改】保持面部轮廓与身形自然，不做明显调整。';

  return [
    `【身份锚定】${IDENTITY_ANCHOR}。`,
    '【保留】保留本人特征、五官辨识度、面部结构与原始构图背景不变。',
    modify,
    `【光影镜头】${LIGHTING_ANCHOR}。`,
    `【风格】自然液化塑形，${PHOTO_ANCHOR}。`,
    `【限制】不要网红脸，不要过度整形感，不要改变五官比例，不要扭曲背景，保持本人辨识度。${QUALITY_ANCHOR}。`,
  ].join('\n');
}

export default function LiquifyPanel({ state, onSubmit }: ToolPanelProps) {
  const [features, setFeatures] = useState<Record<LiquifyFeature, FeatureState>>(() => {
    const initial: Partial<Record<LiquifyFeature, FeatureState>> = {};
    for (const { key } of FEATURES) {
      initial[key] = { enabled: false, strength: 30 };
    }
    return initial as Record<LiquifyFeature, FeatureState>;
  });

  const toggleFeature = (key: LiquifyFeature) => {
    setFeatures((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const updateStrength = (key: LiquifyFeature, value: number) => {
    setFeatures((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: true, strength: value },
    }));
  };

  const handleApply = () => {
    const prompt = buildPrompt(features);
    const params = Object.fromEntries(
      FEATURES.map(({ key }) => [key, features[key]]),
    );
    onSubmit(prompt, { tool: 'liquify', params });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        <Droplets className="w-4 h-4 text-cyan-500" />
        液化塑形
      </div>

      <div className="space-y-3">
        {FEATURES.map(({ key, label }) => {
          const feature = features[key];
          return (
            <div
              key={key}
              className={`rounded-xl border p-3 transition-colors ${
                feature.enabled
                  ? 'bg-cyan-50/50 dark:bg-cyan-900/10 border-cyan-200 dark:border-cyan-800'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                <button
                  onClick={() => toggleFeature(key)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    feature.enabled ? 'bg-cyan-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      feature.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className={`flex items-center gap-3 ${feature.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={feature.strength}
                  onChange={(e) => updateStrength(key, Number(e.target.value))}
                  className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{feature.strength}</span>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleApply}
        disabled={state.isLoading}
        className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
