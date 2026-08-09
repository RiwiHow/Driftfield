import { existsSync } from 'node:fs';
import path from 'node:path';

import { ProjectSqliteDatabase } from './project-sqlite-database';

const DATABASE_VERSION = 1;
const LEGACY_IMPORT_ID = 'project-v2-conversations';

export class ConversationDatabase extends ProjectSqliteDatabase {
  constructor(private readonly projectDirectory: string) {
    super(projectDirectory, 'conversations.sqlite');
    this.migrate();
    this.importLegacyProjectDatabase();
    this.markInterruptedRequests();
  }

  markInterruptedRequests(): void {
    this.connection.prepare(`
      UPDATE conversation_messages
      SET terminal = 'interrupted', run_status = 'interrupted', updated_at = ?
      WHERE role = 'assistant' AND run_status = 'running'
    `).run(new Date().toISOString());
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS legacy_imports (
        id TEXT PRIMARY KEY,
        imported_at TEXT NOT NULL
      ) STRICT;
    `);
    const row = this.connection.prepare(`
      SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations
    `).get() as { version: number };
    if (row.version > DATABASE_VERSION) {
      throw new Error('Conversation database was created by a newer Driftfield version');
    }
    if (row.version !== 0) return;
    this.transaction(() => {
      this.connection.exec(`
        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL CHECK(length(title) <= 200),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        ) STRICT;
        CREATE TABLE conversation_state (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          active_conversation_id TEXT REFERENCES conversations(id)
        ) STRICT;
        INSERT INTO conversation_state(singleton, active_conversation_id)
        VALUES (1, NULL);
        CREATE TABLE conversation_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sequence INTEGER NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          parts_json TEXT,
          terminal TEXT CHECK(terminal IN ('cancelled', 'empty', 'failed', 'interrupted')),
          proposal_id TEXT UNIQUE,
          proposal_json TEXT,
          proposal_status TEXT CHECK(proposal_status IN (
            'pending', 'applying', 'saved', 'rejected', 'conflict',
            'missing', 'stale', 'failed'
          )),
          run_status TEXT CHECK(run_status IN (
            'running', 'completed', 'cancelled', 'failed', 'interrupted'
          )),
          active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE UNIQUE INDEX conversation_messages_active_sequence
          ON conversation_messages(conversation_id, sequence) WHERE active = 1;
        CREATE INDEX conversation_messages_active
          ON conversation_messages(conversation_id, active, sequence);
        INSERT INTO schema_migrations(version, applied_at)
        VALUES (1, datetime('now'));
      `);
    });
  }

  private importLegacyProjectDatabase(): void {
    const sourcePath = path.join(
      this.projectDirectory,
      '.driftfield',
      'project.sqlite',
    );
    if (!existsSync(sourcePath)) return;
    const source = new ProjectSqliteDatabase(
      this.projectDirectory,
      'project.sqlite',
    );
    try {
      if (!source.hasTable('conversations')) return;
      const imported = this.connection.prepare(`
        SELECT 1 AS found FROM legacy_imports WHERE id = ?
      `).get(LEGACY_IMPORT_ID);
      if (imported === undefined) {
        this.copyLegacyRows(source);
      }
      source.transaction(() => {
        source.connection.exec(`
          DROP TABLE IF EXISTS conversation_messages;
          DROP TABLE IF EXISTS conversation_state;
          DROP TABLE IF EXISTS conversations;
        `);
      });
    } finally {
      source.close();
    }
  }

  private copyLegacyRows(source: ProjectSqliteDatabase): void {
    this.transaction(() => {
      for (const row of source.connection.prepare(`
        SELECT id, title, created_at, updated_at, deleted_at FROM conversations
      `).iterate() as Iterable<Record<string, string | number | null>>) {
        this.connection.prepare(`
          INSERT OR IGNORE INTO conversations(
            id, title, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?)
        `).run(row.id, row.title, row.created_at, row.updated_at, row.deleted_at);
      }
      for (const row of source.connection.prepare(`
        SELECT id, conversation_id, sequence, role, content, parts_json,
          terminal, proposal_id, proposal_json, proposal_status, run_status,
          active, created_at, updated_at
        FROM conversation_messages ORDER BY conversation_id, sequence
      `).iterate() as Iterable<Record<string, string | number | null>>) {
        this.connection.prepare(`
          INSERT OR IGNORE INTO conversation_messages(
            id, conversation_id, sequence, role, content, parts_json,
            terminal, proposal_id, proposal_json, proposal_status, run_status,
            active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          row.id,
          row.conversation_id,
          row.sequence,
          row.role,
          row.content,
          row.parts_json,
          row.terminal,
          row.proposal_id,
          row.proposal_json,
          row.proposal_status,
          row.run_status,
          row.active,
          row.created_at,
          row.updated_at,
        );
      }
      const state = source.connection.prepare(`
        SELECT active_conversation_id FROM conversation_state WHERE singleton = 1
      `).get() as { active_conversation_id: string | null } | undefined;
      if (state !== undefined) {
        this.connection.prepare(`
          UPDATE conversation_state SET active_conversation_id = ?
          WHERE singleton = 1
        `).run(state.active_conversation_id);
      }
      this.connection.prepare(`
        INSERT INTO legacy_imports(id, imported_at) VALUES (?, ?)
      `).run(LEGACY_IMPORT_ID, new Date().toISOString());
    });
  }
}
