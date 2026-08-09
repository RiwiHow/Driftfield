import type { Chapter } from '../../app/types';
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
  activeChapterId: string | null;
  chapters: Chapter[];
  documentSaveMessage: LocalizedWorkspaceMessage | null;
  isConfirmingClose: boolean;
  isRefreshingProject: boolean;
  isSavingDocument: boolean;
  projectDirectory: ProjectDirectory | null;
  projectIcon: ProjectSnapshot['projectIcon'];
  projectId: string | null;
  projectPickerAction: 'create' | 'open' | null;
  projectRootTitles: ProjectSnapshot['rootTitles'] | null;
  projectSelectionMessage: LocalizedWorkspaceMessage | null;
  projectTree: ProjectTreeNode[];
  projectWatcherCode: 'refresh-failed' | 'start-failed' | 'stopped' | null;
  saveConflict: SaveConflict | null;
}

export const initialProjectWorkspaceState: ProjectWorkspaceState = {
  activeChapterId: null,
  chapters: [],
  documentSaveMessage: null,
  isConfirmingClose: false,
  isRefreshingProject: false,
  isSavingDocument: false,
  projectDirectory: null,
  projectIcon: undefined,
  projectId: null,
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
  | { chapter: Chapter; revision: string; type: 'commit-saved-chapter' }
  | {
      result: Extract<ApplyAgentProposalResult, { status: 'saved' }>;
      sourceRevision: number;
      type: 'commit-agent-proposal';
    }
  | { markdown: string; type: 'update-active-chapter' }
  | { chapterId: string | null; type: 'select-chapter' }
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
      const chapters = mergeProjectSnapshot(
        state.chapters,
        action.project,
        action.preserveDirtyDocuments,
        action.sourceRevision,
      );
      const activeChapterId =
        action.preserveDirtyDocuments && state.activeChapterId === null
          ? null
          : state.activeChapterId !== null &&
              chapters.some(({ id }) => id === state.activeChapterId)
            ? state.activeChapterId
            : (chapters[0]?.id ?? null);
      return {
        ...state,
        activeChapterId,
        chapters,
        projectDirectory: action.project.directory,
        projectIcon: action.project.projectIcon,
        projectId: action.project.projectId,
        projectRootTitles: action.project.rootTitles ?? null,
        projectTree: action.project.tree,
      };
    }
    case 'commit-saved-chapter':
      return {
        ...state,
        chapters: state.chapters.map((chapter) =>
          chapter.id === action.chapter.id
            ? {
                ...chapter,
                isDirty: chapter.markdown !== action.chapter.markdown,
                previousMarkdown: action.chapter.markdown,
                revision: action.revision,
              }
            : chapter,
        ),
      };
    case 'commit-agent-proposal':
      return {
        ...state,
        chapters: state.chapters.map((chapter) =>
          chapter.id === action.result.documentId
            ? {
                ...chapter,
                isDirty: false,
                markdown: action.result.markdown,
                previousMarkdown: action.result.markdown,
                revision: action.result.revision,
                sourceRevision: action.sourceRevision,
              }
            : chapter,
        ),
      };
    case 'update-active-chapter':
      return {
        ...state,
        chapters: state.chapters.map((chapter) =>
          chapter.id === state.activeChapterId &&
          chapter.markdown !== action.markdown
            ? { ...chapter, isDirty: true, markdown: action.markdown }
            : chapter,
        ),
      };
    case 'select-chapter':
      return { ...state, activeChapterId: action.chapterId };
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
        chapters: state.chapters.map((chapter) =>
          chapter.id === documentId
            ? {
                ...chapter,
                isDirty: false,
                markdown: diskDocument.markdown,
                previousMarkdown: diskDocument.markdown,
                revision: diskDocument.revision,
                sourceRevision: action.sourceRevision,
              }
            : chapter,
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
        chapters: state.chapters.map((chapter) =>
          chapter.id === documentId
            ? {
                ...chapter,
                previousMarkdown: diskDocument.markdown,
                revision: diskDocument.revision,
                sourceRevision: action.sourceRevision,
              }
            : chapter,
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
        activeChapterId: null,
        chapters: state.chapters.map((chapter) =>
          chapter.id === state.activeChapterId
            ? {
                ...chapter,
                isDirty: false,
                markdown: chapter.previousMarkdown,
              }
            : chapter,
        ),
      };
  }
};
