import type { SelectProjectDirectoryResult } from './contracts/project';

export interface DriftfieldAPI {
  platform: string;
  selectProjectDirectory: () => Promise<SelectProjectDirectoryResult>;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}
