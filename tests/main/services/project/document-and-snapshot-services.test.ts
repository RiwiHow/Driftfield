import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { saveProjectDocument } from '../../../../src/main/services/project/document-service';
import {
  contentRevision,
  isPathInside,
} from '../../../../src/main/services/project/document-utils';
import { initializeProjectLayout } from '../../../../src/main/services/project/layout-service';
import { createProjectSnapshot } from '../../../../src/main/services/project/snapshot-service';
import {
  createStructuredProjectDirectory,
  createStructuredProjectDocument,
  deleteStructuredLoreCategory,
} from '../../../../src/main/services/project/structural-document-service';
import { ProjectDatabase } from '../../../../src/main/database/project-database';
import { ProjectCatalogRepository } from '../../../../src/main/database/project-catalog-repository';

const temporaryDirectories: string[] = [];

const createTemporaryProject = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

const createProjectWithChapter = async (markdown: string): Promise<string> => {
  const directory = await createTemporaryProject();
  const layout = await initializeProjectLayout(directory);
  await createStructuredProjectDocument(directory, {
    documentId: 'chapter-1',
    kind: 'chapter',
    markdown,
    parentId: layout.manuscript.index.id,
    title: 'Chapter',
  });
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('project path containment', () => {
  it('rejects siblings and accepts descendants', () => {
    expect(isPathInside('/project', '/project/chapter.md')).toBe(true);
    expect(isPathInside('/project', '/project-other/chapter.md')).toBe(false);
    expect(isPathInside('/project', '/project')).toBe(false);
  });
});

describe('project documents', () => {
  it('scans Markdown with a content revision and ignores MDX', async () => {
    const directory = await createProjectWithChapter('# Chapter\n');
    await writeFile(
      path.join(directory, 'manuscript', 'unsafe.mdx'),
      '<Component />\n',
    );

    const snapshot = await createProjectSnapshot(directory);

    expect(snapshot.documents).toHaveLength(1);
    expect(snapshot.documents[0]).toMatchObject({
      id: 'chapter-1',
      revision: contentRevision('# Chapter\n'),
    });
  });

  it('rejects a missing required v3 lore root', async () => {
    const directory = await createProjectWithChapter('# Chapter\n');
    await rm(path.join(directory, 'lore'), { recursive: true });

    await expect(createProjectSnapshot(directory)).rejects.toThrow(
      'missing lore',
    );
  });

  it('returns a conflict instead of overwriting an external edit', async () => {
    const directory = await createProjectWithChapter('original');
    const [document] = (await createProjectSnapshot(directory)).documents;
    const documentPath = path.join(directory, document.relativePath);
    await writeFile(documentPath, 'external edit');

    const result = await saveProjectDocument(
      directory,
      {
        documentId: document.id,
        expectedRevision: document.revision,
        markdown: 'renderer edit',
      },
      document.relativePath,
    );

    expect(result.status).toBe('conflict');
    expect(await readFile(documentPath, 'utf8')).toBe('external edit');
  });

  it('allows an explicit reviewed overwrite', async () => {
    const directory = await createTemporaryProject();
    const documentPath = path.join(directory, 'chapter.md');
    await writeFile(documentPath, 'external edit');

    const result = await saveProjectDocument(
      directory,
      {
        documentId: 'chapter.md',
        expectedRevision: contentRevision('external edit'),
        markdown: 'reviewed renderer edit',
        overwrite: true,
      },
      'chapter.md',
    );

    expect(result).toEqual({
      revision: contentRevision('reviewed renderer edit'),
      status: 'saved',
    });
    expect(await readFile(documentPath, 'utf8')).toBe('reviewed renderer edit');
  });

  it('uses structured metadata order, labels, and stable document IDs', async () => {
    const directory = await createTemporaryProject();
    const layout = await initializeProjectLayout(directory);
    const database = new ProjectDatabase(directory);
    new ProjectCatalogRepository(database).updateTitle(
      layout.manuscript.index.id,
      'Main Story',
    );
    database.close();
    await createStructuredProjectDirectory(directory, {
      directoryId: 'volume-1',
      kind: 'volume',
      title: 'Volume One',
    });
    await createStructuredProjectDocument(directory, {
      documentId: 'chapter-a', kind: 'chapter', markdown: '# Alpha\n',
      parentId: 'volume-1', title: 'Alpha',
    });
    await createStructuredProjectDocument(directory, {
      documentId: 'chapter-b', kind: 'chapter', markdown: '# Beta\n',
      parentId: 'volume-1', title: 'Beta',
    });
    await createStructuredProjectDocument(directory, {
      documentId: 'chapter-c', kind: 'chapter', markdown: '# Gamma\n',
      parentId: layout.manuscript.index.id, title: 'Gamma',
    });

    const snapshot = await createProjectSnapshot(directory);

    expect(snapshot.documents.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'chapter-a', name: '1. Alpha' },
      { id: 'chapter-b', name: '2. Beta' },
      { id: 'chapter-c', name: '3. Gamma' },
    ]);
    expect(snapshot.rootTitles).toEqual({
      lore: 'Lore',
      manuscript: 'Main Story',
    });
    expect(snapshot.tree[0]).toMatchObject({
      name: 'Volume One',
      type: 'folder',
    });

    const result = await saveProjectDocument(
      directory,
      {
        documentId: 'chapter-a',
        expectedRevision: snapshot.documents[0].revision,
        markdown: '# Revised Alpha\n',
      },
      snapshot.documents[0].relativePath,
    );
    expect(result.status).toBe('saved');
    expect(
      await readFile(
        path.join(directory, snapshot.documents[0].relativePath),
        'utf8',
      ),
    ).toBe('# Revised Alpha\n');
  });

  it('scans indexed lore into its own ordered tree and allows saving it', async () => {
    const directory = await createTemporaryProject();
    const layout = await initializeProjectLayout(directory);
    for (const category of layout.lore?.categories ?? []) {
      await deleteStructuredLoreCategory(directory, {
        directoryId: category.index.id,
      });
    }
    const loreRootId = layout.lore!.index.id;
    await createStructuredProjectDocument(directory, {
      documentId: 'lore-world', kind: 'entry', markdown: '# First version\n',
      parentId: loreRootId, title: 'World',
    });
    await createStructuredProjectDirectory(directory, {
      directoryId: 'lore-places', kind: 'category', title: 'Places',
    });
    await createStructuredProjectDocument(directory, {
      documentId: 'lore-city', kind: 'entry', markdown: '# City\n',
      parentId: 'lore-places', title: 'City',
    });
    const first = await createProjectSnapshot(directory);
    const lorePath = path.join(
      directory,
      first.documents.find(({ id }) => id === 'lore-world')!.relativePath,
    );

    expect(first.documents.map(({ id }) => id)).toEqual([
      'lore-world',
      'lore-city',
    ]);
    expect(first.loreTree).toEqual([
      {
        documentId: 'lore-world',
        name: 'World',
        relativePath: path.join('lore', 'World.md'),
        type: 'file',
      },
      {
        children: [
          {
            documentId: 'lore-city',
            name: 'City',
            relativePath: path.join('lore', 'Places', 'City.md'),
            type: 'file',
          },
        ],
        name: 'Places',
        relativePath: path.join('lore', 'Places'),
        type: 'folder',
      },
    ]);

    const saveResult = await saveProjectDocument(
      directory,
      {
        documentId: 'lore-world',
        expectedRevision: first.documents[0].revision,
        markdown: '# Saved lore\n',
      },
      first.documents[0].relativePath,
    );
    expect(saveResult.status).toBe('saved');

    await writeFile(lorePath, '# Second version\n');
    const second = await createProjectSnapshot(directory);

    expect(second.revision).not.toBe(first.revision);
  });
});
