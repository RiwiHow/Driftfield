import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { WorkspaceShell } from '@/app/WorkspaceShell';
import type { Chapter, ThemeName } from '@/app/types';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import type {
  ProjectDirectory,
  ProjectSnapshot,
  ProjectTreeNode,
} from '../shared/contracts/project';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type UpdateAppSettingsRequest,
} from '../shared/contracts/settings';

export function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [projectDirectory, setProjectDirectory] =
    useState<ProjectDirectory | null>(null);
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([]);
  const [isSelectingProject, setIsSelectingProject] = useState(false);
  const [isRefreshingProject, setIsRefreshingProject] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);
  const [documentSaveError, setDocumentSaveError] = useState<string | null>(
    null,
  );
  const projectRevision = useRef(0);
  const [projectSelectionError, setProjectSelectionError] = useState<
    string | null
  >(null);

  const activeChapter = useMemo(
    () =>
      chapters.find((chapter) => chapter.id === activeChapterId) ?? null,
    [activeChapterId, chapters],
  );

  const applyProjectSnapshot = useCallback(
    (project: ProjectSnapshot, preserveDirtyDocuments: boolean): void => {
      const sourceRevision = ++projectRevision.current;
      const documentIds = new Set(
        project.documents.map((document) => document.id),
      );

      setProjectDirectory(project.directory);
      setProjectTree(project.tree);
      setChapters((current) => {
        const currentById = new Map(
          current.map((chapter) => [chapter.id, chapter]),
        );

        return project.documents.map((document, index) => {
          const existingChapter = currentById.get(document.id);

          if (
            preserveDirtyDocuments &&
            existingChapter?.isDirty === true
          ) {
            return {
              ...existingChapter,
              order: index + 1,
              relativePath: document.relativePath,
              title: document.name,
            };
          }

          if (
            preserveDirtyDocuments &&
            existingChapter !== undefined &&
            existingChapter.markdown === document.markdown
          ) {
            return {
              ...existingChapter,
              order: index + 1,
              previousMarkdown: document.markdown,
              relativePath: document.relativePath,
              title: document.name,
            };
          }

          return {
            id: document.id,
            isDirty: false,
            markdown: document.markdown,
            order: index + 1,
            previousMarkdown: document.markdown,
            relativePath: document.relativePath,
            sourceRevision,
            title: document.name,
          };
        });
      });
      setActiveChapterId((current) =>
        preserveDirtyDocuments && current === null
          ? null
          : current !== null && documentIds.has(current)
          ? current
          : (project.documents[0]?.id ?? null),
      );
    },
    [],
  );

  useEffect(() => {
    let isCurrent = true;

    void window.driftfield.getAppSettings().then(
      (storedSettings) => {
        if (isCurrent) {
          setSettings(storedSettings);
        }
      },
      () => {
        if (isCurrent) {
          setSettingsError('无法读取应用设置，当前使用默认值。');
        }
      },
    );

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(
    () =>
      window.driftfield.onProjectChanged((project) => {
        setProjectSelectionError(null);
        applyProjectSnapshot(project, true);
      }),
    [applyProjectSnapshot],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    const openSettingsFromKeyboard = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
    };

    window.addEventListener('keydown', openSettingsFromKeyboard);
    return () => window.removeEventListener('keydown', openSettingsFromKeyboard);
  }, []);

  const updateActiveChapter = (markdown: string): void => {
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === activeChapterId
          ? chapter.markdown === markdown
            ? chapter
            : { ...chapter, isDirty: true, markdown }
          : chapter,
      ),
    );
  };

  const saveActiveDocument = useCallback(async (): Promise<boolean> => {
    if (
      activeChapter === null ||
      !activeChapter.isDirty ||
      isSavingDocument
    ) {
      return activeChapter !== null;
    }

    const documentId = activeChapter.id;
    const markdown = activeChapter.markdown;
    setIsSavingDocument(true);
    setDocumentSaveError(null);

    try {
      await window.driftfield.saveProjectDocument({ documentId, markdown });
      setChapters((current) =>
        current.map((chapter) =>
          chapter.id === documentId
            ? {
                ...chapter,
                isDirty: chapter.markdown !== markdown,
                previousMarkdown: markdown,
              }
            : chapter,
        ),
      );
      return true;
    } catch {
      setDocumentSaveError('保存失败，请检查文件权限后重试。');
      return false;
    } finally {
      setIsSavingDocument(false);
    }
  }, [activeChapter, isSavingDocument]);

  const closeActiveDocument = async (): Promise<void> => {
    if (activeChapter === null || isConfirmingClose || isSavingDocument) {
      return;
    }

    if (!activeChapter.isDirty) {
      setActiveChapterId(null);
      return;
    }

    const closingDocument = activeChapter;
    setIsConfirmingClose(true);

    try {
      const decision = await window.driftfield.confirmCloseUnsavedDocument(
        closingDocument.title,
      );

      if (decision === 'save') {
        if (await saveActiveDocument()) {
          setActiveChapterId(null);
        }
      } else if (decision === 'discard') {
        setChapters((current) =>
          current.map((chapter) =>
            chapter.id === closingDocument.id
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
  };

  useEffect(() => {
    const saveFromKeyboard = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 's'
      ) {
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

  const selectProjectDirectory = async (): Promise<void> => {
    if (isSelectingProject) {
      return;
    }

    setIsSelectingProject(true);
    setProjectSelectionError(null);

    try {
      const project = await window.driftfield.selectProjectDirectory();

      if (project !== null) {
        applyProjectSnapshot(project, false);
      }
    } catch {
      setProjectSelectionError('无法打开这个文件夹，请重试。');
    } finally {
      setIsSelectingProject(false);
    }
  };

  const refreshProject = async (): Promise<void> => {
    if (projectDirectory === null || isRefreshingProject) {
      return;
    }

    setIsRefreshingProject(true);
    setProjectSelectionError(null);

    try {
      const project = await window.driftfield.refreshProject();

      if (project !== null) {
        applyProjectSnapshot(project, true);
      }
    } catch {
      setProjectSelectionError('项目刷新失败，请检查文件夹后重试。');
    } finally {
      setIsRefreshingProject(false);
    }
  };

  const updateSettings = async (
    update: UpdateAppSettingsRequest,
  ): Promise<void> => {
    if (isSavingSettings) {
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);

    try {
      const nextSettings = await window.driftfield.updateAppSettings(update);
      setSettings(nextSettings);
    } catch {
      setSettingsError('设置保存失败，请重试。');
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <>
      <WorkspaceShell
        activeChapter={activeChapter}
        documentSaveError={documentSaveError}
        editorFontSize={settings.editorFontSize}
        isSelectingProject={isSelectingProject}
        isRefreshingProject={isRefreshingProject}
        isSavingDocument={isSavingDocument}
        onChapterChange={setActiveChapterId}
        onContentChange={updateActiveChapter}
        onCloseChapter={() => void closeActiveDocument()}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshProject={() => void refreshProject()}
        onSaveDocument={() => void saveActiveDocument()}
        onSelectProject={() => void selectProjectDirectory()}
        onThemeChange={(theme: ThemeName) => void updateSettings({ theme })}
        projectDirectory={projectDirectory}
        projectSelectionError={projectSelectionError}
        projectTree={projectTree}
        theme={settings.theme}
      />
      <SettingsDialog
        error={settingsError}
        isSaving={isSavingSettings}
        onOpenChange={setIsSettingsOpen}
        onUpdate={(update) => void updateSettings(update)}
        open={isSettingsOpen}
        settings={settings}
      />
    </>
  );
}
