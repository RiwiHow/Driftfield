import { useMemo, useState } from 'react';

import { WorkspaceShell } from '@/app/WorkspaceShell';
import type { Chapter, ThemeName } from '@/app/types';
import type {
  ProjectDirectory,
  ProjectTreeNode,
} from '../shared/contracts/project';

export function App() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>('github-light');
  const [projectDirectory, setProjectDirectory] =
    useState<ProjectDirectory | null>(null);
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([]);
  const [isSelectingProject, setIsSelectingProject] = useState(false);
  const [projectSelectionError, setProjectSelectionError] = useState<
    string | null
  >(null);

  const activeChapter = useMemo(
    () =>
      chapters.find((chapter) => chapter.id === activeChapterId) ?? null,
    [activeChapterId, chapters],
  );

  const updateActiveChapter = (markdown: string): void => {
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === activeChapterId
          ? { ...chapter, isDirty: true, markdown }
          : chapter,
      ),
    );
  };

  const selectProjectDirectory = async (): Promise<void> => {
    if (isSelectingProject) {
      return;
    }

    setIsSelectingProject(true);
    setProjectSelectionError(null);

    try {
      const project = await window.driftfield.selectProjectDirectory();

      if (project !== null) {
        const nextChapters: Chapter[] = project.documents.map(
          (document, index) => ({
            id: document.id,
            isDirty: false,
            markdown: document.markdown,
            order: index + 1,
            previousMarkdown: document.markdown,
            relativePath: document.relativePath,
            title: document.name,
          }),
        );

        setProjectDirectory(project.directory);
        setProjectTree(project.tree);
        setChapters(nextChapters);
        setActiveChapterId(nextChapters[0]?.id ?? null);
      }
    } catch {
      setProjectSelectionError('无法打开这个文件夹，请重试。');
    } finally {
      setIsSelectingProject(false);
    }
  };

  return (
    <WorkspaceShell
      activeChapter={activeChapter}
      onChapterChange={setActiveChapterId}
      onContentChange={updateActiveChapter}
      isSelectingProject={isSelectingProject}
      onSelectProject={() => void selectProjectDirectory()}
      onThemeChange={setTheme}
      projectDirectory={projectDirectory}
      projectSelectionError={projectSelectionError}
      projectTree={projectTree}
      theme={theme}
    />
  );
}
