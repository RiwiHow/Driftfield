import {
  BookOpenText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
  const animationFrameRef = useRef<number | null>(null);
  const activeAnimationsRef = useRef<Animation[]>([]);
  const transitionOverlaysRef = useRef<HTMLElement[]>([]);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);
  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      for (const animation of activeAnimationsRef.current) animation.cancel();
      for (const overlay of transitionOverlaysRef.current) overlay.remove();
    },
    [],
  );

  const clearPanelAnimations = (): void => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    for (const animation of activeAnimationsRef.current) animation.cancel();
    for (const overlay of transitionOverlaysRef.current) overlay.remove();
    if (libraryElementRef.current) {
      libraryElementRef.current.style.visibility = '';
    }
    if (assistantElementRef.current) {
      assistantElementRef.current.style.visibility = '';
    }
    activeAnimationsRef.current = [];
    transitionOverlaysRef.current = [];
  };

  const animatePanelToggle = (
    side: 'left' | 'right',
    panelElement: HTMLDivElement | null,
    isCollapsed: boolean,
    toggle: () => void,
  ): void => {
    clearPanelAnimations();

    if (
      panelElement === null ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      toggle();
      return;
    }

    const appFrame = panelElement.closest('.app-frame');
    const panelRect = panelElement.getBoundingClientRect();
    const direction = side === 'left' ? -1 : 1;

    if (!isCollapsed && appFrame !== null && panelElement.firstElementChild) {
      const overlay = document.createElement('div');
      overlay.className = 'panel-transition-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.left = `${panelRect.left}px`;
      overlay.style.top = `${panelRect.top}px`;
      overlay.style.width = `${panelRect.width}px`;
      overlay.style.height = `${panelRect.height}px`;
      overlay.append(panelElement.firstElementChild.cloneNode(true));
      appFrame.append(overlay);
      transitionOverlaysRef.current.push(overlay);

      toggle();
      const animation = overlay.animate(
        [
          { transform: 'translate3d(0, 0, 0)' },
          {
            transform: `translate3d(${direction * 100}%, 0, 0)`,
          },
        ],
        {
          duration: 200,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards',
        },
      );
      activeAnimationsRef.current.push(animation);
      const cleanUpOverlay = (): void => {
        overlay.remove();
        transitionOverlaysRef.current = transitionOverlaysRef.current.filter(
          (item) => item !== overlay,
        );
        activeAnimationsRef.current = activeAnimationsRef.current.filter(
          (item) => item !== animation,
        );
      };
      void animation.finished.then(cleanUpOverlay, cleanUpOverlay);
      return;
    }

    panelElement.style.visibility = 'hidden';
    toggle();
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      panelElement.style.visibility = '';
      const animation = panelElement.animate(
        [
          {
            transform: `translate3d(${direction * 100}%, 0, 0)`,
          },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: 220,
          easing: 'cubic-bezier(0, 0, 0.2, 1)',
        },
      );
      activeAnimationsRef.current.push(animation);
      const cleanUpAnimation = (): void => {
        activeAnimationsRef.current = activeAnimationsRef.current.filter(
          (item) => item !== animation,
        );
      };
      void animation.finished.then(cleanUpAnimation, cleanUpAnimation);
    });
  };

  const toggleLibraryPanel = (): void => {
    animatePanelToggle(
      'left',
      libraryElementRef.current,
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

          <PanelSeparator />

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

          <PanelSeparator />

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
            <AssistantPanel />
          </Panel>
        </Group>
      </main>
    </TooltipProvider>
  );
}

function PanelSeparator() {
  return (
    <Separator className="panel-separator">
      <span />
    </Separator>
  );
}
