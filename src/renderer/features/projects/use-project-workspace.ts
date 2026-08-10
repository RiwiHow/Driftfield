import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { Chapter } from '@/app/types';
import type { SuccessfulApplyAgentProposalResult } from '../../../shared/contracts/agent-proposals';
import type { ProjectSnapshot } from '../../../shared/contracts/project';
import {
  initialProjectWorkspaceState,
  projectWorkspaceReducer,
  type LocalizedWorkspaceMessage,
} from './project-workspace-reducer';
import {
  useDocumentLifecycleEffects,
  type SaveDocumentsMessages,
} from './use-document-lifecycle-effects';
import { useProjectSessionEffects } from './use-project-session-effects';

export const useProjectWorkspace = (initialProject: ProjectSnapshot | null) => {
  const { t } = useTranslation('projects');
  const { t: tErrors } = useTranslation('errors');
  const [state, dispatch] = useReducer(
    projectWorkspaceReducer,
    initialProjectWorkspaceState,
  );
  const projectRevision = useRef(0);
  const chaptersRef = useRef<Chapter[]>([]);
  chaptersRef.current = state.chapters;

  const localizeMessage = useCallback(
    (message: LocalizedWorkspaceMessage | null): string | null => {
      if (message === null) return null;
      return message.catalog === 'projects'
        ? t(message.key)
        : tErrors(message.key);
    },
    [t, tErrors],
  );

  const activeChapter = useMemo(
    () => state.chapters.find(({ id }) => id === state.activeChapterId) ?? null,
    [state.activeChapterId, state.chapters],
  );

  const commitSavedChapter = useCallback(
    (chapter: Chapter, revision: string): void => {
      dispatch({ chapter, revision, type: 'commit-saved-chapter' });
    },
    [],
  );

  const saveDocuments = useCallback(
    async (
      documents: Chapter[],
      messages: SaveDocumentsMessages,
    ): Promise<boolean> => {
      dispatch({ type: 'set-saving', value: true });
      dispatch({ type: 'set-save-message', value: null });
      try {
        for (const chapter of documents) {
          if (chapter.backingFileStatus === 'missing') {
            dispatch({ type: 'select-chapter', chapterId: chapter.id });
            dispatch({ type: 'set-save-message', value: messages.missing });
            return false;
          }
          const result = await window.driftfield.saveProjectDocument({
            documentId: chapter.id,
            expectedRevision: chapter.revision,
            markdown: chapter.markdown,
          });
          if (result.status === 'conflict') {
            dispatch({ type: 'select-chapter', chapterId: chapter.id });
            dispatch({
              type: 'set-save-conflict',
              value: {
                diskDocument: result.diskDocument,
                documentId: chapter.id,
              },
            });
            dispatch({ type: 'set-save-message', value: messages.conflict });
            return false;
          }
          if (result.status === 'missing') {
            dispatch({ type: 'select-chapter', chapterId: chapter.id });
            dispatch({ type: 'set-save-message', value: messages.missing });
            return false;
          }
          commitSavedChapter(chapter, result.revision);
        }
        return true;
      } catch {
        dispatch({ type: 'set-save-message', value: messages.failed });
        return false;
      } finally {
        dispatch({ type: 'set-saving', value: false });
      }
    },
    [commitSavedChapter],
  );

  const applyProjectSnapshot = useCallback(
    (project: ProjectSnapshot, preserveDirtyDocuments: boolean): void => {
      dispatch({
        preserveDirtyDocuments,
        project,
        sourceRevision: ++projectRevision.current,
        type: 'apply-snapshot',
      });
    },
    [],
  );

  const commitAgentProposal = useCallback(
    (result: SuccessfulApplyAgentProposalResult): void => {
      if (result.status === 'saved') {
        dispatch({
          result,
          sourceRevision: ++projectRevision.current,
          type: 'commit-agent-proposal',
        });
      } else {
        applyProjectSnapshot(result.project, true);
      }
    },
    [applyProjectSnapshot],
  );

  useProjectSessionEffects({
    applyProjectSnapshot,
    dispatch,
    initialProject,
  });

  const updateActiveChapter = useCallback((markdown: string): void => {
    dispatch({ markdown, type: 'update-active-chapter' });
  }, []);

  const saveActiveDocument = useCallback(
    async (overwrite = false): Promise<boolean> => {
      if (
        activeChapter === null ||
        !activeChapter.isDirty ||
        state.isSavingDocument
      ) {
        return activeChapter !== null;
      }
      const { id: documentId, markdown } = activeChapter;
      dispatch({ type: 'set-saving', value: true });
      dispatch({ type: 'set-save-message', value: null });
      try {
        const result = await window.driftfield.saveProjectDocument({
          documentId,
          expectedRevision:
            overwrite && state.saveConflict?.documentId === documentId
              ? state.saveConflict.diskDocument.revision
              : activeChapter.revision,
          markdown,
          overwrite,
        });
        if (result.status === 'conflict') {
          dispatch({
            type: 'set-save-conflict',
            value: { diskDocument: result.diskDocument, documentId },
          });
          dispatch({
            type: 'set-save-message',
            value: { catalog: 'projects', key: 'errors.saveConflict' },
          });
          return false;
        }
        if (result.status === 'missing') {
          dispatch({
            type: 'set-save-message',
            value: { catalog: 'projects', key: 'errors.saveMissing' },
          });
          return false;
        }
        commitSavedChapter(activeChapter, result.revision);
        dispatch({ type: 'set-save-conflict', value: null });
        return true;
      } catch {
        dispatch({
          type: 'set-save-message',
          value: { catalog: 'errors', key: 'projects.save' },
        });
        return false;
      } finally {
        dispatch({ type: 'set-saving', value: false });
      }
    },
    [
      activeChapter,
      commitSavedChapter,
      state.isSavingDocument,
      state.saveConflict,
    ],
  );

  const dirtyDocumentsLabel = useCallback(
    (count: number): string => t('unsavedDocuments', { count }),
    [t],
  );

  useDocumentLifecycleEffects({
    chapters: state.chapters,
    chaptersRef,
    dirtyDocumentsLabel,
    dispatch,
    saveActiveDocument,
    saveDocuments,
  });

  const closeActiveDocument = useCallback(async (): Promise<void> => {
    if (
      activeChapter === null ||
      state.isConfirmingClose ||
      state.isSavingDocument
    ) {
      return;
    }
    if (!activeChapter.isDirty) {
      dispatch({ type: 'select-chapter', chapterId: null });
      return;
    }
    dispatch({ type: 'set-confirming-close', value: true });
    try {
      const decision = await window.driftfield.confirmCloseUnsavedDocument(
        activeChapter.title,
      );
      if (decision === 'save' && (await saveActiveDocument())) {
        dispatch({ type: 'select-chapter', chapterId: null });
      } else if (decision === 'discard') {
        dispatch({ type: 'discard-active-changes' });
      }
    } finally {
      dispatch({ type: 'set-confirming-close', value: false });
    }
  }, [
    activeChapter,
    saveActiveDocument,
    state.isConfirmingClose,
    state.isSavingDocument,
  ]);

  const chooseProjectDirectory = useCallback(
    async (
      choose: () => Promise<ProjectSnapshot | null>,
      errorKey: 'projects.create' | 'projects.open',
      pickerAction: 'create' | 'open',
    ): Promise<void> => {
      if (state.projectPickerAction !== null || state.isSavingDocument) return;
      const dirtyChapters = chaptersRef.current.filter(
        (chapter) => chapter.isDirty,
      );
      if (dirtyChapters.length > 0) {
        const decision = await window.driftfield.confirmCloseUnsavedDocument(
          dirtyDocumentsLabel(dirtyChapters.length),
        );
        if (decision === 'cancel') return;
        if (
          decision === 'save' &&
          !(await saveDocuments(dirtyChapters, {
            conflict: {
              catalog: 'projects',
              key: 'errors.conflictBeforeSwitch',
            },
            failed: {
              catalog: 'projects',
              key: 'errors.failedBeforeSwitch',
            },
            missing: {
              catalog: 'projects',
              key: 'errors.missingBeforeSwitch',
            },
          }))
        ) {
          return;
        }
      }
      dispatch({ type: 'set-picker-action', value: pickerAction });
      dispatch({ type: 'set-selection-message', value: null });
      try {
        const project = await choose();
        if (project !== null) applyProjectSnapshot(project, false);
      } catch {
        dispatch({
          type: 'set-selection-message',
          value: { catalog: 'errors', key: errorKey },
        });
      } finally {
        dispatch({ type: 'set-picker-action', value: null });
      }
    },
    [
      applyProjectSnapshot,
      dirtyDocumentsLabel,
      saveDocuments,
      state.isSavingDocument,
      state.projectPickerAction,
    ],
  );

  const createProjectDirectory = useCallback(
    () =>
      chooseProjectDirectory(
        window.driftfield.createProjectDirectory,
        'projects.create',
        'create',
      ),
    [chooseProjectDirectory],
  );

  const selectProjectDirectory = useCallback(
    () =>
      chooseProjectDirectory(
        window.driftfield.selectProjectDirectory,
        'projects.open',
        'open',
      ),
    [chooseProjectDirectory],
  );

  const refreshProject = useCallback(async (): Promise<void> => {
    if (state.projectDirectory === null || state.isRefreshingProject) return;
    dispatch({ type: 'set-refreshing', value: true });
    dispatch({ type: 'set-selection-message', value: null });
    try {
      const project = await window.driftfield.refreshProject();
      if (project !== null) applyProjectSnapshot(project, true);
    } catch {
      dispatch({
        type: 'set-selection-message',
        value: { catalog: 'errors', key: 'projects.refresh' },
      });
    } finally {
      dispatch({ type: 'set-refreshing', value: false });
    }
  }, [applyProjectSnapshot, state.isRefreshingProject, state.projectDirectory]);

  const reloadConflictedDocument = useCallback((): void => {
    dispatch({
      sourceRevision: ++projectRevision.current,
      type: 'reload-conflict',
    });
  }, []);

  const compareConflictedDocument = useCallback((): void => {
    dispatch({
      sourceRevision: ++projectRevision.current,
      type: 'compare-conflict',
    });
  }, []);

  const projectWatcherError =
    state.projectWatcherCode === null
      ? null
      : t(
          state.projectWatcherCode === 'refresh-failed'
            ? 'watcher.refreshFailed'
            : state.projectWatcherCode === 'start-failed'
              ? 'watcher.startFailed'
              : 'watcher.stopped',
        );

  return {
    activeChapter,
    chapters: state.chapters,
    commitAgentProposal,
    closeActiveDocument,
    compareConflictedDocument,
    createProjectDirectory,
    dismissSaveConflict: () =>
      dispatch({ type: 'set-save-conflict', value: null }),
    documentSaveError: localizeMessage(state.documentSaveMessage),
    isCreatingProject: state.projectPickerAction === 'create',
    isRefreshingProject: state.isRefreshingProject,
    isSavingDocument: state.isSavingDocument,
    isSelectingProject: state.projectPickerAction !== null,
    projectDirectory: state.projectDirectory,
    projectId: state.projectId,
    projectIcon: state.projectIcon,
    projectRootTitles: state.projectRootTitles,
    projectSelectionError: localizeMessage(state.projectSelectionMessage),
    projectTree: state.projectTree,
    projectWatcherError,
    refreshProject,
    reloadConflictedDocument,
    saveActiveDocument,
    saveConflict: state.saveConflict,
    selectChapter: (chapterId: string | null) =>
      dispatch({ type: 'select-chapter', chapterId }),
    selectProjectDirectory,
    updateActiveChapter,
  };
};
