interface HistoryItem {
  id: string;
  prompt: string;
  resultImageUrl?: string;
  resultImage?: string; // base64
  resultMimeType?: string;
  text?: string;
  timestamp: number;
}

interface HistoryPanelProps {
  history: HistoryItem[];
  onRestore: (entry: HistoryItem, index: number) => void;
  currentImage?: string | null;
}

export default function HistoryPanel({ history, onRestore, currentImage }: HistoryPanelProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        <p>暂无历史记录</p>
        <p className="mt-1 text-xs">生成后历史记录将显示在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((entry, index) => (
        <div
          key={entry.id}
          onClick={() => onRestore(entry, index)}
          className={`
            flex gap-3 p-2 rounded-lg cursor-pointer transition-colors
            ${entry.resultImage === currentImage
              ? 'bg-blue-50 border border-blue-200'
              : 'hover:bg-gray-50 border border-transparent'}
          `}
        >
          {entry.resultImage ? (
            <img
              src={`data:${entry.resultMimeType || 'image/png'};base64,${entry.resultImage}`}
              alt={`生成 ${index + 1}`}
              className="w-12 h-12 object-cover rounded-md flex-shrink-0"
            />
          ) : entry.resultImageUrl ? (
            <img
              src={entry.resultImageUrl}
              alt={`生成 ${index + 1}`}
              className="w-12 h-12 object-cover rounded-md flex-shrink-0"
            />
          ) : entry.text ? (
            <div className="w-12 h-12 rounded-md flex-shrink-0 bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500">第 {index + 1} 轮</p>
            <p className="text-sm text-gray-700 truncate">{entry.prompt}</p>
            <p className="text-xs text-gray-400">
              {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
