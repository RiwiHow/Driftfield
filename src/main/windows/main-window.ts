import { app, BrowserWindow, type Event } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { SettingsService } from '../services/settings-service';
import {
  createRendererNavigationPolicy,
  type RendererNavigationPolicy,
} from './navigation-policy';

const themeBackgroundColors = {
  'github-light': '#ffffff',
  'one-dark': '#282c34',
  'tokyo-night': '#1a1b26',
} as const;

interface CreateMainWindowOptions {
  onClose: (window: BrowserWindow, event: Event) => void;
  onClosed: (webContentsId: number) => void;
  settingsService: SettingsService;
}

interface MainWindowRegistration {
  navigationPolicy: RendererNavigationPolicy;
  window: BrowserWindow;
}

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
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: themeBackgroundColors[settingsService.get().theme],
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  const webContentsId = window.webContents.id;
  window.once('closed', () => onClosed(webContentsId));
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
