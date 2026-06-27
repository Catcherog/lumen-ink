import { useState, useRef, useCallback } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  ExternalLink,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import { validateImageFile, fileToBase64 } from '../utils/image';

interface ManualWorkflowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: { base64: string; mimeType: string; prompt: string }) => void;
  currentImage: string | null;
  currentImageUrl: string | null;
  currentMimeType: string;
  currentPrompt: string;
}

export default function ManualWorkflowDialog({
  isOpen,
  onClose,
  onImport,
  currentImage,
  currentImageUrl,
  currentMimeType,
  currentPrompt,
}: ManualWorkflowDialogProps) {
  const [uploadedResult, setUploadedResult] = useState<{ base64: string; mimeType: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasImage = !!(currentImage || currentImageUrl);
  const previewSrc = currentImage
    ? `data:${currentMimeType};base64,${currentImage}`
    : currentImageUrl || '';
  const downloadUrl = currentImage
    ? `data:${currentMimeType};base64,${currentImage}`
    : currentImageUrl || '';
  const downloadExt = (currentMimeType.split('/')[1] || 'png').replace('jpeg', 'jpg');

  const handleCopyPrompt = useCallback(async () => {
    if (!currentPrompt) return;
    try {
      await navigator.clipboard.writeText(currentPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; ignore silently
    }
  }, [currentPrompt]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    const base64 = await fileToBase64(file);
    setUploadedResult({ base64, mimeType: file.type });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so selecting the same file again re-triggers change
    e.target.value = '';
  };

  const handleConfirm = () => {
    if (!uploadedResult) return;
    onImport({
      base64: uploadedResult.base64,
      mimeType: uploadedResult.mimeType,
      prompt: currentPrompt,
    });
    setUploadedResult(null);
    setError(null);
  };

  const handleClose = () => {
    setUploadedResult(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">导出到 Gemini</h2>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-300">
              <span>{error}</span>
            </div>
          )}

          {/* Current image preview */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">当前图片</h3>
            {hasImage ? (
              <div className="flex items-start gap-4">
                <img
                  src={previewSrc}
                  alt="当前图片"
                  className="max-h-[200px] w-auto rounded-lg border border-gray-200 dark:border-gray-700 object-contain"
                />
                <a
                  href={downloadUrl}
                  download={`image-${Date.now()}.${downloadExt}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  下载图片
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                <ImageIcon className="w-4 h-4" />
                <span>请先在主界面上传图片</span>
              </div>
            )}
          </section>

          {/* Prompt */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prompt</h3>
            <div className="relative">
              <textarea
                value={currentPrompt}
                readOnly
                rows={3}
                placeholder="（暂无 prompt，请在主界面输入编辑指令）"
                className="w-full px-3 py-2 pr-24 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-gray-100 resize-none focus:outline-none"
              />
              <button
                onClick={handleCopyPrompt}
                disabled={!currentPrompt}
                title="复制 prompt"
                className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </section>

          {/* Open Gemini */}
          <section>
            <a
              href="https://gemini.google.com/app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              打开 gemini.google.com
            </a>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              在 Gemini 中粘贴 prompt 并上传图片，生成后下载结果图回到这里
            </p>
          </section>

          {/* Result upload */}
          <section>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">导入生成结果</h3>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
              } ${uploadedResult ? 'p-2' : 'p-5'}`}
            >
              {uploadedResult ? (
                <img
                  src={`data:${uploadedResult.mimeType};base64,${uploadedResult.base64}`}
                  alt="结果预览"
                  className="w-full h-auto max-h-48 object-contain rounded-lg"
                />
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">拖拽结果图到此处，或点击选择文件</p>
                  <p className="mt-1 text-xs text-gray-400">支持 JPG/PNG/WebP，最大 20MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleInputChange}
                className="hidden"
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!uploadedResult}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="w-4 h-4" />
            确认导入
          </button>
        </div>
      </div>
    </div>
  );
}
