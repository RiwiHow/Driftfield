import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
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
  tablePlugin,
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
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Save,
  X,
} from 'lucide-react';
import { useMemo, useState, type MouseEvent } from 'react';

import type { Chapter, ThemeName } from '@/app/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { shouldApplyEditorChange } from './editor-change';

import '@mdxeditor/editor/style.css';

interface ManuscriptEditorProps {
  chapter: Chapter | null;
  isSaving: boolean;
  onClose: () => void;
  onChange: (markdown: string) => void;
  onSave: () => void;
  saveError: string | null;
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
  isSaving,
  onClose,
  onChange,
  onSave,
  saveError,
  theme,
}: ManuscriptEditorProps) {
  if (chapter === null) {
    return <EmptyManuscriptEditor />;
  }

  return (
    <LoadedManuscriptEditor
      chapter={chapter}
      isSaving={isSaving}
      onClose={onClose}
      onChange={onChange}
      onSave={onSave}
      saveError={saveError}
      theme={theme}
    />
  );
}

function EmptyManuscriptEditor() {
  return (
    <section className="editor-pane">
      <div className="editor-tabs" />
      <div className="editor-empty-state">
        <div className="editor-empty-content">
          <FileText aria-hidden="true" size={28} strokeWidth={1.4} />
          <strong>没有打开的 Markdown 文档</strong>
          <span
            aria-label="点击小说目录右上角的加号按钮打开本地项目"
            className="editor-empty-hint"
          >
            <span aria-hidden="true">点击小说目录右上角的</span>
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
            <span aria-hidden="true">打开本地项目</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function LoadedManuscriptEditor({
  chapter,
  isSaving,
  onChange,
  onClose,
  onSave,
  saveError,
  theme,
}: {
  chapter: Chapter;
  isSaving: boolean;
  onChange: (markdown: string) => void;
  onClose: () => void;
  onSave: () => void;
  saveError: string | null;
  theme: ThemeName;
}) {
  const [parseError, setParseError] = useState<string | null>(null);

  const plugins = useMemo(
    () => [
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
      quotePlugin(),
      listsPlugin(),
      thematicBreakPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'text' }),
      codeMirrorPlugin({
        autoLoadLanguageSupport: true,
        codeBlockLanguages: {
          javascript: 'JavaScript',
          json: 'JSON',
          markdown: 'Markdown',
          text: '纯文本',
          typescript: 'TypeScript',
        },
      }),
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

  const showContextMenu = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;

    if (target.closest('[contenteditable="true"], .cm-editor') === null) {
      return;
    }

    event.preventDefault();
    void window.driftfield.showEditorContextMenu();
  };

  return (
    <section className="editor-pane">
      <div className="editor-tabs">
        <div className="editor-tab is-active">
          <FileText aria-hidden="true" size={13} />
          <span>{chapter.title}</span>
          {chapter.isDirty && (
            <span className="unsaved-dot" title="仅保存在当前内存中" />
          )}
          <button
            aria-label={`关闭 ${chapter.title}`}
            className="editor-tab-close"
            onClick={onClose}
            title="关闭文件"
            type="button"
          >
            <X aria-hidden="true" size={12} />
          </button>
        </div>
        <div className="editor-tab-actions">
          <Button
            aria-label="保存文件"
            disabled={!chapter.isDirty || isSaving}
            onClick={onSave}
            size="icon"
            title="保存（⌘S）"
            variant="ghost"
          >
            {isSaving ? (
              <LoaderCircle className="editor-save-spinner" size={14} />
            ) : (
              <Save size={14} />
            )}
          </Button>
          <Button aria-label="更多编辑器操作" size="icon" variant="ghost">
            <MoreHorizontal size={15} />
          </Button>
        </div>
      </div>

      <div className="editor-surface" onContextMenu={showContextMenu}>
        <MDXEditor
          className={cn(
            'driftfield-mdx',
            theme !== 'github-light' && 'dark-theme',
          )}
          contentEditableClassName="manuscript-prose"
          iconComponentFor={editorIcon}
          key={`${chapter.id}:${chapter.sourceRevision}`}
          markdown={chapter.markdown}
          onChange={(markdown, initialMarkdownNormalize) => {
            if (!shouldApplyEditorChange(initialMarkdownNormalize)) {
              return;
            }

            setParseError(null);
            onChange(markdown);
          }}
          onError={({ error }) => setParseError(error)}
          placeholder="从这里开始写作……"
          plugins={plugins}
          readOnly={isSaving}
          spellCheck={false}
          suppressHtmlProcessing
          translation={translateEditor}
          trim={false}
        />
      </div>

      <footer className="editor-statusbar">
        <div>
          <span>Markdown</span>
          <span>
            {saveError
              ? saveError
              : chapter.backingFileStatus === 'missing'
                ? '磁盘文件已移动或删除；修改已保留'
              : isSaving
                ? '正在保存…'
                : parseError
              ? '格式解析失败'
              : chapter.isDirty
                ? '当前会话修改'
                : chapter.relativePath}
          </span>
        </div>
        <div>
          <span>{characterCount} 字</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </section>
  );
}
