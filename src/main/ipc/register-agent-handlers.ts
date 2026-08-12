import { ipcMain } from "electron";

import { IPC_CHANNELS } from "../../shared/contracts/ipc-channels";
import { DEFAULT_APP_SETTINGS, resolveProjectAgentSettings } from "../../shared/contracts/settings";
import { getAgentStartConfigurationError } from "../ai/agent-start-policy";
import { getAgentConfiguration } from "../ai/get-agent-configuration";
import type { IpcHandlerContext } from "./ipc-handler-context";
import { parseAgentModelOverrideRequest } from "../services/agent/model-config-service";
import {
  isApplyAgentProposalRequest,
  isCancelAgentRequest,
  isRemoveAgentCredentialRequest,
  isSetAgentApiKeyRequest,
  isStartAgentPromptRequest,
  isRejectAgentProposalRequest,
  isCreateAgentConversationRequest,
  isDeleteAgentConversationRequest,
  isRenameAgentConversationRequest,
  isSelectAgentConversationRequest,
  isUpdateAgentConversationMessageRequest,
} from "./validators/agent-requests";

export const registerAgentIpcHandlers = ({
  agentConversationService,
  agentCredentialService,
  agentModelConfigService,
  agentProposalService,
  aiAgentService,
  getTrustedSenderWindow,
  projectSessions,
  projectSettingsService,
  settingsService,
}: IpcHandlerContext): void => {
  const getProjectSession = (event: Electron.IpcMainInvokeEvent) => {
    const window = getTrustedSenderWindow(event);
    const session = projectSessions.get(window.webContents.id);
    if (session === undefined) throw new Error('No project is open');
    return { session, window };
  };

  ipcMain.handle(IPC_CHANNELS.getAgentConversationState, (event) => {
    const { session } = getProjectSession(event);
    return agentConversationService.getState(session);
  });
  ipcMain.handle(IPC_CHANNELS.createAgentConversation, (event, value: unknown) => {
    const { session } = getProjectSession(event);
    if (!isCreateAgentConversationRequest(value)) throw new Error('Invalid conversation create request');
    return agentConversationService.create(session, value.title);
  });
  ipcMain.handle(IPC_CHANNELS.selectAgentConversation, (event, value: unknown) => {
    const { session } = getProjectSession(event);
    if (!isSelectAgentConversationRequest(value)) throw new Error('Invalid conversation selection');
    return agentConversationService.select(session, value.conversationId);
  });
  ipcMain.handle(IPC_CHANNELS.renameAgentConversation, (event, value: unknown) => {
    const { session } = getProjectSession(event);
    if (!isRenameAgentConversationRequest(value)) throw new Error('Invalid conversation rename request');
    return agentConversationService.rename(session, value.conversationId, value.title);
  });
  ipcMain.handle(IPC_CHANNELS.deleteAgentConversation, (event, value: unknown) => {
    const { session } = getProjectSession(event);
    if (!isDeleteAgentConversationRequest(value)) throw new Error('Invalid conversation delete request');
    return agentConversationService.delete(session, value.conversationId);
  });
  ipcMain.handle(IPC_CHANNELS.updateAgentConversationMessage, (event, value: unknown) => {
    const { session } = getProjectSession(event);
    if (!isUpdateAgentConversationMessageRequest(value)) throw new Error('Invalid conversation message update');
    return agentConversationService.updateAssistantMessage(
      session,
      value.conversationId,
      value.messageId,
      value.content,
    );
  });
  ipcMain.handle(
    IPC_CHANNELS.applyAgentProposal,
    async (event, value: unknown) => {
      const window = getTrustedSenderWindow(event);
      if (!isApplyAgentProposalRequest(value)) {
        throw new Error("Invalid Agent proposal apply request");
      }
      return 'proposalIds' in value
        ? agentProposalService.applyStoryBatch(
            window.webContents.id,
            value.proposalIds,
          )
        : agentProposalService.apply(
            window.webContents.id,
            value.proposalId,
          );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.rejectAgentProposal,
    async (event, value: unknown) => {
      const window = getTrustedSenderWindow(event);
      if (!isRejectAgentProposalRequest(value)) {
        throw new Error("Invalid Agent proposal rejection");
      }
      return {
        rejected: agentProposalService.reject(
          window.webContents.id,
          value.proposalId,
          value.reason ?? 'rejected',
        ),
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.getAgentConfiguration, async (event) => {
    const window = getTrustedSenderWindow(event);
    return getAgentConfiguration(
      aiAgentService,
      agentCredentialService,
      agentModelConfigService,
      projectSessions.get(window.webContents.id),
    );
  });

  ipcMain.handle(IPC_CHANNELS.setAgentApiKey, async (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (!isSetAgentApiKeyRequest(value)) {
      throw new Error("Invalid Agent API key request");
    }
    aiAgentService.reloadConfiguration();
    await agentCredentialService.setApiKey(value.providerId, value.apiKey);
    return getAgentConfiguration(
      aiAgentService,
      agentCredentialService,
      agentModelConfigService,
      projectSessions.get(window.webContents.id),
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.removeAgentCredential,
    async (event, value: unknown) => {
      const window = getTrustedSenderWindow(event);
      if (!isRemoveAgentCredentialRequest(value)) {
        throw new Error("Invalid Agent credential request");
      }
      aiAgentService.reloadConfiguration();
      await agentCredentialService.remove(value.providerId);
      return getAgentConfiguration(
        aiAgentService,
        agentCredentialService,
        agentModelConfigService,
        projectSessions.get(window.webContents.id),
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.resetAgentSettings, async (event) => {
    const { session } = getProjectSession(event);
    aiAgentService.reloadConfiguration();
    await agentCredentialService.reset();
    await agentModelConfigService.reset();
    const projectSettings = projectSettingsService.reset(session);
    const appSettings = await settingsService.update({
      agent: DEFAULT_APP_SETTINGS.agent,
    });
    return {
      appSettings,
      configuration: await getAgentConfiguration(
        aiAgentService,
        agentCredentialService,
        agentModelConfigService,
        session,
      ),
      projectSettings,
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.updateAgentModelOverride,
    async (event, value: unknown) => {
      getTrustedSenderWindow(event);
      const override = parseAgentModelOverrideRequest(value);
      const { session } = getProjectSession(event);
      const modelsPath = await agentModelConfigService.prepareRuntime(session);
      const models = await aiAgentService.listModels(modelsPath);
      if (
        !models.some(
          ({ id, providerId }) =>
            id === override.modelId && providerId === override.providerId,
        )
      ) {
        throw new Error("Unknown Agent model override target");
      }
      const agentSettings = settingsService.get().agent;
      if (
        agentSettings.defaultModel?.providerId === override.providerId &&
        agentSettings.defaultModel.modelId === override.modelId &&
        override.thinkingLevelMap[agentSettings.thinkingLevel] === null
      ) {
        throw new Error(
          "Selected Agent thinking level would become unsupported",
        );
      }
      aiAgentService.reloadConfiguration();
      await agentModelConfigService.update(override, session);
      return {
        override:
          (await agentModelConfigService.getOverrides(session)).find(
            ({ modelId, providerId }) =>
              modelId === override.modelId &&
              providerId === override.providerId,
          ) ?? null,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.startAgentPrompt,
    async (event, value: unknown) => {
      const window = getTrustedSenderWindow(event);
      if (!isStartAgentPromptRequest(value)) {
        throw new Error("Invalid Agent prompt request");
      }
      const session = projectSessions.get(window.webContents.id);
      const currentDocument = session?.project.documents.find(
        ({ id }) => id === value.currentDocumentId,
      );
      if (
        value.currentDocumentId !== undefined &&
        (session === undefined || currentDocument === undefined)
      ) {
        throw new Error("Unknown project document");
      }
      if (
        value.draftSnapshot !== undefined &&
        (currentDocument === undefined ||
          value.draftSnapshot.documentId !== value.currentDocumentId ||
          value.draftSnapshot.baseRevision !== currentDocument.revision)
      ) {
        throw new Error("Stale Agent document snapshot");
      }
      if (session === undefined) throw new Error('No project is open');
      const appSettings = settingsService.get();
      const agentSettings = resolveProjectAgentSettings(
        projectSettingsService.get(session),
        appSettings.agent,
      );
      const selectedModel = agentSettings.defaultModel;
      const configurationError = getAgentStartConfigurationError(
        agentSettings,
        await agentCredentialService.getProviderStatuses(),
      );
      if (configurationError !== null) {
        return { code: configurationError, status: "error" };
      }
      if (selectedModel === null)
        throw new Error("Agent model invariant failed");
      const promptHistory = agentConversationService.beginPrompt(session, value);
      try {
        const modelsPath = await agentModelConfigService.prepareRuntime(session);
        const requestId = await aiAgentService.start({
          ...value,
          history: promptHistory.history,
          proposalOutcomes: promptHistory.proposalOutcomes,
          model: selectedModel,
          modelsPath,
          ownerId: window.webContents.id,
          projectSessionId: session?.id,
          responseLanguage: appSettings.language,
          sendEvent: (agentEvent) => {
            agentConversationService.recordEvent(agentEvent);
            if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
              window.webContents.send(IPC_CHANNELS.agentEvent, agentEvent);
            }
          },
          thinkingLevel: agentSettings.thinkingLevel,
        });
        return { requestId, status: "started" };
      } catch {
        agentConversationService.abandonRequest(value.requestId);
        return { code: "runtime-unavailable", status: "error" };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.cancelAgent, async (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (!isCancelAgentRequest(value)) {
      throw new Error("Invalid Agent cancellation");
    }
    return {
      cancelled: await aiAgentService.cancel(
        window.webContents.id,
        value.requestId,
      ),
    };
  });
};
