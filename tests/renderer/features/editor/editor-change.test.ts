import { describe, expect, it } from 'vitest';

import { shouldApplyEditorChange } from '../../../../src/renderer/features/editor/editor-change';

describe('MDXEditor change initialization', () => {
  it('ignores the initial Markdown normalization callback', () => {
    expect(shouldApplyEditorChange(true)).toBe(false);
  });

  it('accepts subsequent user changes', () => {
    expect(shouldApplyEditorChange(false)).toBe(true);
  });
});
