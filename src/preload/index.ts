import { contextBridge, ipcRenderer } from "electron";
import type { DriftfieldAPI } from "../shared/electron-api";
import { IPC_CHANNELS } from "../shared/contracts/ipc-channels";
import type {
  AgentConfiguration,
  RemoveAgentCredentialRequest,
  ResetAgentSettingsResult,
  SetAgentApiKeyRequest,
  UpdateAgentModelOverrideRequest,
  UpdateAgentModelOverrideResult,
} from "../shared/contracts/agent-configuration";
import type {
  ProjectSnapshot,
  ProjectWatcherStatus,
  SaveProjectDocumentRequest,
  SelectProjectDirectoryResult,
  CloseUnsavedDocumentDecision,
  SaveProjectDocumentResult,
} from "../shared/contracts/project";
import type {
  AppSettings,
  ProjectAgentSettings,
  UpdateAppSettingsRequest,
  UpdateProjectAgentSettingsRequest,
} from "../shared/contracts/settings";
import type {
  CompleteWindowCloseRequest,
  WindowCloseRequest,
} from "../shared/contracts/window-lifecycle";
import type {
  AgentEvent,
  CancelAgentRequest,
  CancelAgentResult,
  StartAgentPromptRequest,
  StartAgentPromptResult,
} from "../shared/contracts/agent";
import type {
  ApplyAgentProposalRequest,
  ApplyAgentProposalResult,
  RejectAgentProposalRequest,
  RejectAgentProposalResult,
} from "../shared/contracts/agent-proposals";
import type {
  AgentConversationState,
  CreateAgentConversationRequest,
  DeleteAgentConversationRequest,
  RenameAgentConversationRequest,
  SelectAgentConversationRequest,
  UpdateAgentConversationMessageRequest,
} from '../shared/contracts/agent-conversations';
import type { ProjectStorySnapshot } from '../shared/contracts/project-story';

const api: DriftfieldAPI = {
  platform: process.platform,
  applyAgentProposal: (request: ApplyAgentProposalRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.applyAgentProposal,
      request,
    ) as Promise<ApplyAgentProposalResult>,
  cancelAgent: (request: CancelAgentRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.cancelAgent,
      request,
    ) as Promise<CancelAgentResult>,
  createAgentConversation: (request: CreateAgentConversationRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.createAgentConversation,
      request,
    ) as Promise<AgentConversationState>,
  deleteAgentConversation: (request: DeleteAgentConversationRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.deleteAgentConversation,
      request,
    ) as Promise<AgentConversationState>,
  createProjectDirectory: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.createProjectDirectory,
    ) as Promise<SelectProjectDirectoryResult>,
  copyEditorSelection: () =>
    ipcRenderer.invoke(IPC_CHANNELS.copyEditorSelection) as Promise<void>,
  cutEditorSelection: () =>
    ipcRenderer.invoke(IPC_CHANNELS.cutEditorSelection) as Promise<void>,
  confirmCloseUnsavedDocument: (documentTitle) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.confirmCloseUnsavedDocument,
      documentTitle,
    ) as Promise<CloseUnsavedDocumentDecision>,
  getAppSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAppSettings) as Promise<AppSettings>,
  getProjectAgentSettings: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getProjectAgentSettings,
    ) as Promise<ProjectAgentSettings>,
  getProjectStory: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getProjectStory,
    ) as Promise<ProjectStorySnapshot>,
  getAgentConfiguration: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getAgentConfiguration,
    ) as Promise<AgentConfiguration>,
  getAgentConversationState: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.getAgentConversationState,
    ) as Promise<AgentConversationState>,
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
  onAgentEvent: (listener) => {
    const handleAgentEvent = (
      _event: Electron.IpcRendererEvent,
      agentEvent: AgentEvent,
    ): void => listener(agentEvent);
    ipcRenderer.on(IPC_CHANNELS.agentEvent, handleAgentEvent);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handleAgentEvent);
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
  pasteIntoEditor: () =>
    ipcRenderer.invoke(IPC_CHANNELS.pasteIntoEditor) as Promise<void>,
  refreshProject: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.refreshProject,
    ) as Promise<ProjectSnapshot | null>,
  restoreLastProject: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.restoreLastProject,
    ) as Promise<ProjectSnapshot | null>,
  rejectAgentProposal: (request: RejectAgentProposalRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.rejectAgentProposal,
      request,
    ) as Promise<RejectAgentProposalResult>,
  renameAgentConversation: (request: RenameAgentConversationRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.renameAgentConversation,
      request,
    ) as Promise<AgentConversationState>,
  removeAgentCredential: (request: RemoveAgentCredentialRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.removeAgentCredential,
      request,
    ) as Promise<AgentConfiguration>,
  resetAgentSettings: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.resetAgentSettings,
    ) as Promise<ResetAgentSettingsResult>,
  saveProjectDocument: (request: SaveProjectDocumentRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.saveProjectDocument,
      request,
    ) as Promise<SaveProjectDocumentResult>,
  selectAllEditorText: () =>
    ipcRenderer.invoke(IPC_CHANNELS.selectAllEditorText) as Promise<void>,
  selectAgentConversation: (request: SelectAgentConversationRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.selectAgentConversation,
      request,
    ) as Promise<AgentConversationState>,
  setWindowDirty: (isDirty: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setWindowDirty, isDirty) as Promise<void>,
  setAgentApiKey: (request: SetAgentApiKeyRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.setAgentApiKey,
      request,
    ) as Promise<AgentConfiguration>,
  startAgentPrompt: (request: StartAgentPromptRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.startAgentPrompt,
      request,
    ) as Promise<StartAgentPromptResult>,
  completeWindowClose: (request: CompleteWindowCloseRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.completeWindowClose,
      request,
    ) as Promise<void>,
  selectProjectDirectory: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.selectProjectDirectory,
    ) as Promise<SelectProjectDirectoryResult>,
  updateAppSettings: (settings: UpdateAppSettingsRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateAppSettings,
      settings,
    ) as Promise<AppSettings>,
  updateProjectAgentSettings: (settings: UpdateProjectAgentSettingsRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateProjectAgentSettings,
      settings,
    ) as Promise<ProjectAgentSettings>,
  updateAgentModelOverride: (request: UpdateAgentModelOverrideRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateAgentModelOverride,
      request,
    ) as Promise<UpdateAgentModelOverrideResult>,
  updateAgentConversationMessage: (request: UpdateAgentConversationMessageRequest) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateAgentConversationMessage,
      request,
    ) as Promise<AgentConversationState>,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
};

contextBridge.exposeInMainWorld("driftfield", api);
