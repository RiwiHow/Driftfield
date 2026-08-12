import { DatabaseSync } from 'node:sqlite';

import { ProjectSqliteDatabase } from './project-sqlite-database';
import { DRIFTFIELD_PROJECT_MARKER } from '../../shared/contracts/project-layout';

const DATABASE_VERSION = 4;

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

export const readExistingProjectFormatVersion = (
  databasePath: string,
): number => {
  const connection = new DatabaseSync(databasePath, {
    allowExtension: false,
    readOnly: true,
  });
  try {
    const row = connection.prepare(`
      SELECT format_version FROM project_metadata WHERE singleton = 1
    `).get() as { format_version: number } | undefined;
    if (row === undefined || !Number.isSafeInteger(row.format_version)) {
      throw new Error('Driftfield project identity is invalid');
    }
    return row.format_version;
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

  setProjectFormatVersion(formatVersion: number): void {
    if (!Number.isSafeInteger(formatVersion) || formatVersion < 1) {
      throw new Error('Invalid Driftfield project format version');
    }
    const result = this.connection.prepare(`
      UPDATE project_metadata SET format_version = ? WHERE singleton = 1
    `).run(formatVersion);
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

          CREATE TABLE story_questions (
            question_id TEXT PRIMARY KEY CHECK(length(question_id) BETWEEN 1 AND 128),
            kind TEXT NOT NULL CHECK(kind IN (
              'possible_alias', 'uncertain_time', 'unclear_relationship',
              'contradiction', 'other'
            )),
            question TEXT NOT NULL CHECK(length(question) BETWEEN 1 AND 2000),
            context TEXT NOT NULL CHECK(length(context) <= 10000),
            options_json TEXT NOT NULL CHECK(length(options_json) <= 4000),
            evidence_json TEXT CHECK(evidence_json IS NULL OR length(evidence_json) <= 12000),
            status TEXT NOT NULL CHECK(status IN ('open', 'resolved')),
            answer TEXT CHECK(answer IS NULL OR length(answer) BETWEEN 1 AND 2000),
            origin_request_id TEXT NOT NULL CHECK(length(origin_request_id) BETWEEN 1 AND 128),
            created_at TEXT NOT NULL,
            resolved_at TEXT
          ) STRICT;
          CREATE INDEX story_questions_by_status
            ON story_questions(status, created_at, question_id);

          INSERT INTO schema_migrations(version, applied_at)
          VALUES (2, datetime('now'));
        `);
      });
      this.migrateVersion3();
      this.migrateVersion4();
      return;
    }
    if (row.version === 2) {
      this.migrateVersion3();
      this.migrateVersion4();
    } else if (row.version === 3) {
      this.migrateVersion4();
    } else if (row.version !== DATABASE_VERSION) {
      throw new Error('Project database schema is outdated');
    }
    this.assertCurrentSchema();
  }

  private migrateVersion3(): void {
    this.transaction(() => {
      this.connection.exec(`
        CREATE TABLE project_catalog_state (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          revision INTEGER NOT NULL CHECK(revision >= 0)
        ) STRICT;
        INSERT INTO project_catalog_state(singleton, revision) VALUES (1, 0);

        CREATE TABLE project_nodes (
          node_id TEXT PRIMARY KEY CHECK(length(node_id) BETWEEN 1 AND 128),
          parent_node_id TEXT REFERENCES project_nodes(node_id) ON DELETE RESTRICT,
          node_type TEXT NOT NULL CHECK(node_type IN ('directory', 'document')),
          kind TEXT NOT NULL CHECK(kind IN (
            'manuscript', 'lore', 'volume', 'category', 'chapter',
            'prologue', 'interlude', 'epilogue', 'appendix', 'entry'
          )),
          metadata_title TEXT NOT NULL CHECK(length(metadata_title) BETWEEN 1 AND 500),
          icon TEXT CHECK(icon IS NULL OR length(icon) BETWEEN 1 AND 100),
          relative_path TEXT NOT NULL UNIQUE CHECK(length(relative_path) BETWEEN 1 AND 2000),
          sort_key INTEGER NOT NULL,
          numbering_mode TEXT CHECK(numbering_mode IS NULL OR numbering_mode IN (
            'continuous', 'per-volume', 'manual', 'none'
          )),
          numbering_format TEXT CHECK(
            numbering_format IS NULL OR length(numbering_format) <= 500
          ),
          content_revision TEXT CHECK(
            content_revision IS NULL OR length(content_revision) = 64
          ),
          backing_status TEXT NOT NULL CHECK(backing_status IN ('present', 'missing')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(parent_node_id, sort_key),
          CHECK(
            (node_type = 'directory' AND kind IN (
              'manuscript', 'lore', 'volume', 'category'
            ) AND content_revision IS NULL) OR
            (node_type = 'document' AND kind IN (
              'chapter', 'prologue', 'interlude', 'epilogue', 'appendix', 'entry'
            ) AND numbering_mode IS NULL AND numbering_format IS NULL AND icon IS NULL)
          ),
          CHECK(
            (parent_node_id IS NULL AND kind IN ('manuscript', 'lore')) OR
            parent_node_id IS NOT NULL
          )
        ) STRICT;
        CREATE UNIQUE INDEX project_one_root_per_kind
          ON project_nodes(kind) WHERE parent_node_id IS NULL;
        CREATE INDEX project_nodes_by_parent
          ON project_nodes(parent_node_id, sort_key, node_id);

        CREATE TABLE agent_settings (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          provider_id TEXT CHECK(provider_id IS NULL OR length(provider_id) BETWEEN 1 AND 255),
          model_id TEXT CHECK(model_id IS NULL OR length(model_id) BETWEEN 1 AND 255),
          thinking_level TEXT NOT NULL CHECK(thinking_level IN (
            'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'
          )),
          use_global INTEGER NOT NULL CHECK(use_global IN (0, 1)),
          CHECK((provider_id IS NULL) = (model_id IS NULL))
        ) STRICT;
        INSERT INTO agent_settings(singleton, provider_id, model_id, thinking_level, use_global)
        VALUES (1, NULL, NULL, 'medium', 1);

        CREATE TABLE conversations (
          id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
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
          id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
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

        CREATE TABLE writing_artifacts (
          artifact_id TEXT PRIMARY KEY CHECK(length(artifact_id) BETWEEN 1 AND 128),
          request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 128),
          target_document_id TEXT REFERENCES project_nodes(node_id) ON DELETE SET NULL,
          state TEXT NOT NULL CHECK(state IN (
            'generated', 'validated', 'invalid', 'proposed', 'accepted',
            'rejected', 'discarded'
          )),
          markdown TEXT NOT NULL CHECK(length(markdown) <= 524288),
          validation_code TEXT CHECK(
            validation_code IS NULL OR length(validation_code) <= 100
          ),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE project_operations (
          operation_id TEXT PRIMARY KEY CHECK(length(operation_id) BETWEEN 1 AND 128),
          operation_kind TEXT NOT NULL CHECK(length(operation_kind) BETWEEN 1 AND 100),
          state TEXT NOT NULL CHECK(state IN (
            'prepared', 'filesystem_applied', 'completed',
            'failed_recoverable', 'failed_terminal'
          )),
          base_project_revision INTEGER NOT NULL CHECK(base_project_revision >= 0),
          payload_json TEXT NOT NULL CHECK(length(payload_json) <= 524288),
          error_code TEXT CHECK(error_code IS NULL OR length(error_code) <= 100),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE INDEX project_operations_by_state
          ON project_operations(state, created_at, operation_id);
        CREATE TABLE project_operation_files (
          operation_id TEXT NOT NULL REFERENCES project_operations(operation_id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
          old_relative_path TEXT CHECK(
            old_relative_path IS NULL OR length(old_relative_path) BETWEEN 1 AND 2000
          ),
          new_relative_path TEXT CHECK(
            new_relative_path IS NULL OR length(new_relative_path) BETWEEN 1 AND 2000
          ),
          old_revision TEXT CHECK(old_revision IS NULL OR length(old_revision) = 64),
          new_revision TEXT CHECK(new_revision IS NULL OR length(new_revision) = 64),
          staging_relative_path TEXT CHECK(
            staging_relative_path IS NULL OR length(staging_relative_path) BETWEEN 1 AND 2000
          ),
          recovery_relative_path TEXT CHECK(
            recovery_relative_path IS NULL OR length(recovery_relative_path) BETWEEN 1 AND 2000
          ),
          trash_relative_path TEXT CHECK(
            trash_relative_path IS NULL OR length(trash_relative_path) BETWEEN 1 AND 2000
          ),
          PRIMARY KEY(operation_id, ordinal)
        ) STRICT;

        INSERT INTO schema_migrations(version, applied_at)
        VALUES (3, datetime('now'));
      `);
    });
  }

  private migrateVersion4(): void {
    this.transaction(() => {
      this.connection.exec(`
        CREATE TABLE legacy_agent_model_overrides (
          provider_id TEXT NOT NULL CHECK(length(provider_id) BETWEEN 1 AND 255),
          model_id TEXT NOT NULL CHECK(length(model_id) BETWEEN 1 AND 255),
          override_json TEXT NOT NULL CHECK(length(override_json) <= 65536),
          updated_at TEXT NOT NULL,
          PRIMARY KEY(provider_id, model_id)
        ) STRICT;
        INSERT INTO schema_migrations(version, applied_at)
        VALUES (4, datetime('now'));
      `);
    });
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
      'story_questions',
      'thread_beats',
      'thread_event_links',
      'threads',
      'agent_settings',
      'conversation_messages',
      'conversation_state',
      'conversations',
      'legacy_agent_model_overrides',
      'project_catalog_state',
      'project_nodes',
      'project_operation_files',
      'project_operations',
      'writing_artifacts',
    ];
    if (requiredTables.some((tableName) => !this.hasTable(tableName))) {
      throw new Error('Project database schema is invalid');
    }
  }
}
