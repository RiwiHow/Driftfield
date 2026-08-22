import { describe, expect, it } from 'vitest';

import {
  MAX_PROJECT_ICON_SUGGESTIONS,
  searchProjectIcons,
} from '../../../src/main/ai/project-icon-search';
import { isProjectIconId } from '../../../src/shared/contracts/project-layout';

describe('project icon search', () => {
  it('ranks exact and compound Lucide names from semantic keywords', () => {
    const icons = searchProjectIcons('magic wand sparkles');

    expect(icons).toContain('wand');
    expect(icons).toContain('wand-sparkles');
    expect(icons).toContain('sparkles');
  });

  it('returns a bounded unique list containing only bundled icons', () => {
    const icons = searchProjectIcons('person character users contact');

    expect(icons.length).toBeLessThanOrEqual(MAX_PROJECT_ICON_SUGGESTIONS);
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons.every(isProjectIconId)).toBe(true);
  });

  it('ignores generic search wording without a visual keyword', () => {
    expect(searchProjectIcons('icons for the lore folder')).toEqual([]);
  });
});
