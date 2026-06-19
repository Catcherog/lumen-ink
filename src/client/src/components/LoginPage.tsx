import { useState } from 'react';
import axios from 'axios';
import { serializeError } from '../utils/error';

interface LoginPageProps {
  onLogin: (token: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('请输入密码');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/auth', { password });
      if (response.data.success && response.data.token) {
        onLogin(response.data.token);
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: unknown }; message?: string };
      const serverData = axiosError.response?.data;
      const msg = serverData !== undefined
        ? serializeError(serverData)
        : axiosError.message || '登录失败';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">GLM 图像编辑器</h1>
        <p className="text-sm text-gray-500 text-center mb-6">请输入密码以访问</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="输入访问密码"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3"
            autoFocus
          />

          {error && (
            <p className="text-sm text-red-500 mb-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {isLoading ? '验证中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
