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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { WorkspaceDocument } from '@/app/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppTheme } from '../../../shared/contracts/settings';
import { isDarkAppTheme } from '../../../shared/theme-contract';
import { shouldApplyEditorChange } from './editor-change';
import { EditorContextMenu } from './EditorContextMenu';
import { createMdxEditorTranslation } from './mdx-editor-translation';

import '@mdxeditor/editor/style.css';

interface ManuscriptEditorProps {
  document: WorkspaceDocument | null;
  isSaving: boolean;
  onClose: () => void;
  onChange: (markdown: string) => void;
  onSave: () => void;
  saveError: string | null;
  theme: AppTheme;
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
  document,
  isSaving,
  onClose,
  onChange,
  onSave,
  saveError,
  theme,
}: ManuscriptEditorProps) {
  if (document === null) {
    return <EmptyManuscriptEditor />;
  }

  return (
    <LoadedManuscriptEditor
      document={document}
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
  const { t } = useTranslation('editor');
  return (
    <section className="editor-pane">
      <div className="editor-tabs" />
      <div className="editor-empty-state">
        <div className="editor-empty-content">
          <FileText aria-hidden="true" size={28} strokeWidth={1.4} />
          <strong>{t('empty.title')}</strong>
          <span
            aria-label={t('empty.hint')}
            className="editor-empty-hint"
          >
            <span aria-hidden="true">{t('empty.hintPrefix')}</span>
            <Plus aria-hidden="true" size={13} strokeWidth={2} />
            <span aria-hidden="true">{t('empty.action')}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function LoadedManuscriptEditor({
  document,
  isSaving,
  onChange,
  onClose,
  onSave,
  saveError,
  theme,
}: {
  document: WorkspaceDocument;
  isSaving: boolean;
  onChange: (markdown: string) => void;
  onClose: () => void;
  onSave: () => void;
  saveError: string | null;
  theme: AppTheme;
}) {
  const { t } = useTranslation('editor');
  const [parseError, setParseError] = useState<string | null>(null);
  const translateEditor = useMemo(() => createMdxEditorTranslation(t), [t]);

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
          text: t('status.plainText'),
          typescript: 'TypeScript',
        },
      }),
      linkPlugin(),
      linkDialogPlugin(),
      markdownShortcutPlugin(),
      diffSourcePlugin({
        diffMarkdown: document.previousMarkdown,
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
    [document.previousMarkdown, t],
  );

  const characterCount = document.markdown.replace(/\s|[#>*_`\-[\]()]/g, '').length;

  return (
    <section className="editor-pane">
      <div className="editor-tabs">
        <div className="editor-tab is-active">
          <FileText aria-hidden="true" size={13} />
          <span>{document.title}</span>
          {document.isDirty && (
            <span className="unsaved-dot" title={t('status.unsavedTitle')} />
          )}
          <button
            aria-label={t('actions.closeNamed', { title: document.title })}
            className="editor-tab-close"
            onClick={onClose}
            title={t('actions.closeFile')}
            type="button"
          >
            <X aria-hidden="true" size={12} />
          </button>
        </div>
        <div className="editor-tab-actions">
          <Button
            aria-label={t('actions.save')}
            disabled={!document.isDirty || isSaving}
            onClick={onSave}
            size="icon"
            title={t('actions.saveShortcut')}
            variant="ghost"
          >
            {isSaving ? (
              <LoaderCircle className="editor-save-spinner" size={14} />
            ) : (
              <Save size={14} />
            )}
          </Button>
          <Button aria-label={t('actions.more')} size="icon" variant="ghost">
            <MoreHorizontal size={15} />
          </Button>
        </div>
      </div>

      <EditorContextMenu readOnly={isSaving}>
        <div className="editor-surface">
          <MDXEditor
            className={cn(
              'driftfield-mdx',
              isDarkAppTheme(theme) && 'dark-theme',
            )}
            contentEditableClassName="manuscript-prose"
            iconComponentFor={editorIcon}
            key={`${document.id}:${document.sourceRevision}`}
            markdown={document.markdown}
            onChange={(markdown, initialMarkdownNormalize) => {
              if (!shouldApplyEditorChange(initialMarkdownNormalize)) {
                return;
              }

              setParseError(null);
              onChange(markdown);
            }}
            onError={({ error }) => setParseError(error)}
            placeholder={t('placeholder')}
            plugins={plugins}
            readOnly={isSaving}
            spellCheck={false}
            suppressHtmlProcessing
            translation={translateEditor}
            trim={false}
          />
        </div>
      </EditorContextMenu>

      <footer className="editor-statusbar">
        <div>
          <span>Markdown</span>
          <span>
            {saveError
              ? saveError
              : document.backingFileStatus === 'missing'
                ? t('status.missing')
              : isSaving
                ? t('status.saving')
                : parseError
              ? t('status.parseError')
              : document.isDirty
                ? t('status.dirty')
                : document.relativePath}
          </span>
        </div>
        <div>
          <span>{t('status.characterCount', { count: characterCount })}</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </section>
  );
}
