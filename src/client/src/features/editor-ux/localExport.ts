export type ExportFormat = 'jpeg' | 'png' | 'webp';

export const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface LocalExportInput {
  imageData?: string | null;
  imageUrl?: string | null;
  sourceMimeType?: string | null;
  format: ExportFormat;
  quality: number;
  filenamePrefix?: string;
}

export function clampExportQuality(quality: number): number {
  if (!Number.isFinite(quality)) return 0.9;
  return Math.min(1, Math.max(0.5, quality / 100));
}

export function makeExportFilename(format: ExportFormat, prefix = 'lumen-ink'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const extension = format === 'jpeg' ? 'jpg' : format;
  return `${prefix}-${timestamp}.${extension}`;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('EXPORT_IMAGE_DECODE_FAILED'));
    image.src = src;
  });
}

async function resolveSource(input: LocalExportInput): Promise<{ src: string; revoke?: () => void }> {
  if (input.imageData) {
    const mimeType = input.sourceMimeType || 'image/png';
    return { src: `data:${mimeType};base64,${input.imageData}` };
  }

  if (!input.imageUrl) {
    throw new Error('EXPORT_SOURCE_MISSING');
  }

  let response: Response;
  try {
    response = await fetch(input.imageUrl, { mode: 'cors', credentials: 'omit' });
  } catch {
    throw new Error('EXPORT_REMOTE_CORS_FAILED');
  }
  if (!response.ok) {
    throw new Error(`EXPORT_REMOTE_HTTP_${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  return { src: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('EXPORT_ENCODING_FAILED'));
    }, mimeType, quality);
  });
}

export async function exportCurrentResult(input: LocalExportInput): Promise<string> {
  const source = await resolveSource(input);
  try {
    const image = await loadImage(source.src);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context || canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('EXPORT_CANVAS_UNAVAILABLE');
    }

    if (input.format === 'jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0);

    const blob = await canvasToBlob(
      canvas,
      EXPORT_MIME_TYPES[input.format],
      clampExportQuality(input.quality),
    );
    const filename = makeExportFilename(input.format, input.filenamePrefix);
    const downloadUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(downloadUrl);
    }
    return filename;
  } finally {
    source.revoke?.();
  }
}

export function localExportErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'EXPORT_SOURCE_MISSING') return '当前没有可导出的图片。';
  if (message === 'EXPORT_REMOTE_CORS_FAILED') return '远程结果不允许浏览器跨域读取，请先在新标签页保存原图后重新上传。';
  if (message.startsWith('EXPORT_REMOTE_HTTP_')) return '远程结果读取失败，请稍后重试或先保存原图。';
  if (message === 'EXPORT_IMAGE_DECODE_FAILED') return '图片解码失败，无法导出。';
  if (message === 'EXPORT_CANVAS_UNAVAILABLE' || message === 'EXPORT_ENCODING_FAILED') return '浏览器无法完成本地编码，请更换浏览器后重试。';
  return '本地导出失败，请稍后重试。';
}
