import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import {
  initializeProjectLayout,
  loadProjectLayout,
  openProjectLayout,
} from '../../../../src/main/services/project/layout-service';
import { ProjectDatabase } from '../../../../src/main/database/project-database';
import { PROJECT_INDEX_NAME } from '../../../../src/shared/contracts/project-layout';

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-layout-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Driftfield project layout', () => {
  it('initializes an empty folder with manuscript and default lore categories', async () => {
    const directory = await createTemporaryDirectory();

    const layout = await openProjectLayout(directory);

    expect(layout?.manifest).toMatchObject({
      formatVersion: 2,
      kind: 'novel',
      title: path.basename(directory),
    });
    expect(await readdir(directory)).toEqual(
      expect.arrayContaining(['.driftfield', 'lore', 'manuscript']),
    );
    expect(await readdir(directory)).not.toContain(PROJECT_INDEX_NAME);
    expect(await readdir(path.join(directory, 'manuscript'))).toContain(
      PROJECT_INDEX_NAME,
    );
    expect(await readdir(path.join(directory, 'lore'))).toEqual(
      expect.arrayContaining([
        PROJECT_INDEX_NAME,
        'Locations',
        'Personae',
        'World',
      ]),
    );
    expect(await readdir(path.join(directory, '.driftfield'))).toEqual(
      expect.arrayContaining([
        'conversations.sqlite',
        'project.sqlite',
        'settings.sqlite',
      ]),
    );
    expect(layout?.lore?.index).toMatchObject({
      children: [
        { directory: 'Personae', kind: 'category' },
        { directory: 'Locations', kind: 'category' },
        { directory: 'World', kind: 'category' },
      ],
      kind: 'lore',
      title: 'Lore',
    });
    expect(layout?.lore?.categories.map(({ directory, index }) => ({
      directory,
      icon: index.icon,
      title: index.title,
    }))).toEqual([
      { directory: 'Personae', icon: 'users', title: 'Personae' },
      { directory: 'Locations', icon: 'map', title: 'Locations' },
      { directory: 'World', icon: 'earth', title: 'World' },
    ]);
  });

  it('rejects a nonempty folder without the project database', async () => {
    const directory = await createTemporaryDirectory();
    await writeFile(path.join(directory, 'chapter.md'), '# Existing\n');

    await expect(openProjectLayout(directory)).rejects.toMatchObject({
      code: 'project-database-missing',
    });
    await expect(
      readFile(path.join(directory, 'chapter.md'), 'utf8'),
    ).resolves.toBe('# Existing\n');
    await expect(
      readFile(path.join(directory, PROJECT_INDEX_NAME), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
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

  it('reads project presentation metadata from the project database', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    const database = new ProjectDatabase(directory);
    database.setProjectPresentation('Citadel', 'castle');
    database.close();

    await expect(loadProjectLayout(directory)).resolves.toMatchObject({
      manifest: { icon: 'castle', title: 'Citadel' },
    });
  });

  it('reports a missing project database explicitly', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    await rm(path.join(directory, '.driftfield', 'project.sqlite'));

    await expect(loadProjectLayout(directory)).rejects.toMatchObject({
      code: 'project-database-missing',
    });
  });

  it('reports a damaged project database explicitly', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    await writeFile(
      path.join(directory, '.driftfield', 'project.sqlite'),
      'not a sqlite database',
    );

    await expect(loadProjectLayout(directory)).rejects.toMatchObject({
      code: 'project-database-corrupt',
    });
  });

  it('does not migrate an unrelated SQLite database', async () => {
    const directory = await createTemporaryDirectory();
    const dataDirectory = path.join(directory, '.driftfield');
    await mkdir(dataDirectory);
    const databasePath = path.join(dataDirectory, 'project.sqlite');
    const unrelated = new DatabaseSync(databasePath);
    unrelated.exec('CREATE TABLE unrelated(value TEXT) STRICT;');
    unrelated.close();

    await expect(loadProjectLayout(directory)).rejects.toMatchObject({
      code: 'project-database-corrupt',
    });

    const reopened = new DatabaseSync(databasePath, { readOnly: true });
    expect(
      reopened
        .prepare(`
          SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name
        `)
        .all(),
    ).toEqual([{ name: 'unrelated' }]);
    reopened.close();
  });

  it('records but does not reject a different project format version', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    const database = new ProjectDatabase(directory);
    database.connection
      .prepare(
        `
      UPDATE project_metadata SET format_version = 99 WHERE singleton = 1
    `,
      )
      .run();
    database.close();

    await expect(loadProjectLayout(directory)).resolves.toMatchObject({
      manifest: { formatVersion: 99 },
    });
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

  it('rejects duplicate stable IDs across manuscript and lore', async () => {
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
      writeFile(
        path.join(directory, 'manuscript', 'chapter.md'),
        '# Chapter\n',
      ),
      writeFile(
        path.join(directory, 'lore', PROJECT_INDEX_NAME),
        stringify({
          children: [
            {
              file: 'world.md',
              id: 'shared-id',
              kind: 'entry',
              title: 'World',
            },
          ],
          id: 'lore-1',
          kind: 'lore',
          title: 'Lore',
        }),
      ),
      writeFile(path.join(directory, 'lore', 'world.md'), '# World\n'),
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
