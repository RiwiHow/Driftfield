import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { PROJECT_INDEX_NAME } from '../../../../src/shared/contracts/project-layout';
import { stringify } from 'yaml';

const temporaryDirectories: string[] = [];

const createTemporaryProject = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

const createProjectWithChapter = async (markdown: string): Promise<string> => {
  const directory = await createTemporaryProject();
  await initializeProjectLayout(directory);
  await writeFile(
    path.join(directory, 'manuscript', PROJECT_INDEX_NAME),
    stringify({
      children: [
        {
          file: 'chapter.md',
          id: 'chapter-1',
          kind: 'chapter',
          title: 'Chapter',
        },
      ],
      id: 'manuscript-1',
      kind: 'manuscript',
      title: 'Manuscript',
    }),
  );
  await writeFile(path.join(directory, 'manuscript', 'chapter.md'), markdown);
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

  it('keeps the optional lore tree absent for legacy projects', async () => {
    const directory = await createProjectWithChapter('# Chapter\n');
    await rm(path.join(directory, 'lore'), { recursive: true });

    const snapshot = await createProjectSnapshot(directory);

    expect(snapshot.loreTree).toBeNull();
    expect(snapshot.rootTitles).toEqual({ manuscript: 'Manuscript' });
  });

  it('returns a conflict instead of overwriting an external edit', async () => {
    const directory = await createProjectWithChapter('original');
    const documentPath = path.join(directory, 'manuscript', 'chapter.md');
    const [document] = (await createProjectSnapshot(directory)).documents;
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
    await initializeProjectLayout(directory);
    await mkdir(path.join(directory, 'manuscript', 'volume-001'));
    await Promise.all([
      writeFile(
        path.join(directory, 'manuscript', PROJECT_INDEX_NAME),
        stringify({
          chapterNumbering: {
            format: '{number}. {title}',
            mode: 'continuous',
          },
          children: [
            { directory: 'volume-001', kind: 'volume' },
            {
              file: 'chapter-003.md',
              id: 'chapter-c',
              kind: 'chapter',
              title: 'Gamma',
            },
          ],
          id: 'manuscript-1',
          kind: 'manuscript',
          title: 'Main Story',
        }),
      ),
      writeFile(
        path.join(directory, 'manuscript', 'volume-001', PROJECT_INDEX_NAME),
        stringify({
          children: [
            {
              file: 'chapter-001.md',
              id: 'chapter-a',
              kind: 'chapter',
              title: 'Alpha',
            },
            {
              file: 'chapter-002.md',
              id: 'chapter-b',
              kind: 'chapter',
              title: 'Beta',
            },
          ],
          id: 'volume-1',
          kind: 'volume',
          title: 'Volume One',
        }),
      ),
      writeFile(
        path.join(directory, 'manuscript', 'volume-001', 'chapter-001.md'),
        '# Alpha\n',
      ),
      writeFile(
        path.join(directory, 'manuscript', 'volume-001', 'chapter-002.md'),
        '# Beta\n',
      ),
      writeFile(
        path.join(directory, 'manuscript', 'chapter-003.md'),
        '# Gamma\n',
      ),
    ]);

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
        path.join(directory, 'manuscript', 'volume-001', 'chapter-001.md'),
        'utf8',
      ),
    ).toBe('# Revised Alpha\n');
  });

  it('scans indexed lore into its own ordered tree and allows saving it', async () => {
    const directory = await createTemporaryProject();
    await initializeProjectLayout(directory);
    await mkdir(path.join(directory, 'lore', 'places'));
    await writeFile(
      path.join(directory, 'lore', PROJECT_INDEX_NAME),
      stringify({
        children: [
          {
            file: 'world.md',
            id: 'lore-world',
            kind: 'entry',
            title: 'World',
          },
          { directory: 'places', kind: 'category' },
        ],
        id: 'lore-1',
        kind: 'lore',
        title: 'Lore',
      }),
    );
    await writeFile(
      path.join(directory, 'lore', 'places', PROJECT_INDEX_NAME),
      stringify({
        children: [
          {
            file: 'city.md',
            id: 'lore-city',
            kind: 'entry',
            title: 'City',
          },
        ],
        id: 'lore-places',
        kind: 'category',
        title: 'Places',
      }),
    );
    const lorePath = path.join(directory, 'lore', 'world.md');
    await writeFile(lorePath, '# First version\n');
    await writeFile(path.join(directory, 'lore', 'places', 'city.md'), '# City\n');
    const first = await createProjectSnapshot(directory);

    expect(first.documents.map(({ id }) => id)).toEqual([
      'lore-world',
      'lore-city',
    ]);
    expect(first.loreTree).toEqual([
      {
        documentId: 'lore-world',
        name: 'World',
        relativePath: path.join('lore', 'world.md'),
        type: 'file',
      },
      {
        children: [
          {
            documentId: 'lore-city',
            name: 'City',
            relativePath: path.join('lore', 'places', 'city.md'),
            type: 'file',
          },
        ],
        name: 'Places',
        relativePath: path.join('lore', 'places'),
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
