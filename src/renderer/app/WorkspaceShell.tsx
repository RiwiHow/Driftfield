import {
  BookOpenText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  type CSSProperties,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Panel, Separator } from 'react-resizable-panels';

import type { Chapter } from '@/app/types';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AssistantPanel } from '@/features/assistant/AssistantPanel';
import { ManuscriptEditor } from '@/features/editor/ManuscriptEditor';
import { LibraryPanel } from '@/features/library/LibraryPanel';
import type { StorySection } from '@/features/story/StoryDialog';
import type { AgentConfiguration } from '../../shared/contracts/agent-configuration';
import type { AgentSettings, AppTheme } from '../../shared/contracts/settings';
import type {
  ProjectDirectory,
  ProjectSnapshot,
  ProjectTreeNode,
} from '../../shared/contracts/project';
import type { SuccessfulApplyAgentProposalResult } from '../../shared/contracts/agent-proposals';
import {
  WORKSPACE_PANEL_MIN_WIDTHS,
  WORKSPACE_PANEL_SEPARATOR_WIDTH,
} from '../../shared/workspace-layout';
import { useWorkspacePanelTransitions } from './use-workspace-panel-transitions';

interface WorkspaceShellProps {
  activeChapter: Chapter | null;
  chapters: Chapter[];
  agentConfiguration: AgentConfiguration;
  agentConfigurationError: string | null;
  agentConfigurationLoading: boolean;
  agentSettings: AgentSettings;
  documentSaveError: string | null;
  editorFontSize: number;
  isCreatingProject: boolean;
  isSelectingProject: boolean;
  isRefreshingProject: boolean;
  isSavingDocument: boolean;
  onChapterChange: (chapterId: string) => void;
  onAgentProposalApplied: (
    result: SuccessfulApplyAgentProposalResult,
  ) => void;
  onAgentStoryChanged: (revision: number) => void;
  onCloseChapter: () => void;
  onContentChange: (markdown: string) => void;
  onCreateProject: () => void;
  onOpenSettings: () => void;
  onOpenStory: (section: StorySection) => void;
  onRefreshProject: () => void;
  onSaveDocument: () => void;
  onSelectProject: () => void;
  projectDirectory: ProjectDirectory | null;
  projectId: string | null;
  projectIcon: ProjectSnapshot['projectIcon'];
  projectRootTitles: ProjectSnapshot['rootTitles'] | null;
  projectSelectionError: string | null;
  projectTree: ProjectTreeNode[];
  projectWatcherError: string | null;
  recoveredChapters: Chapter[];
  theme: AppTheme;
}

export function WorkspaceShell({
  activeChapter,
  chapters,
  agentConfiguration,
  agentConfigurationError,
  agentConfigurationLoading,
  agentSettings,
  documentSaveError,
  editorFontSize,
  isCreatingProject,
  isSelectingProject,
  isRefreshingProject,
  isSavingDocument,
  onChapterChange,
  onAgentProposalApplied,
  onAgentStoryChanged,
  onCloseChapter,
  onContentChange,
  onCreateProject,
  onOpenSettings,
  onOpenStory,
  onRefreshProject,
  onSaveDocument,
  onSelectProject,
  projectDirectory,
  projectId,
  projectIcon,
  projectRootTitles,
  projectSelectionError,
  projectTree,
  projectWatcherError,
  recoveredChapters,
  theme,
}: WorkspaceShellProps) {
  const { t } = useTranslation('workspace');
  const { t: tCommon } = useTranslation('common');
  const {
    assistantElementRef,
    assistantPanelRef,
    assistantSeparatorRef,
    isAssistantCollapsed,
    isLibraryCollapsed,
    libraryElementRef,
    libraryPanelRef,
    librarySeparatorRef,
    onAssistantResize,
    onLibraryResize,
    toggleAssistantPanel,
    toggleLibraryPanel,
  } = useWorkspacePanelTransitions();

  return (
    <TooltipProvider>
      <main
        className="app-frame"
        data-platform={window.driftfield.platform}
        data-theme={theme}
        style={
          {
            '--df-divider-size': `${WORKSPACE_PANEL_SEPARATOR_WIDTH}px`,
            '--df-editor-font-size': `${editorFontSize}px`,
          } as CSSProperties
        }
      >
        <header className="titlebar">
          <div className="titlebar-leading">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={
                    isLibraryCollapsed
                      ? t('expandLibrary')
                      : t('collapseLibrary')
                  }
                  onClick={toggleLibraryPanel}
                  size="icon"
                  variant="ghost"
                >
                  {isLibraryCollapsed ? (
                    <PanelLeftOpen size={15} />
                  ) : (
                    <PanelLeftClose size={15} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isLibraryCollapsed
                  ? t('expandLibrary')
                  : t('collapseLibrary')}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="titlebar-brand">
            <BookOpenText aria-hidden="true" size={14} strokeWidth={1.8} />
            <span>{tCommon('appName')}</span>
          </div>

          <div className="titlebar-actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={
                    isAssistantCollapsed
                      ? t('expandAgents')
                      : t('collapseAgents')
                  }
                  onClick={toggleAssistantPanel}
                  size="icon"
                  variant="ghost"
                >
                  {isAssistantCollapsed ? (
                    <PanelRightOpen size={15} />
                  ) : (
                    <PanelRightClose size={15} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isAssistantCollapsed
                  ? t('expandAgents')
                  : t('collapseAgents')}
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        <Group className="workspace-panels" orientation="horizontal">
          <Panel
            collapsedSize={0}
            collapsible
            defaultSize={260}
            elementRef={libraryElementRef}
            groupResizeBehavior="preserve-pixel-size"
            id="library"
            minSize={WORKSPACE_PANEL_MIN_WIDTHS.library}
            maxSize={380}
            onResize={onLibraryResize}
            panelRef={libraryPanelRef}
          >
            <LibraryPanel
              activeChapterId={activeChapter?.id ?? null}
              isCreatingProject={isCreatingProject}
              isSelectingProject={isSelectingProject}
              isRefreshingProject={isRefreshingProject}
              onChapterChange={onChapterChange}
              onCreateProject={onCreateProject}
              onOpenSettings={onOpenSettings}
              onOpenStory={onOpenStory}
              onRefreshProject={onRefreshProject}
              onSelectProject={onSelectProject}
              projectDirectory={projectDirectory}
              projectIcon={projectIcon}
              manuscriptTitle={projectRootTitles?.manuscript ?? null}
              projectSelectionError={projectSelectionError}
              projectTree={projectTree}
              projectWatcherError={projectWatcherError}
              recoveredChapters={recoveredChapters}
            />
          </Panel>

          <PanelSeparator
            elementRef={librarySeparatorRef}
            isCollapsed={isLibraryCollapsed}
          />

          <Panel
            defaultSize="56%"
            id="editor"
            minSize={WORKSPACE_PANEL_MIN_WIDTHS.editor}
          >
            <ManuscriptEditor
              chapter={activeChapter}
              isSaving={isSavingDocument}
              onClose={onCloseChapter}
              onChange={onContentChange}
              onSave={onSaveDocument}
              saveError={documentSaveError}
              theme={theme}
            />
          </Panel>

          <PanelSeparator
            elementRef={assistantSeparatorRef}
            isCollapsed={isAssistantCollapsed}
          />

          <Panel
            collapsedSize={0}
            collapsible
            defaultSize={326}
            elementRef={assistantElementRef}
            groupResizeBehavior="preserve-pixel-size"
            id="assistant"
            minSize={WORKSPACE_PANEL_MIN_WIDTHS.assistant}
            maxSize={460}
            onResize={onAssistantResize}
            panelRef={assistantPanelRef}
          >
            <AssistantPanel
              activeChapter={activeChapter}
              chapters={chapters}
              configuration={agentConfiguration}
              configurationError={agentConfigurationError}
              configurationLoading={agentConfigurationLoading}
              onProposalApplied={onAgentProposalApplied}
              onStoryChanged={onAgentStoryChanged}
              onOpenSettings={onOpenSettings}
              projectId={projectId}
              settings={agentSettings}
            />
          </Panel>
        </Group>
      </main>
    </TooltipProvider>
  );
}

function PanelSeparator({
  elementRef,
  isCollapsed,
}: {
  elementRef: RefObject<HTMLDivElement | null>;
  isCollapsed: boolean;
}) {
  return (
    <Separator
      className={
        isCollapsed ? 'panel-separator is-collapsed' : 'panel-separator'
      }
      disabled={isCollapsed}
      elementRef={elementRef}
    >
      <span />
    </Separator>
  );
}
