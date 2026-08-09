import { describe, expect, it } from 'vitest';

import type { Chapter } from '../../../../src/renderer/app/types';
import {
  initialProjectWorkspaceState,
  projectWorkspaceReducer,
} from '../../../../src/renderer/features/projects/project-workspace-reducer';
import type { ProjectSnapshot } from '../../../../src/shared/contracts/project';

const chapter: Chapter = {
  backingFileStatus: 'available',
  id: 'chapter-1',
  isDirty: false,
  markdown: '# Chapter',
  order: 0,
  previousMarkdown: '# Chapter',
  relativePath: 'manuscript/chapter.md',
  revision: 'revision-1',
  sourceRevision: 1,
  title: 'Chapter',
};

const snapshot: ProjectSnapshot = {
  directory: { name: 'Novel', path: '/novel' },
  documents: [
    {
      id: chapter.id,
      markdown: chapter.markdown,
      name: chapter.title,
      relativePath: chapter.relativePath,
      revision: chapter.revision,
    },
  ],
  projectId: 'project-1',
  revision: 'project-revision-1',
  tree: [],
};

describe('projectWorkspaceReducer', () => {
  it('applies a project snapshot and selects its first document', () => {
    const state = projectWorkspaceReducer(initialProjectWorkspaceState, {
      preserveDirtyDocuments: false,
      project: snapshot,
      sourceRevision: 1,
      type: 'apply-snapshot',
    });

    expect(state).toMatchObject({
      activeChapterId: 'chapter-1',
      projectDirectory: snapshot.directory,
      projectId: 'project-1',
    });
    expect(state.chapters).toHaveLength(1);
  });

  it('keeps editor changes dirty until the matching content is committed', () => {
    const loaded = {
      ...initialProjectWorkspaceState,
      activeChapterId: chapter.id,
      chapters: [chapter],
    };
    const edited = projectWorkspaceReducer(loaded, {
      markdown: '# Edited',
      type: 'update-active-chapter',
    });
    const saved = projectWorkspaceReducer(edited, {
      chapter: edited.chapters[0],
      revision: 'revision-2',
      type: 'commit-saved-chapter',
    });

    expect(edited.chapters[0]).toMatchObject({
      isDirty: true,
      markdown: '# Edited',
    });
    expect(saved.chapters[0]).toMatchObject({
      isDirty: false,
      previousMarkdown: '# Edited',
      revision: 'revision-2',
    });
  });

  it('moves a conflict into comparison state without losing local text', () => {
    const state = {
      ...initialProjectWorkspaceState,
      activeChapterId: chapter.id,
      chapters: [{ ...chapter, isDirty: true, markdown: '# Local' }],
      saveConflict: {
        diskDocument: {
          id: chapter.id,
          markdown: '# Disk',
          name: chapter.title,
          relativePath: chapter.relativePath,
          revision: 'revision-disk',
        },
        documentId: chapter.id,
      },
    };
    const compared = projectWorkspaceReducer(state, {
      sourceRevision: 3,
      type: 'compare-conflict',
    });

    expect(compared.chapters[0]).toMatchObject({
      isDirty: true,
      markdown: '# Local',
      previousMarkdown: '# Disk',
      revision: 'revision-disk',
    });
    expect(compared.saveConflict).toBeNull();
    expect(compared.documentSaveMessage).toMatchObject({
      key: 'messages.comparisonReady',
    });
  });
});
