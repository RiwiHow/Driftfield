import { DatabaseSync } from 'node:sqlite';

import { ProjectSqliteDatabase } from './project-sqlite-database';
import { DRIFTFIELD_PROJECT_MARKER } from '../../shared/contracts/project-layout';

const DATABASE_VERSION = 1;

export interface ProjectMetadataRecord {
  formatVersion: number;
  icon: string | null;
  marker: string;
  projectId: string;
  title: string;
}

export const validateExistingProjectDatabase = (
  databasePath: string,
): void => {
  const connection = new DatabaseSync(databasePath, {
    allowExtension: false,
    readOnly: true,
  });
  try {
    const columns = connection.prepare(`
      PRAGMA table_info(project_metadata)
    `).all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map(({ name }) => name));
    if (
      ![
        'created_at',
        'format_version',
        'icon',
        'project_id',
        'project_marker',
        'singleton',
        'title',
      ].every((column) => columnNames.has(column))
    ) {
      throw new Error('Driftfield project identity is missing');
    }
    const metadata = connection.prepare(`
      SELECT project_id, project_marker, format_version, title
      FROM project_metadata WHERE singleton = 1
    `).get() as {
      format_version: number;
      project_id: string;
      project_marker: string;
      title: string;
    } | undefined;
    if (
      metadata === undefined ||
      typeof metadata.project_id !== 'string' ||
      metadata.project_id.length === 0 ||
      metadata.project_marker !== DRIFTFIELD_PROJECT_MARKER ||
      !Number.isSafeInteger(metadata.format_version) ||
      metadata.format_version < 1 ||
      typeof metadata.title !== 'string' ||
      metadata.title.length === 0
    ) {
      throw new Error('Driftfield project identity is invalid');
    }
  } finally {
    connection.close();
  }
};

export class ProjectDatabase extends ProjectSqliteDatabase {
  constructor(projectDirectory: string) {
    super(projectDirectory, 'project.sqlite');
    try {
      this.migrate();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  getProjectMetadata(): ProjectMetadataRecord | null {
    const row = this.connection
      .prepare(
        `
      SELECT project_id, project_marker, format_version, title, icon
      FROM project_metadata WHERE singleton = 1
    `,
      )
      .get() as
      | {
          format_version: number;
          icon: string | null;
          project_id: string;
          project_marker: string;
          title: string;
        }
      | undefined;
    return row === undefined
      ? null
      : {
          formatVersion: row.format_version,
          icon: row.icon,
          marker: row.project_marker,
          projectId: row.project_id,
          title: row.title,
        };
  }

  initializeProjectMetadata(
    projectId: string,
    formatVersion: number,
    title: string,
    icon: string | null = null,
  ): void {
    const existing = this.getProjectMetadata();
    if (existing !== null) {
      if (
        existing.projectId !== projectId ||
        existing.formatVersion !== formatVersion ||
        existing.marker !== DRIFTFIELD_PROJECT_MARKER
      ) {
        throw new Error('Project database identity does not match the project');
      }
      return;
    }
    this.connection
      .prepare(
        `
      INSERT INTO project_metadata(
        singleton, project_id, project_marker, format_version, title, icon, created_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        projectId,
        DRIFTFIELD_PROJECT_MARKER,
        formatVersion,
        title,
        icon,
        new Date().toISOString(),
      );
  }

  setProjectPresentation(title: string, icon: string | null): void {
    const result = this.connection
      .prepare(
        `
      UPDATE project_metadata SET title = ?, icon = ? WHERE singleton = 1
    `,
      )
      .run(title, icon);
    if (result.changes !== 1) {
      throw new Error('Driftfield project identity is missing');
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
      .prepare(
        'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
      )
      .get() as { version: number };
    if (row.version > DATABASE_VERSION) {
      throw new Error(
        'Project database was created by a newer Driftfield version',
      );
    }
    if (row.version === 0) {
      this.transaction(() => {
        this.connection.exec(`
          CREATE TABLE project_metadata (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            project_id TEXT NOT NULL UNIQUE CHECK(length(project_id) BETWEEN 1 AND 128),
            project_marker TEXT NOT NULL CHECK(project_marker = '${DRIFTFIELD_PROJECT_MARKER}'),
            format_version INTEGER NOT NULL CHECK(format_version > 0),
            title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
            icon TEXT,
            created_at TEXT NOT NULL
          ) STRICT;
          INSERT INTO schema_migrations(version, applied_at)
          VALUES (1, datetime('now'));
        `);
      });
      return;
    }
    this.assertCurrentSchema();
  }

  private assertCurrentSchema(): void {
    const columns = this.connection.prepare(`
      PRAGMA table_info(project_metadata)
    `).all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map(({ name }) => name));
    if (
      ![
        'created_at',
        'format_version',
        'icon',
        'project_id',
        'project_marker',
        'singleton',
        'title',
      ].every((column) => columnNames.has(column))
    ) {
      throw new Error('Project database schema is invalid');
    }
  }
}
