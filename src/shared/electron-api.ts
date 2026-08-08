import type {
  ProjectSnapshot,
  SaveProjectDocumentRequest,
  SelectProjectDirectoryResult,
  CloseUnsavedDocumentDecision,
} from './contracts/project';
import type {
  AppSettings,
  UpdateAppSettingsRequest,
} from './contracts/settings';

export interface DriftfieldAPI {
  platform: string;
  getAppSettings: () => Promise<AppSettings>;
  confirmCloseUnsavedDocument: (
    documentTitle: string,
  ) => Promise<CloseUnsavedDocumentDecision>;
  onProjectChanged: (listener: (project: ProjectSnapshot) => void) => () => void;
  refreshProject: () => Promise<ProjectSnapshot | null>;
  saveProjectDocument: (request: SaveProjectDocumentRequest) => Promise<void>;
  selectProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  showEditorContextMenu: () => Promise<void>;
  updateAppSettings: (
    settings: UpdateAppSettingsRequest,
  ) => Promise<AppSettings>;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}
