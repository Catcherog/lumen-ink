import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Star,
  Check,
  XCircle,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Shield,
  ShieldOff,
} from 'lucide-react';
import type { ProviderConfig, ProviderType } from '../../../shared/types';
import { PROVIDER_MODELS } from '../../../shared/types';
import { serializeError } from '../utils/error';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProvidersChanged?: () => void;
}

type FormData = {
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  enabled: boolean;
  isDefault: boolean;
};

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'glm', label: 'GLM' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'seedream', label: '即梦/Seedream' },
  { value: 'custom', label: '自定义' },
];

const ENV_KEY_HINTS: Record<ProviderType, string> = {
  glm: '留空则使用环境变量 GLM_API_KEY',
  gemini: '留空则使用环境变量 GEMINI_API_KEY',
  openai: '留空则使用环境变量 OPENAI_API_KEY',
  seedream: '留空则使用环境变量 SEEDREAM_API_KEY',
  jimeng: '',
  custom: '',
};

const EMPTY_FORM: FormData = {
  name: '',
  type: 'glm',
  apiKey: '',
  baseUrl: '',
  defaultModel: 'cogview-4-250304',
  enabled: true,
  isDefault: false,
};

export default function ApiSettingsModal({ isOpen, onClose, onProvidersChanged }: ApiSettingsModalProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  const notifyChanged = () => {
    onProvidersChanged?.();
  };

  const loadProviders = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/providers');
      setProviders(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (err: unknown) {
      setError(serializeError(err) || '加载 Provider 列表失败');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormErrors({});
    setShowApiKey(false);
    setHasApiKey(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    Promise.resolve().then(() => {
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFormErrors({});
      setShowApiKey(false);
      setHasApiKey(false);
      setError(null);
    });
    Promise.resolve().then(() => setLoading(true));
    axios
      .get('/api/providers')
      .then((res) => {
        setProviders(Array.isArray(res.data) ? res.data : []);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(serializeError(err) || '加载 Provider 列表失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) errors.name = '名称必填';
    if (!form.type) errors.type = '类型必填';
    if (!form.defaultModel.trim()) errors.defaultModel = '默认模型必填';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      setError(null);
      const payload: Partial<FormData> & Omit<FormData, 'apiKey'> = { ...form };
      if (editingId && editingId !== 'new' && !payload.apiKey?.trim()) {
        delete payload.apiKey;
      }
      if (editingId && editingId !== 'new') {
        await axios.put(`/api/providers/${editingId}`, payload);
      } else {
        await axios.post('/api/providers', payload);
      }
      await loadProviders();
      resetForm();
      notifyChanged();
    } catch (err: unknown) {
      setError(serializeError(err) || '保存 Provider 失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除该 Provider？')) return;
    try {
      setLoading(true);
      setError(null);
      await axios.delete(`/api/providers/${id}`);
      if (editingId === id) resetForm();
      await loadProviders();
      notifyChanged();
    } catch (err: unknown) {
      setError(serializeError(err) || '删除 Provider 失败');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (provider: ProviderConfig) => {
    try {
      setLoading(true);
      setError(null);
      await axios.put(`/api/providers/${provider.id}`, { enabled: !provider.enabled });
      await loadProviders();
      notifyChanged();
    } catch (err: unknown) {
      setError(serializeError(err) || '更新状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await axios.patch(`/api/providers/${id}/default`);
      await loadProviders();
      notifyChanged();
    } catch (err: unknown) {
      setError(serializeError(err) || '设置默认 Provider 失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (provider: ProviderConfig) => {
    setEditingId(provider.id);
    setForm({
      name: provider.name,
      type: provider.type,
      apiKey: '',
      baseUrl: provider.baseUrl || '',
      defaultModel: provider.defaultModel,
      enabled: provider.enabled,
      isDefault: !!provider.isDefault,
    });
    setFormErrors({});
    setShowApiKey(false);
    setHasApiKey(!!provider.hasApiKey);
    setError(null);
  };

  const handleAddNew = () => {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowApiKey(false);
    setHasApiKey(false);
    setError(null);
  };

  const updateForm = (field: keyof FormData, value: string | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'type' && typeof value === 'string') {
        const models = PROVIDER_MODELS[value as ProviderType] || [];
        if (models.length > 0 && !models.some((m) => m.value === prev.defaultModel)) {
          next.defaultModel = models[0].value;
        }
      }
      if (field === 'isDefault' && value === true) {
        // 勾选设为默认时，保持启用状态
        next.enabled = true;
      }
      return next;
    });
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const isEditingExisting = editingId && editingId !== 'new';
  const apiKeyPlaceholder = isEditingExisting
    ? (hasApiKey ? '留空则不修改' : '输入 API Key')
    : (ENV_KEY_HINTS[form.type] || '输入 API Key（可选）');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API 设置</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!editingId && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Provider 列表</h3>
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                添加 Provider
              </button>
            </div>
          )}

          {editingId && (
            <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-5">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                {editingId === 'new' ? '添加 Provider' : '编辑 Provider'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="例如：默认 GLM"
                  />
                  {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    类型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => updateForm('type', e.target.value as ProviderType)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {PROVIDER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {formErrors.type && <p className="mt-1 text-xs text-red-500">{formErrors.type}</p>}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    默认模型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.defaultModel}
                    onChange={(e) => updateForm('defaultModel', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {PROVIDER_MODELS[form.type]?.length ? (
                      PROVIDER_MODELS[form.type].map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))
                    ) : (
                      <option value="">请先选择类型</option>
                    )}
                  </select>
                  {formErrors.defaultModel && <p className="mt-1 text-xs text-red-500">{formErrors.defaultModel}</p>}
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      API Key
                    </label>
                    {isEditingExisting && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                        hasApiKey
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                      }`}>
                        {hasApiKey ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                        {hasApiKey ? '已设置' : '未设置'}
                      </span>
                    )}
                    {ENV_KEY_HINTS[form.type] && (
                      <span className="text-gray-400 dark:text-gray-500 font-normal text-xs">{ENV_KEY_HINTS[form.type]}</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={form.apiKey}
                      onChange={(e) => updateForm('apiKey', e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder={apiKeyPlaceholder}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      title={showApiKey ? '隐藏' : '显示'}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {formErrors.apiKey && <p className="mt-1 text-xs text-red-500">{formErrors.apiKey}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Base URL（可选）
                  </label>
                  <input
                    type="text"
                    value={form.baseUrl}
                    onChange={(e) => updateForm('baseUrl', e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="例如：https://open.bigmodel.cn/api/paas/v4"
                  />
                </div>

                <div className="flex items-center gap-4 sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="provider-enabled"
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => updateForm('enabled', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">启用该 Provider</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      id="provider-default"
                      type="checkbox"
                      checked={form.isDefault}
                      onChange={(e) => updateForm('isDefault', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">设为默认 Provider</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  保存
                </button>
              </div>
            </div>
          )}

          {!editingId && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {providers.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  暂无 Provider，点击右上角添加
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">名称</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">类型</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">默认模型</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">Key</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">状态</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-gray-300">默认</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {providers.map((provider) => (
                      <tr key={provider.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{provider.name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{provider.type}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{provider.defaultModel}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                            provider.hasApiKey
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                          }`}>
                            {provider.hasApiKey ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                            {provider.hasApiKey ? '已设置' : '未设置'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleToggleEnabled(provider)}
                            disabled={loading}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                              provider.enabled
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                            }`}
                          >
                            {provider.enabled ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {provider.enabled ? '启用' : '禁用'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleSetDefault(provider.id)}
                            disabled={loading || provider.isDefault}
                            className={`p-1.5 rounded-lg transition-colors ${
                              provider.isDefault
                                ? 'text-yellow-500'
                                : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                            title={provider.isDefault ? '当前默认' : '设为默认'}
                          >
                            <Star className={`w-4 h-4 ${provider.isDefault ? 'fill-current' : ''}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(provider)}
                              disabled={loading}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="编辑"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(provider.id)}
                              disabled={loading}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
