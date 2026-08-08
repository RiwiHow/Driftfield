import { contextBridge } from 'electron';
import type { DriftfieldAPI } from '../shared/electron-api';

const api: DriftfieldAPI = {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld('driftfield', api);

