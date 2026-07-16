import { describe, it, expect } from 'vitest';
import { validateImageFile } from './image';

describe('validateImageFile', () => {
  it('accepts valid JPEG files within size limit', () => {
    const file = new File(['dummy'], 'test.jpg', { type: 'image/jpeg' });
    expect(validateImageFile(file)).toBeNull();
  });

  it('accepts valid PNG files within size limit', () => {
    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    expect(validateImageFile(file)).toBeNull();
  });

  it('accepts valid WebP files within size limit', () => {
    const file = new File(['dummy'], 'test.webp', { type: 'image/webp' });
    expect(validateImageFile(file)).toBeNull();
  });

  it('rejects unsupported file formats', () => {
    const file = new File(['dummy'], 'test.gif', { type: 'image/gif' });
    expect(validateImageFile(file)).toBe('不支持该格式，请上传 JPG/PNG/WebP 图片');
  });

  it('rejects files exceeding 20MB size limit', () => {
    const largeContent = new ArrayBuffer(21 * 1024 * 1024);
    const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
    expect(validateImageFile(file)).toBe('图片过大，请压缩后上传（最大 20MB）');
  });
});
