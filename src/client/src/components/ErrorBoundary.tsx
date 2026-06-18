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
              请尝试清除浏览器缓存后刷新页面，或点击下面按钮重新登录。
            </p>
            <pre className="text-xs bg-gray-100 p-3 rounded-lg overflow-auto mb-4 max-h-40">
              {this.state.error?.message || 'Unknown error'}
            </pre>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              清除缓存并刷新
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
