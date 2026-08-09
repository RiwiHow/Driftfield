import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ConversationDatabase } from '../../../src/main/database/conversation-database';
import { ProjectDatabase } from '../../../src/main/database/project-database';
import { SettingsDatabase } from '../../../src/main/database/settings-database';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('project databases', () => {
  it('creates isolated current schemas without compatibility tables', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-databases-'));
    directories.push(directory);

    const project = new ProjectDatabase(directory);
    project.initializeProjectMetadata('project-1', 1);
    expect(project.getProjectMetadata()).toEqual({
      formatVersion: 1,
      projectId: 'project-1',
    });
    expect(project.hasTable('conversations')).toBe(false);
    expect(project.hasTable('agent_settings')).toBe(false);
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
});

const listTables = (
  database: ProjectDatabase | ConversationDatabase | SettingsDatabase,
): string[] =>
  (database.connection.prepare(`
    SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name
  `).all() as Array<{ name: string }>).map(({ name }) => name);
