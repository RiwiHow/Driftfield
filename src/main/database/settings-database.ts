import { existsSync } from 'node:fs';
import path from 'node:path';

import { ProjectSqliteDatabase } from './project-sqlite-database';

const DATABASE_VERSION = 1;
const LEGACY_IMPORT_ID = 'project-v2-settings';

export class SettingsDatabase extends ProjectSqliteDatabase {
  constructor(private readonly projectDirectory: string) {
    super(projectDirectory, 'settings.sqlite');
    this.migrate();
    this.importLegacyProjectDatabase();
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
      throw new Error('Settings database was created by a newer Driftfield version');
    }
    if (row.version !== 0) return;
    this.transaction(() => {
      this.connection.exec(`
        CREATE TABLE agent_settings (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          provider_id TEXT CHECK(provider_id IS NULL OR length(provider_id) BETWEEN 1 AND 255),
          model_id TEXT CHECK(model_id IS NULL OR length(model_id) BETWEEN 1 AND 255),
          thinking_level TEXT NOT NULL CHECK(thinking_level IN (
            'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'
          )),
          CHECK((provider_id IS NULL) = (model_id IS NULL))
        ) STRICT;
        INSERT INTO agent_settings(singleton, provider_id, model_id, thinking_level)
        VALUES (1, NULL, NULL, 'medium');
        CREATE TABLE agent_model_overrides (
          provider_id TEXT NOT NULL CHECK(length(provider_id) BETWEEN 1 AND 255),
          model_id TEXT NOT NULL CHECK(length(model_id) BETWEEN 1 AND 255),
          override_json TEXT NOT NULL CHECK(length(override_json) <= 65536),
          updated_at TEXT NOT NULL,
          PRIMARY KEY(provider_id, model_id)
        ) STRICT;
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
      if (!source.hasTable('agent_settings')) return;
      const imported = this.connection.prepare(`
        SELECT 1 AS found FROM legacy_imports WHERE id = ?
      `).get(LEGACY_IMPORT_ID);
      if (imported === undefined) this.copyLegacyRows(source);
      source.transaction(() => {
        source.connection.exec(`
          DROP TABLE IF EXISTS agent_model_overrides;
          DROP TABLE IF EXISTS agent_settings;
        `);
      });
    } finally {
      source.close();
    }
  }

  private copyLegacyRows(source: ProjectSqliteDatabase): void {
    this.transaction(() => {
      const settings = source.connection.prepare(`
        SELECT provider_id, model_id, thinking_level
        FROM agent_settings WHERE singleton = 1
      `).get() as {
        model_id: string | null;
        provider_id: string | null;
        thinking_level: string;
      } | undefined;
      if (settings !== undefined) {
        this.connection.prepare(`
          UPDATE agent_settings
          SET provider_id = ?, model_id = ?, thinking_level = ?
          WHERE singleton = 1
        `).run(
          settings.provider_id,
          settings.model_id,
          settings.thinking_level,
        );
      }
      for (const row of source.connection.prepare(`
        SELECT provider_id, model_id, override_json, updated_at
        FROM agent_model_overrides
      `).iterate() as Iterable<Record<string, string | number | null>>) {
        this.connection.prepare(`
          INSERT OR IGNORE INTO agent_model_overrides(
            provider_id, model_id, override_json, updated_at
          ) VALUES (?, ?, ?, ?)
        `).run(
          row.provider_id,
          row.model_id,
          row.override_json,
          row.updated_at,
        );
      }
      this.connection.prepare(`
        INSERT INTO legacy_imports(id, imported_at) VALUES (?, ?)
      `).run(LEGACY_IMPORT_ID, new Date().toISOString());
    });
  }
}
