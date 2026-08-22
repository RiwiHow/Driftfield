import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { initializeProjectLayout, loadProjectLayout } from '../../../../src/main/services/project/layout-service';
import { createProjectSnapshot } from '../../../../src/main/services/project/snapshot-service';
import {
  createStructuredProjectDocument,
  createStructuredProjectDirectory,
  deleteStructuredProjectDocument,
  deleteStructuredLoreCategory,
  moveStructuredProjectDocument,
  setStructuredLoreCategoryIcon,
} from '../../../../src/main/services/project/structural-document-service';
import { contentRevision } from '../../../../src/main/services/project/document-utils';
import { ProjectDatabase } from '../../../../src/main/database/project-database';

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
  it('records completed cross-domain mutations in the project operation ledger', async () => {
    const directory = await createProject();
    const layout = await loadProjectLayout(directory);
    await createStructuredProjectDocument(directory, {
      documentId: 'chapter-ledger',
      kind: 'chapter',
      markdown: '# Ledger\n',
      parentId: layout.manuscript.index.id,
      title: 'Ledger',
    });
    const database = new ProjectDatabase(directory);
    expect(database.connection.prepare(`
      SELECT operation_kind, state FROM project_operations ORDER BY created_at
    `).all()).toEqual([{ operation_kind: 'create-document', state: 'completed' }]);
    database.close();
  });

  it('blocks opening a project with an unfinished recoverable mutation', async () => {
    const directory = await createProject();
    const database = new ProjectDatabase(directory);
    database.connection.prepare(`
      INSERT INTO project_operations(
        operation_id, operation_kind, state, base_project_revision,
        payload_json, created_at, updated_at
      ) VALUES ('operation-1', 'save-document', 'filesystem_applied', 0,
                '{}', 'now', 'now')
    `).run();
    database.close();

    await expect(loadProjectLayout(directory)).rejects.toMatchObject({
      code: 'project-recovery-required',
    });
  });

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
    expect(documentPath).toBe(path.join('manuscript', 'Created.md'));

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

  it('creates icon-bearing lore categories and deletes them only when empty', async () => {
    const directory = await createProject();

    await createStructuredProjectDirectory(directory, {
      directoryId: 'society-id',
      icon: 'landmark',
      kind: 'category',
      title: 'Society',
    });
    await createStructuredProjectDocument(directory, {
      documentId: 'society-book-id',
      kind: 'entry',
      markdown: '# Society\n',
      parentId: 'society-id',
      title: 'Society book',
    });

    await setStructuredLoreCategoryIcon(directory, {
      directoryId: 'society-id',
      icon: 'flag',
    });

    const created = await loadProjectLayout(directory);
    expect(created.lore?.categories).toContainEqual(
      expect.objectContaining({
        index: expect.objectContaining({
          children: [expect.objectContaining({ id: 'society-book-id' })],
          icon: 'flag',
          id: 'society-id',
          title: 'Society',
        }),
      }),
    );
    const database = new ProjectDatabase(directory);
    expect(database.connection.prepare(`
      SELECT operation_kind FROM project_operations ORDER BY created_at
    `).all()).toContainEqual({ operation_kind: 'set-directory-icon' });
    database.close();
    await expect(
      deleteStructuredLoreCategory(directory, { directoryId: 'society-id' }),
    ).rejects.toThrow('must be empty');

    await deleteStructuredProjectDocument(directory, {
      baseRevision: contentRevision('# Society\n'),
      documentId: 'society-book-id',
    });
    await deleteStructuredLoreCategory(directory, { directoryId: 'society-id' });

    expect((await loadProjectLayout(directory)).lore?.categories).not.toContainEqual(
      expect.objectContaining({ index: expect.objectContaining({ id: 'society-id' }) }),
    );
    await expect(access(path.join(directory, 'lore', 'Society'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('creates a volume and moves a chapter into it by stable IDs', async () => {
    const directory = await createProject();
    const layout = await loadProjectLayout(directory);
    await createStructuredProjectDocument(directory, {
      documentId: 'chapter-moved',
      kind: 'chapter',
      markdown: '# Move me\n',
      parentId: layout.manuscript.index.id,
      title: 'Move me',
    });

    await createStructuredProjectDirectory(directory, {
      directoryId: 'volume-two',
      kind: 'volume',
      title: 'Volume Two',
    });
    await moveStructuredProjectDocument(directory, {
      baseRevision: contentRevision('# Move me\n'),
      documentId: 'chapter-moved',
      targetParentId: 'volume-two',
    });

    const movedLayout = await loadProjectLayout(directory);
    expect(movedLayout.manuscript.index.children).toContainEqual({
      directory: 'Volume Two',
      kind: 'volume',
    });
    expect(movedLayout.manuscript.index.children).not.toContainEqual(
      expect.objectContaining({ id: 'chapter-moved' }),
    );
    expect(movedLayout.manuscript.volumes[0].index).toMatchObject({
      id: 'volume-two',
      title: 'Volume Two',
    });
    expect(movedLayout.manuscript.volumes[0].index.children).toContainEqual(
      expect.objectContaining({ id: 'chapter-moved' }),
    );
    expect((await createProjectSnapshot(directory)).documents).toContainEqual(
      expect.objectContaining({
        id: 'chapter-moved',
        markdown: '# Move me\n',
        relativePath: path.join('manuscript', 'Volume Two', 'Move me.md'),
      }),
    );
  });

  it('creates readable collision-safe names without changing stable IDs', async () => {
    const directory = await createProject();
    const layout = await loadProjectLayout(directory);

    await createStructuredProjectDocument(directory, {
      documentId: 'first-stable-id',
      kind: 'chapter',
      markdown: '# First\n',
      parentId: layout.manuscript.index.id,
      title: 'Act I: Arrival',
    });
    await createStructuredProjectDocument(directory, {
      documentId: 'second-stable-id',
      kind: 'chapter',
      markdown: '# Second\n',
      parentId: layout.manuscript.index.id,
      title: 'Act I: Arrival',
    });

    const created = await createProjectSnapshot(directory);
    expect(created.documents).toEqual([
      expect.objectContaining({
        id: 'first-stable-id',
        relativePath: path.join('manuscript', 'Act I- Arrival.md'),
      }),
      expect.objectContaining({
        id: 'second-stable-id',
        relativePath: path.join('manuscript', 'Act I- Arrival (2).md'),
      }),
    ]);
  });
});
