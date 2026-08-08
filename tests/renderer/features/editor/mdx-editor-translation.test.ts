import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import { createMdxEditorTranslation } from '../../../../src/renderer/features/editor/mdx-editor-translation';

describe('MDXEditor translation adapter', () => {
  it('maps known MDXEditor keys and forwards interpolation values', () => {
    const t = vi.fn((key: string, options: Record<string, unknown>) =>
      `${key}:${String(options.level)}`,
    );
    const translate = createMdxEditorTranslation(
      t as unknown as TFunction<'editor'>,
    );

    expect(
      translate('toolbar.blockTypes.heading', 'Heading {{level}}', { level: 2 }),
    ).toBe('mdx.heading:2');
    expect(t).toHaveBeenCalledWith('mdx.heading', {
      defaultValue: 'Heading {{level}}',
      level: 2,
    });
  });

  it('uses the library default for unmapped keys', () => {
    const translate = createMdxEditorTranslation(
      vi.fn() as unknown as TFunction<'editor'>,
    );
    expect(translate('future.key', 'Future label')).toBe('Future label');
  });
});
