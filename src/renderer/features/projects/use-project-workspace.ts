import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { WorkspaceDocument } from '@/app/types';
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
  const documentsRef = useRef<WorkspaceDocument[]>([]);
  documentsRef.current = state.documents;

  const localizeMessage = useCallback(
    (message: LocalizedWorkspaceMessage | null): string | null => {
      if (message === null) return null;
      return message.catalog === 'projects'
        ? t(message.key)
        : tErrors(message.key);
    },
    [t, tErrors],
  );

  const activeDocument = useMemo(
    () => state.documents.find(({ id }) => id === state.activeDocumentId) ?? null,
    [state.activeDocumentId, state.documents],
  );

  const commitSavedDocument = useCallback(
    (document: WorkspaceDocument, revision: string): void => {
      dispatch({ document, revision, type: 'commit-saved-document' });
    },
    [],
  );

  const saveDocuments = useCallback(
    async (
      documents: WorkspaceDocument[],
      messages: SaveDocumentsMessages,
    ): Promise<boolean> => {
      dispatch({ type: 'set-saving', value: true });
      dispatch({ type: 'set-save-message', value: null });
      try {
        for (const document of documents) {
          if (document.backingFileStatus === 'missing') {
            dispatch({ type: 'select-document', documentId: document.id });
            dispatch({ type: 'set-save-message', value: messages.missing });
            return false;
          }
          const result = await window.driftfield.saveProjectDocument({
            documentId: document.id,
            expectedRevision: document.revision,
            markdown: document.markdown,
          });
          if (result.status === 'conflict') {
            dispatch({ type: 'select-document', documentId: document.id });
            dispatch({
              type: 'set-save-conflict',
              value: {
                diskDocument: result.diskDocument,
                documentId: document.id,
              },
            });
            dispatch({ type: 'set-save-message', value: messages.conflict });
            return false;
          }
          if (result.status === 'missing') {
            dispatch({ type: 'select-document', documentId: document.id });
            dispatch({ type: 'set-save-message', value: messages.missing });
            return false;
          }
          commitSavedDocument(document, result.revision);
        }
        return true;
      } catch {
        dispatch({ type: 'set-save-message', value: messages.failed });
        return false;
      } finally {
        dispatch({ type: 'set-saving', value: false });
      }
    },
    [commitSavedDocument],
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
      if (result.status === 'story-updated') return;
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

  const updateActiveDocument = useCallback((markdown: string): void => {
    dispatch({ markdown, type: 'update-active-document' });
  }, []);

  const saveActiveDocument = useCallback(
    async (overwrite = false): Promise<boolean> => {
      if (
        activeDocument === null ||
        !activeDocument.isDirty ||
        state.isSavingDocument
      ) {
        return activeDocument !== null;
      }
      const { id: documentId, markdown } = activeDocument;
      dispatch({ type: 'set-saving', value: true });
      dispatch({ type: 'set-save-message', value: null });
      try {
        const result = await window.driftfield.saveProjectDocument({
          documentId,
          expectedRevision:
            overwrite && state.saveConflict?.documentId === documentId
              ? state.saveConflict.diskDocument.revision
              : activeDocument.revision,
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
        commitSavedDocument(activeDocument, result.revision);
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
      activeDocument,
      commitSavedDocument,
      state.isSavingDocument,
      state.saveConflict,
    ],
  );

  const dirtyDocumentsLabel = useCallback(
    (count: number): string => t('unsavedDocuments', { count }),
    [t],
  );

  useDocumentLifecycleEffects({
    documents: state.documents,
    documentsRef,
    dirtyDocumentsLabel,
    dispatch,
    saveActiveDocument,
    saveDocuments,
  });

  const closeActiveDocument = useCallback(async (): Promise<void> => {
    if (
      activeDocument === null ||
      state.isConfirmingClose ||
      state.isSavingDocument
    ) {
      return;
    }
    if (!activeDocument.isDirty) {
      dispatch({ type: 'select-document', documentId: null });
      return;
    }
    dispatch({ type: 'set-confirming-close', value: true });
    try {
      const decision = await window.driftfield.confirmCloseUnsavedDocument(
        activeDocument.title,
      );
      if (decision === 'save' && (await saveActiveDocument())) {
        dispatch({ type: 'select-document', documentId: null });
      } else if (decision === 'discard') {
        dispatch({ type: 'discard-active-changes' });
      }
    } finally {
      dispatch({ type: 'set-confirming-close', value: false });
    }
  }, [
    activeDocument,
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
      const dirtyDocuments = documentsRef.current.filter(
        (document) => document.isDirty,
      );
      if (dirtyDocuments.length > 0) {
        const decision = await window.driftfield.confirmCloseUnsavedDocument(
          dirtyDocumentsLabel(dirtyDocuments.length),
        );
        if (decision === 'cancel') return;
        if (
          decision === 'save' &&
          !(await saveDocuments(dirtyDocuments, {
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
    activeDocument,
    documents: state.documents,
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
    projectLoreTree: state.projectLoreTree,
    projectRootTitles: state.projectRootTitles,
    projectSelectionError: localizeMessage(state.projectSelectionMessage),
    projectTree: state.projectTree,
    projectWatcherError,
    refreshProject,
    reloadConflictedDocument,
    saveActiveDocument,
    saveConflict: state.saveConflict,
    selectDocument: (documentId: string | null) =>
      dispatch({ type: 'select-document', documentId }),
    selectProjectDirectory,
    updateActiveDocument,
  };
};
