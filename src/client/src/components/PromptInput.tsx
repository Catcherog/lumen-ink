import { useState, useEffect } from 'react';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  placeholder?: string;
  externalPrompt?: string;
  onPromptConsumed?: () => void;
}

export default function PromptInput({ onSubmit, isLoading, placeholder = '输入编辑指令，如：面部精修，保持自然质感...', externalPrompt, onPromptConsumed }: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (externalPrompt) {
      setPrompt(externalPrompt);
      onPromptConsumed?.();
    }
  }, [externalPrompt, onPromptConsumed]);

  const handleSubmit = () => {
    if (!prompt.trim()) {
      setError('请输入编辑指令');
      return;
    }
    setError(null);
    onSubmit(prompt.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-2">
        <textarea
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={3}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400 text-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              处理中
            </span>
          ) : '提交'}
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
}
