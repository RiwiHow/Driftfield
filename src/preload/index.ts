import { contextBridge, ipcRenderer } from 'electron';
import type { DriftfieldAPI } from '../shared/electron-api';
import { IPC_CHANNELS } from '../shared/contracts/ipc-channels';
import type { SelectProjectDirectoryResult } from '../shared/contracts/project';

const api: DriftfieldAPI = {
  platform: process.platform,
  selectProjectDirectory: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.selectProjectDirectory,
    ) as Promise<SelectProjectDirectoryResult>,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld('driftfield', api);
