import { describe, expect, it } from 'vitest';

import type { WorkspaceDocument } from '../../../../src/renderer/app/types';
import {
  initialProjectWorkspaceState,
  projectWorkspaceReducer,
} from '../../../../src/renderer/features/projects/project-workspace-reducer';
import type { ProjectSnapshot } from '../../../../src/shared/contracts/project';

const document: WorkspaceDocument = {
  backingFileStatus: 'available',
  id: 'document-1',
  isDirty: false,
  markdown: '# Chapter',
  previousMarkdown: '# Chapter',
  relativePath: 'manuscript/document.md',
  revision: 'revision-1',
  sourceRevision: 1,
  title: 'Chapter',
};

const snapshot: ProjectSnapshot = {
  directory: { name: 'Novel', path: '/novel' },
  documents: [
    {
      id: document.id,
      markdown: document.markdown,
      name: document.title,
      relativePath: document.relativePath,
      revision: document.revision,
    },
  ],
  loreTree: [
    {
      documentId: 'lore-1',
      name: 'World',
      relativePath: 'lore/world.md',
      type: 'file',
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
      activeDocumentId: 'document-1',
      projectDirectory: snapshot.directory,
      projectId: 'project-1',
      projectLoreTree: snapshot.loreTree,
    });
    expect(state.documents).toHaveLength(1);
  });

  it('keeps editor changes dirty until the matching content is committed', () => {
    const loaded = {
      ...initialProjectWorkspaceState,
      activeDocumentId: document.id,
      documents: [document],
    };
    const edited = projectWorkspaceReducer(loaded, {
      markdown: '# Edited',
      type: 'update-active-document',
    });
    const saved = projectWorkspaceReducer(edited, {
      document: edited.documents[0],
      revision: 'revision-2',
      type: 'commit-saved-document',
    });

    expect(edited.documents[0]).toMatchObject({
      isDirty: true,
      markdown: '# Edited',
    });
    expect(saved.documents[0]).toMatchObject({
      isDirty: false,
      previousMarkdown: '# Edited',
      revision: 'revision-2',
    });
  });

  it('moves a conflict into comparison state without losing local text', () => {
    const state = {
      ...initialProjectWorkspaceState,
      activeDocumentId: document.id,
      documents: [{ ...document, isDirty: true, markdown: '# Local' }],
      saveConflict: {
        diskDocument: {
          id: document.id,
          markdown: '# Disk',
          name: document.title,
          relativePath: document.relativePath,
          revision: 'revision-disk',
        },
        documentId: document.id,
      },
    };
    const compared = projectWorkspaceReducer(state, {
      sourceRevision: 3,
      type: 'compare-conflict',
    });

    expect(compared.documents[0]).toMatchObject({
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
