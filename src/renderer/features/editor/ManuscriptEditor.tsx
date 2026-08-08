import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  defaultSvgIcons,
  DiffSourceToggleWrapper,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  diffSourcePlugin,
  type IconKey,
} from '@mdxeditor/editor';
import {
  CodeXml,
  FilePenLine,
  FileText,
  GitCompareArrows,
  MoreHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Chapter, ThemeName } from '@/app/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import '@mdxeditor/editor/style.css';

interface ManuscriptEditorProps {
  chapter: Chapter;
  onChange: (markdown: string) => void;
  theme: ThemeName;
}

const editorTranslations: Record<string, string> = {
  'toolbar.blockTypeSelect.placeholder': '段落样式',
  'toolbar.blockTypeSelect.selectBlockTypeTooltip': '选择段落样式',
  'toolbar.blockTypes.paragraph': '正文',
  'toolbar.blockTypes.quote': '引用',
  'toolbar.blockTypes.heading': '标题 {{level}}',
  'toolbar.undo': '撤销 {{shortcut}}',
  'toolbar.redo': '重做 {{shortcut}}',
  'toolbar.bold': '粗体',
  'toolbar.removeBold': '取消粗体',
  'toolbar.italic': '斜体',
  'toolbar.removeItalic': '取消斜体',
  'toolbar.link': '插入链接',
  'toolbar.bulletedList': '无序列表',
  'toolbar.numberedList': '有序列表',
  'toolbar.richText': '所见即所得',
  'toolbar.diffMode': '对比修改',
  'toolbar.source': 'Markdown 源码',
};

function translateEditor(
  key: string,
  defaultValue: string,
  interpolations?: Record<string, unknown>,
): string {
  const template = editorTranslations[key] ?? defaultValue;

  return template.replace(/{{(\w+)}}/g, (_, name: string) =>
    String(interpolations?.[name] ?? ''),
  );
}

function editorIcon(name: IconKey) {
  switch (name) {
    case 'rich_text':
      return <FilePenLine aria-hidden="true" size={17} />;
    case 'difference':
      return <GitCompareArrows aria-hidden="true" size={17} />;
    case 'markdown':
      return <CodeXml aria-hidden="true" size={17} />;
    default:
      return defaultSvgIcons[name];
  }
}

export function ManuscriptEditor({
  chapter,
  onChange,
  theme,
}: ManuscriptEditorProps) {
  const [parseError, setParseError] = useState<string | null>(null);

  const plugins = useMemo(
    () => [
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
      quotePlugin(),
      listsPlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      markdownShortcutPlugin(),
      diffSourcePlugin({
        diffMarkdown: chapter.previousMarkdown,
        viewMode: 'rich-text',
        readOnlyDiff: true,
      }),
      toolbarPlugin({
        toolbarClassName: 'manuscript-toolbar',
        toolbarContents: () => (
          <DiffSourceToggleWrapper>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles options={['Bold', 'Italic']} />
            <CreateLink />
            <ListsToggle options={['bullet', 'number']} />
          </DiffSourceToggleWrapper>
        ),
      }),
    ],
    [chapter.previousMarkdown],
  );

  const characterCount = chapter.markdown.replace(/\s|[#>*_`\-[\]()]/g, '').length;

  return (
    <section className="editor-pane">
      <div className="editor-tabs">
        <div className="editor-tab is-active">
          <FileText aria-hidden="true" size={13} />
          <span>{chapter.title}</span>
          <span className="unsaved-dot" title="仅保存在当前内存中" />
        </div>
        <Button aria-label="更多编辑器操作" size="icon" variant="ghost">
          <MoreHorizontal size={15} />
        </Button>
      </div>

      <div className="editor-surface">
        <MDXEditor
          className={cn(
            'driftfield-mdx',
            theme !== 'github-light' && 'dark-theme',
          )}
          contentEditableClassName="manuscript-prose"
          iconComponentFor={editorIcon}
          key={chapter.id}
          markdown={chapter.markdown}
          onChange={(markdown) => {
            setParseError(null);
            onChange(markdown);
          }}
          onError={({ error }) => setParseError(error)}
          placeholder="从这里开始写作……"
          plugins={plugins}
          spellCheck={false}
          suppressHtmlProcessing
          translation={translateEditor}
          trim={false}
        />
      </div>

      <footer className="editor-statusbar">
        <div>
          <span>Markdown</span>
          <span>{parseError ? '格式解析失败' : '当前会话草稿'}</span>
        </div>
        <div>
          <span>{characterCount} 字</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </section>
  );
}
