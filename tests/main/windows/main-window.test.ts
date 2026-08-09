import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKSPACE_MIN_CONTENT_WIDTH } from '../../../src/shared/workspace-layout';

const { browserWindowOptions } = vi.hoisted(() => ({
  browserWindowOptions: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: class BrowserWindow {
    webContents = {
      id: 1,
      on: vi.fn(),
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };

    constructor(options: unknown) {
      browserWindowOptions(options);
    }

    isDestroyed = vi.fn(() => false);
    loadURL = vi.fn(() => Promise.resolve());
    on = vi.fn();
    once = vi.fn();
    show = vi.fn();
  },
}));

import {
  createMainWindow,
  getMainWindowChromeOptions,
  updateMainWindowTheme,
} from '../../../src/main/windows/main-window';

describe('main window', () => {
  beforeEach(() => {
    browserWindowOptions.mockClear();
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
        get: () => ({ theme: 'github-light' }),
      } as never,
    });

    expect(browserWindowOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        minWidth: WORKSPACE_MIN_CONTENT_WIDTH,
        useContentSize: true,
      }),
    );
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
});
