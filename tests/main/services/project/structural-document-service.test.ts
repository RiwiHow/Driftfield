import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { initializeProjectLayout, loadProjectLayout } from '../../../../src/main/services/project/layout-service';
import { createProjectSnapshot } from '../../../../src/main/services/project/snapshot-service';
import {
  createStructuredProjectDocument,
  deleteStructuredProjectDocument,
} from '../../../../src/main/services/project/structural-document-service';
import { contentRevision } from '../../../../src/main/services/project/document-utils';

const temporaryDirectories: string[] = [];

const createProject = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'driftfield-structure-'));
  temporaryDirectories.push(directory);
  await initializeProjectLayout(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('structured project documents', () => {
  it('creates and deletes a manuscript document through its parent stable ID', async () => {
    const directory = await createProject();
    const layout = await loadProjectLayout(directory);

    await createStructuredProjectDocument(directory, {
      documentId: 'chapter-created',
      kind: 'chapter',
      markdown: '# Created\n',
      parentId: layout.manuscript.index.id,
      title: 'Created',
    });

    const created = await createProjectSnapshot(directory);
    expect(created.documents).toEqual([
      expect.objectContaining({
        id: 'chapter-created',
        markdown: '# Created\n',
        name: '1. Created',
      }),
    ]);
    const documentPath = created.documents[0].relativePath;

    await deleteStructuredProjectDocument(directory, {
      baseRevision: contentRevision('# Created\n'),
      documentId: 'chapter-created',
    });

    await expect(access(path.join(directory, documentPath))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(createProjectSnapshot(directory)).resolves.toMatchObject({
      documents: [],
      tree: [],
    });
  });

  it('does not remove a document when its content revision changed', async () => {
    const directory = await createProject();
    const layout = await loadProjectLayout(directory);
    await createStructuredProjectDocument(directory, {
      documentId: 'chapter-conflict',
      kind: 'chapter',
      markdown: '# Original\n',
      parentId: layout.manuscript.index.id,
      title: 'Conflict',
    });
    const [{ relativePath }] = (await createProjectSnapshot(directory)).documents;
    await writeFile(path.join(directory, relativePath), '# External\n');

    await expect(
      deleteStructuredProjectDocument(directory, {
        baseRevision: contentRevision('# Original\n'),
        documentId: 'chapter-conflict',
      }),
    ).rejects.toThrow('revision changed');

    await expect(readFile(path.join(directory, relativePath), 'utf8')).resolves.toBe(
      '# External\n',
    );
    expect((await loadProjectLayout(directory)).manuscript.index.children).toEqual([
      expect.objectContaining({ id: 'chapter-conflict' }),
    ]);
  });

  it('enforces lore and manuscript document kinds', async () => {
    const directory = await createProject();
    const layout = await loadProjectLayout(directory);

    await expect(
      createStructuredProjectDocument(directory, {
        documentId: 'invalid-entry',
        kind: 'entry',
        markdown: '',
        parentId: layout.manuscript.index.id,
        title: 'Invalid',
      }),
    ).rejects.toThrow('kind is invalid');
  });
});
