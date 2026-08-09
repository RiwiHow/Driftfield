import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { realpath, stat } from 'node:fs/promises';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import type {
  AgentConfiguration,
  RemoveAgentCredentialRequest,
  SetAgentApiKeyRequest,
} from '../../shared/contracts/agent-configuration';
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
import { openProjectLayout } from '../services/project-layout-service';
import type { ProjectSessionService } from '../services/project-session-service';
import {
  type SettingsService,
  parseSettingsUpdate,
} from '../services/settings-service';
import type { AiAgentService } from '../ai/ai-agent-service';
import { getAgentStartConfigurationError } from '../ai/agent-start-policy';
import {
  createCloseUnsavedDialogOptions,
  createOpenProjectDialogOptions,
} from '../i18n/native-dialog-options';
import {
  isAgentApiKeyProviderId,
  type AgentCredentialService,
} from '../services/agent-credential-service';

interface RegisterIpcHandlersOptions {
  aiAgentService: AiAgentService;
  agentCredentialService: AgentCredentialService;
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
  agentCredentialService,
  completeWindowClose,
  getTrustedSenderWindow,
  projectSessions,
  setWindowDirty,
  settingsService,
}: RegisterIpcHandlersOptions): void => {
  const getAgentConfiguration = async (): Promise<AgentConfiguration> => {
    const providers = await agentCredentialService.getProviderStatuses();
    const configuredProviders = new Set<string>(
      providers
        .filter(({ configured }) => configured)
        .map(({ providerId }) => providerId),
    );
    return {
      models:
        configuredProviders.size === 0
          ? []
          : (await aiAgentService.listModels()).filter(({ providerId }) =>
              configuredProviders.has(providerId),
            ),
      providers,
    };
  };

  ipcMain.handle(IPC_CHANNELS.getAgentConfiguration, async (event) => {
    getTrustedSenderWindow(event);
    return getAgentConfiguration();
  });

  ipcMain.handle(IPC_CHANNELS.setAgentApiKey, async (event, value: unknown) => {
    getTrustedSenderWindow(event);
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !isAgentApiKeyProviderId(
        (value as Partial<SetAgentApiKeyRequest>).providerId,
      ) ||
      typeof (value as Partial<SetAgentApiKeyRequest>).apiKey !== 'string'
    ) {
      throw new Error('Invalid Agent API key request');
    }
    const request = value as SetAgentApiKeyRequest;
    aiAgentService.reloadConfiguration();
    await agentCredentialService.setApiKey(request.providerId, request.apiKey);
    return getAgentConfiguration();
  });

  ipcMain.handle(
    IPC_CHANNELS.removeAgentCredential,
    async (event, value: unknown) => {
      getTrustedSenderWindow(event);
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        !isAgentApiKeyProviderId(
          (value as Partial<RemoveAgentCredentialRequest>).providerId,
        )
      ) {
        throw new Error('Invalid Agent credential request');
      }
      aiAgentService.reloadConfiguration();
      await agentCredentialService.remove(
        (value as RemoveAgentCredentialRequest).providerId,
      );
      return getAgentConfiguration();
    },
  );

  ipcMain.handle(IPC_CHANNELS.startAgentPrompt, async (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (!isStartAgentPromptRequest(value)) {
      throw new Error('Invalid Agent prompt request');
    }
    const session = projectSessions.get(window.webContents.id);
    if (
      value.currentDocumentId !== undefined &&
      (session === undefined ||
        !session.documentPaths.has(value.currentDocumentId))
    ) {
      throw new Error('Unknown project document');
    }
    const agentSettings = settingsService.get().agent;
    const selectedModel = agentSettings.defaultModel;
    const configurationError = getAgentStartConfigurationError(
      agentSettings,
      await agentCredentialService.getProviderStatuses(),
    );
    if (configurationError !== null) {
      return { code: configurationError, status: 'error' };
    }
    if (selectedModel === null) throw new Error('Agent model invariant failed');
    try {
      const requestId = await aiAgentService.start({
        ...value,
        model: selectedModel,
        ownerId: window.webContents.id,
        projectDirectory: session?.directoryPath,
        projectSessionId: session?.id,
        sendEvent: (agentEvent) => {
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.agentEvent, agentEvent);
          }
        },
        thinkingLevel: agentSettings.thinkingLevel,
      });
      return { requestId, status: 'started' };
    } catch {
      return { code: 'runtime-unavailable', status: 'error' };
    }
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
    const update = parseSettingsUpdate(value);
    if (update.agent !== undefined && update.agent.defaultModel !== null) {
      const { models } = await getAgentConfiguration();
      const selection = update.agent.defaultModel;
      if (
        !models.some(
          ({ id, providerId }) =>
            id === selection.modelId && providerId === selection.providerId,
        )
      ) {
        throw new Error('Selected Agent model is not available');
      }
    }
    return settingsService.update(update);
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
    const relativeDocumentPath =
      typeof request.documentId === 'string'
        ? session.documentPaths.get(request.documentId)
        : undefined;
    if (
      typeof request.documentId !== 'string' ||
      typeof request.expectedRevision !== 'string' ||
      typeof request.markdown !== 'string' ||
      (request.overwrite !== undefined && typeof request.overwrite !== 'boolean') ||
      relativeDocumentPath === undefined ||
      Buffer.byteLength(request.markdown, 'utf8') > MAX_PROJECT_BYTES
    ) {
      throw new Error('Unknown project document');
    }
    return saveProjectDocument(
      session.directoryPath,
      request as SaveProjectDocumentRequest,
      relativeDocumentPath,
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
      const { language } = settingsService.get();
      const result = await dialog.showMessageBox(
        window,
        createCloseUnsavedDialogOptions(language, documentTitle),
      );
      return ['cancel', 'discard', 'save'][result.response] ?? 'cancel';
    },
  );

  ipcMain.handle(IPC_CHANNELS.copyEditorSelection, (event) => {
    const window = getTrustedSenderWindow(event);
    window.webContents.copy();
  });

  ipcMain.handle(IPC_CHANNELS.cutEditorSelection, (event) => {
    const window = getTrustedSenderWindow(event);
    window.webContents.cut();
  });

  ipcMain.handle(IPC_CHANNELS.pasteIntoEditor, (event) => {
    const window = getTrustedSenderWindow(event);
    window.webContents.paste();
  });

  ipcMain.handle(IPC_CHANNELS.selectAllEditorText, (event) => {
    const window = getTrustedSenderWindow(event);
    window.webContents.selectAll();
  });

  ipcMain.handle(
    IPC_CHANNELS.selectProjectDirectory,
    async (event): Promise<SelectProjectDirectoryResult> => {
      const window = getTrustedSenderWindow(event);
      const { language } = settingsService.get();
      const result = await dialog.showOpenDialog(
        window,
        createOpenProjectDialogOptions(language, app.getPath('documents')),
      );
      const selectedPath = result.filePaths[0];
      if (result.canceled || selectedPath === undefined) return null;
      const directoryPath = await realpath(selectedPath);
      if (!(await stat(directoryPath)).isDirectory()) {
        throw new Error('Selected project path is not a directory');
      }
      const layout = await openProjectLayout(directoryPath);
      const project = await createProjectSnapshot(directoryPath, layout);
      aiAgentService.disposeOwner(window.webContents.id);
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
    typeof request.requestId === 'string' &&
    request.requestId.length > 0 &&
    request.requestId.length <= 128 &&
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
