import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import { getAgentConfiguration } from '../ai/get-agent-configuration';
import { parseSettingsUpdate } from '../services/settings-service';
import type { IpcHandlerContext } from './ipc-handler-context';

export const registerSettingsIpcHandlers = ({
  agentCredentialService,
  aiAgentService,
  getTrustedSenderWindow,
  settingsService,
}: IpcHandlerContext): void => {
  ipcMain.handle(IPC_CHANNELS.getAppSettings, (event) => {
    getTrustedSenderWindow(event);
    return settingsService.get();
  });

  ipcMain.handle(IPC_CHANNELS.updateAppSettings, async (event, value) => {
    getTrustedSenderWindow(event);
    const update = parseSettingsUpdate(value);
    if (update.agent !== undefined && update.agent.defaultModel !== null) {
      const { models } = await getAgentConfiguration(
        aiAgentService,
        agentCredentialService,
      );
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
};
