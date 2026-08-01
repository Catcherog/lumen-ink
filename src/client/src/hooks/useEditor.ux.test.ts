import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

import useEditor from './useEditor';
import type { HistoryEntry } from '../../../shared/types';

function makeFile(name: string): File {
  return new File(['image'], name, { type: 'image/jpeg' });
}

function entry(id: string, image: string): HistoryEntry {
  return {
    id,
    prompt: id,
    resultImage: image,
    resultMimeType: 'image/png',
    timestamp: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'confirm', {
    configurable: true,
    value: vi.fn(() => true),
  });
});

describe('R2 editor UX invariants', () => {
  it('requires confirmation before replacing a visible editing session', async () => {
    const { result } = renderHook(() => useEditor());
    await act(async () => {
      result.current.uploadImage({ base64: 'first', mimeType: 'image/jpeg', file: makeFile('first.jpg') });
    });

    const confirmMock = window.confirm as unknown as ReturnType<typeof vi.fn>;
    confirmMock.mockReturnValue(false);
    await act(async () => {
      const accepted = result.current.uploadImage({ base64: 'second', mimeType: 'image/jpeg', file: makeFile('second.jpg') });
      expect(accepted).toBe(false);
    });

    expect(result.current.state.originalImage).toBe('first');
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('history preview changes the viewer result without changing the editing base', async () => {
    const { result } = renderHook(() => useEditor());
    await act(async () => {
      result.current.uploadImage({ base64: 'base', mimeType: 'image/jpeg', file: makeFile('base.jpg') });
      result.current.dispatch({
        type: 'SET_RESULT',
        payload: { imageData: 'latest', mimeType: 'image/png', history: [entry('old', 'old'), entry('latest', 'latest')] },
      });
    });

    await act(async () => {
      result.current.viewHistory(entry('old', 'old'));
    });

    expect(result.current.state.currentImage).toBe('latest');
    expect(result.current.state.resultImage).toBe('old');
  });

  it('restoring history retains the selected entry and removes only later entries', async () => {
    const { result } = renderHook(() => useEditor());
    const history = [entry('one', 'one'), entry('two', 'two'), entry('three', 'three')];
    await act(async () => {
      result.current.dispatch({ type: 'LOAD_HISTORY', payload: history });
      result.current.restoreFromHistory(history[1], 1);
    });

    expect(result.current.state.history.map((item) => item.id)).toEqual(['one', 'two']);
    expect(result.current.state.currentImage).toBe('two');
    expect(result.current.state.resultImage).toBe('two');
  });
});
