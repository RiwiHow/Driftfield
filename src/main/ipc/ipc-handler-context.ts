import type { BrowserWindow } from 'electron';

import type { CompleteWindowCloseRequest } from '../../shared/contracts/window-lifecycle';
import type { AiAgentService } from '../ai/ai-agent-service';
import type { AgentCredentialService } from '../services/agent-credential-service';
import type { ProjectSessionService } from '../services/project-session-service';
import type { SettingsService } from '../services/settings-service';

export interface IpcHandlerContext {
  agentCredentialService: AgentCredentialService;
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
