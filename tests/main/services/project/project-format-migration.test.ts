import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { ProjectDatabase } from '../../../../src/main/database/project-database';
import { DatabaseSync } from 'node:sqlite';
import { loadProjectLayout } from '../../../../src/main/services/project/layout-service';
import { createProjectSnapshot } from '../../../../src/main/services/project/snapshot-service';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })));
});

describe('Project Format v2 migration', () => {
  it('imports YAML, settings, and conversations into project.sqlite and retires legacy authorities', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-v2-migration-'));
    temporaryDirectories.push(directory);
    await mkdir(path.join(directory, 'manuscript'), { recursive: true });
    await mkdir(path.join(directory, 'lore'), { recursive: true });
    await writeFile(path.join(directory, 'manuscript', '_index.yaml'), stringify({
      chapterNumbering: { format: '{number}. {title}', mode: 'continuous' },
      children: [{ file: 'chapter.md', id: 'chapter-1', kind: 'chapter', title: 'Arrival' }],
      id: 'manuscript-1',
      kind: 'manuscript',
      title: 'Manuscript',
    }));
    await writeFile(path.join(directory, 'manuscript', 'chapter.md'), '# Arrival\n');
    await writeFile(path.join(directory, 'lore', '_index.yaml'), stringify({
      children: [],
      id: 'lore-1',
      kind: 'lore',
      title: 'Lore',
    }));

    const project = new ProjectDatabase(directory);
    project.initializeProjectMetadata('project-1', 2, 'Legacy Project');
    project.close();
    const settings = new DatabaseSync(path.join(directory, '.driftfield', 'settings.sqlite'));
    settings.exec(`
      CREATE TABLE agent_settings (
        singleton INTEGER PRIMARY KEY,
        provider_id TEXT,
        model_id TEXT,
        thinking_level TEXT NOT NULL,
        use_global INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE agent_model_overrides (
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        override_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(provider_id, model_id)
      ) STRICT;
      INSERT INTO agent_settings VALUES (1, 'provider', 'model', 'high', 0);
      INSERT INTO agent_model_overrides(provider_id, model_id, override_json, updated_at)
      VALUES ('provider', 'model', '{"providerId":"provider","modelId":"model"}', 'now');
    `);
    settings.close();
    const conversations = new DatabaseSync(
      path.join(directory, '.driftfield', 'conversations.sqlite'),
    );
    conversations.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      ) STRICT;
      CREATE TABLE conversation_state (
        singleton INTEGER PRIMARY KEY,
        active_conversation_id TEXT
      ) STRICT;
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
      INSERT INTO conversations(id, title, created_at, updated_at)
      VALUES ('conversation-1', 'History', 'now', 'now');
      INSERT INTO conversation_messages(
        id, conversation_id, sequence, role, content, active, created_at, updated_at
      ) VALUES ('message-1', 'conversation-1', 1, 'user', 'Continue', 1, 'now', 'now');
      INSERT INTO conversation_state VALUES (1, 'conversation-1');
    `);
    conversations.close();

    await expect(loadProjectLayout(directory)).resolves.toMatchObject({
      manifest: { formatVersion: 3, id: 'project-1' },
      manuscript: { index: { id: 'manuscript-1' } },
    });
    const snapshot = await createProjectSnapshot(directory);
    expect(snapshot.documents).toEqual([
      expect.objectContaining({ id: 'chapter-1', markdown: '# Arrival\n' }),
    ]);
    await expect(readFile(path.join(directory, 'manuscript', '_index.yaml'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(path.join(directory, '.driftfield'))).not.toEqual(
      expect.arrayContaining(['conversations.sqlite', 'settings.sqlite']),
    );

    const migrated = new ProjectDatabase(directory);
    expect(migrated.getProjectMetadata()?.formatVersion).toBe(3);
    expect(migrated.connection.prepare(`
      SELECT provider_id, model_id, thinking_level, use_global
      FROM agent_settings WHERE singleton = 1
    `).get()).toEqual({
      model_id: 'model',
      provider_id: 'provider',
      thinking_level: 'high',
      use_global: 0,
    });
    expect(migrated.connection.prepare(`
      SELECT id, title FROM conversations
    `).all()).toEqual([{ id: 'conversation-1', title: 'History' }]);
    expect(migrated.connection.prepare(`
      SELECT content FROM conversation_messages
    `).all()).toEqual([{ content: 'Continue' }]);
    expect(migrated.connection.prepare(`
      SELECT provider_id, model_id FROM legacy_agent_model_overrides
    `).all()).toEqual([{ model_id: 'model', provider_id: 'provider' }]);
    migrated.close();

    const recoveryEntries = await readdir(path.join(directory, '.driftfield', 'recovery'));
    expect(recoveryEntries).toHaveLength(1);
    const migrationManifest = JSON.parse(await readFile(path.join(
      directory,
      '.driftfield',
      'recovery',
      recoveryEntries[0],
      'migration.json',
    ), 'utf8')) as { state: string };
    expect(migrationManifest.state).toBe('completed');
  });
});
