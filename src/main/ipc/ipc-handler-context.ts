import type { BrowserWindow } from "electron";

import type { CompleteWindowCloseRequest } from "../../shared/contracts/window-lifecycle";
import type { AiAgentService } from "../ai/ai-agent-service";
import type { AgentProposalService } from "../ai/agent-proposal-service";
import type { AgentConversationService } from '../services/agent-conversation-service';
import type { AgentCredentialService } from "../services/agent-credential-service";
import type { AgentModelConfigService } from "../services/agent-model-config-service";
import type { ProjectSessionService } from "../services/project-session-service";
import type { ProjectSettingsService } from '../services/project-settings-service';
import type { SettingsService } from "../services/settings-service";

export interface IpcHandlerContext {
  agentConversationService: AgentConversationService;
  agentCredentialService: AgentCredentialService;
  agentModelConfigService: AgentModelConfigService;
  aiAgentService: AiAgentService;
  agentProposalService: AgentProposalService;
  completeWindowClose: (
    window: BrowserWindow,
    request: CompleteWindowCloseRequest,
  ) => void;
  getTrustedSenderWindow: (event: Electron.IpcMainInvokeEvent) => BrowserWindow;
  projectSessions: ProjectSessionService;
  projectSettingsService: ProjectSettingsService;
  setWindowDirty: (window: BrowserWindow, isDirty: boolean) => void;
  settingsService: SettingsService;
}
