import {
  ChevronRight,
  ChevronDown,
  FileText,
  FolderOpen,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Chapter } from '@/app/types';
import { cn } from '@/lib/utils';
import type {
  ProjectDirectory,
  ProjectTreeNode,
} from '../../../shared/contracts/project';

interface LibraryPanelProps {
  activeChapterId: string | null;
  isSelectingProject: boolean;
  isRefreshingProject: boolean;
  onChapterChange: (chapterId: string) => void;
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
  isSelectingProject,
  isRefreshingProject,
  onChapterChange,
  onOpenSettings,
  onRefreshProject,
  onSelectProject,
  projectDirectory,
  projectSelectionError,
  projectTree,
  projectWatcherError,
  recoveredChapters,
}: LibraryPanelProps) {
  return (
    <aside className="library-pane">
      <div className="pane-heading">
        <span
          className="pane-heading-title"
          title={projectDirectory?.path ?? '小说目录'}
        >
          {projectDirectory?.name ?? '小说目录'}
        </span>
        <div className="pane-heading-actions">
          <Button
            aria-label="打开本地项目"
            disabled={isSelectingProject}
            onClick={onSelectProject}
            size="icon"
            title="打开本地项目"
            variant="ghost"
          >
            {isSelectingProject ? (
              <LoaderCircle className="project-switcher-spinner" size={15} />
            ) : (
              <Plus size={15} />
            )}
          </Button>
          <Button
            aria-label="刷新项目目录"
            disabled={projectDirectory === null || isRefreshingProject}
            onClick={onRefreshProject}
            size="icon"
            title="刷新项目目录"
            variant="ghost"
          >
            <RefreshCw
              className={cn(
                isRefreshingProject && 'project-switcher-spinner',
              )}
              size={14}
            />
          </Button>
          <Button aria-label="更多目录操作" size="icon" variant="ghost">
            <MoreHorizontal size={15} />
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

      <nav className="manuscript-tree" aria-label="小说目录">
        <div className="tree-section-label">手稿</div>
        {projectDirectory === null ? (
          <p
            aria-label="点击右上角的加号按钮打开本地项目"
            className="tree-empty-state"
          >
            <span aria-hidden="true">点击右上角</span>
            <Plus aria-hidden="true" size={12} strokeWidth={2} />
            <span aria-hidden="true">打开本地项目</span>
          </p>
        ) : projectTree.length === 0 && recoveredChapters.length === 0 ? (
          <p className="tree-empty-state">此文件夹中没有 Markdown 文件</p>
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
                <div className="tree-section-label">待恢复的未保存文档</div>
                {recoveredChapters.map((chapter) => (
                  <button
                    className={cn(
                      'chapter-row is-missing',
                      chapter.id === activeChapterId && 'is-active',
                    )}
                    key={chapter.id}
                    onClick={() => onChapterChange(chapter.id)}
                    title={`${chapter.relativePath}（磁盘文件已移动或删除）`}
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
          title="应用设置（⌘,）"
          variant="ghost"
        >
          <Settings2 size={14} />
          应用设置
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
