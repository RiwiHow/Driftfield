import { app, BrowserWindow, type Event } from 'electron';
import { randomUUID } from 'node:crypto';

import { IPC_CHANNELS } from '../shared/contracts/ipc-channels';
import type {
  CompleteWindowCloseRequest,
  WindowCloseRequest,
} from '../shared/contracts/window-lifecycle';
import { registerIpcHandlers } from './ipc/register-ipc-handlers';
import { AiAgentService } from './ai/ai-agent-service';
import { ProjectSessionService } from './services/project-session-service';
import { SettingsService } from './services/settings-service';
import { createMainWindow } from './windows/main-window';
import type { RendererNavigationPolicy } from './windows/navigation-policy';

const mainWindows = new Set<BrowserWindow>();
const navigationPolicies = new WeakMap<BrowserWindow, RendererNavigationPolicy>();
const projectSessions = new ProjectSessionService();
const lifecycleStates = new WeakMap<BrowserWindow, WindowLifecycleState>();
let isQuitting = false;
let pendingQuit = false;
let activeAiAgentService: AiAgentService | null = null;

interface WindowLifecycleState {
  allowClose: boolean;
  closeRequest: WindowCloseRequest | null;
  dirty: boolean;
}

const requestWindowClose = (
  window: BrowserWindow,
  reason: WindowCloseRequest['reason'],
): void => {
  const state = lifecycleStates.get(window);
  if (state === undefined || state.closeRequest !== null) return;
  state.closeRequest = { reason, requestId: randomUUID() };
  window.webContents.send(IPC_CHANNELS.windowCloseRequested, state.closeRequest);
};

const setWindowDirty = (window: BrowserWindow, dirty: boolean): void => {
  const state = lifecycleStates.get(window);
  if (state === undefined) throw new Error('Unknown application window');
  state.dirty = dirty;
};

const completeWindowClose = (
  window: BrowserWindow,
  request: CompleteWindowCloseRequest,
): void => {
  const state = lifecycleStates.get(window);
  if (state?.closeRequest?.requestId !== request.requestId) {
    throw new Error('Unknown close request');
  }
  const reason = state.closeRequest.reason;
  state.closeRequest = null;
  if (!request.proceed) {
    pendingQuit = false;
    return;
  }
  state.dirty = false;
  state.allowClose = true;
  if (reason === 'quit') {
    pendingQuit = false;
    isQuitting = true;
    app.quit();
  } else {
    window.close();
  }
};

const getTrustedSenderWindow = (
  event: Electron.IpcMainInvokeEvent,
): BrowserWindow => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (
    window === null ||
    !mainWindows.has(window) ||
    event.senderFrame !== event.sender.mainFrame ||
    navigationPolicies.get(window)?.allows(event.senderFrame.url) !== true
  ) {
    throw new Error('Unauthorized renderer request');
  }
  return window;
};

const openMainWindow = (
  settingsService: SettingsService,
  aiAgentService: AiAgentService,
): void => {
  const registration = createMainWindow({
    onClose: (window, event: Event) => {
      const lifecycle = lifecycleStates.get(window);
      if (isQuitting || lifecycle?.allowClose) return;
      event.preventDefault();
      if (
        process.platform !== 'darwin' &&
        settingsService.get().closeWindowBehavior === 'minimize'
      ) {
        window.minimize();
      } else if (lifecycle?.dirty) {
        pendingQuit = true;
        requestWindowClose(window, 'quit');
      } else {
        isQuitting = true;
        app.quit();
      }
    },
    onClosed: (webContentsId) => {
      aiAgentService.disposeOwner(webContentsId);
      projectSessions.close(webContentsId);
      mainWindows.delete(registration.window);
    },
    settingsService,
  });
  mainWindows.add(registration.window);
  navigationPolicies.set(registration.window, registration.navigationPolicy);
  lifecycleStates.set(registration.window, {
    allowClose: false,
    closeRequest: null,
    dirty: false,
  });
};

void app.whenReady().then(async () => {
  try {
    const settingsService = await SettingsService.create(app.getPath('userData'));
    const aiAgentService = new AiAgentService(app.getPath('userData'));
    activeAiAgentService = aiAgentService;
    registerIpcHandlers({
      aiAgentService,
      completeWindowClose,
      getTrustedSenderWindow,
      projectSessions,
      setWindowDirty,
      settingsService,
    });
    openMainWindow(settingsService, aiAgentService);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        openMainWindow(settingsService, aiAgentService);
      }
    });
  } catch (error) {
    console.error('Failed to initialize application settings', error);
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuitting) return;
  const dirtyWindows = [...mainWindows].filter(
    (window) => lifecycleStates.get(window)?.dirty,
  );
  if (dirtyWindows.length === 0) {
    isQuitting = true;
    return;
  }
  event.preventDefault();
  if (!pendingQuit) {
    pendingQuit = true;
    for (const window of dirtyWindows) requestWindowClose(window, 'quit');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  activeAiAgentService?.dispose();
  activeAiAgentService = null;
});
