import type {
  AgentConfiguration,
  RemoveAgentCredentialRequest,
  SetAgentApiKeyRequest,
} from './contracts/agent-configuration';
import type {
  ProjectSnapshot,
  ProjectWatcherStatus,
  SaveProjectDocumentRequest,
  SaveProjectDocumentResult,
  SelectProjectDirectoryResult,
  CloseUnsavedDocumentDecision,
} from './contracts/project';
import type {
  AppSettings,
  UpdateAppSettingsRequest,
} from './contracts/settings';
import type {
  CompleteWindowCloseRequest,
  WindowCloseRequest,
} from './contracts/window-lifecycle';
import type {
  AgentEvent,
  CancelAgentRequest,
  CancelAgentResult,
  StartAgentPromptRequest,
  StartAgentPromptResult,
} from './contracts/agent';

export interface DriftfieldAPI {
  platform: string;
  cancelAgent: (request: CancelAgentRequest) => Promise<CancelAgentResult>;
  createProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  copyEditorSelection: () => Promise<void>;
  cutEditorSelection: () => Promise<void>;
  getAgentConfiguration: () => Promise<AgentConfiguration>;
  getAppSettings: () => Promise<AppSettings>;
  confirmCloseUnsavedDocument: (
    documentTitle: string,
  ) => Promise<CloseUnsavedDocumentDecision>;
  onProjectChanged: (listener: (project: ProjectSnapshot) => void) => () => void;
  onProjectWatcherStatusChanged: (
    listener: (status: ProjectWatcherStatus) => void,
  ) => () => void;
  onWindowCloseRequested: (
    listener: (request: WindowCloseRequest) => void,
  ) => () => void;
  onAgentEvent: (listener: (event: AgentEvent) => void) => () => void;
  pasteIntoEditor: () => Promise<void>;
  refreshProject: () => Promise<ProjectSnapshot | null>;
  removeAgentCredential: (
    request: RemoveAgentCredentialRequest,
  ) => Promise<AgentConfiguration>;
  saveProjectDocument: (
    request: SaveProjectDocumentRequest,
  ) => Promise<SaveProjectDocumentResult>;
  selectProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  selectAllEditorText: () => Promise<void>;
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
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}
