import type {
  ProjectSnapshot,
  SelectProjectDirectoryResult,
} from './contracts/project';
import type {
  AppSettings,
  UpdateAppSettingsRequest,
} from './contracts/settings';

export interface DriftfieldAPI {
  platform: string;
  getAppSettings: () => Promise<AppSettings>;
  onProjectChanged: (listener: (project: ProjectSnapshot) => void) => () => void;
  refreshProject: () => Promise<ProjectSnapshot | null>;
  selectProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  updateAppSettings: (
    settings: UpdateAppSettingsRequest,
  ) => Promise<AppSettings>;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}
