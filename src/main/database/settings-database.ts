import { ProjectSqliteDatabase } from './project-sqlite-database';

const DATABASE_VERSION = 1;

export class SettingsDatabase extends ProjectSqliteDatabase {
  constructor(projectDirectory: string) {
    super(projectDirectory, 'settings.sqlite');
    this.migrate();
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

}
