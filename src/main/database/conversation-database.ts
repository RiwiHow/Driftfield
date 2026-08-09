import { ProjectSqliteDatabase } from './project-sqlite-database';

const DATABASE_VERSION = 1;

export class ConversationDatabase extends ProjectSqliteDatabase {
  constructor(projectDirectory: string) {
    super(projectDirectory, 'conversations.sqlite');
    this.migrate();
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

}
