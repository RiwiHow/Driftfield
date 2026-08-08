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
  refreshProject: () => Promise<ProjectSnapshot | null>;
  saveProjectDocument: (
    request: SaveProjectDocumentRequest,
  ) => Promise<SaveProjectDocumentResult>;
  selectProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  showEditorContextMenu: () => Promise<void>;
  setWindowDirty: (isDirty: boolean) => Promise<void>;
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
