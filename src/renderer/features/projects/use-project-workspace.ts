import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Chapter } from '@/app/types';
import { mergeProjectSnapshot } from '@/features/library/merge-project-snapshot';
import type {
  ProjectDirectory,
  ProjectDocument,
  ProjectSnapshot,
  ProjectTreeNode,
} from '../../../shared/contracts/project';

interface SaveConflict {
  diskDocument: ProjectDocument;
  documentId: string;
}

type ProjectMessageKey =
  | 'errors.conflictBeforeQuit'
  | 'errors.conflictBeforeSwitch'
  | 'errors.failedBeforeQuit'
  | 'errors.failedBeforeSwitch'
  | 'errors.missingBeforeQuit'
  | 'errors.missingBeforeSwitch'
  | 'errors.saveConflict'
  | 'errors.saveMissing'
  | 'messages.comparisonReady';

type ErrorMessageKey =
  | 'projects.dirtySync'
  | 'projects.open'
  | 'projects.refresh'
  | 'projects.save';

type LocalizedWorkspaceMessage =
  | { catalog: 'projects'; key: ProjectMessageKey }
  | { catalog: 'errors'; key: ErrorMessageKey };

interface SaveDocumentsMessages {
  conflict: LocalizedWorkspaceMessage;
  failed: LocalizedWorkspaceMessage;
  missing: LocalizedWorkspaceMessage;
}

export const useProjectWorkspace = () => {
  const { t } = useTranslation('projects');
  const { t: tErrors } = useTranslation('errors');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [projectDirectory, setProjectDirectory] =
    useState<ProjectDirectory | null>(null);
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([]);
  const [isSelectingProject, setIsSelectingProject] = useState(false);
  const [isRefreshingProject, setIsRefreshingProject] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const [documentSaveMessage, setDocumentSaveMessage] =
    useState<LocalizedWorkspaceMessage | null>(null);
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null);
  const [projectSelectionMessage, setProjectSelectionMessage] =
    useState<LocalizedWorkspaceMessage | null>(null);
  const [projectWatcherCode, setProjectWatcherCode] = useState<
    'refresh-failed' | 'start-failed' | 'stopped' | null
  >(null);
  const projectRevision = useRef(0);
  const chaptersRef = useRef<Chapter[]>([]);
  chaptersRef.current = chapters;

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
    () => chapters.find((chapter) => chapter.id === activeChapterId) ?? null,
    [activeChapterId, chapters],
  );

  const commitSavedChapter = useCallback(
    (chapter: Chapter, revision: string): void => {
      setChapters((current) =>
        current.map((item) =>
          item.id === chapter.id
            ? {
                ...item,
                isDirty: item.markdown !== chapter.markdown,
                previousMarkdown: chapter.markdown,
                revision,
              }
            : item,
        ),
      );
    },
    [],
  );

  const saveDocuments = useCallback(
    async (
      documents: Chapter[],
      messages: SaveDocumentsMessages,
    ): Promise<boolean> => {
      setIsSavingDocument(true);
      setDocumentSaveMessage(null);
      try {
        for (const chapter of documents) {
          if (chapter.backingFileStatus === 'missing') {
            setActiveChapterId(chapter.id);
            setDocumentSaveMessage(messages.missing);
            return false;
          }
          const result = await window.driftfield.saveProjectDocument({
            documentId: chapter.id,
            expectedRevision: chapter.revision,
            markdown: chapter.markdown,
          });
          if (result.status === 'conflict') {
            setActiveChapterId(chapter.id);
            setSaveConflict({
              diskDocument: result.diskDocument,
              documentId: chapter.id,
            });
            setDocumentSaveMessage(messages.conflict);
            return false;
          }
          if (result.status === 'missing') {
            setActiveChapterId(chapter.id);
            setDocumentSaveMessage(messages.missing);
            return false;
          }
          commitSavedChapter(chapter, result.revision);
        }
        return true;
      } catch {
        setDocumentSaveMessage(messages.failed);
        return false;
      } finally {
        setIsSavingDocument(false);
      }
    },
    [commitSavedChapter],
  );

  const applyProjectSnapshot = useCallback(
    (project: ProjectSnapshot, preserveDirtyDocuments: boolean): void => {
      const next = mergeProjectSnapshot(
        chaptersRef.current,
        project,
        preserveDirtyDocuments,
        ++projectRevision.current,
      );
      setProjectDirectory(project.directory);
      setProjectTree(project.tree);
      setChapters(next);
      setActiveChapterId((activeId) =>
        preserveDirtyDocuments && activeId === null
          ? null
          : activeId !== null && next.some((chapter) => chapter.id === activeId)
            ? activeId
            : (next[0]?.id ?? null),
      );
    },
    [],
  );

  useEffect(() => {
    void window.driftfield
      .setWindowDirty(chapters.some((chapter) => chapter.isDirty))
      .catch(() => {
        setDocumentSaveMessage({
          catalog: 'errors',
          key: 'projects.dirtySync',
        });
      });
  }, [chapters]);

  useEffect(
    () =>
      window.driftfield.onProjectChanged((project) => {
        setProjectSelectionMessage(null);
        applyProjectSnapshot(project, true);
      }),
    [applyProjectSnapshot],
  );

  useEffect(
    () =>
      window.driftfield.onProjectWatcherStatusChanged((status) => {
        setProjectWatcherCode(status.status === 'error' ? status.code : null);
      }),
    [],
  );

  useEffect(
    () =>
      window.driftfield.onWindowCloseRequested((request) => {
        void (async () => {
          const dirtyChapters = chaptersRef.current.filter(
            (chapter) => chapter.isDirty,
          );
          if (dirtyChapters.length === 0) {
            await window.driftfield.completeWindowClose({
              proceed: true,
              requestId: request.requestId,
            });
            return;
          }
          setIsConfirmingClose(true);
          const decision = await window.driftfield.confirmCloseUnsavedDocument(
            t('unsavedDocuments', { count: dirtyChapters.length }),
          );
          let proceed = decision === 'discard';
          if (decision === 'save') {
            proceed = await saveDocuments(dirtyChapters, {
              conflict: { catalog: 'projects', key: 'errors.conflictBeforeQuit' },
              failed: { catalog: 'projects', key: 'errors.failedBeforeQuit' },
              missing: { catalog: 'projects', key: 'errors.missingBeforeQuit' },
            });
          }
          setIsConfirmingClose(false);
          await window.driftfield.completeWindowClose({
            proceed,
            requestId: request.requestId,
          });
        })();
      }),
    [saveDocuments, t],
  );

  const updateActiveChapter = useCallback(
    (markdown: string): void => {
      setChapters((current) =>
        current.map((chapter) =>
          chapter.id === activeChapterId && chapter.markdown !== markdown
            ? { ...chapter, isDirty: true, markdown }
            : chapter,
        ),
      );
    },
    [activeChapterId],
  );

  const saveActiveDocument = useCallback(
    async (overwrite = false): Promise<boolean> => {
      if (activeChapter === null || !activeChapter.isDirty || isSavingDocument) {
        return activeChapter !== null;
      }
      const { id: documentId, markdown } = activeChapter;
      setIsSavingDocument(true);
      setDocumentSaveMessage(null);
      try {
        const result = await window.driftfield.saveProjectDocument({
          documentId,
          expectedRevision:
            overwrite && saveConflict?.documentId === documentId
              ? saveConflict.diskDocument.revision
              : activeChapter.revision,
          markdown,
          overwrite,
        });
        if (result.status === 'conflict') {
          setSaveConflict({ diskDocument: result.diskDocument, documentId });
          setDocumentSaveMessage({
            catalog: 'projects',
            key: 'errors.saveConflict',
          });
          return false;
        }
        if (result.status === 'missing') {
          setDocumentSaveMessage({
            catalog: 'projects',
            key: 'errors.saveMissing',
          });
          return false;
        }
        commitSavedChapter(activeChapter, result.revision);
        setSaveConflict(null);
        return true;
      } catch {
        setDocumentSaveMessage({ catalog: 'errors', key: 'projects.save' });
        return false;
      } finally {
        setIsSavingDocument(false);
      }
    },
    [
      activeChapter,
      commitSavedChapter,
      isSavingDocument,
      saveConflict,
    ],
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
      window.removeEventListener('keydown', saveFromKeyboard, { capture: true });
  }, [saveActiveDocument]);

  const closeActiveDocument = useCallback(async (): Promise<void> => {
    if (activeChapter === null || isConfirmingClose || isSavingDocument) return;
    if (!activeChapter.isDirty) {
      setActiveChapterId(null);
      return;
    }
    setIsConfirmingClose(true);
    try {
      const decision = await window.driftfield.confirmCloseUnsavedDocument(
        activeChapter.title,
      );
      if (decision === 'save' && (await saveActiveDocument())) {
        setActiveChapterId(null);
      } else if (decision === 'discard') {
        setChapters((current) =>
          current.map((chapter) =>
            chapter.id === activeChapter.id
              ? {
                  ...chapter,
                  isDirty: false,
                  markdown: chapter.previousMarkdown,
                }
              : chapter,
          ),
        );
        setActiveChapterId(null);
      }
    } finally {
      setIsConfirmingClose(false);
    }
  }, [activeChapter, isConfirmingClose, isSavingDocument, saveActiveDocument]);

  const selectProjectDirectory = useCallback(async (): Promise<void> => {
    if (isSelectingProject || isSavingDocument) return;
    const dirtyChapters = chaptersRef.current.filter((chapter) => chapter.isDirty);
    if (dirtyChapters.length > 0) {
      const decision = await window.driftfield.confirmCloseUnsavedDocument(
        t('unsavedDocuments', { count: dirtyChapters.length }),
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
    setIsSelectingProject(true);
    setProjectSelectionMessage(null);
    try {
      const project = await window.driftfield.selectProjectDirectory();
      if (project !== null) applyProjectSnapshot(project, false);
    } catch {
      setProjectSelectionMessage({ catalog: 'errors', key: 'projects.open' });
    } finally {
      setIsSelectingProject(false);
    }
  }, [
    applyProjectSnapshot,
    isSavingDocument,
    isSelectingProject,
    saveDocuments,
    t,
  ]);

  const refreshProject = useCallback(async (): Promise<void> => {
    if (projectDirectory === null || isRefreshingProject) return;
    setIsRefreshingProject(true);
    setProjectSelectionMessage(null);
    try {
      const project = await window.driftfield.refreshProject();
      if (project !== null) applyProjectSnapshot(project, true);
    } catch {
      setProjectSelectionMessage({
        catalog: 'errors',
        key: 'projects.refresh',
      });
    } finally {
      setIsRefreshingProject(false);
    }
  }, [applyProjectSnapshot, isRefreshingProject, projectDirectory]);

  const reloadConflictedDocument = useCallback((): void => {
    if (saveConflict === null) return;
    const { diskDocument, documentId } = saveConflict;
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === documentId
          ? {
              ...chapter,
              isDirty: false,
              markdown: diskDocument.markdown,
              previousMarkdown: diskDocument.markdown,
              revision: diskDocument.revision,
              sourceRevision: ++projectRevision.current,
            }
          : chapter,
      ),
    );
    setSaveConflict(null);
    setDocumentSaveMessage(null);
  }, [saveConflict]);

  const compareConflictedDocument = useCallback((): void => {
    if (saveConflict === null) return;
    const { diskDocument, documentId } = saveConflict;
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === documentId
          ? {
              ...chapter,
              previousMarkdown: diskDocument.markdown,
              revision: diskDocument.revision,
              sourceRevision: ++projectRevision.current,
            }
          : chapter,
      ),
    );
    setSaveConflict(null);
    setDocumentSaveMessage({
      catalog: 'projects',
      key: 'messages.comparisonReady',
    });
  }, [saveConflict]);

  const projectWatcherError =
    projectWatcherCode === null
      ? null
      : t(
          projectWatcherCode === 'refresh-failed'
            ? 'watcher.refreshFailed'
            : projectWatcherCode === 'start-failed'
              ? 'watcher.startFailed'
              : 'watcher.stopped',
        );

  return {
    activeChapter,
    chapters,
    closeActiveDocument,
    compareConflictedDocument,
    dismissSaveConflict: () => setSaveConflict(null),
    documentSaveError: localizeMessage(documentSaveMessage),
    isRefreshingProject,
    isSavingDocument,
    isSelectingProject,
    projectDirectory,
    projectSelectionError: localizeMessage(projectSelectionMessage),
    projectTree,
    projectWatcherError,
    refreshProject,
    reloadConflictedDocument,
    saveActiveDocument,
    saveConflict,
    selectChapter: setActiveChapterId,
    selectProjectDirectory,
    updateActiveChapter,
  };
};
