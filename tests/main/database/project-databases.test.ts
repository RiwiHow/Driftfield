import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase } from '../../../src/main/database/project-database';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('project databases', () => {
  it('creates one authoritative current project schema', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'driftfield-databases-'),
    );
    directories.push(directory);

    const project = new ProjectDatabase(directory);
    project.initializeProjectMetadata('project-1', 3, 'Project One');
    expect(project.getProjectMetadata()).toEqual({
      formatVersion: 3,
      icon: null,
      marker: 'driftfield-project',
      projectId: 'project-1',
      title: 'Project One',
    });
    expect(project.hasTable('conversations')).toBe(true);
    expect(project.hasTable('agent_settings')).toBe(true);
    expect(project.hasTable('project_nodes')).toBe(true);
    expect(project.hasTable('writing_artifacts')).toBe(true);
    expect(project.hasTable('project_operations')).toBe(true);
    expect(
      project.connection.prepare(`
        SELECT version FROM schema_migrations ORDER BY version
      `).all(),
    ).toEqual([{ version: 2 }, { version: 3 }, { version: 4 }]);
    project.close();
  });

  it('rejects pre-marker project metadata instead of migrating it', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'driftfield-databases-'),
    );
    directories.push(directory);
    const dataDirectory = path.join(directory, '.driftfield');
    await mkdir(dataDirectory);
    const legacy = new DatabaseSync(
      path.join(dataDirectory, 'project.sqlite'),
    );
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE project_metadata (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        project_id TEXT NOT NULL UNIQUE,
        format_version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations VALUES (1, datetime('now'));
      INSERT INTO project_metadata VALUES (1, 'legacy-project', 1, datetime('now'));
    `);
    legacy.close();

    expect(() => new ProjectDatabase(directory)).toThrow(
      'Project database schema is outdated',
    );
  });

  it('rejects a newer project database schema', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'driftfield-databases-'),
    );
    directories.push(directory);
    const current = new ProjectDatabase(directory);
    current.initializeProjectMetadata('project-1', 2, 'Project One');
    current.connection.prepare(`
      INSERT INTO schema_migrations(version, applied_at)
      VALUES (5, datetime('now'))
    `).run();
    current.close();

    expect(() => new ProjectDatabase(directory)).toThrow(
      'Project database was created by a newer Driftfield version',
    );
  });

  it('rejects discarded version-one project databases', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'driftfield-databases-'),
    );
    directories.push(directory);
    const legacy = new ProjectDatabase(directory);
    legacy.initializeProjectMetadata('project-1', 1, 'Project One');
    legacy.connection.exec(`
      DROP TABLE project_operations;
      DELETE FROM schema_migrations;
      INSERT INTO schema_migrations(version, applied_at)
      VALUES (1, datetime('now'));
    `);
    legacy.close();

    expect(() => new ProjectDatabase(directory)).toThrow(
      'Project database schema is outdated',
    );
  });

});
