import { describe, expect, it } from 'vitest';

import type { Chapter } from '@/app/types';
import type { ProjectSnapshot } from '../../../shared/contracts/project';
import { mergeProjectSnapshot } from './merge-project-snapshot';

const dirtyChapter: Chapter = {
  backingFileStatus: 'available',
  id: 'chapter.md',
  isDirty: true,
  markdown: 'unsaved text',
  order: 1,
  previousMarkdown: 'old disk text',
  relativePath: 'chapter.md',
  revision: 'old-revision',
  sourceRevision: 1,
  title: 'chapter',
};

const emptySnapshot: ProjectSnapshot = {
  directory: { name: 'Novel', path: '/Novel' },
  documents: [],
  revision: 'empty',
  tree: [],
};

describe('project snapshot merge', () => {
  it('preserves a dirty document deleted outside Driftfield', () => {
    expect(mergeProjectSnapshot([dirtyChapter], emptySnapshot, true, 2)).toEqual([
      { ...dirtyChapter, backingFileStatus: 'missing' },
    ]);
  });

  it('drops a missing clean document', () => {
    expect(
      mergeProjectSnapshot(
        [{ ...dirtyChapter, isDirty: false }],
        emptySnapshot,
        true,
        2,
      ),
    ).toEqual([]);
  });

  it('does not replace dirty text when the disk changes', () => {
    const snapshot: ProjectSnapshot = {
      ...emptySnapshot,
      documents: [
        {
          id: 'chapter.md',
          markdown: 'external edit',
          name: 'chapter',
          relativePath: 'chapter.md',
          revision: 'new-revision',
        },
      ],
    };

    expect(mergeProjectSnapshot([dirtyChapter], snapshot, true, 2)[0]).toMatchObject({
      isDirty: true,
      markdown: 'unsaved text',
      revision: 'old-revision',
    });
  });
});
