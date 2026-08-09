import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import { getAgentStartConfigurationError } from '../ai/agent-start-policy';
import { getAgentConfiguration } from '../ai/get-agent-configuration';
import type { IpcHandlerContext } from './ipc-handler-context';
import {
  isCancelAgentRequest,
  isRemoveAgentCredentialRequest,
  isSetAgentApiKeyRequest,
  isStartAgentPromptRequest,
} from './validators/agent-requests';

export const registerAgentIpcHandlers = ({
  agentCredentialService,
  aiAgentService,
  getTrustedSenderWindow,
  projectSessions,
  settingsService,
}: IpcHandlerContext): void => {
  ipcMain.handle(IPC_CHANNELS.getAgentConfiguration, async (event) => {
    getTrustedSenderWindow(event);
    return getAgentConfiguration(aiAgentService, agentCredentialService);
  });

  ipcMain.handle(IPC_CHANNELS.setAgentApiKey, async (event, value: unknown) => {
    getTrustedSenderWindow(event);
    if (!isSetAgentApiKeyRequest(value)) {
      throw new Error('Invalid Agent API key request');
    }
    aiAgentService.reloadConfiguration();
    await agentCredentialService.setApiKey(value.providerId, value.apiKey);
    return getAgentConfiguration(aiAgentService, agentCredentialService);
  });

  ipcMain.handle(
    IPC_CHANNELS.removeAgentCredential,
    async (event, value: unknown) => {
      getTrustedSenderWindow(event);
      if (!isRemoveAgentCredentialRequest(value)) {
        throw new Error('Invalid Agent credential request');
      }
      aiAgentService.reloadConfiguration();
      await agentCredentialService.remove(value.providerId);
      return getAgentConfiguration(aiAgentService, agentCredentialService);
    },
  );

  ipcMain.handle(IPC_CHANNELS.startAgentPrompt, async (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (!isStartAgentPromptRequest(value)) {
      throw new Error('Invalid Agent prompt request');
    }
    const session = projectSessions.get(window.webContents.id);
    const currentDocument = session?.project.documents.find(
      ({ id }) => id === value.currentDocumentId,
    );
    if (
      value.currentDocumentId !== undefined &&
      (session === undefined || currentDocument === undefined)
    ) {
      throw new Error('Unknown project document');
    }
    if (
      value.draftSnapshot !== undefined &&
      (currentDocument === undefined ||
        value.draftSnapshot.documentId !== value.currentDocumentId ||
        value.draftSnapshot.baseRevision !== currentDocument.revision)
    ) {
      throw new Error('Stale Agent document snapshot');
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
    if (!isCancelAgentRequest(value)) {
      throw new Error('Invalid Agent cancellation');
    }
    return {
      cancelled: await aiAgentService.cancel(
        window.webContents.id,
        value.requestId,
      ),
    };
  });
};
