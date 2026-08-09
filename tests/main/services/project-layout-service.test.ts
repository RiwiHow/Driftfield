import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import {
  initializeProjectLayout,
  loadProjectLayout,
  openProjectLayout,
} from '../../../src/main/services/project-layout-service';
import {
  PROJECT_INDEX_NAME,
  PROJECT_MANIFEST_NAME,
} from '../../../src/shared/contracts/project-layout';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-layout-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('Driftfield project layout', () => {
  it('initializes an empty folder with manuscript and lorebook roots', async () => {
    const directory = await createTemporaryDirectory();

    const layout = await openProjectLayout(directory);

    expect(layout?.manifest).toMatchObject({
      formatVersion: 1,
      kind: 'novel',
      title: path.basename(directory),
    });
    expect(await readdir(directory)).toEqual(
      expect.arrayContaining(['driftfield.yaml', 'lorebook', 'manuscript']),
    );
    expect(await readdir(path.join(directory, 'manuscript'))).toContain(
      PROJECT_INDEX_NAME,
    );
    expect(await readdir(path.join(directory, 'lorebook'))).toContain(
      PROJECT_INDEX_NAME,
    );
    expect(layout?.lorebook?.index).toMatchObject({
      children: [],
      kind: 'lorebook',
      title: 'Lorebook',
    });
  });

  it('does not initialize or mutate a nonempty legacy folder', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, 'chapter.md'), '# Existing\n');

    await expect(openProjectLayout(directory)).resolves.toBeNull();
    await expect(readFile(path.join(directory, 'chapter.md'), 'utf8')).resolves.toBe(
      '# Existing\n',
    );
    await expect(readFile(path.join(directory, PROJECT_MANIFEST_NAME), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('requires exact lowercase root names', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    await renameForCaseTest(
      path.join(directory, 'manuscript'),
      path.join(directory, 'Manuscript'),
    );

    await expect(loadProjectLayout(directory)).rejects.toThrow(
      'exact lowercase name',
    );
  });

  it('rejects unsupported formatter placeholders', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    const manuscriptIndexPath = path.join(
      directory,
      'manuscript',
      PROJECT_INDEX_NAME,
    );
    await writeFile(
      manuscriptIndexPath,
      stringify({
        chapterNumbering: {
          format: '{title} {process.env.SECRET}',
          mode: 'continuous',
        },
        children: [],
        id: 'manuscript-1',
        kind: 'manuscript',
        title: 'Manuscript',
      }),
    );

    await expect(loadProjectLayout(directory)).rejects.toThrow(
      'Unknown project label placeholder',
    );
  });

  it('rejects YAML aliases', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    const manuscriptIndexPath = path.join(
      directory,
      'manuscript',
      PROJECT_INDEX_NAME,
    );
    await writeFile(
      manuscriptIndexPath,
      [
        'kind: manuscript',
        'id: manuscript-1',
        'title: Manuscript',
        'children:',
        '  - &chapter',
        '    kind: chapter',
        '    id: chapter-1',
        '    file: chapter.md',
        '    title: Chapter',
        '  - *chapter',
        '',
      ].join('\n'),
    );

    await expect(loadProjectLayout(directory)).rejects.toThrow();
  });

  it('rejects path traversal segments', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    await writeFile(path.join(directory, 'outside.md'), '# Outside\n');
    await writeFile(
      path.join(directory, 'manuscript', PROJECT_INDEX_NAME),
      stringify({
        children: [
          {
            file: '../outside.md',
            id: 'chapter-1',
            kind: 'chapter',
            title: 'Outside',
          },
        ],
        id: 'manuscript-1',
        kind: 'manuscript',
        title: 'Manuscript',
      }),
    );

    await expect(loadProjectLayout(directory)).rejects.toThrow(
      'invalid path segment',
    );
  });

  it('rejects duplicate stable IDs across manuscript and lorebook', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    await Promise.all([
      writeFile(
        path.join(directory, 'manuscript', PROJECT_INDEX_NAME),
        stringify({
          children: [
            {
              file: 'chapter.md',
              id: 'shared-id',
              kind: 'chapter',
              title: 'Chapter',
            },
          ],
          id: 'manuscript-1',
          kind: 'manuscript',
          title: 'Manuscript',
        }),
      ),
      writeFile(path.join(directory, 'manuscript', 'chapter.md'), '# Chapter\n'),
      writeFile(
        path.join(directory, 'lorebook', PROJECT_INDEX_NAME),
        stringify({
          children: [
            {
              file: 'world.md',
              id: 'shared-id',
              kind: 'entry',
              title: 'World',
            },
          ],
          id: 'lorebook-1',
          kind: 'lorebook',
          title: 'Lorebook',
        }),
      ),
      writeFile(path.join(directory, 'lorebook', 'world.md'), '# World\n'),
    ]);

    await expect(loadProjectLayout(directory)).rejects.toThrow(
      'duplicate stable IDs',
    );
  });
});

const renameForCaseTest = async (
  sourcePath: string,
  destinationPath: string,
): Promise<void> => {
  const intermediatePath = `${sourcePath}-case-transition`;
  await rename(sourcePath, intermediatePath);
  await rename(intermediatePath, destinationPath);
};
