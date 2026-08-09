import type { IpcHandlerContext } from './ipc-handler-context';
import { registerAgentIpcHandlers } from './register-agent-handlers';
import { registerProjectIpcHandlers } from './register-project-handlers';
import { registerSettingsIpcHandlers } from './register-settings-handlers';
import { registerWindowIpcHandlers } from './register-window-handlers';

export const registerIpcHandlers = (context: IpcHandlerContext): void => {
  registerAgentIpcHandlers(context);
  registerProjectIpcHandlers(context);
  registerSettingsIpcHandlers(context);
  registerWindowIpcHandlers(context);
};
