import {
  BookOpen,
  ChevronDown,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Settings2,
} from 'lucide-react';

import type { Chapter } from '@/app/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LibraryPanelProps {
  activeChapterId: string;
  chapters: Chapter[];
  onChapterChange: (chapterId: string) => void;
}

export function LibraryPanel({
  activeChapterId,
  chapters,
  onChapterChange,
}: LibraryPanelProps) {
  return (
    <aside className="library-pane">
      <div className="pane-heading">
        <span>小说目录</span>
        <div className="pane-heading-actions">
          <Button aria-label="新建章节" size="icon" variant="ghost">
            <Plus size={15} />
          </Button>
          <Button aria-label="更多目录操作" size="icon" variant="ghost">
            <MoreHorizontal size={15} />
          </Button>
        </div>
      </div>

      <div className="project-switcher">
        <div className="project-icon">
          <BookOpen aria-hidden="true" size={17} />
        </div>
        <div className="project-copy">
          <strong>漂流地</strong>
          <span>长篇小说 · 本地草稿</span>
        </div>
        <ChevronDown aria-hidden="true" size={14} />
      </div>

      <nav className="manuscript-tree" aria-label="小说目录">
        <div className="tree-section-label">手稿</div>
        <div className="tree-parent">
          <div className="tree-parent-row">
            <ChevronDown aria-hidden="true" size={13} />
            <FolderOpen aria-hidden="true" size={14} />
            <span>第一卷 · 远方的蓝光</span>
          </div>

          <div className="chapter-tree-list">
            {chapters.map((chapter) => (
              <button
                className={cn(
                  'chapter-row',
                  chapter.id === activeChapterId && 'is-active',
                )}
                key={chapter.id}
                onClick={() => onChapterChange(chapter.id)}
                type="button"
              >
                <FileText aria-hidden="true" size={14} />
                <span>{chapter.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="tree-section-label tree-section-spaced">资料库</div>
        <button className="tree-simple-row" type="button">
          <FolderOpen aria-hidden="true" size={14} />
          <span>人物</span>
          <span className="tree-count">3</span>
        </button>
        <button className="tree-simple-row" type="button">
          <FolderOpen aria-hidden="true" size={14} />
          <span>世界观</span>
          <span className="tree-count">2</span>
        </button>
      </nav>

      <div className="library-footer">
        <Button className="library-settings" size="sm" variant="ghost">
          <Settings2 size={14} />
          项目设置
        </Button>
        <span>{window.driftfield.platform}</span>
      </div>
    </aside>
  );
}
