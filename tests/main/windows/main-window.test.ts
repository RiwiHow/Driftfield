import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKSPACE_MIN_CONTENT_WIDTH } from '../../../src/shared/workspace-layout';

const {
  browserWindowOptions,
  nativeThemeState,
  setBackgroundColor,
  setTitleBarOverlay,
  setZoomFactor,
} = vi.hoisted(() => ({
  browserWindowOptions: vi.fn(),
  nativeThemeState: {
    dark: false,
    updatedHandlers: new Set<() => void>(),
  },
  setBackgroundColor: vi.fn(),
  setTitleBarOverlay: vi.fn(),
  setZoomFactor: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: class BrowserWindow {
    webContents = {
      id: 1,
      on: vi.fn(),
      openDevTools: vi.fn(),
      setZoomFactor,
      setWindowOpenHandler: vi.fn(),
    };

    constructor(options: unknown) {
      browserWindowOptions(options);
    }

    isDestroyed = vi.fn(() => false);
    loadURL = vi.fn(() => Promise.resolve());
    on = vi.fn();
    once = vi.fn();
    setBackgroundColor = setBackgroundColor;
    setTitleBarOverlay = setTitleBarOverlay;
    show = vi.fn();
  },
  nativeTheme: {
    get shouldUseDarkColors() {
      return nativeThemeState.dark;
    },
    off: vi.fn((_event: string, handler: () => void) => {
      nativeThemeState.updatedHandlers.delete(handler);
    }),
    on: vi.fn((_event: string, handler: () => void) => {
      nativeThemeState.updatedHandlers.add(handler);
    }),
  },
}));

import {
  createMainWindow,
  getMainWindowChromeOptions,
  updateMainWindowTheme,
  updateMainWindowZoom,
} from '../../../src/main/windows/main-window';

describe('main window', () => {
  beforeEach(() => {
    browserWindowOptions.mockClear();
    nativeThemeState.dark = false;
    nativeThemeState.updatedHandlers.clear();
    setBackgroundColor.mockClear();
    setTitleBarOverlay.mockClear();
    setZoomFactor.mockClear();
    vi.stubGlobal(
      'MAIN_WINDOW_VITE_DEV_SERVER_URL',
      'http://localhost:5173/',
    );
  });

  it('keeps the content area wide enough for all expanded workspace panels', () => {
    createMainWindow({
      onClose: vi.fn(),
      onClosed: vi.fn(),
      settingsService: {
        get: () => ({ theme: 'github-light', zoomPercent: 100 }),
      } as never,
    });

    expect(browserWindowOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        minWidth: WORKSPACE_MIN_CONTENT_WIDTH,
        useContentSize: true,
      }),
    );
  });

  it('applies the persisted interface zoom before loading the renderer', () => {
    createMainWindow({
      onClose: vi.fn(),
      onClosed: vi.fn(),
      settingsService: {
        get: () => ({ theme: 'github-light', zoomPercent: 125 }),
      } as never,
    });

    expect(setZoomFactor).toHaveBeenCalledWith(1.25);
  });

  it('converts a zoom percentage to Electron zoom factor', () => {
    const window = { webContents: { setZoomFactor: vi.fn() } };

    updateMainWindowZoom(window as never, 150);

    expect(window.webContents.setZoomFactor).toHaveBeenCalledWith(1.5);
  });

  it('integrates the renderer titlebar with the Windows caption controls', () => {
    expect(getMainWindowChromeOptions('win32', 'github-dark')).toEqual({
      autoHideMenuBar: true,
      titleBarOverlay: {
        color: '#151b23',
        height: 37,
        symbolColor: '#9198a1',
      },
      titleBarStyle: 'hidden',
    });
  });

  it('keeps the inset native titlebar on macOS', () => {
    expect(getMainWindowChromeOptions('darwin', 'github-dark')).toEqual({
      titleBarStyle: 'hiddenInset',
    });
  });

  it('updates Windows native chrome when the application theme changes', () => {
    const window = {
      setBackgroundColor: vi.fn(),
      setTitleBarOverlay: vi.fn(),
    };

    updateMainWindowTheme(window as never, 'github-light', 'win32');

    expect(window.setBackgroundColor).toHaveBeenCalledWith('#ffffff');
    expect(window.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#f6f8fa',
      height: 37,
      symbolColor: '#59636e',
    });
  });

  it('resolves a system theme preference for native chrome', () => {
    const window = {
      setBackgroundColor: vi.fn(),
      setTitleBarOverlay: vi.fn(),
    };

    updateMainWindowTheme(window as never, 'system', 'win32', true);

    expect(window.setBackgroundColor).toHaveBeenCalledWith('#0d1117');
    expect(window.setTitleBarOverlay).toHaveBeenCalledWith({
      color: '#151b23',
      height: 37,
      symbolColor: '#9198a1',
    });
  });

  it('updates a following window when the system appearance changes', () => {
    createMainWindow({
      onClose: vi.fn(),
      onClosed: vi.fn(),
      settingsService: {
        get: () => ({ theme: 'system', zoomPercent: 100 }),
      } as never,
    });

    expect(browserWindowOptions).toHaveBeenCalledWith(
      expect.objectContaining({ backgroundColor: '#ffffff' }),
    );

    nativeThemeState.dark = true;
    for (const handler of nativeThemeState.updatedHandlers) handler();

    expect(setBackgroundColor).toHaveBeenCalledWith('#0d1117');
  });
});
