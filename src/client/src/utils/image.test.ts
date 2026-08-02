import { describe, it, expect, vi } from 'vitest';
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

  it('opens the provider URL in a safe new window when CORS blocks the download', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const { downloadImageUrl } = await import('./image');

    await downloadImageUrl('https://provider.example/result.png', 'result.png');

    expect(fetchSpy).toHaveBeenCalledWith('https://provider.example/result.png');
    expect(openSpy).toHaveBeenCalledWith(
      'https://provider.example/result.png',
      '_blank',
      'noopener,noreferrer',
    );

    fetchSpy.mockRestore();
    openSpy.mockRestore();
  });

  it('downloads a provider URL as a browser-owned file when fetch succeeds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['result']), { status: 200, headers: { 'Content-Type': 'image/png' } }),
    );
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:result');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { downloadImageUrl } = await import('./image');

    await downloadImageUrl('https://provider.example/result.png', 'result.png');

    expect(fetchSpy).toHaveBeenCalledWith('https://provider.example/result.png');
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:result');

    fetchSpy.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    click.mockRestore();
  });

  it('does not open a new window for an explicit upstream HTTP failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream failed', { status: 502 }),
    );
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const { downloadImageUrl } = await import('./image');

    await expect(downloadImageUrl('https://provider.example/fail.png', 'result.png'))
      .rejects.toThrow('DOWNLOAD_FAILED');
    expect(openSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    openSpy.mockRestore();
  });
});
