import { describe, expect, it } from 'vitest';

import { validateManuscriptMarkdown } from '../../../../src/main/services/project/manuscript-markdown-validator';

describe('Manuscript Markdown validation', () => {
  it('accepts ordinary novel Markdown', () => {
    expect(validateManuscriptMarkdown('# Chapter\n\nA paragraph with *emphasis*.'))
      .toEqual({ ok: true });
  });

  it('rejects raw HTML and Agent protocol remnants', () => {
    expect(validateManuscriptMarkdown('Before\n\n<div>unsafe</div>')).toEqual({
      code: 'raw-html',
      ok: false,
    });
    expect(validateManuscriptMarkdown('Before\n\n<prompt>unfinished</prompt>')).toEqual({
      code: 'protocol-markup',
      ok: false,
    });
  });

  it('rejects a severely truncated assigned draft', () => {
    expect(validateManuscriptMarkdown('Only an opening.', { targetLength: 3_000 }))
      .toEqual({ code: 'severely-under-target', ok: false });
  });
});
