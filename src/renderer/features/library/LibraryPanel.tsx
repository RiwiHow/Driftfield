import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderPlus,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { Chapter } from '@/app/types';
import { cn } from '@/lib/utils';
import type {
  ProjectDirectory,
  ProjectTreeNode,
} from '../../../shared/contracts/project';

interface LibraryPanelProps {
  activeChapterId: string | null;
  isCreatingProject: boolean;
  isSelectingProject: boolean;
  isRefreshingProject: boolean;
  manuscriptTitle: string | null;
  onChapterChange: (chapterId: string) => void;
  onCreateProject: () => void;
  onOpenSettings: () => void;
  onRefreshProject: () => void;
  onSelectProject: () => void;
  projectDirectory: ProjectDirectory | null;
  projectSelectionError: string | null;
  projectTree: ProjectTreeNode[];
  projectWatcherError: string | null;
  recoveredChapters: Chapter[];
}

export function LibraryPanel({
  activeChapterId,
  isCreatingProject,
  isSelectingProject,
  isRefreshingProject,
  manuscriptTitle,
  onChapterChange,
  onCreateProject,
  onOpenSettings,
  onRefreshProject,
  onSelectProject,
  projectDirectory,
  projectSelectionError,
  projectTree,
  projectWatcherError,
  recoveredChapters,
}: LibraryPanelProps) {
  const { t } = useTranslation('library');
  const { t: tSettings } = useTranslation('settings');
  return (
    <aside className="library-pane">
      <div className="pane-heading">
        <span
          className="pane-heading-title"
          title={projectDirectory?.path ?? t('title')}
        >
          {projectDirectory?.name ?? t('title')}
        </span>
        <div className="pane-heading-actions">
          <Button
            aria-label={t('actions.create')}
            disabled={isSelectingProject}
            onClick={onCreateProject}
            size="icon"
            title={t('actions.create')}
            variant="ghost"
          >
            {isCreatingProject ? (
              <LoaderCircle className="project-switcher-spinner" size={15} />
            ) : (
              <FolderPlus size={15} />
            )}
          </Button>
          <Button
            aria-label={t('actions.open')}
            disabled={isSelectingProject}
            onClick={onSelectProject}
            size="icon"
            title={t('actions.open')}
            variant="ghost"
          >
            {isSelectingProject && !isCreatingProject ? (
              <LoaderCircle className="project-switcher-spinner" size={15} />
            ) : (
              <FolderOpen size={15} />
            )}
          </Button>
          <Button
            aria-label={t('actions.refresh')}
            disabled={projectDirectory === null || isRefreshingProject}
            onClick={onRefreshProject}
            size="icon"
            title={t('actions.refresh')}
            variant="ghost"
          >
            <RefreshCw
              className={cn(
                isRefreshingProject && 'project-switcher-spinner',
              )}
              size={14}
            />
          </Button>
        </div>
      </div>

      {projectSelectionError !== null && (
        <p className="project-selection-error" role="alert">
          {projectSelectionError}
        </p>
      )}
      {projectWatcherError !== null && (
        <p className="project-selection-error" role="status">
          {projectWatcherError}
        </p>
      )}

      <nav className="manuscript-tree" aria-label={t('title')}>
        <div className="tree-section-label">
          {manuscriptTitle ?? t('labels.manuscript')}
        </div>
        {projectDirectory === null ? (
          <p
            aria-label={`${t('empty.hint')} ${t('empty.action')}`}
            className="tree-empty-state"
          >
            <span aria-hidden="true">{t('empty.hint')}</span>
            <Plus aria-hidden="true" size={12} strokeWidth={2} />
            <span aria-hidden="true">{t('empty.action')}</span>
          </p>
        ) : projectTree.length === 0 && recoveredChapters.length === 0 ? (
          <p className="tree-empty-state">{t('empty.noMarkdown')}</p>
        ) : (
          <>
            <ProjectTree
              activeChapterId={activeChapterId}
              key={projectDirectory.path}
              nodes={projectTree}
              onChapterChange={onChapterChange}
            />
            {recoveredChapters.length > 0 && (
              <div className="recovered-documents">
                <div className="tree-section-label">
                  {t('labels.recovery')}
                </div>
                {recoveredChapters.map((chapter) => (
                  <button
                    className={cn(
                      'chapter-row is-missing',
                      chapter.id === activeChapterId && 'is-active',
                    )}
                    key={chapter.id}
                    onClick={() => onChapterChange(chapter.id)}
                    title={t('missingTitle', {
                      path: chapter.relativePath,
                    })}
                    type="button"
                  >
                    <FileText aria-hidden="true" size={14} />
                    <span>{chapter.title}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      <div className="library-footer">
        <Button
          className="library-settings"
          onClick={onOpenSettings}
          size="sm"
          title={t('actions.settings')}
          variant="ghost"
        >
          <Settings2 size={14} />
          {tSettings('title')}
        </Button>
        <span>{window.driftfield.platform}</span>
      </div>
    </aside>
  );
}

interface ProjectTreeProps {
  activeChapterId: string | null;
  depth?: number;
  nodes: ProjectTreeNode[];
  onChapterChange: (chapterId: string) => void;
}

function ProjectTree({
  activeChapterId,
  depth = 0,
  nodes,
  onChapterChange,
}: ProjectTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleFolder = (relativePath: string): void => {
    setCollapsedFolders((current) => {
      const next = new Set(current);

      if (next.has(relativePath)) {
        next.delete(relativePath);
      } else {
        next.add(relativePath);
      }

      return next;
    });
  };

  return (
    <div className={cn('project-tree-level', depth > 0 && 'is-nested')}>
      {nodes.map((node) => {
        if (node.type === 'folder') {
          const isCollapsed = collapsedFolders.has(node.relativePath);

          return (
            <div className="tree-folder" key={node.relativePath}>
              <button
                aria-expanded={!isCollapsed}
                className="tree-parent-row"
                onClick={() => toggleFolder(node.relativePath)}
                type="button"
              >
                {isCollapsed ? (
                  <ChevronRight aria-hidden="true" size={13} />
                ) : (
                  <ChevronDown aria-hidden="true" size={13} />
                )}
                <FolderOpen aria-hidden="true" size={14} />
                <span>{node.name}</span>
              </button>

              {!isCollapsed && (
                <ProjectTree
                  activeChapterId={activeChapterId}
                  depth={depth + 1}
                  nodes={node.children}
                  onChapterChange={onChapterChange}
                />
              )}
            </div>
          );
        }

        return (
          <button
            className={cn(
              'chapter-row',
              node.documentId === activeChapterId && 'is-active',
            )}
            key={node.relativePath}
            onClick={() => onChapterChange(node.documentId)}
            title={node.relativePath}
            type="button"
          >
            <FileText aria-hidden="true" size={14} />
            <span>{node.name}</span>
          </button>
        );
      })}
    </div>
  );
}
