import {
  Image as ImageIcon,
  Columns,
  Download,
  Settings,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';

interface EditorHeaderProps {
  projectName: string;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onCompare?: () => void;
  onExport?: () => void;
  onSettings?: () => void;
  /** 无原图或无结果时为 false，按钮渲染为禁用态 */
  canCompare?: boolean;
  /** 无可导出图片结果（base64 或 URL）时为 false，按钮渲染为禁用态；纯文本结果不计入 */
  canExport?: boolean;
}

export default function EditorHeader({
  projectName,
  darkMode,
  onToggleTheme,
  onLogout,
  onCompare,
  onExport,
  onSettings,
  canCompare = false,
  canExport = false,
}: EditorHeaderProps) {
  const compareDisabled = !canCompare;
  const exportDisabled = !canExport;

  const baseBtnClass = (disabled: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
      disabled
        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-1.5 bg-blue-600 text-white rounded-lg flex-shrink-0">
          <ImageIcon className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-base lg:text-lg font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
            光砚
          </h1>
          <span className="text-gray-300 dark:text-gray-700 hidden sm:inline">|</span>
          <span
            className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px] sm:max-w-[240px] lg:max-w-[360px]"
            title={projectName}
          >
            {projectName}
          </span>
        </div>
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 flex-shrink-0">
          当前会话
        </span>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onCompare}
          disabled={compareDisabled}
          aria-disabled={compareDisabled}
          title={compareDisabled ? '需要原图与生成结果才能对比' : '对比'}
          className={baseBtnClass(compareDisabled)}
        >
          <Columns className="w-4 h-4" />
          <span className="hidden md:inline">对比</span>
        </button>

        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-disabled={exportDisabled}
          title={exportDisabled ? '暂无可导出的结果' : '导出'}
          className={baseBtnClass(exportDisabled)}
        >
          <Download className="w-4 h-4" />
          <span className="hidden md:inline">导出</span>
        </button>

        <button
          type="button"
          onClick={onSettings}
          title="设置"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden md:inline">设置</span>
        </button>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

        <button
          type="button"
          onClick={onToggleTheme}
          title={darkMode ? '浅色模式' : '深色模式'}
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onLogout}
          title="退出登录"
          className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
