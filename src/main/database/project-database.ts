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
          CREATE TABLE project_story_state (
            singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
            revision INTEGER NOT NULL CHECK(revision >= 0)
          ) STRICT;
          INSERT INTO project_story_state(singleton, revision) VALUES (1, 0);

          CREATE TABLE personae (
            persona_id TEXT PRIMARY KEY CHECK(length(persona_id) BETWEEN 1 AND 128),
            kind TEXT NOT NULL CHECK(kind = 'character'),
            name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 500),
            role TEXT CHECK(role IS NULL OR length(role) <= 500),
            summary TEXT NOT NULL CHECK(length(summary) <= 20000),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;

          CREATE TABLE chronicle_timelines (
            timeline_id TEXT PRIMARY KEY CHECK(length(timeline_id) BETWEEN 1 AND 128),
            title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
            summary TEXT NOT NULL CHECK(length(summary) <= 20000),
            is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          ) STRICT;
          CREATE UNIQUE INDEX chronicle_one_primary_timeline
            ON chronicle_timelines(is_primary) WHERE is_primary = 1;

          CREATE TABLE chronicle_moments (
            moment_id TEXT PRIMARY KEY CHECK(length(moment_id) BETWEEN 1 AND 128),
            timeline_id TEXT NOT NULL REFERENCES chronicle_timelines(timeline_id) ON DELETE CASCADE,
            display_time TEXT NOT NULL CHECK(length(display_time) BETWEEN 1 AND 500),
            precision TEXT NOT NULL CHECK(precision IN (
              'exact', 'day', 'month', 'season', 'approximate', 'unknown'
            )),
            order_key INTEGER NOT NULL,
            note TEXT NOT NULL CHECK(length(note) <= 10000),
            UNIQUE(moment_id, timeline_id),
            UNIQUE(timeline_id, order_key)
          ) STRICT;

          CREATE TABLE chronicle_events (
            event_id TEXT PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 128),
            timeline_id TEXT NOT NULL REFERENCES chronicle_timelines(timeline_id) ON DELETE CASCADE,
            start_moment_id TEXT NOT NULL,
            end_moment_id TEXT,
            title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
            summary TEXT NOT NULL CHECK(length(summary) <= 30000),
            status TEXT NOT NULL CHECK(status IN ('planned', 'established')),
            causes TEXT NOT NULL CHECK(length(causes) <= 20000),
            consequences TEXT NOT NULL CHECK(length(consequences) <= 20000),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(event_id, timeline_id),
            FOREIGN KEY(start_moment_id, timeline_id)
              REFERENCES chronicle_moments(moment_id, timeline_id),
            FOREIGN KEY(end_moment_id, timeline_id)
              REFERENCES chronicle_moments(moment_id, timeline_id)
          ) STRICT;
          CREATE INDEX chronicle_events_by_start
            ON chronicle_events(timeline_id, start_moment_id);

          CREATE TABLE chronicle_event_personae (
            event_id TEXT NOT NULL REFERENCES chronicle_events(event_id) ON DELETE CASCADE,
            persona_id TEXT NOT NULL REFERENCES personae(persona_id) ON DELETE RESTRICT,
            role TEXT NOT NULL CHECK(role IN ('actor', 'target', 'witness', 'affected')),
            description TEXT NOT NULL CHECK(length(description) <= 10000),
            PRIMARY KEY(event_id, persona_id, role)
          ) STRICT;
          CREATE INDEX chronicle_events_by_persona
            ON chronicle_event_personae(persona_id, event_id);

          CREATE TABLE chronicle_event_sources (
            source_id TEXT PRIMARY KEY CHECK(length(source_id) BETWEEN 1 AND 128),
            event_id TEXT NOT NULL REFERENCES chronicle_events(event_id) ON DELETE CASCADE,
            source_kind TEXT NOT NULL CHECK(source_kind IN ('manuscript', 'lore')),
            document_id TEXT NOT NULL CHECK(length(document_id) BETWEEN 1 AND 128),
            document_revision TEXT NOT NULL CHECK(length(document_revision) BETWEEN 1 AND 128),
            relation TEXT NOT NULL CHECK(relation IN ('depicted', 'mentioned', 'inferred')),
            anchor TEXT CHECK(anchor IS NULL OR length(anchor) <= 10000)
          ) STRICT;
          CREATE INDEX chronicle_sources_by_document
            ON chronicle_event_sources(document_id, event_id);

          CREATE TABLE threads (
            thread_id TEXT PRIMARY KEY CHECK(length(thread_id) BETWEEN 1 AND 128),
            parent_thread_id TEXT REFERENCES threads(thread_id) ON DELETE RESTRICT,
            title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
            summary TEXT NOT NULL CHECK(length(summary) <= 20000),
            status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'resolved', 'abandoned')),
            order_key INTEGER NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK(parent_thread_id IS NULL OR parent_thread_id <> thread_id)
          ) STRICT;

          CREATE TABLE thread_beats (
            beat_id TEXT PRIMARY KEY CHECK(length(beat_id) BETWEEN 1 AND 128),
            thread_id TEXT NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
            parent_beat_id TEXT,
            kind TEXT NOT NULL CHECK(kind IN (
              'beat', 'setup', 'turning_point', 'climax', 'resolution'
            )),
            title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
            description TEXT NOT NULL CHECK(length(description) <= 30000),
            status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'resolved', 'abandoned')),
            order_key INTEGER NOT NULL,
            dramatic_purpose TEXT NOT NULL CHECK(length(dramatic_purpose) <= 10000),
            desired_outcome TEXT NOT NULL CHECK(length(desired_outcome) <= 10000),
            UNIQUE(beat_id, thread_id),
            UNIQUE(thread_id, order_key),
            FOREIGN KEY(parent_beat_id, thread_id)
              REFERENCES thread_beats(beat_id, thread_id),
            CHECK(parent_beat_id IS NULL OR parent_beat_id <> beat_id)
          ) STRICT;

          CREATE TABLE thread_event_links (
            beat_id TEXT NOT NULL REFERENCES thread_beats(beat_id) ON DELETE CASCADE,
            event_id TEXT NOT NULL REFERENCES chronicle_events(event_id) ON DELETE CASCADE,
            relation TEXT NOT NULL CHECK(relation IN (
              'plans', 'realizes', 'reveals', 'foreshadows', 'resolves'
            )),
            PRIMARY KEY(beat_id, event_id, relation)
          ) STRICT;
          CREATE INDEX thread_links_by_event
            ON thread_event_links(event_id, beat_id);

          CREATE TABLE story_operations (
            operation_id TEXT PRIMARY KEY CHECK(length(operation_id) BETWEEN 1 AND 128),
            operation_kind TEXT NOT NULL CHECK(length(operation_kind) BETWEEN 1 AND 100),
            payload_json TEXT NOT NULL CHECK(length(payload_json) <= 262144),
            base_revision INTEGER NOT NULL CHECK(base_revision >= 0),
            applied_revision INTEGER CHECK(applied_revision IS NULL OR applied_revision > base_revision),
            status TEXT NOT NULL CHECK(status IN (
              'pending', 'applied', 'rejected', 'conflict', 'failed'
            )),
            origin_request_id TEXT CHECK(
              origin_request_id IS NULL OR length(origin_request_id) BETWEEN 1 AND 128
            ),
            created_at TEXT NOT NULL,
            decided_at TEXT,
            error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 100)
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
    const requiredTables = [
      'chronicle_event_personae',
      'chronicle_event_sources',
      'chronicle_events',
      'chronicle_moments',
      'chronicle_timelines',
      'personae',
      'project_story_state',
      'story_operations',
      'thread_beats',
      'thread_event_links',
      'threads',
    ];
    if (requiredTables.some((tableName) => !this.hasTable(tableName))) {
      throw new Error('Project database schema is invalid');
    }
  }
}
