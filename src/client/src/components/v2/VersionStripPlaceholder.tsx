import { GitBranch } from 'lucide-react';

export default function VersionStripPlaceholder() {
  return (
    <footer className="h-12 flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <GitBranch className="w-4 h-4" />
      <span>版本记录将在 VERSION-001 启用</span>
    </footer>
  );
}
