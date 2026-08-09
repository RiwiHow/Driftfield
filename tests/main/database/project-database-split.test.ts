import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ConversationDatabase } from '../../../src/main/database/conversation-database';
import { ProjectDatabase } from '../../../src/main/database/project-database';
import { ProjectSqliteDatabase } from '../../../src/main/database/project-sqlite-database';
import { SettingsDatabase } from '../../../src/main/database/settings-database';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('project database split migration', () => {
  it('moves legacy conversations and settings while retaining project identity', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-db-split-'));
    directories.push(directory);
    createLegacyDatabase(directory);

    const core = new ProjectDatabase(directory);
    expect(core.getProjectMetadata()).toEqual({
      formatVersion: 1,
      projectId: 'project-1',
    });
    core.close();

    const conversations = new ConversationDatabase(directory);
    expect(
      conversations.connection.prepare(`
        SELECT title FROM conversations WHERE id = 'conversation-1'
      `).get(),
    ).toEqual({ title: 'History' });
    expect(
      conversations.connection.prepare(`
        SELECT content FROM conversation_messages WHERE id = 'message-1'
      `).get(),
    ).toEqual({ content: 'Remember this' });
    conversations.close();

    const settings = new SettingsDatabase(directory);
    expect(
      settings.connection.prepare(`
        SELECT provider_id, model_id, thinking_level
        FROM agent_settings WHERE singleton = 1
      `).get(),
    ).toEqual({
      model_id: 'model-1',
      provider_id: 'openrouter',
      thinking_level: 'high',
    });
    expect(
      settings.connection.prepare(`
        SELECT COUNT(*) AS count FROM agent_model_overrides
      `).get(),
    ).toEqual({ count: 1 });
    settings.close();

    const migratedCore = new ProjectDatabase(directory);
    expect(migratedCore.hasTable('project_metadata')).toBe(true);
    expect(migratedCore.hasTable('conversations')).toBe(false);
    expect(migratedCore.hasTable('agent_settings')).toBe(false);
    migratedCore.close();

    await expect(
      stat(path.join(directory, '.driftfield', 'conversations.sqlite')),
    ).resolves.toMatchObject({});
    await expect(
      stat(path.join(directory, '.driftfield', 'settings.sqlite')),
    ).resolves.toMatchObject({});

    new ConversationDatabase(directory).close();
    new SettingsDatabase(directory).close();
  });
});

const createLegacyDatabase = (directory: string): void => {
  const database = new ProjectSqliteDatabase(directory, 'project.sqlite');
  database.connection.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO schema_migrations VALUES (1, datetime('now'));
    INSERT INTO schema_migrations VALUES (2, datetime('now'));
    CREATE TABLE project_metadata (
      singleton INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL,
      format_version INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO project_metadata VALUES (1, 'project-1', 1, datetime('now'));
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    ) STRICT;
    INSERT INTO conversations VALUES (
      'conversation-1', 'History', datetime('now'), datetime('now'), NULL
    );
    CREATE TABLE conversation_state (
      singleton INTEGER PRIMARY KEY,
      active_conversation_id TEXT
    ) STRICT;
    INSERT INTO conversation_state VALUES (1, 'conversation-1');
    CREATE TABLE conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      parts_json TEXT,
      terminal TEXT,
      proposal_id TEXT,
      proposal_json TEXT,
      proposal_status TEXT,
      run_status TEXT,
      active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO conversation_messages VALUES (
      'message-1', 'conversation-1', 1, 'user', 'Remember this',
      NULL, NULL, NULL, NULL, NULL, NULL, 1, datetime('now'), datetime('now')
    );
    CREATE TABLE agent_settings (
      singleton INTEGER PRIMARY KEY,
      provider_id TEXT,
      model_id TEXT,
      thinking_level TEXT NOT NULL
    ) STRICT;
    INSERT INTO agent_settings VALUES (1, 'openrouter', 'model-1', 'high');
    CREATE TABLE agent_model_overrides (
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      override_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(provider_id, model_id)
    ) STRICT;
    INSERT INTO agent_model_overrides VALUES (
      'openrouter', 'model-1',
      '{"compatibility":{"maxTokensField":null,"supportsDeveloperRole":null,"supportsReasoningEffort":null,"supportsUsageInStreaming":null,"thinkingFormat":null},"headers":[],"modelId":"model-1","openRouterRouting":null,"providerId":"openrouter","thinkingLevelMap":{}}',
      datetime('now')
    );
  `);
  database.close();
};
