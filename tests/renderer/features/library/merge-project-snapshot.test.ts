import { describe, expect, it } from 'vitest';

import type { WorkspaceDocument } from '../../../../src/renderer/app/types';
import { mergeProjectSnapshot } from '../../../../src/renderer/features/library/merge-project-snapshot';
import type { ProjectSnapshot } from '../../../../src/shared/contracts/project';

const dirtyDocument: WorkspaceDocument = {
  backingFileStatus: 'available',
  id: 'document.md',
  isDirty: true,
  markdown: 'unsaved text',
  order: 1,
  previousMarkdown: 'old disk text',
  relativePath: 'document.md',
  revision: 'old-revision',
  sourceRevision: 1,
  title: 'document',
};

const emptySnapshot: ProjectSnapshot = {
  directory: { name: 'Novel', path: '/Novel' },
  documents: [],
  projectId: 'project-1',
  revision: 'empty',
  tree: [],
};

describe('project snapshot merge', () => {
  it('preserves a dirty document deleted outside Driftfield', () => {
    expect(mergeProjectSnapshot([dirtyDocument], emptySnapshot, true, 2)).toEqual([
      { ...dirtyDocument, backingFileStatus: 'missing' },
    ]);
  });

  it('drops a missing clean document', () => {
    expect(
      mergeProjectSnapshot(
        [{ ...dirtyDocument, isDirty: false }],
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
          id: 'document.md',
          markdown: 'external edit',
          name: 'document',
          relativePath: 'document.md',
          revision: 'new-revision',
        },
      ],
    };

    expect(mergeProjectSnapshot([dirtyDocument], snapshot, true, 2)[0]).toMatchObject({
      isDirty: true,
      markdown: 'unsaved text',
      revision: 'old-revision',
    });
  });
});
