import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class ProjectSqliteDatabase {
  readonly connection: DatabaseSync;
  readonly databasePath: string;

  constructor(projectDirectory: string, filename: string) {
    const dataDirectory = path.join(projectDirectory, '.driftfield');
    mkdirSync(dataDirectory, { mode: 0o700, recursive: true });
    const stats = lstatSync(dataDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('Invalid Driftfield project data directory');
    }
    this.databasePath = path.join(dataDirectory, filename);
    if (existsSync(this.databasePath)) {
      const databaseStats = lstatSync(this.databasePath);
      if (!databaseStats.isFile() || databaseStats.isSymbolicLink()) {
        throw new Error('Invalid Driftfield project database file');
      }
    }
    this.connection = new DatabaseSync(this.databasePath, {
      allowExtension: false,
    });
    chmodSync(this.databasePath, 0o600);
    this.connection.enableDefensive(true);
    this.connection.limits.length = 2 * 1024 * 1024;
    this.connection.limits.sqlLength = 100_000;
    this.connection.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = DELETE;
      PRAGMA busy_timeout = 5000;
      PRAGMA trusted_schema = OFF;
    `);
  }

  close(): void {
    this.connection.close();
  }

  hasTable(tableName: string): boolean {
    return this.connection.prepare(`
      SELECT 1 AS found FROM sqlite_schema
      WHERE type = 'table' AND name = ?
    `).get(tableName) !== undefined;
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
}
