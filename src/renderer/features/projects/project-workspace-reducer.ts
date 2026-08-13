import type { WorkspaceDocument } from '../../app/types';
import { mergeProjectSnapshot } from '../library/merge-project-snapshot';
import type { ApplyAgentProposalResult } from '../../../shared/contracts/agent-proposals';
import type {
  ProjectDirectory,
  ProjectDocument,
  ProjectSnapshot,
  ProjectTreeNode,
} from '../../../shared/contracts/project';

export interface SaveConflict {
  diskDocument: ProjectDocument;
  documentId: string;
}

export type ProjectMessageKey =
  | 'errors.conflictBeforeQuit'
  | 'errors.conflictBeforeSwitch'
  | 'errors.failedBeforeQuit'
  | 'errors.failedBeforeSwitch'
  | 'errors.missingBeforeQuit'
  | 'errors.missingBeforeSwitch'
  | 'errors.saveConflict'
  | 'errors.saveMissing'
  | 'messages.comparisonReady';

export type ErrorMessageKey =
  | 'projects.create'
  | 'projects.dirtySync'
  | 'projects.open'
  | 'projects.refresh'
  | 'projects.save';

export type LocalizedWorkspaceMessage =
  | { catalog: 'projects'; key: ProjectMessageKey }
  | { catalog: 'errors'; key: ErrorMessageKey };

export interface ProjectWorkspaceState {
  activeDocumentId: string | null;
  documents: WorkspaceDocument[];
  documentSaveMessage: LocalizedWorkspaceMessage | null;
  isConfirmingClose: boolean;
  isRefreshingProject: boolean;
  isSavingDocument: boolean;
  projectDirectory: ProjectDirectory | null;
  projectIcon: ProjectSnapshot['projectIcon'];
  projectId: string | null;
  projectLoreTree: ProjectSnapshot['loreTree'];
  projectPickerAction: 'create' | 'open' | null;
  projectRootTitles: ProjectSnapshot['rootTitles'] | null;
  projectSelectionMessage: LocalizedWorkspaceMessage | null;
  projectTree: ProjectTreeNode[];
  projectWatcherCode: 'refresh-failed' | 'start-failed' | 'stopped' | null;
  saveConflict: SaveConflict | null;
}

export const initialProjectWorkspaceState: ProjectWorkspaceState = {
  activeDocumentId: null,
  documents: [],
  documentSaveMessage: null,
  isConfirmingClose: false,
  isRefreshingProject: false,
  isSavingDocument: false,
  projectDirectory: null,
  projectIcon: undefined,
  projectId: null,
  projectLoreTree: null,
  projectPickerAction: null,
  projectRootTitles: null,
  projectSelectionMessage: null,
  projectTree: [],
  projectWatcherCode: null,
  saveConflict: null,
};

export type ProjectWorkspaceAction =
  | {
      project: ProjectSnapshot;
      preserveDirtyDocuments: boolean;
      sourceRevision: number;
      type: 'apply-snapshot';
    }
  | { document: WorkspaceDocument; revision: string; type: 'commit-saved-document' }
  | {
      result: Extract<ApplyAgentProposalResult, { status: 'saved' }>;
      sourceRevision: number;
      type: 'commit-agent-proposal';
    }
  | { markdown: string; type: 'update-active-document' }
  | { documentId: string | null; type: 'select-document' }
  | {
      value: boolean;
      type: 'set-saving' | 'set-confirming-close' | 'set-refreshing';
    }
  | { value: 'create' | 'open' | null; type: 'set-picker-action' }
  | { value: LocalizedWorkspaceMessage | null; type: 'set-save-message' }
  | { value: LocalizedWorkspaceMessage | null; type: 'set-selection-message' }
  | { value: SaveConflict | null; type: 'set-save-conflict' }
  | {
      value: ProjectWorkspaceState['projectWatcherCode'];
      type: 'set-watcher-code';
    }
  | { sourceRevision: number; type: 'reload-conflict' | 'compare-conflict' }
  | { type: 'discard-active-changes' };

export const projectWorkspaceReducer = (
  state: ProjectWorkspaceState,
  action: ProjectWorkspaceAction,
): ProjectWorkspaceState => {
  switch (action.type) {
    case 'apply-snapshot': {
      const documents = mergeProjectSnapshot(
        state.documents,
        action.project,
        action.preserveDirtyDocuments,
        action.sourceRevision,
      );
      const activeDocumentId =
        action.preserveDirtyDocuments && state.activeDocumentId === null
          ? null
          : state.activeDocumentId !== null &&
              documents.some(({ id }) => id === state.activeDocumentId)
            ? state.activeDocumentId
            : (documents[0]?.id ?? null);
      return {
        ...state,
        activeDocumentId,
        documents,
        projectDirectory: action.project.directory,
        projectIcon: action.project.projectIcon,
        projectId: action.project.projectId,
        projectLoreTree: action.project.loreTree,
        projectRootTitles: action.project.rootTitles,
        projectTree: action.project.tree,
      };
    }
    case 'commit-saved-document':
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === action.document.id
            ? {
                ...document,
                isDirty: document.markdown !== action.document.markdown,
                previousMarkdown: action.document.markdown,
                revision: action.revision,
              }
            : document,
        ),
      };
    case 'commit-agent-proposal':
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === action.result.documentId
            ? {
                ...document,
                isDirty: false,
                markdown: action.result.markdown,
                previousMarkdown: action.result.markdown,
                revision: action.result.revision,
                sourceRevision: action.sourceRevision,
              }
            : document,
        ),
      };
    case 'update-active-document':
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === state.activeDocumentId &&
          document.markdown !== action.markdown
            ? { ...document, isDirty: true, markdown: action.markdown }
            : document,
        ),
      };
    case 'select-document':
      return { ...state, activeDocumentId: action.documentId };
    case 'set-saving':
      return { ...state, isSavingDocument: action.value };
    case 'set-confirming-close':
      return { ...state, isConfirmingClose: action.value };
    case 'set-refreshing':
      return { ...state, isRefreshingProject: action.value };
    case 'set-picker-action':
      return { ...state, projectPickerAction: action.value };
    case 'set-save-message':
      return { ...state, documentSaveMessage: action.value };
    case 'set-selection-message':
      return { ...state, projectSelectionMessage: action.value };
    case 'set-save-conflict':
      return { ...state, saveConflict: action.value };
    case 'set-watcher-code':
      return { ...state, projectWatcherCode: action.value };
    case 'reload-conflict': {
      if (state.saveConflict === null) return state;
      const { diskDocument, documentId } = state.saveConflict;
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === documentId
            ? {
                ...document,
                isDirty: false,
                markdown: diskDocument.markdown,
                previousMarkdown: diskDocument.markdown,
                revision: diskDocument.revision,
                sourceRevision: action.sourceRevision,
              }
            : document,
        ),
        documentSaveMessage: null,
        saveConflict: null,
      };
    }
    case 'compare-conflict': {
      if (state.saveConflict === null) return state;
      const { diskDocument, documentId } = state.saveConflict;
      return {
        ...state,
        documents: state.documents.map((document) =>
          document.id === documentId
            ? {
                ...document,
                previousMarkdown: diskDocument.markdown,
                revision: diskDocument.revision,
                sourceRevision: action.sourceRevision,
              }
            : document,
        ),
        documentSaveMessage: {
          catalog: 'projects',
          key: 'messages.comparisonReady',
        },
        saveConflict: null,
      };
    }
    case 'discard-active-changes':
      return {
        ...state,
        activeDocumentId: null,
        documents: state.documents.map((document) =>
          document.id === state.activeDocumentId
            ? {
                ...document,
                isDirty: false,
                markdown: document.previousMarkdown,
              }
            : document,
        ),
      };
  }
};
