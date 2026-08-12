import {
  app,
  BrowserWindow,
  nativeTheme,
  type BrowserWindowConstructorOptions,
  type Event,
  type TitleBarOverlayOptions,
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

// The renderer titlebar is 38 CSS pixels high. Keep the native overlay one
// scaled CSS pixel shorter so its bottom border remains visible while page zoom
// changes the renderer's physical titlebar height.
const WINDOWS_CAPTION_CONTROL_HEIGHT = 37;

export const getWindowsCaptionControlHeight = (
  zoomPercent: AppZoomPercent,
): number => Math.round(WINDOWS_CAPTION_CONTROL_HEIGHT * zoomPercent / 100);

const getWindowsTitleBarOverlay = (
  theme: AppTheme,
  zoomPercent: AppZoomPercent,
): TitleBarOverlayOptions => {
  const chrome = APP_THEME_WINDOW_CHROME[theme];
  return {
    color: chrome.background,
    height: getWindowsCaptionControlHeight(zoomPercent),
    symbolColor: chrome.symbol,
  };
};

export const getMainWindowChromeOptions = (
  platform: NodeJS.Platform,
  theme: AppTheme,
  zoomPercent: AppZoomPercent = 100,
): Pick<
  BrowserWindowConstructorOptions,
  'autoHideMenuBar' | 'titleBarOverlay' | 'titleBarStyle'
> => {
  if (platform !== 'win32') {
    return { titleBarStyle: 'hiddenInset' };
  }

  return {
    autoHideMenuBar: true,
    titleBarOverlay: getWindowsTitleBarOverlay(theme, zoomPercent),
    titleBarStyle: 'hidden',
  };
};

export const updateMainWindowTheme = (
  window: BrowserWindow,
  preference: AppThemePreference,
  zoomPercent: AppZoomPercent = 100,
  platform: NodeJS.Platform = process.platform,
  prefersDark: boolean = nativeTheme.shouldUseDarkColors,
): void => {
  const theme = resolveAppTheme(preference, prefersDark);
  window.setBackgroundColor(APP_THEME_WINDOW_BACKGROUNDS[theme]);
  if (platform === 'win32') {
    window.setTitleBarOverlay(getWindowsTitleBarOverlay(theme, zoomPercent));
  }
};

export const updateMainWindowZoom = (
  window: BrowserWindow,
  zoomPercent: AppZoomPercent,
  preference: AppThemePreference,
  platform: NodeJS.Platform = process.platform,
  prefersDark: boolean = nativeTheme.shouldUseDarkColors,
): void => {
  window.webContents.setZoomFactor(zoomPercent / 100);
  if (platform === 'win32') {
    const theme = resolveAppTheme(preference, prefersDark);
    window.setTitleBarOverlay(getWindowsTitleBarOverlay(theme, zoomPercent));
  }
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
  const settings = settingsService.get();
  const themePreference = settings.theme;
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
    ...getMainWindowChromeOptions(process.platform, theme, settings.zoomPercent),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  updateMainWindowZoom(
    window,
    settings.zoomPercent,
    settings.theme,
  );

  const webContentsId = window.webContents.id;
  const updateSystemTheme = (): void => {
    if (settingsService.get().theme === 'system') {
      updateMainWindowTheme(
        window,
        'system',
        settingsService.get().zoomPercent,
        process.platform,
        nativeTheme.shouldUseDarkColors,
      );
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
