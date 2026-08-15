/**
 * Responsive parameter panel tests for App.tsx.
 *
 * Verifies that the fixed right parameter panel only appears at >= 1280px
 * (Tailwind xl breakpoint, via matchMedia) and that the mobile/tablet drawer
 * toggle is shown below 1280px. Also verifies that Provider/Model selection
 * and Toolbar expand behavior remain unchanged.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

// --- Hoisted mock functions (must be hoisted for vi.mock factories) --------

const mocks = vi.hoisted(() => ({
  setProvider: vi.fn(),
  setModel: vi.fn(),
  setTool: vi.fn(),
  dispatch: vi.fn(),
  setShowApiSettings: vi.fn(),
  uploadImage: vi.fn(),
  submitEdit: vi.fn(),
  restoreFromHistory: vi.fn(),
  viewHistory: vi.fn(),
  deleteHistory: vi.fn(),
  importExternalResult: vi.fn(),
}));

// --- Mock useEditor hook ---------------------------------------------------

vi.mock('./hooks/useEditor', () => ({
  default: () => ({
    state: {
      originalImage: null,
      originalMimeType: 'image/jpeg',
      currentImage: null,
      currentImageUrl: null,
      currentMimeType: 'image/jpeg',
      resultImage: null,
      resultImageUrl: null,
      resultText: null,
      resultMimeType: 'image/png',
      isLoading: false,
      error: null,
      selectedModel: 'cogview-4-250304',
      history: [],
      referenceImages: [],
      selectedTool: 'face',
      selectedProvider: 'test-provider',
      showApiSettings: false,
    },
    dispatch: mocks.dispatch,
    uploadImage: mocks.uploadImage,
    submitEdit: mocks.submitEdit,
    restoreFromHistory: mocks.restoreFromHistory,
    viewHistory: mocks.viewHistory,
    deleteHistory: mocks.deleteHistory,
    setTool: mocks.setTool,
    setProvider: mocks.setProvider,
    setModel: mocks.setModel,
    setShowApiSettings: mocks.setShowApiSettings,
    importExternalResult: mocks.importExternalResult,
  }),
}));

// --- Mock axios ------------------------------------------------------------

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: [
        { id: 'test-provider', name: 'Test Provider', type: 'glm', enabled: true, isDefault: true, defaultModel: 'cogview-4-250304' },
        { id: 'alt-provider', name: 'Alt Provider', type: 'glm', enabled: true, isDefault: false, defaultModel: 'cogview-4-250304' },
      ],
    }),
    post: vi.fn(),
    defaults: { headers: { common: {} as Record<string, string> } },
    interceptors: {
      response: {
        use: vi.fn(() => 0),
        eject: vi.fn(),
      },
    },
  },
}));

// --- Mock child components (lightweight stubs) -----------------------------

vi.mock('./components/LoginPage', () => ({
  default: () => <div data-testid="login-page" />,
}));

vi.mock('./components/ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./components/Toolbar', () => ({
  default: ({ activeTool, expanded, onToggleExpand, className }: {
    activeTool: string; expanded: boolean; onToggleExpand?: () => void; className?: string;
  }) => (
    <div data-testid="toolbar" data-active-tool={activeTool} data-expanded={expanded ? 'true' : 'false'} className={className}>
      {onToggleExpand && <button data-testid="toolbar-expand-toggle" onClick={onToggleExpand} />}
    </div>
  ),
}));

vi.mock('./components/ParamPanel', () => ({
  default: () => <div data-testid="param-panel" />,
}));

vi.mock('./components/ResultViewer', () => ({
  default: () => <div data-testid="result-viewer" />,
}));

vi.mock('./components/ApiSettingsButton', () => ({
  default: ({ onClick }: { onClick: () => void }) => (
    <button data-testid="api-settings-button" onClick={onClick}>API</button>
  ),
}));

vi.mock('./components/ApiSettingsModal', () => ({
  default: () => <div data-testid="api-settings-modal" />,
}));

vi.mock('./components/ManualWorkflowDialog', () => ({
  default: () => <div data-testid="manual-workflow-dialog" />,
}));

// --- Import App after mocks ------------------------------------------------

import App from './App';

// --- matchMedia mock helper ------------------------------------------------

function createMatchMediaMock() {
  let currentMatches = false;
  const listeners = new Set<(e: { matches: boolean }) => void>();

  const mql = {
    get matches() { return currentMatches; },
    media: '(min-width: 1280px)',
    onchange: null,
    addEventListener: (event: string, listener: (e: { matches: boolean }) => void) => {
      if (event === 'change') listeners.add(listener);
    },
    removeEventListener: (event: string, listener: (e: { matches: boolean }) => void) => {
      if (event === 'change') listeners.delete(listener);
    },
    dispatchEvent: () => false,
    addListener: () => {},
    removeListener: () => {},
  };

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn(() => mql),
  });

  return {
    setMatches(matches: boolean) {
      currentMatches = matches;
      listeners.forEach((l) => l({ matches }));
    },
    get matches() { return currentMatches; },
  };
}

// --- Tests -----------------------------------------------------------------

describe('App responsive parameter panel', () => {
  let matchMediaMock: ReturnType<typeof createMatchMediaMock>;

  beforeEach(() => {
    matchMediaMock = createMatchMediaMock();
    localStorage.setItem('auth_token', 'test-token');
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('1024px (matchMedia false): no desktop panel, mobile toggle present', () => {
    matchMediaMock.setMatches(false);
    render(<App />);

    expect(screen.queryByTestId('desktop-param-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-param-panel-toggle')).toBeInTheDocument();
  });

  it('1279px (matchMedia false): no desktop panel, mobile toggle present', () => {
    matchMediaMock.setMatches(false);
    render(<App />);

    expect(screen.queryByTestId('desktop-param-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-param-panel-toggle')).toBeInTheDocument();
  });

  it('1280px (matchMedia true): desktop panel present, no mobile toggle', () => {
    matchMediaMock.setMatches(true);
    render(<App />);

    expect(screen.getByTestId('desktop-param-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-param-panel-toggle')).not.toBeInTheDocument();
  });

  it('1440px (matchMedia true): desktop panel present, no mobile toggle', () => {
    matchMediaMock.setMatches(true);
    render(<App />);

    expect(screen.getByTestId('desktop-param-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-param-panel-toggle')).not.toBeInTheDocument();
  });

  it('breakpoint change desktop -> mobile: UI switches correctly', async () => {
    matchMediaMock.setMatches(true);
    const { rerender } = render(<App />);

    expect(screen.getByTestId('desktop-param-panel')).toBeInTheDocument();

    matchMediaMock.setMatches(false);
    rerender(<App />);

    await waitFor(() => {
      expect(screen.queryByTestId('desktop-param-panel')).not.toBeInTheDocument();
      expect(screen.getByTestId('mobile-param-panel-toggle')).toBeInTheDocument();
    });
  });

  it('breakpoint change mobile -> desktop: UI switches correctly', async () => {
    matchMediaMock.setMatches(false);
    const { rerender } = render(<App />);

    expect(screen.getByTestId('mobile-param-panel-toggle')).toBeInTheDocument();

    matchMediaMock.setMatches(true);
    rerender(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('desktop-param-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('mobile-param-panel-toggle')).not.toBeInTheDocument();
    });
  });

  it('Provider select calls setProvider on change', async () => {
    matchMediaMock.setMatches(true);
    render(<App />);

    // Wait for providers to load and the Provider option to appear
    await screen.findByText('Test Provider');
    // Wait for both selects to be present (Provider + Model)
    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(2);
    });

    // Find the Provider select by its current displayed value ("Test Provider")
    const providerSelect = screen.getByDisplayValue('Test Provider');
    fireEvent.change(providerSelect, { target: { value: 'alt-provider' } });
    expect(mocks.setProvider).toHaveBeenCalledWith('alt-provider');
  });

  it('Model select calls setModel on change', async () => {
    matchMediaMock.setMatches(true);
    render(<App />);

    // Wait for providers (and thus models) to load
    await screen.findByText('Test Provider');
    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(2);
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'glm-image' } });
    expect(mocks.setModel).toHaveBeenCalledWith('glm-image');
  });

  it('Toolbar expand toggle available on desktop (>= 1280px)', () => {
    matchMediaMock.setMatches(true);
    render(<App />);

    expect(screen.queryByTestId('toolbar-expand-toggle')).toBeInTheDocument();
  });

  it('Toolbar expand toggle not available on mobile (< 1280px)', () => {
    matchMediaMock.setMatches(false);
    render(<App />);

    expect(screen.queryByTestId('toolbar-expand-toggle')).not.toBeInTheDocument();
  });

  it('Header still renders Provider label, Model label, API settings, dark mode, and logout', async () => {
    matchMediaMock.setMatches(true);
    render(<App />);

    // Wait for providers to load so the Model label (conditional on availableModels) renders
    await screen.findByText('Test Provider');
    await waitFor(() => {
      expect(screen.getAllByRole('combobox')).toHaveLength(2);
    });

    expect(screen.getByText('Provider：')).toBeInTheDocument();
    expect(screen.getByText('模型：')).toBeInTheDocument();
    expect(screen.getByTestId('api-settings-button')).toBeInTheDocument();
    // Dark mode and logout buttons exist as <button> elements with title attributes
    expect(screen.getByTitle('深色模式')).toBeInTheDocument();
    expect(screen.getByTitle('退出登录')).toBeInTheDocument();
  });
});
