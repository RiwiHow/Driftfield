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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { WorkspaceDocument } from '@/app/types';
import { cn } from '@/lib/utils';
import type {
  ProjectDirectory,
  ProjectTreeNode,
} from '../../../shared/contracts/project';
import type { ProjectIconId } from '../../../shared/contracts/project-layout';
import { ProjectIcon } from './ProjectIcon';

interface LibraryPanelProps {
  activeDocumentId: string | null;
  isCreatingProject: boolean;
  isSelectingProject: boolean;
  isRefreshingProject: boolean;
  manuscriptTitle: string | null;
  onDocumentChange: (documentId: string) => void;
  onCreateProject: () => void;
  onOpenSettings: () => void;
  onRefreshProject: () => void;
  onSelectProject: () => void;
  projectDirectory: ProjectDirectory | null;
  projectIcon?: ProjectIconId;
  projectSelectionError: string | null;
  projectTree: ProjectTreeNode[];
  projectWatcherError: string | null;
  recoveredDocuments: WorkspaceDocument[];
}

export function LibraryPanel({
  activeDocumentId,
  isCreatingProject,
  isSelectingProject,
  isRefreshingProject,
  manuscriptTitle,
  onDocumentChange,
  onCreateProject,
  onOpenSettings,
  onRefreshProject,
  onSelectProject,
  projectDirectory,
  projectIcon,
  projectSelectionError,
  projectTree,
  projectWatcherError,
  recoveredDocuments,
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
          {projectIcon !== undefined && (
            <ProjectIcon aria-hidden="true" icon={projectIcon} size={14} />
          )}
          {projectDirectory?.name ?? t('title')}
        </span>
        <div className="pane-heading-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('actions.create')}
                disabled={isSelectingProject}
                onClick={onCreateProject}
                size="icon"
                variant="ghost"
              >
                {isCreatingProject ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="project-switcher-spinner"
                    size={15}
                  />
                ) : (
                  <FolderPlus aria-hidden="true" size={15} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.create')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('actions.open')}
                disabled={isSelectingProject}
                onClick={onSelectProject}
                size="icon"
                variant="ghost"
              >
                {isSelectingProject && !isCreatingProject ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="project-switcher-spinner"
                    size={15}
                  />
                ) : (
                  <FolderOpen aria-hidden="true" size={15} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.open')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('actions.refresh')}
                disabled={projectDirectory === null || isRefreshingProject}
                onClick={onRefreshProject}
                size="icon"
                variant="ghost"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn(
                    isRefreshingProject && 'project-switcher-spinner',
                  )}
                  size={14}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.refresh')}</TooltipContent>
          </Tooltip>
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
        ) : projectTree.length === 0 && recoveredDocuments.length === 0 ? (
          <p className="tree-empty-state">{t('empty.noMarkdown')}</p>
        ) : (
          <>
            <ProjectTree
              activeDocumentId={activeDocumentId}
              key={projectDirectory.path}
              nodes={projectTree}
              onDocumentChange={onDocumentChange}
            />
            {recoveredDocuments.length > 0 && (
              <div className="recovered-documents">
                <div className="tree-section-label">
                  {t('labels.recovery')}
                </div>
                {recoveredDocuments.map((document) => (
                  <button
                    className={cn(
                      'document-row is-missing',
                      document.id === activeDocumentId && 'is-active',
                    )}
                    key={document.id}
                    onClick={() => onDocumentChange(document.id)}
                    title={t('missingTitle', {
                      path: document.relativePath,
                    })}
                    type="button"
                  >
                    <FileText aria-hidden="true" size={14} />
                    <span>{document.title}</span>
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
  activeDocumentId: string | null;
  depth?: number;
  nodes: ProjectTreeNode[];
  onDocumentChange: (documentId: string) => void;
}

function ProjectTree({
  activeDocumentId,
  depth = 0,
  nodes,
  onDocumentChange,
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
                {node.icon === undefined ? (
                  <FolderOpen aria-hidden="true" size={14} />
                ) : (
                  <ProjectIcon aria-hidden="true" icon={node.icon} size={14} />
                )}
                <span>{node.name}</span>
              </button>

              {!isCollapsed && (
                <ProjectTree
                  activeDocumentId={activeDocumentId}
                  depth={depth + 1}
                  nodes={node.children}
                  onDocumentChange={onDocumentChange}
                />
              )}
            </div>
          );
        }

        return (
          <button
            className={cn(
              'document-row',
              node.documentId === activeDocumentId && 'is-active',
            )}
            key={node.relativePath}
            onClick={() => onDocumentChange(node.documentId)}
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
