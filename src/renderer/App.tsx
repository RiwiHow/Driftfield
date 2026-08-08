import { useMemo, useState } from 'react';

import { WorkspaceShell } from '@/app/WorkspaceShell';
import type { Chapter, ThemeName } from '@/app/types';

const initialChapters: Chapter[] = [
  {
    id: 'prologue',
    order: 1,
    title: '序章：风从荒原来',
    markdown: `# 序章：风从荒原来

风越过无人耕种的荒原时，旧信标第一次亮了起来。

林舟停下脚步。他已经很多年没有见过那种颜色——不是篝火的橙，也不是城市终夜不熄的白，而是一点**沉静、遥远的蓝**。

它像是在等一个迟到了很久的人。

> 有些召唤不会发出声音。它们只是一直亮着，直到你终于回头。`,
    previousMarkdown: `# 序章：风从荒原来

风越过荒原时，旧信标亮了起来。

林舟停下脚步。他已经很多年没有见过那种颜色。

它像是在等待什么。`,
  },
  {
    id: 'chapter-1',
    order: 2,
    title: '第一章：失落的信标',
    markdown: `# 第一章：失落的信标

信标立在盐碱地的尽头，外壳布满风沙留下的划痕。

林舟把手掌贴在冰冷的金属表面。里面传来极轻的振动，仿佛一颗沉睡多年的心脏，刚刚恢复了第一次搏动。`,
    previousMarkdown: `# 第一章：失落的信标

信标立在盐碱地的尽头。`,
  },
  {
    id: 'chapter-2',
    order: 3,
    title: '第二章：无名旅人',
    markdown: `# 第二章：无名旅人

旅人是在第二天清晨出现的。

她没有名字，也不肯说自己从哪里来，只把一枚刻着潮汐纹路的铜币放在桌上。`,
    previousMarkdown: `# 第二章：无名旅人

旅人是在第二天清晨出现的。`,
  },
];

export function App() {
  const [chapters, setChapters] = useState(initialChapters);
  const [activeChapterId, setActiveChapterId] = useState(
    initialChapters[0].id,
  );
  const [theme, setTheme] = useState<ThemeName>('tokyo-night');

  const activeChapter = useMemo(
    () =>
      chapters.find((chapter) => chapter.id === activeChapterId) ??
      chapters[0],
    [activeChapterId, chapters],
  );

  const updateActiveChapter = (markdown: string): void => {
    setChapters((current) =>
      current.map((chapter) =>
        chapter.id === activeChapterId ? { ...chapter, markdown } : chapter,
      ),
    );
  };

  return (
    <WorkspaceShell
      activeChapter={activeChapter}
      chapters={chapters}
      onChapterChange={setActiveChapterId}
      onContentChange={updateActiveChapter}
      onThemeChange={setTheme}
      theme={theme}
    />
  );
}
