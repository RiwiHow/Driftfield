import { ProjectSqliteDatabase } from './project-sqlite-database';

const DATABASE_VERSION = 1;

export interface ProjectMetadataRecord {
  formatVersion: number;
  projectId: string;
}

export class ProjectDatabase extends ProjectSqliteDatabase {
  constructor(projectDirectory: string) {
    super(projectDirectory, 'project.sqlite');
    this.migrate();
  }

  getProjectMetadata(): ProjectMetadataRecord | null {
    const row = this.connection.prepare(`
      SELECT project_id, format_version FROM project_metadata WHERE singleton = 1
    `).get() as { format_version: number; project_id: string } | undefined;
    return row === undefined
      ? null
      : { formatVersion: row.format_version, projectId: row.project_id };
  }

  initializeProjectMetadata(projectId: string, formatVersion: number): void {
    const existing = this.getProjectMetadata();
    if (existing !== null) {
      if (
        existing.projectId !== projectId ||
        existing.formatVersion !== formatVersion
      ) {
        throw new Error('Project database identity does not match the project');
      }
      return;
    }
    this.connection.prepare(`
      INSERT INTO project_metadata(singleton, project_id, format_version, created_at)
      VALUES (1, ?, ?, ?)
    `).run(projectId, formatVersion, new Date().toISOString());
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
    if (row.version === 0) {
      this.transaction(() => {
        this.connection.exec(`
          CREATE TABLE project_metadata (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            project_id TEXT NOT NULL UNIQUE CHECK(length(project_id) BETWEEN 1 AND 128),
            format_version INTEGER NOT NULL CHECK(format_version > 0),
            created_at TEXT NOT NULL
          ) STRICT;
          INSERT INTO schema_migrations(version, applied_at)
          VALUES (1, datetime('now'));
        `);
      });
    }
  }
}
