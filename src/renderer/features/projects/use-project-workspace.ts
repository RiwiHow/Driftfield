import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Chapter } from '@/app/types';
import { mergeProjectSnapshot } from '@/features/library/merge-project-snapshot';
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

interface SaveDocumentsMessages {
  conflict: string;
  failed: string;
  missing: string;
}

export const useProjectWorkspace = () => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [projectDirectory, setProjectDirectory] =
    useState<ProjectDirectory | null>(null);
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([]);
  const [isSelectingProject, setIsSelectingProject] = useState(false);
  const [isRefreshingProject, setIsRefreshingProject] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const [documentSaveError, setDocumentSaveError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null);
  const [projectSelectionError, setProjectSelectionError] =
    useState<string | null>(null);
  const [projectWatcherError, setProjectWatcherError] = useState<string | null>(
    null,
  );
  const projectRevision = useRef(0);
  const chaptersRef = useRef<Chapter[]>([]);
  chaptersRef.current = chapters;

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
      setDocumentSaveError(null);
      try {
        for (const chapter of documents) {
          if (chapter.backingFileStatus === 'missing') {
            setActiveChapterId(chapter.id);
            setDocumentSaveError(messages.missing);
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
            setDocumentSaveError(messages.conflict);
            return false;
          }
          if (result.status === 'missing') {
            setActiveChapterId(chapter.id);
            setDocumentSaveError(messages.missing);
            return false;
          }
          commitSavedChapter(chapter, result.revision);
        }
        return true;
      } catch {
        setDocumentSaveError(messages.failed);
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
        setDocumentSaveError('无法同步未保存状态；请先手动保存文档。');
      });
  }, [chapters]);

  useEffect(
    () =>
      window.driftfield.onProjectChanged((project) => {
        setProjectSelectionError(null);
        applyProjectSnapshot(project, true);
      }),
    [applyProjectSnapshot],
  );

  useEffect(
    () =>
      window.driftfield.onProjectWatcherStatusChanged((status) => {
        setProjectWatcherError(status.status === 'error' ? status.message : null);
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
            `${dirtyChapters.length} 个未保存文档`,
          );
          let proceed = decision === 'discard';
          if (decision === 'save') {
            proceed = await saveDocuments(dirtyChapters, {
              conflict: '退出已取消，请先处理磁盘文件冲突。',
              failed: '保存未完成，退出已取消。',
              missing: '磁盘文件已移动或删除，退出已取消；请先恢复内容。',
            });
          }
          setIsConfirmingClose(false);
          await window.driftfield.completeWindowClose({
            proceed,
            requestId: request.requestId,
          });
        })();
      }),
    [saveDocuments],
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
      setDocumentSaveError(null);
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
          setDocumentSaveError('磁盘文件已被其他程序修改，请选择处理方式。');
          return false;
        }
        if (result.status === 'missing') {
          setDocumentSaveError('磁盘文件已被移动或删除；当前修改仍保留在内存中。');
          return false;
        }
        commitSavedChapter(activeChapter, result.revision);
        setSaveConflict(null);
        return true;
      } catch {
        setDocumentSaveError('保存失败，请检查文件权限后重试。');
        return false;
      } finally {
        setIsSavingDocument(false);
      }
    },
    [activeChapter, commitSavedChapter, isSavingDocument, saveConflict],
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
        `${dirtyChapters.length} 个未保存文档`,
      );
      if (decision === 'cancel') return;
      if (
        decision === 'save' &&
        !(await saveDocuments(dirtyChapters, {
          conflict: '磁盘文件已被其他程序修改，请先处理冲突。',
          failed: '保存未完成，项目未切换。',
          missing: '有文档的磁盘文件已移动或删除，无法切换项目。请先恢复内容。',
        }))
      ) {
        return;
      }
    }
    setIsSelectingProject(true);
    setProjectSelectionError(null);
    try {
      const project = await window.driftfield.selectProjectDirectory();
      if (project !== null) applyProjectSnapshot(project, false);
    } catch {
      setProjectSelectionError('无法打开这个文件夹，请重试。');
    } finally {
      setIsSelectingProject(false);
    }
  }, [
    applyProjectSnapshot,
    isSavingDocument,
    isSelectingProject,
    saveDocuments,
  ]);

  const refreshProject = useCallback(async (): Promise<void> => {
    if (projectDirectory === null || isRefreshingProject) return;
    setIsRefreshingProject(true);
    setProjectSelectionError(null);
    try {
      const project = await window.driftfield.refreshProject();
      if (project !== null) applyProjectSnapshot(project, true);
    } catch {
      setProjectSelectionError('项目刷新失败，请检查文件夹后重试。');
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
    setDocumentSaveError(null);
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
    setDocumentSaveError('已载入磁盘版本作为对比基线，请在编辑器中审阅并合并。');
  }, [saveConflict]);

  return {
    activeChapter,
    chapters,
    closeActiveDocument,
    compareConflictedDocument,
    dismissSaveConflict: () => setSaveConflict(null),
    documentSaveError,
    isRefreshingProject,
    isSavingDocument,
    isSelectingProject,
    projectDirectory,
    projectSelectionError,
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
