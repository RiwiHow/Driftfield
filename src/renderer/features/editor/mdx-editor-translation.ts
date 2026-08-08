import type { TFunction } from 'i18next';

const mdxTranslationKeys = {
  'toolbar.blockTypeSelect.placeholder': 'mdx.blockType',
  'toolbar.blockTypeSelect.selectBlockTypeTooltip': 'mdx.blockTypeTooltip',
  'toolbar.blockTypes.paragraph': 'mdx.paragraph',
  'toolbar.blockTypes.quote': 'mdx.quote',
  'toolbar.blockTypes.heading': 'mdx.heading',
  'toolbar.undo': 'mdx.undo',
  'toolbar.redo': 'mdx.redo',
  'toolbar.bold': 'mdx.bold',
  'toolbar.removeBold': 'mdx.removeBold',
  'toolbar.italic': 'mdx.italic',
  'toolbar.removeItalic': 'mdx.removeItalic',
  'toolbar.link': 'mdx.link',
  'toolbar.bulletedList': 'mdx.bulletedList',
  'toolbar.numberedList': 'mdx.numberedList',
  'toolbar.richText': 'mdx.richText',
  'toolbar.diffMode': 'mdx.diff',
  'toolbar.source': 'mdx.source',
} as const;

export const createMdxEditorTranslation = (t: TFunction<'editor'>) =>
  (
    key: string,
    defaultValue: string,
    interpolations?: Record<string, unknown>,
  ): string => {
    const translationKey =
      mdxTranslationKeys[key as keyof typeof mdxTranslationKeys];
    return translationKey === undefined
      ? defaultValue
      : t(translationKey, { ...interpolations, defaultValue });
  };
