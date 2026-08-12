import {
  app,
  BrowserWindow,
  nativeTheme,
  type BrowserWindowConstructorOptions,
  type Event,
} from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { WORKSPACE_MIN_CONTENT_WIDTH } from '../../shared/workspace-layout';
import {
  APP_THEME_WINDOW_BACKGROUNDS,
  APP_THEME_WINDOW_CHROME,
  type AppTheme,
  type AppThemePreference,
  resolveAppTheme,
} from '../../shared/theme-contract';
import type { AppZoomPercent } from '../../shared/contracts/settings';
import type { SettingsService } from '../services/settings-service';
import {
  createRendererNavigationPolicy,
  type RendererNavigationPolicy,
} from './navigation-policy';

interface CreateMainWindowOptions {
  onClose: (window: BrowserWindow, event: Event) => void;
  onClosed: (webContentsId: number) => void;
  settingsService: SettingsService;
}

interface MainWindowRegistration {
  navigationPolicy: RendererNavigationPolicy;
  window: BrowserWindow;
}

// Keep the native overlay one CSS pixel shorter than the renderer titlebar so
// its bottom border remains visible beneath the Windows caption controls.
const WINDOWS_CAPTION_CONTROL_HEIGHT = 37;

export const getMainWindowChromeOptions = (
  platform: NodeJS.Platform,
  theme: AppTheme,
): Pick<
  BrowserWindowConstructorOptions,
  'autoHideMenuBar' | 'titleBarOverlay' | 'titleBarStyle'
> => {
  if (platform !== 'win32') {
    return { titleBarStyle: 'hiddenInset' };
  }

  const chrome = APP_THEME_WINDOW_CHROME[theme];
  return {
    autoHideMenuBar: true,
    titleBarOverlay: {
      color: chrome.background,
      height: WINDOWS_CAPTION_CONTROL_HEIGHT,
      symbolColor: chrome.symbol,
    },
    titleBarStyle: 'hidden',
  };
};

export const updateMainWindowTheme = (
  window: BrowserWindow,
  preference: AppThemePreference,
  platform: NodeJS.Platform = process.platform,
  prefersDark: boolean = nativeTheme.shouldUseDarkColors,
): void => {
  const theme = resolveAppTheme(preference, prefersDark);
  window.setBackgroundColor(APP_THEME_WINDOW_BACKGROUNDS[theme]);
  if (platform === 'win32') {
    const chrome = APP_THEME_WINDOW_CHROME[theme];
    window.setTitleBarOverlay({
      color: chrome.background,
      height: WINDOWS_CAPTION_CONTROL_HEIGHT,
      symbolColor: chrome.symbol,
    });
  }
};

export const updateMainWindowZoom = (
  window: BrowserWindow,
  zoomPercent: AppZoomPercent,
): void => {
  window.webContents.setZoomFactor(zoomPercent / 100);
};

export const createMainWindow = ({
  onClose,
  onClosed,
  settingsService,
}: CreateMainWindowOptions): MainWindowRegistration => {
  const rendererUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : pathToFileURL(
        path.join(
          __dirname,
          `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
        ),
      ).href;
  const navigationPolicy = createRendererNavigationPolicy(rendererUrl);
  const themePreference = settingsService.get().theme;
  const theme = resolveAppTheme(
    themePreference,
    nativeTheme.shouldUseDarkColors,
  );
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: WORKSPACE_MIN_CONTENT_WIDTH,
    minHeight: 620,
    useContentSize: true,
    backgroundColor: APP_THEME_WINDOW_BACKGROUNDS[theme],
    show: false,
    ...getMainWindowChromeOptions(process.platform, theme),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  updateMainWindowZoom(window, settingsService.get().zoomPercent);

  const webContentsId = window.webContents.id;
  const updateSystemTheme = (): void => {
    if (settingsService.get().theme === 'system') {
      updateMainWindowTheme(window, 'system');
    }
  };
  nativeTheme.on('updated', updateSystemTheme);
  window.once('closed', () => {
    nativeTheme.off('updated', updateSystemTheme);
    onClosed(webContentsId);
  });
  window.on('close', (event) => onClose(window, event));
  window.once('ready-to-show', () => !window.isDestroyed() && window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!navigationPolicy.allows(url)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!navigationPolicy.allows(url)) event.preventDefault();
  });
  void window.loadURL(navigationPolicy.expectedUrl);
  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return { navigationPolicy, window };
};
