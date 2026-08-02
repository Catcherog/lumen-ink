import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { PROVIDER_MODELS } from '../../../shared/types';
import type { EphemeralProviderConfig } from '../../../shared/types';

type EphemeralProviderType = EphemeralProviderConfig['type'];

interface EphemeralProviderSettingsProps {
  isOpen: boolean;
  value: EphemeralProviderConfig;
  onChange: (value: EphemeralProviderConfig) => void;
  onClose: () => void;
}

const PROVIDER_TYPES: Array<{ value: EphemeralProviderType; label: string }> = [
  { value: 'seedream', label: '即梦 Seedream' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'glm', label: 'GLM' },
];

export default function EphemeralProviderSettings({
  isOpen,
  value,
  onChange,
  onClose,
}: EphemeralProviderSettingsProps) {
  const [draftKey, setDraftKey] = useState('');

  useEffect(() => {
    if (isOpen) setDraftKey('');
  }, [isOpen]);

  if (!isOpen) return null;

  const models = PROVIDER_MODELS[value.type] ?? [];

  const handleTypeChange = (type: EphemeralProviderType) => {
    const nextModel = PROVIDER_MODELS[type]?.[0]?.value ?? '';
    onChange({ ...value, type, defaultModel: nextModel });
  };

  const handleSave = () => {
    onChange({ ...value, apiKey: draftKey.trim() || value.apiKey });
    onClose();
  };

  const handleClear = () => {
    setDraftKey('');
    onChange({ ...value, apiKey: '' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ephemeral-settings-title"
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 id="ephemeral-settings-title" className="font-semibold text-gray-900 dark:text-gray-100">
              临时编辑设置
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">API Key 只保留在本次页面会话内</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭设置" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Provider</span>
            <select
              value={value.type}
              onChange={(event) => handleTypeChange(event.target.value as EphemeralProviderType)}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              {PROVIDER_TYPES.map((provider) => (
                <option key={provider.value} value={provider.value}>{provider.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">模型</span>
            <select
              value={value.defaultModel}
              onChange={(event) => onChange({ ...value, defaultModel: event.target.value })}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            >
              {models.map((model) => (
                <option key={model.value} value={model.value}>{model.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">API Key</span>
            <div className="relative mt-1">
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="password"
                value={draftKey}
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder={value.apiKey ? '当前会话已有 Key，留空保持不变' : '输入 Provider API Key'}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            {value.apiKey && <p className="mt-1 text-xs text-emerald-600">当前会话已配置 Key，不会回显完整内容</p>}
          </label>

          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            临时展示模式不会保存项目、历史或 Key。刷新页面后需要重新输入；编辑结果请使用“下载结果”保存到本地。
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={handleClear} className="text-xs text-red-600 hover:text-red-700">
              清除当前 Key
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                取消
              </button>
              <button type="button" onClick={handleSave} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                保存到本次会话
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
