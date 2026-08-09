import { describe, expect, it } from 'vitest';

import {
  parseManuscriptIndex,
  parseProjectYamlSource,
} from '../../../../src/main/services/project/metadata-parser';

describe('project metadata parser', () => {
  it('parses validated metadata without filesystem context', () => {
    const value = parseProjectYamlSource(`
kind: manuscript
id: manuscript-1
title: Manuscript
children: []
`);

    expect(parseManuscriptIndex(value)).toEqual({
      children: [],
      id: 'manuscript-1',
      kind: 'manuscript',
      title: 'Manuscript',
    });
  });

  it('rejects executable-style formatter fields', () => {
    const value = parseProjectYamlSource(`
kind: manuscript
id: manuscript-1
title: Manuscript
chapterNumbering:
  mode: continuous
  format: "{process.env.SECRET}"
children: []
`);

    expect(() => parseManuscriptIndex(value)).toThrow(
      'Unknown project label placeholder',
    );
  });
});
