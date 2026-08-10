import { useEffect, type Dispatch, type RefObject } from 'react';

import type { WorkspaceDocument } from '../../app/types';
import type {
  LocalizedWorkspaceMessage,
  ProjectWorkspaceAction,
} from './project-workspace-reducer';

export interface SaveDocumentsMessages {
  conflict: LocalizedWorkspaceMessage;
  failed: LocalizedWorkspaceMessage;
  missing: LocalizedWorkspaceMessage;
}

interface DocumentLifecycleEffectsOptions {
  documents: WorkspaceDocument[];
  documentsRef: RefObject<WorkspaceDocument[]>;
  dirtyDocumentsLabel: (count: number) => string;
  dispatch: Dispatch<ProjectWorkspaceAction>;
  saveActiveDocument: () => Promise<boolean>;
  saveDocuments: (
    documents: WorkspaceDocument[],
    messages: SaveDocumentsMessages,
  ) => Promise<boolean>;
}

export const useDocumentLifecycleEffects = ({
  documents,
  documentsRef,
  dirtyDocumentsLabel,
  dispatch,
  saveActiveDocument,
  saveDocuments,
}: DocumentLifecycleEffectsOptions): void => {
  useEffect(() => {
    void window.driftfield
      .setWindowDirty(documents.some((document) => document.isDirty))
      .catch(() => {
        dispatch({
          type: 'set-save-message',
          value: { catalog: 'errors', key: 'projects.dirtySync' },
        });
      });
  }, [documents, dispatch]);

  useEffect(
    () =>
      window.driftfield.onWindowCloseRequested((request) => {
        void (async () => {
          const dirtyDocuments = documentsRef.current.filter(
            (document) => document.isDirty,
          );
          if (dirtyDocuments.length === 0) {
            await window.driftfield.completeWindowClose({
              proceed: true,
              requestId: request.requestId,
            });
            return;
          }
          dispatch({ type: 'set-confirming-close', value: true });
          const decision = await window.driftfield.confirmCloseUnsavedDocument(
            dirtyDocumentsLabel(dirtyDocuments.length),
          );
          let proceed = decision === 'discard';
          if (decision === 'save') {
            proceed = await saveDocuments(dirtyDocuments, {
              conflict: {
                catalog: 'projects',
                key: 'errors.conflictBeforeQuit',
              },
              failed: {
                catalog: 'projects',
                key: 'errors.failedBeforeQuit',
              },
              missing: {
                catalog: 'projects',
                key: 'errors.missingBeforeQuit',
              },
            });
          }
          dispatch({ type: 'set-confirming-close', value: false });
          await window.driftfield.completeWindowClose({
            proceed,
            requestId: request.requestId,
          });
        })();
      }),
    [documentsRef, dirtyDocumentsLabel, dispatch, saveDocuments],
  );

  useEffect(() => {
    const saveFromKeyboard = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveActiveDocument();
      }
    };
    window.addEventListener('keydown', saveFromKeyboard, { capture: true });
    return () =>
      window.removeEventListener('keydown', saveFromKeyboard, {
        capture: true,
      });
  }, [saveActiveDocument]);
};
