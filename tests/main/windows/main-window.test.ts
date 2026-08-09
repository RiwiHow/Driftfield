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

import { createMainWindow } from '../../../src/main/windows/main-window';

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
});
