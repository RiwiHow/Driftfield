import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATABASE_VERSION = 1;

export class ProjectDatabase {
  readonly connection: DatabaseSync;

  constructor(projectDirectory: string) {
    const dataDirectory = path.join(projectDirectory, '.driftfield');
    mkdirSync(dataDirectory, { mode: 0o700, recursive: true });
    const stats = lstatSync(dataDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('Invalid Driftfield project data directory');
    }
    try {
      writeFileSync(
        path.join(dataDirectory, '.gitignore'),
        'project.sqlite\nproject.sqlite-*\nbackups/\n',
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const databasePath = path.join(dataDirectory, 'project.sqlite');
    if (existsSync(databasePath)) {
      const databaseStats = lstatSync(databasePath);
      if (!databaseStats.isFile() || databaseStats.isSymbolicLink()) {
        throw new Error('Invalid Driftfield project database file');
      }
    }
    this.connection = new DatabaseSync(
      databasePath,
      { allowExtension: false },
    );
    chmodSync(databasePath, 0o600);
    this.connection.enableDefensive(true);
    this.connection.limits.length = 2 * 1024 * 1024;
    this.connection.limits.sqlLength = 100_000;
    this.connection.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = DELETE;
      PRAGMA busy_timeout = 5000;
      PRAGMA trusted_schema = OFF;
    `);
    this.migrate();
    this.markInterruptedRequests();
  }

  close(): void {
    this.connection.close();
  }

  transaction<T>(operation: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const row = this.connection
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as { version: number };
    if (row.version > DATABASE_VERSION) {
      throw new Error('Project database was created by a newer Driftfield version');
    }
    if (row.version === 0) this.applyVersionOne();
  }

  private applyVersionOne(): void {
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

  private markInterruptedRequests(): void {
    this.connection.prepare(`
      UPDATE conversation_messages
      SET terminal = 'interrupted', run_status = 'interrupted', updated_at = ?
      WHERE role = 'assistant' AND run_status = 'running'
    `).run(new Date().toISOString());
  }
}
