import { contextBridge, ipcRenderer } from 'electron';
import type { DriftfieldAPI } from '../shared/electron-api';
import { IPC_CHANNELS } from '../shared/contracts/ipc-channels';
import type {
  ProjectSnapshot,
  ProjectWatcherStatus,
  SaveProjectDocumentRequest,
  SelectProjectDirectoryResult,
  CloseUnsavedDocumentDecision,
  SaveProjectDocumentResult,
} from '../shared/contracts/project';
import type {
  AppSettings,
  UpdateAppSettingsRequest,
} from '../shared/contracts/settings';
import type {
  CompleteWindowCloseRequest,
  WindowCloseRequest,
} from '../shared/contracts/window-lifecycle';

const api: DriftfieldAPI = {
  platform: process.platform,
  confirmCloseUnsavedDocument: (documentTitle) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.confirmCloseUnsavedDocument,
      documentTitle,
    ) as Promise<CloseUnsavedDocumentDecision>,
  getAppSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAppSettings) as Promise<AppSettings>,
  onProjectChanged: (listener) => {
    const handleProjectChanged = (
      _event: Electron.IpcRendererEvent,
      project: ProjectSnapshot,
    ): void => listener(project);

    ipcRenderer.on(IPC_CHANNELS.projectChanged, handleProjectChanged);
    return () =>
      ipcRenderer.removeListener(
        IPC_CHANNELS.projectChanged,
        handleProjectChanged,
      );
  },
  onProjectWatcherStatusChanged: (listener) => {
    const handleStatus = (
      _event: Electron.IpcRendererEvent,
      status: ProjectWatcherStatus,
    ): void => listener(status);
    ipcRenderer.on(IPC_CHANNELS.projectWatcherStatusChanged, handleStatus);
    return () =>
      ipcRenderer.removeListener(
        IPC_CHANNELS.projectWatcherStatusChanged,
        handleStatus,
      );
  },
  onWindowCloseRequested: (listener) => {
    const handleCloseRequested = (
      _event: Electron.IpcRendererEvent,
      request: WindowCloseRequest,
    ): void => listener(request);
    ipcRenderer.on(IPC_CHANNELS.windowCloseRequested, handleCloseRequested);
    return () =>
      ipcRenderer.removeListener(
        IPC_CHANNELS.windowCloseRequested,
        handleCloseRequested,
      );
  },
  refreshProject: () =>
    ipcRenderer.invoke(IPC_CHANNELS.refreshProject) as Promise<
      ProjectSnapshot | null
    >,
  saveProjectDocument: (request: SaveProjectDocumentRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveProjectDocument, request) as Promise<
      SaveProjectDocumentResult
    >,
  showEditorContextMenu: () =>
    ipcRenderer.invoke(IPC_CHANNELS.showEditorContextMenu) as Promise<void>,
  setWindowDirty: (isDirty: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setWindowDirty, isDirty) as Promise<void>,
  completeWindowClose: (request: CompleteWindowCloseRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.completeWindowClose, request) as Promise<void>,
  selectProjectDirectory: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.selectProjectDirectory,
    ) as Promise<SelectProjectDirectoryResult>,
  updateAppSettings: (settings: UpdateAppSettingsRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateAppSettings,
      settings,
    ) as Promise<AppSettings>,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld('driftfield', api);
