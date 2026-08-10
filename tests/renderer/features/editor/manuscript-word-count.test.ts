import { describe, expect, it } from 'vitest';

import { countManuscriptWords } from '../../../../src/renderer/features/editor/manuscript-word-count';

describe('manuscript word count', () => {
  it('counts Han characters and non-Han words as writing units', () => {
    expect(countManuscriptWords('开学第一天，hello world 2026。')).toBe(8);
  });

  it('counts visible Markdown text without counting syntax or link targets', () => {
    const markdown = [
      '# **Hello**, [world](https://example.com/path)',
      '',
      '你好，世界。',
      '',
      '`const value`',
    ].join('\n');

    expect(countManuscriptWords(markdown)).toBe(8);
  });

  it('counts image descriptions and code content but not raw HTML', () => {
    const markdown = [
      '![旧校门](https://example.com/school.png)',
      '',
      '```text',
      'first draft',
      '```',
      '',
      '<!-- hidden metadata -->',
    ].join('\n');

    expect(countManuscriptWords(markdown)).toBe(5);
  });

  it('treats apostrophes and hyphens inside Latin words as one word', () => {
    expect(countManuscriptWords("don't state-of-mind re—enter")).toBe(3);
  });

  it('returns zero for Markdown with no readable prose', () => {
    expect(countManuscriptWords('---\n')).toBe(0);
  });
});
