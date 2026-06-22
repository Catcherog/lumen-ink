import { useRef, useEffect, useState, useCallback } from 'react';
import type { Region } from '../../../../shared/types';
import { Trash2 } from 'lucide-react';

export interface CanvasRegionSelectorProps {
  imageSrc?: string;
  regions: Region[];
  onChange: (regions: Region[]) => void;
  mode?: 'rect' | 'brush';
  brushSize?: number;
  readOnly?: boolean;
}

interface Point {
  x: number;
  y: number;
}

export default function CanvasRegionSelector({
  imageSrc,
  regions,
  onChange,
  mode = 'rect',
  brushSize = 30,
  readOnly = false,
}: CanvasRegionSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [rectPreview, setRectPreview] = useState<Region | null>(null);
  const [brushPath, setBrushPath] = useState<Point[]>([]);

  const toImageCoords = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || img.naturalWidth === 0) return null;

    const rect = canvas.getBoundingClientRect();
    const displayX = clientX - rect.left;
    const displayY = clientY - rect.top;
    const scale = img.naturalWidth / rect.width;

    let x = displayX * scale;
    let y = displayY * scale;

    x = Math.max(0, Math.min(x, img.naturalWidth));
    y = Math.max(0, Math.min(y, img.naturalHeight));
    return { x, y };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const lineWidth = Math.max(2, img.naturalWidth / 300);

    // Existing regions
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.85)';
    ctx.lineWidth = lineWidth;

    for (const r of regions) {
      ctx.fillRect(r.x, r.y, r.width, r.height);
      ctx.strokeRect(r.x, r.y, r.width, r.height);
    }

    // Rect preview
    if (rectPreview) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
      ctx.fillRect(rectPreview.x, rectPreview.y, rectPreview.width, rectPreview.height);
      ctx.strokeRect(rectPreview.x, rectPreview.y, rectPreview.width, rectPreview.height);
    }

    // Brush preview path
    if (brushPath.length > 1) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(brushPath[0].x, brushPath[0].y);
      for (let i = 1; i < brushPath.length; i++) {
        ctx.lineTo(brushPath[i].x, brushPath[i].y);
      }
      ctx.stroke();
    }
  }, [regions, rectPreview, brushPath, brushSize]);

  // Load image
  useEffect(() => {
    if (!imageSrc) {
      imageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      draw();
    };
    img.src = imageSrc;
  }, [imageSrc, draw]);

  // Redraw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly || !imageSrc) return;
    const pos = toImageCoords(e.clientX, e.clientY);
    if (!pos) return;

    setIsDrawing(true);
    if (mode === 'rect') {
      setRectStart(pos);
      setRectPreview({ x: pos.x, y: pos.y, width: 0, height: 0 });
    } else {
      setBrushPath([pos]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readOnly || !isDrawing) return;
    const pos = toImageCoords(e.clientX, e.clientY);
    if (!pos) return;

    if (mode === 'rect' && rectStart) {
      const x = Math.min(rectStart.x, pos.x);
      const y = Math.min(rectStart.y, pos.y);
      const width = Math.abs(pos.x - rectStart.x);
      const height = Math.abs(pos.y - rectStart.y);
      setRectPreview({ x, y, width, height });
    } else if (mode === 'brush') {
      setBrushPath((prev) => {
        const last = prev[prev.length - 1];
        if (!last) return [pos];
        const dx = pos.x - last.x;
        const dy = pos.y - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < brushSize / 4) return prev;
        return [...prev, pos];
      });
    }
  };

  const finalizeRect = useCallback(() => {
    if (rectPreview && rectPreview.width > 2 && rectPreview.height > 2) {
      onChange([...regions, { ...rectPreview, label: `区域 ${regions.length + 1}` }]);
    }
    setRectPreview(null);
    setRectStart(null);
    setIsDrawing(false);
  }, [rectPreview, regions, onChange]);

  const finalizeBrush = useCallback(() => {
    if (brushPath.length === 0) {
      setIsDrawing(false);
      return;
    }

    let minX = brushPath[0].x;
    let minY = brushPath[0].y;
    let maxX = brushPath[0].x;
    let maxY = brushPath[0].y;

    for (const p of brushPath) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const half = brushSize / 2;
    const region: Region = {
      x: Math.max(0, minX - half),
      y: Math.max(0, minY - half),
      width: maxX - minX + brushSize,
      height: maxY - minY + brushSize,
      label: `涂抹 ${regions.length + 1}`,
    };

    onChange([...regions, region]);
    setBrushPath([]);
    setIsDrawing(false);
  }, [brushPath, brushSize, regions, onChange]);

  const handleMouseUp = () => {
    if (readOnly || !isDrawing) return;
    if (mode === 'rect') {
      finalizeRect();
    } else {
      finalizeBrush();
    }
  };

  const handleMouseLeave = () => {
    if (readOnly || (mode === 'rect' && isDrawing)) {
      finalizeRect();
    }
  };

  const handleClear = () => {
    onChange([]);
    setRectPreview(null);
    setBrushPath([]);
    setIsDrawing(false);
  };

  return (
    <div className="w-full">
      <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
        {imageSrc ? (
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            className="w-full h-auto block cursor-crosshair"
          />
        ) : (
          <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-gray-400">
            请先上传图片以使用区域选择
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          已选 {regions.length} 个区域
        </span>
        {!readOnly && (
          <button
            onClick={handleClear}
            disabled={regions.length === 0}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清除
          </button>
        )}
      </div>
    </div>
  );
}
