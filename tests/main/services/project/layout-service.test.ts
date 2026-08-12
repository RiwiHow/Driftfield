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

import {
  initializeProjectLayout,
  loadProjectLayout,
  openProjectLayout,
} from '../../../../src/main/services/project/layout-service';
import { ProjectDatabase } from '../../../../src/main/database/project-database';
import { LEGACY_PROJECT_INDEX_NAME } from '../../../../src/shared/contracts/project-layout';

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
      formatVersion: 3,
      kind: 'novel',
      title: path.basename(directory),
    });
    expect(await readdir(directory)).toEqual(
      expect.arrayContaining(['.driftfield', 'lore', 'manuscript']),
    );
    expect(await readdir(directory)).not.toContain(LEGACY_PROJECT_INDEX_NAME);
    expect(await readdir(path.join(directory, 'manuscript'))).toEqual([]);
    expect(await readdir(path.join(directory, 'lore'))).toEqual(
      expect.arrayContaining([
        'Locations',
        'Personae',
        'World',
      ]),
    );
    expect(await readdir(path.join(directory, '.driftfield'))).toEqual(
      expect.arrayContaining([
        'project.sqlite',
        'recovery',
        'staging',
        'trash',
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
      readFile(path.join(directory, LEGACY_PROJECT_INDEX_NAME), 'utf8'),
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
    const database = new ProjectDatabase(directory);
    database.connection.prepare(`
      UPDATE project_nodes SET numbering_format = '{title} {process.env.SECRET}'
      WHERE kind = 'manuscript' AND parent_node_id IS NULL
    `).run();
    database.close();

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

  it('rejects a project created by a newer format version', async () => {
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

    await expect(loadProjectLayout(directory)).rejects.toThrow(
      'newer application version',
    );
  });

  it('ignores legacy YAML after the v3 authority switch', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    const manuscriptIndexPath = path.join(
      directory,
      'manuscript',
      LEGACY_PROJECT_INDEX_NAME,
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

    await expect(loadProjectLayout(directory)).resolves.toMatchObject({
      manifest: { formatVersion: 3 },
      manuscript: { index: { children: [] } },
    });
  });

  it('rejects path traversal segments', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    await writeFile(path.join(directory, 'outside.md'), '# Outside\n');
    const database = new ProjectDatabase(directory);
    database.connection.prepare(`
      INSERT INTO project_nodes(
        node_id, parent_node_id, node_type, kind, metadata_title, icon,
        relative_path, sort_key, numbering_mode, numbering_format,
        content_revision, backing_status, created_at, updated_at
      ) SELECT 'chapter-1', node_id, 'document', 'chapter', 'Outside', NULL,
               '../outside.md', 0, NULL, NULL, ?, 'present', 'now', 'now'
        FROM project_nodes WHERE kind = 'manuscript' AND parent_node_id IS NULL
    `).run('a'.repeat(64));
    database.close();

    await expect(loadProjectLayout(directory)).rejects.toThrow(
      'invalid',
    );
  });

  it('enforces unique stable IDs in the database catalog', async () => {
    const directory = await createTemporaryDirectory();
    await initializeProjectLayout(directory);
    const database = new ProjectDatabase(directory);
    const parentId = (database.connection.prepare(`
      SELECT node_id FROM project_nodes
      WHERE kind = 'manuscript' AND parent_node_id IS NULL
    `).get() as { node_id: string }).node_id;
    const insert = database.connection.prepare(`
      INSERT INTO project_nodes(
        node_id, parent_node_id, node_type, kind, metadata_title, icon,
        relative_path, sort_key, numbering_mode, numbering_format,
        content_revision, backing_status, created_at, updated_at
      ) VALUES ('shared-id', ?, 'document', 'chapter', 'Chapter', NULL,
                ?, ?, NULL, NULL, ?, 'present', 'now', 'now')
    `);
    insert.run(parentId, 'manuscript/one.md', 0, 'a'.repeat(64));
    expect(() => insert.run(
      parentId,
      'manuscript/two.md',
      1,
      'b'.repeat(64),
    )).toThrow('UNIQUE constraint failed');
    database.close();
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
