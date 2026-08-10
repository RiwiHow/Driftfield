import type {
  AgentConfiguration,
  RemoveAgentCredentialRequest,
  ResetAgentSettingsResult,
  SetAgentApiKeyRequest,
  UpdateAgentModelOverrideRequest,
  UpdateAgentModelOverrideResult,
} from "./contracts/agent-configuration";
import type {
  ProjectSnapshot,
  ProjectWatcherStatus,
  SaveProjectDocumentRequest,
  SaveProjectDocumentResult,
  SelectProjectDirectoryResult,
  CloseUnsavedDocumentDecision,
} from "./contracts/project";
import type {
  AppSettings,
  ProjectAgentSettings,
  UpdateAppSettingsRequest,
  UpdateProjectAgentSettingsRequest,
} from "./contracts/settings";
import type {
  CompleteWindowCloseRequest,
  WindowCloseRequest,
} from "./contracts/window-lifecycle";
import type {
  AgentEvent,
  CancelAgentRequest,
  CancelAgentResult,
  StartAgentPromptRequest,
  StartAgentPromptResult,
} from "./contracts/agent";
import type {
  ApplyAgentProposalRequest,
  ApplyAgentProposalResult,
  RejectAgentProposalRequest,
  RejectAgentProposalResult,
} from "./contracts/agent-proposals";
import type {
  AgentConversationState,
  CreateAgentConversationRequest,
  DeleteAgentConversationRequest,
  RenameAgentConversationRequest,
  SelectAgentConversationRequest,
  UpdateAgentConversationMessageRequest,
} from './contracts/agent-conversations';
import type { ProjectStorySnapshot } from './contracts/project-story';

export interface DriftfieldAPI {
  platform: string;
  applyAgentProposal: (
    request: ApplyAgentProposalRequest,
  ) => Promise<ApplyAgentProposalResult>;
  cancelAgent: (request: CancelAgentRequest) => Promise<CancelAgentResult>;
  createAgentConversation: (
    request: CreateAgentConversationRequest,
  ) => Promise<AgentConversationState>;
  deleteAgentConversation: (
    request: DeleteAgentConversationRequest,
  ) => Promise<AgentConversationState>;
  createProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  copyEditorSelection: () => Promise<void>;
  cutEditorSelection: () => Promise<void>;
  getAgentConfiguration: () => Promise<AgentConfiguration>;
  getAgentConversationState: () => Promise<AgentConversationState>;
  getAppSettings: () => Promise<AppSettings>;
  getProjectAgentSettings: () => Promise<ProjectAgentSettings>;
  getProjectStory: () => Promise<ProjectStorySnapshot>;
  confirmCloseUnsavedDocument: (
    documentTitle: string,
  ) => Promise<CloseUnsavedDocumentDecision>;
  onProjectChanged: (
    listener: (project: ProjectSnapshot) => void,
  ) => () => void;
  onProjectWatcherStatusChanged: (
    listener: (status: ProjectWatcherStatus) => void,
  ) => () => void;
  onWindowCloseRequested: (
    listener: (request: WindowCloseRequest) => void,
  ) => () => void;
  onAgentEvent: (listener: (event: AgentEvent) => void) => () => void;
  pasteIntoEditor: () => Promise<void>;
  refreshProject: () => Promise<ProjectSnapshot | null>;
  restoreLastProject: () => Promise<ProjectSnapshot | null>;
  removeAgentCredential: (
    request: RemoveAgentCredentialRequest,
  ) => Promise<AgentConfiguration>;
  resetAgentSettings: () => Promise<ResetAgentSettingsResult>;
  rejectAgentProposal: (
    request: RejectAgentProposalRequest,
  ) => Promise<RejectAgentProposalResult>;
  renameAgentConversation: (
    request: RenameAgentConversationRequest,
  ) => Promise<AgentConversationState>;
  saveProjectDocument: (
    request: SaveProjectDocumentRequest,
  ) => Promise<SaveProjectDocumentResult>;
  selectProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  selectAllEditorText: () => Promise<void>;
  selectAgentConversation: (
    request: SelectAgentConversationRequest,
  ) => Promise<AgentConversationState>;
  setWindowDirty: (isDirty: boolean) => Promise<void>;
  setAgentApiKey: (
    request: SetAgentApiKeyRequest,
  ) => Promise<AgentConfiguration>;
  startAgentPrompt: (
    request: StartAgentPromptRequest,
  ) => Promise<StartAgentPromptResult>;
  completeWindowClose: (request: CompleteWindowCloseRequest) => Promise<void>;
  updateAppSettings: (
    settings: UpdateAppSettingsRequest,
  ) => Promise<AppSettings>;
  updateProjectAgentSettings: (
    settings: UpdateProjectAgentSettingsRequest,
  ) => Promise<ProjectAgentSettings>;
  updateAgentModelOverride: (
    request: UpdateAgentModelOverrideRequest,
  ) => Promise<UpdateAgentModelOverrideResult>;
  updateAgentConversationMessage: (
    request: UpdateAgentConversationMessageRequest,
  ) => Promise<AgentConversationState>;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}
