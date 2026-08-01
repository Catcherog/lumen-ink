import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-xl border border-red-200 p-6 max-w-md w-full">
            <h1 className="text-lg font-bold text-red-600 mb-2">页面加载出错</h1>
            <p className="text-sm text-gray-600 mb-4">
              请尝试重置本应用的登录与编辑缓存后刷新页面。其他网站数据不会被清除。
            </p>
            <pre className="text-xs bg-gray-100 p-3 rounded-lg overflow-auto mb-4 max-h-40">
              {this.state.error?.message || 'Unknown error'}
            </pre>
            <button
              onClick={() => {
                ['auth_token', 'edit_history', 'edit_history_backup'].forEach((key) => {
                  localStorage.removeItem(key);
                });
                window.location.reload();
              }}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              重置应用状态并刷新
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
