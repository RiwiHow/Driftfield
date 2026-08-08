import { app, dialog, ipcMain, Menu, type BrowserWindow } from 'electron';
import { realpath, stat } from 'node:fs/promises';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import type {
  CancelAgentRequest,
  StartAgentPromptRequest,
} from '../../shared/contracts/agent';
import type {
  SaveProjectDocumentRequest,
  SelectProjectDirectoryResult,
} from '../../shared/contracts/project';
import type { CompleteWindowCloseRequest } from '../../shared/contracts/window-lifecycle';
import {
  MAX_PROJECT_BYTES,
  createProjectSnapshot,
  saveProjectDocument,
} from '../services/project-service';
import type { ProjectSessionService } from '../services/project-session-service';
import {
  type SettingsService,
  parseSettingsUpdate,
} from '../services/settings-service';
import type { AiAgentService } from '../ai/ai-agent-service';

interface RegisterIpcHandlersOptions {
  aiAgentService: AiAgentService;
  completeWindowClose: (
    window: BrowserWindow,
    request: CompleteWindowCloseRequest,
  ) => void;
  getTrustedSenderWindow: (
    event: Electron.IpcMainInvokeEvent,
  ) => BrowserWindow;
  projectSessions: ProjectSessionService;
  setWindowDirty: (window: BrowserWindow, isDirty: boolean) => void;
  settingsService: SettingsService;
}

export const registerIpcHandlers = ({
  aiAgentService,
  completeWindowClose,
  getTrustedSenderWindow,
  projectSessions,
  setWindowDirty,
  settingsService,
}: RegisterIpcHandlersOptions): void => {
  ipcMain.handle(IPC_CHANNELS.startAgentPrompt, async (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (!isStartAgentPromptRequest(value)) {
      throw new Error('Invalid Agent prompt request');
    }
    const session = projectSessions.get(window.webContents.id);
    if (
      value.currentDocumentId !== undefined &&
      (session === undefined || !session.documentIds.has(value.currentDocumentId))
    ) {
      throw new Error('Unknown project document');
    }
    const requestId = await aiAgentService.start({
      ...value,
      ownerId: window.webContents.id,
      projectDirectory: session?.directoryPath,
      sendEvent: (agentEvent) => {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.agentEvent, agentEvent);
        }
      },
    });
    return { requestId };
  });

  ipcMain.handle(IPC_CHANNELS.cancelAgent, async (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (!isCancelAgentRequest(value)) throw new Error('Invalid Agent cancellation');
    return {
      cancelled: await aiAgentService.cancel(window.webContents.id, value.requestId),
    };
  });

  ipcMain.handle(IPC_CHANNELS.getAppSettings, (event) => {
    getTrustedSenderWindow(event);
    return settingsService.get();
  });

  ipcMain.handle(IPC_CHANNELS.setWindowDirty, (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (typeof value !== 'boolean') throw new Error('Invalid dirty state');
    setWindowDirty(window, value);
  });

  ipcMain.handle(IPC_CHANNELS.completeWindowClose, (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof (value as Partial<CompleteWindowCloseRequest>).requestId !==
        'string' ||
      typeof (value as Partial<CompleteWindowCloseRequest>).proceed !== 'boolean'
    ) {
      throw new Error('Invalid close completion');
    }
    completeWindowClose(window, value as CompleteWindowCloseRequest);
  });

  ipcMain.handle(IPC_CHANNELS.updateAppSettings, async (event, value) => {
    getTrustedSenderWindow(event);
    return settingsService.update(parseSettingsUpdate(value));
  });

  ipcMain.handle(IPC_CHANNELS.refreshProject, async (event) => {
    const window = getTrustedSenderWindow(event);
    return projectSessions.refresh(window.webContents.id);
  });

  ipcMain.handle(IPC_CHANNELS.saveProjectDocument, async (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    const session = projectSessions.get(window.webContents.id);
    if (
      session === undefined ||
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value)
    ) {
      throw new Error('Invalid project document save request');
    }
    const request = value as Partial<SaveProjectDocumentRequest>;
    if (
      typeof request.documentId !== 'string' ||
      typeof request.expectedRevision !== 'string' ||
      typeof request.markdown !== 'string' ||
      (request.overwrite !== undefined && typeof request.overwrite !== 'boolean') ||
      !session.documentIds.has(request.documentId) ||
      Buffer.byteLength(request.markdown, 'utf8') > MAX_PROJECT_BYTES
    ) {
      throw new Error('Unknown project document');
    }
    return saveProjectDocument(
      session.directoryPath,
      request as SaveProjectDocumentRequest,
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.confirmCloseUnsavedDocument,
    async (event, documentTitle: unknown) => {
      const window = getTrustedSenderWindow(event);
      if (
        typeof documentTitle !== 'string' ||
        documentTitle.length === 0 ||
        documentTitle.length > 255
      ) {
        throw new Error('Invalid document title');
      }
      const result = await dialog.showMessageBox(window, {
        buttons: ['取消', '不保存', '保存并关闭'],
        cancelId: 0,
        defaultId: 2,
        detail: '如果不保存，你在当前会话中的修改将会丢失。',
        message: `要保存对“${documentTitle}”的修改吗？`,
        noLink: true,
        title: '未保存的修改',
        type: 'warning',
      });
      return ['cancel', 'discard', 'save'][result.response] ?? 'cancel';
    },
  );

  ipcMain.handle(IPC_CHANNELS.showEditorContextMenu, (event) => {
    const window = getTrustedSenderWindow(event);
    Menu.buildFromTemplate([
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' },
    ]).popup({ window });
  });

  ipcMain.handle(
    IPC_CHANNELS.selectProjectDirectory,
    async (event): Promise<SelectProjectDirectoryResult> => {
      const window = getTrustedSenderWindow(event);
      const result = await dialog.showOpenDialog(window, {
        buttonLabel: '打开项目',
        defaultPath: app.getPath('documents'),
        message: '选择一个文件夹作为 Driftfield 项目目录',
        properties: ['openDirectory'],
        title: '打开本地项目',
      });
      const selectedPath = result.filePaths[0];
      if (result.canceled || selectedPath === undefined) return null;
      const directoryPath = await realpath(selectedPath);
      if (!(await stat(directoryPath)).isDirectory()) {
        throw new Error('Selected project path is not a directory');
      }
      const project = await createProjectSnapshot(directoryPath);
      projectSessions.watch(window, directoryPath, project);
      return project;
    },
  );
};

const isStartAgentPromptRequest = (
  value: unknown,
): value is StartAgentPromptRequest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<StartAgentPromptRequest>;
  return (
    typeof request.prompt === 'string' &&
    request.prompt.trim().length > 0 &&
    Buffer.byteLength(request.prompt, 'utf8') <= 32 * 1024 &&
    (request.currentDocumentId === undefined ||
      (typeof request.currentDocumentId === 'string' &&
        request.currentDocumentId.length > 0 &&
        request.currentDocumentId.length <= 1_024))
  );
};

const isCancelAgentRequest = (value: unknown): value is CancelAgentRequest =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Partial<CancelAgentRequest>).requestId === 'string' &&
  (value as Partial<CancelAgentRequest>).requestId!.length <= 128;
