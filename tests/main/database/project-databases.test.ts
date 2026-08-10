import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { ConversationDatabase } from '../../../src/main/database/conversation-database';
import { ProjectDatabase } from '../../../src/main/database/project-database';
import { SettingsDatabase } from '../../../src/main/database/settings-database';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('project databases', () => {
  it('creates isolated current schemas without compatibility tables', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'driftfield-databases-'),
    );
    directories.push(directory);

    const project = new ProjectDatabase(directory);
    project.initializeProjectMetadata('project-1', 1, 'Project One');
    expect(project.getProjectMetadata()).toEqual({
      formatVersion: 1,
      icon: null,
      marker: 'driftfield-project',
      projectId: 'project-1',
      title: 'Project One',
    });
    expect(project.hasTable('conversations')).toBe(false);
    expect(project.hasTable('agent_settings')).toBe(false);
    expect(listTables(project)).toEqual([
      'chronicle_event_personae',
      'chronicle_event_sources',
      'chronicle_events',
      'chronicle_moments',
      'chronicle_timelines',
      'personae',
      'project_metadata',
      'project_story_state',
      'schema_migrations',
      'story_operations',
      'story_questions',
      'thread_beats',
      'thread_event_links',
      'threads',
    ]);
    expect(
      project.connection.prepare(`
        SELECT version FROM schema_migrations ORDER BY version
      `).all(),
    ).toEqual([{ version: 2 }]);
    project.close();

    const conversations = new ConversationDatabase(directory);
    expect(listTables(conversations)).toEqual([
      'conversation_messages',
      'conversation_state',
      'conversations',
      'schema_migrations',
    ]);
    conversations.close();

    const settings = new SettingsDatabase(directory);
    expect(listTables(settings)).toEqual([
      'agent_model_overrides',
      'agent_settings',
      'schema_migrations',
    ]);
    settings.close();
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

  it('rejects discarded version-one project model settings', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'driftfield-settings-migration-'),
    );
    directories.push(directory);
    const dataDirectory = path.join(directory, '.driftfield');
    await mkdir(dataDirectory);
    const legacy = new DatabaseSync(path.join(dataDirectory, 'settings.sqlite'));
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE agent_settings (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        provider_id TEXT,
        model_id TEXT,
        thinking_level TEXT NOT NULL
      ) STRICT;
      CREATE TABLE agent_model_overrides (
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        override_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(provider_id, model_id)
      ) STRICT;
      INSERT INTO agent_settings VALUES (1, 'anthropic', 'model-a', 'high');
      INSERT INTO schema_migrations VALUES (1, datetime('now'));
    `);
    legacy.close();

    expect(() => new SettingsDatabase(directory)).toThrow(
      'Settings database schema is outdated',
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
      VALUES (3, datetime('now'))
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
      DROP TABLE story_questions;
      DELETE FROM schema_migrations WHERE version = 2;
      INSERT INTO schema_migrations(version, applied_at)
      VALUES (1, datetime('now'));
    `);
    legacy.close();

    expect(() => new ProjectDatabase(directory)).toThrow(
      'Project database schema is outdated',
    );
  });

});

const listTables = (
  database: ProjectDatabase | ConversationDatabase | SettingsDatabase,
): string[] =>
  (
    database.connection
      .prepare(
        `
    SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name
  `,
      )
      .all() as Array<{ name: string }>
  ).map(({ name }) => name);
