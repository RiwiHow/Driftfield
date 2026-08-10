import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import { getAgentConfiguration } from '../ai/get-agent-configuration';
import { parseSettingsUpdate } from '../services/settings-service';
import { parseProjectAgentSettingsUpdate } from '../services/project/settings-service';
import { updateMainWindowTheme } from '../windows/main-window';
import type { IpcHandlerContext } from './ipc-handler-context';

export const registerSettingsIpcHandlers = ({
  agentCredentialService,
  agentModelConfigService,
  aiAgentService,
  getTrustedSenderWindow,
  projectSessions,
  projectSettingsService,
  settingsService,
}: IpcHandlerContext): void => {
  ipcMain.handle(IPC_CHANNELS.getAppSettings, (event) => {
    getTrustedSenderWindow(event);
    return settingsService.get();
  });

  ipcMain.handle(IPC_CHANNELS.getProjectAgentSettings, (event) => {
    const window = getTrustedSenderWindow(event);
    const session = projectSessions.get(window.webContents.id);
    if (session === undefined) throw new Error('No project is open');
    return projectSettingsService.get(session);
  });

  ipcMain.handle(IPC_CHANNELS.updateAppSettings, async (event, value) => {
    const window = getTrustedSenderWindow(event);
    const update = parseSettingsUpdate(value);
    if (update.agent !== undefined && update.agent.defaultModel !== null) {
      const session = projectSessions.get(window.webContents.id);
      const { models } = await getAgentConfiguration(
        aiAgentService,
        agentCredentialService,
        agentModelConfigService,
        session,
      );
      const selection = update.agent.defaultModel;
      if (!models.some(({ id, providerId }) =>
        id === selection.modelId && providerId === selection.providerId
      )) throw new Error('Selected global Agent model is not available');
    }
    const settings = await settingsService.update(update);
    if (update.theme !== undefined) {
      updateMainWindowTheme(window, settings.theme);
    }
    return settings;
  });

  ipcMain.handle(IPC_CHANNELS.updateProjectAgentSettings, async (event, value) => {
    const window = getTrustedSenderWindow(event);
    const session = projectSessions.get(window.webContents.id);
    if (session === undefined) throw new Error('No project is open');
    const update = parseProjectAgentSettingsUpdate(value);
    if (!update.useGlobal && update.defaultModel !== null) {
      const { models } = await getAgentConfiguration(
        aiAgentService,
        agentCredentialService,
        agentModelConfigService,
        session,
      );
      const selection = update.defaultModel;
      if (
        !models.some(
          ({ id, providerId }) =>
            id === selection.modelId && providerId === selection.providerId,
        )
      ) {
        throw new Error('Selected Agent model is not available');
      }
    }
    return projectSettingsService.update(session, update);
  });
};
