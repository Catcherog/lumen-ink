import { Settings } from 'lucide-react';

interface ApiSettingsButtonProps {
  onClick: () => void;
}

export default function ApiSettingsButton({ onClick }: ApiSettingsButtonProps) {
  return (
    <button
      onClick={onClick}
      title="API 设置"
      className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      <Settings className="w-4 h-4" />
      <span className="hidden sm:inline">API 设置</span>
    </button>
  );
}
