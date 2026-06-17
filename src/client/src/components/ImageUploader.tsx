import { useState, useRef, useCallback } from 'react';
import { validateImageFile, fileToBase64 } from '../utils/image';

interface ImageUploaderProps {
  onImageUpload: (data: { base64: string; mimeType: string; file: File }) => void;
  currentImage?: string | null; // base64 or data URL for preview
  label?: string;
}

export default function ImageUploader({ onImageUpload, currentImage, label = '上传图片' }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    const base64 = await fileToBase64(file);
    onImageUpload({ base64, mimeType: file.type, file });
  }, [onImageUpload]);

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

  const handleClick = () => fileInputRef.current?.click();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full">
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-xl cursor-pointer transition-all
          ${isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'}
          ${currentImage ? 'p-2' : 'p-8'}
        `}
      >
        {currentImage ? (
          <img
            src={`data:image/png;base64,${currentImage}`}
            alt="预览"
            className="w-full h-auto max-h-96 object-contain rounded-lg"
          />
        ) : (
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-sm text-gray-600">{label}</p>
            <p className="mt-1 text-xs text-gray-400">拖拽图片到此处，或点击选择文件</p>
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
      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
