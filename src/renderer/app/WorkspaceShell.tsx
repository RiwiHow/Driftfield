import { BookOpenText, Palette, PanelRight, Search } from 'lucide-react';
import { Group, Panel, Separator } from 'react-resizable-panels';

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
  isSelectingProject: boolean;
  onChapterChange: (chapterId: string) => void;
  onContentChange: (markdown: string) => void;
  onSelectProject: () => void;
  onThemeChange: (theme: ThemeName) => void;
  projectDirectory: ProjectDirectory | null;
  projectSelectionError: string | null;
  projectTree: ProjectTreeNode[];
  theme: ThemeName;
}

const themeLabels: Record<ThemeName, string> = {
  'github-light': 'GitHub Light',
  'one-dark': 'One Dark',
  'tokyo-night': 'Tokyo Night',
};

const themes: ThemeName[] = ['github-light', 'tokyo-night', 'one-dark'];

export function WorkspaceShell({
  activeChapter,
  isSelectingProject,
  onChapterChange,
  onContentChange,
  onSelectProject,
  onThemeChange,
  projectDirectory,
  projectSelectionError,
  projectTree,
  theme,
}: WorkspaceShellProps) {
  const currentThemeIndex = themes.indexOf(theme);
  const nextTheme = themes[(currentThemeIndex + 1) % themes.length];

  return (
    <TooltipProvider>
      <main className="app-frame" data-theme={theme}>
        <header className="titlebar">
          <div className="titlebar-brand">
            <BookOpenText aria-hidden="true" size={14} strokeWidth={1.8} />
            <span>Driftfield</span>
          </div>

          <div
            className="titlebar-document"
            title={activeChapter?.title ?? projectDirectory?.path}
          >
            {activeChapter?.title ?? projectDirectory?.name ?? '未打开项目'}
          </div>

          <div className="titlebar-actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="搜索" size="icon" variant="ghost">
                  <Search size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>搜索</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={`切换为 ${themeLabels[nextTheme]}`}
                  onClick={() => onThemeChange(nextTheme)}
                  size="icon"
                  variant="ghost"
                >
                  <Palette size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                当前主题：{themeLabels[theme]}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="Agent 面板" size="icon" variant="ghost">
                  <PanelRight size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Agent 面板</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <Group className="workspace-panels" orientation="horizontal">
          <Panel
            defaultSize={260}
            groupResizeBehavior="preserve-pixel-size"
            id="library"
            minSize={220}
            maxSize={380}
          >
            <LibraryPanel
              activeChapterId={activeChapter?.id ?? null}
              isSelectingProject={isSelectingProject}
              onChapterChange={onChapterChange}
              onSelectProject={onSelectProject}
              projectDirectory={projectDirectory}
              projectSelectionError={projectSelectionError}
              projectTree={projectTree}
            />
          </Panel>

          <PanelSeparator />

          <Panel defaultSize="56%" id="editor" minSize={430}>
            <ManuscriptEditor
              chapter={activeChapter}
              onChange={onContentChange}
              theme={theme}
            />
          </Panel>

          <PanelSeparator />

          <Panel
            defaultSize={326}
            groupResizeBehavior="preserve-pixel-size"
            id="assistant"
            minSize={270}
            maxSize={460}
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
