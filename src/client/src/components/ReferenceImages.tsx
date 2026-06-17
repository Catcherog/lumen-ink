import { useState, useRef } from 'react';
import { validateImageFile, fileToBase64 } from '../utils/image';

interface ReferenceImage {
  base64: string;
  mimeType: string;
}

interface ReferenceImagesProps {
  images: ReferenceImage[];
  onImagesChange: (images: ReferenceImage[]) => void;
}

export default function ReferenceImages({ images, onImagesChange }: ReferenceImagesProps) {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddImages = async (files: FileList) => {
    setError(null);
    const newImages: ReferenceImage[] = [];

    for (let i = 0; i < files.length; i++) {
      if (images.length + newImages.length >= 14) {
        setError('最多上传 14 张参考图');
        break;
      }
      const file = files[i];
      const validationError = validateImageFile(file);
      if (validationError) {
        setError(validationError);
        continue;
      }
      const base64 = await fileToBase64(file);
      newImages.push({ base64, mimeType: file.type });
    }

    if (newImages.length > 0) {
      onImagesChange([...images, ...newImages]);
    }
  };

  const handleRemove = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const handleClick = () => fileInputRef.current?.click();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{images.length}/14 张</span>
        {images.length < 14 && (
          <button
            onClick={handleClick}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            + 添加参考图
          </button>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {images.map((img, index) => (
            <div key={index} className="relative group">
              <img
                src={`data:${img.mimeType};base64,${img.base64}`}
                alt={`参考图 ${index + 1}`}
                className="w-full h-16 object-cover rounded-md border border-gray-200"
              />
              <button
                onClick={() => handleRemove(index)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => {
          if (e.target.files) handleAddImages(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}
