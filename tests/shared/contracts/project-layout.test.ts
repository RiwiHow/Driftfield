import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { describe, expect, it } from 'vitest';

import {
  isProjectIconId,
  PROJECT_ICON_IDS,
} from '../../../src/shared/contracts/project-layout';

describe('project icon catalog', () => {
  it('matches every dynamic icon exported by the installed Lucide package', () => {
    expect(PROJECT_ICON_IDS).toEqual(Object.keys(dynamicIconImports).sort());
  });

  it('accepts catalog icons and rejects names outside the installed library', () => {
    expect(isProjectIconId('zodiac-sagittarius')).toBe(true);
    expect(isProjectIconId('not-an-icon')).toBe(false);
  });
});
