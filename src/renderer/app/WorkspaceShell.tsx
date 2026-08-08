import {
  BookOpenText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import {
  Group,
  Panel,
  Separator,
  usePanelRef,
} from 'react-resizable-panels';

import type { Chapter, ThemeName } from '@/app/types';
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
import type {
  ProjectDirectory,
  ProjectTreeNode,
} from '../../shared/contracts/project';

interface WorkspaceShellProps {
  activeChapter: Chapter | null;
  documentSaveError: string | null;
  editorFontSize: number;
  isSelectingProject: boolean;
  isRefreshingProject: boolean;
  isSavingDocument: boolean;
  onChapterChange: (chapterId: string) => void;
  onCloseChapter: () => void;
  onContentChange: (markdown: string) => void;
  onOpenSettings: () => void;
  onRefreshProject: () => void;
  onSaveDocument: () => void;
  onSelectProject: () => void;
  projectDirectory: ProjectDirectory | null;
  projectSelectionError: string | null;
  projectTree: ProjectTreeNode[];
  projectWatcherError: string | null;
  recoveredChapters: Chapter[];
  theme: ThemeName;
}

export function WorkspaceShell({
  activeChapter,
  documentSaveError,
  editorFontSize,
  isSelectingProject,
  isRefreshingProject,
  isSavingDocument,
  onChapterChange,
  onCloseChapter,
  onContentChange,
  onOpenSettings,
  onRefreshProject,
  onSaveDocument,
  onSelectProject,
  projectDirectory,
  projectSelectionError,
  projectTree,
  projectWatcherError,
  recoveredChapters,
  theme,
}: WorkspaceShellProps) {
  const libraryPanelRef = usePanelRef();
  const assistantPanelRef = usePanelRef();
  const libraryElementRef = useRef<HTMLDivElement | null>(null);
  const assistantElementRef = useRef<HTMLDivElement | null>(null);
  const librarySeparatorRef = useRef<HTMLDivElement | null>(null);
  const assistantSeparatorRef = useRef<HTMLDivElement | null>(null);
  const activeViewTransitionRef = useRef<ViewTransition | null>(null);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);

  const clearViewTransitionStyles = useCallback((): void => {
    for (const panelElement of [
      libraryElementRef.current,
      assistantElementRef.current,
    ]) {
      panelElement?.style.removeProperty('view-transition-name');
    }
    for (const separatorElement of [
      librarySeparatorRef.current,
      assistantSeparatorRef.current,
    ]) {
      separatorElement?.style.removeProperty('visibility');
    }
    document.documentElement.removeAttribute('data-panel-transition');
  }, []);

  useEffect(
    () => () => {
      activeViewTransitionRef.current?.skipTransition();
      activeViewTransitionRef.current = null;
      clearViewTransitionStyles();
    },
    [clearViewTransitionStyles],
  );

  const animatePanelToggle = (
    side: 'left' | 'right',
    panelElement: HTMLDivElement | null,
    separatorElement: HTMLDivElement | null,
    isCollapsed: boolean,
    toggle: () => void,
  ): void => {
    activeViewTransitionRef.current?.skipTransition();
    activeViewTransitionRef.current = null;
    clearViewTransitionStyles();

    if (
      panelElement === null ||
      !document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      toggle();
      return;
    }

    const transitionKind = `${side}-${isCollapsed ? 'open' : 'close'}`;
    document.documentElement.dataset.panelTransition = transitionKind;
    panelElement.style.viewTransitionName = isCollapsed
      ? 'none'
      : 'df-side-panel';
    if (separatorElement !== null) separatorElement.style.visibility = 'hidden';

    const transition = document.startViewTransition(() => {
      flushSync(toggle);
      panelElement.style.viewTransitionName = isCollapsed
        ? 'df-side-panel'
        : 'none';
    });
    activeViewTransitionRef.current = transition;

    const cleanUp = (): void => {
      if (activeViewTransitionRef.current !== transition) return;
      activeViewTransitionRef.current = null;
      clearViewTransitionStyles();
    };
    void transition.finished.then(cleanUp, cleanUp);
  };

  const toggleLibraryPanel = (): void => {
    animatePanelToggle(
      'left',
      libraryElementRef.current,
      librarySeparatorRef.current,
      libraryPanelRef.current?.isCollapsed() ?? false,
      () => {
        if (libraryPanelRef.current?.isCollapsed()) {
          libraryPanelRef.current.expand();
        } else {
          libraryPanelRef.current?.collapse();
        }
      },
    );
  };

  const toggleAssistantPanel = (): void => {
    animatePanelToggle(
      'right',
      assistantElementRef.current,
      assistantSeparatorRef.current,
      assistantPanelRef.current?.isCollapsed() ?? false,
      () => {
        if (assistantPanelRef.current?.isCollapsed()) {
          assistantPanelRef.current.expand();
        } else {
          assistantPanelRef.current?.collapse();
        }
      },
    );
  };

  return (
    <TooltipProvider>
      <main
        className="app-frame"
        data-theme={theme}
        style={
          { '--df-editor-font-size': `${editorFontSize}px` } as CSSProperties
        }
      >
        <header className="titlebar">
          <div className="titlebar-leading">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={isLibraryCollapsed ? '展开小说目录' : '收起小说目录'}
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
                {isLibraryCollapsed ? '展开小说目录' : '收起小说目录'}
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="titlebar-brand">
            <BookOpenText aria-hidden="true" size={14} strokeWidth={1.8} />
            <span>Driftfield</span>
          </div>

          <div className="titlebar-actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={isAssistantCollapsed ? '展开 Agents' : '收起 Agents'}
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
                {isAssistantCollapsed ? '展开 Agents' : '收起 Agents'}
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
            minSize={220}
            maxSize={380}
            onResize={(size) => setIsLibraryCollapsed(size.inPixels === 0)}
            panelRef={libraryPanelRef}
          >
            <LibraryPanel
              activeChapterId={activeChapter?.id ?? null}
              isSelectingProject={isSelectingProject}
              isRefreshingProject={isRefreshingProject}
              onChapterChange={onChapterChange}
              onOpenSettings={onOpenSettings}
              onRefreshProject={onRefreshProject}
              onSelectProject={onSelectProject}
              projectDirectory={projectDirectory}
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

          <Panel defaultSize="56%" id="editor" minSize={430}>
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
            minSize={270}
            maxSize={460}
            onResize={(size) => setIsAssistantCollapsed(size.inPixels === 0)}
            panelRef={assistantPanelRef}
          >
            <AssistantPanel activeChapter={activeChapter} />
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
