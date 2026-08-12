# Project Database

Project Format v3 uses one SQLite database:
`.driftfield/project.sqlite`. Domain repositories remain separate in code, but
share one connection format, migration history, backup boundary, and
transaction authority.

## Ownership

The database owns:

- project identity, presentation, and format version;
- the Manuscript/Lore catalog and file revision observations;
- project Agent model inheritance and selection;
- Agent conversations, messages, ordered parts, proposal outcomes, and
  writing-artifact lifecycle;
- durable accepted-Manuscript reconciliation jobs and proposal-to-artifact
  recovery linkage;
- Personae, Chronicle, Threads, story questions, and story mutation records;
- cross-database/filesystem operation coordination and recovery metadata.

Current prose remains in registered Markdown files. Credentials and global
application/model settings remain under Electron `userData`.

## Schema and repositories

`schema_migrations` is the sole ordered project schema history. Current v3
domains include:

- `project_metadata`, `project_catalog_state`, `project_nodes`;
- `agent_settings`, plus bounded legacy override handoff rows;
- `conversations`, `conversation_state`, `conversation_messages`;
- `writing_artifacts`, `story_reconciliation_jobs`;
- Personae, Chronicle, Threads, story operations, and questions;
- `project_operations` and `project_operation_files`.

SQL stays behind Main-owned repositories and services. Renderer, preload, and
Agent workers never receive database handles or issue SQL. Internal
foreign-key relationships are enabled; references from global stores use
validated stable IDs.

## Runtime rules

- Enable foreign keys, defensive mode, bounded SQLite limits, and a busy
  timeout.
- Use transactions for multi-record changes and nested savepoints within one
  repository operation.
- Serialize project mutations at the service layer.
- Validate stable IDs, values, node kinds, canonical path containment, regular
  file state, Markdown, and content revisions before privileged mutation.
- Convert failures to small typed serializable errors at IPC boundaries.
- Never treat conversation/tool audit rows as authority for catalog or story
  state. A saved proposal outcome may roll a linked writing artifact forward to
  `accepted` during recovery only when the retained Markdown matches the
  catalog's observed document revision. That revision and the reconciliation
  job—not assistant narration—bind subsequent story work.

## Backup and migration

Back up `project.sqlite` together with the Markdown tree while no write is in
flight. SQLite is not a Git-merge format. V2 migration copies all three legacy
databases and YAML indexes into a recovery directory before changing authority,
then imports sidecar data into the unified schema. See
[Project Format](project-format.md) and
[Project Format v3](project-format-v3.md).

## Reset semantics

Resetting model settings updates the unified `agent_settings` row and clears
global generated model caches through the owning service. It does not delete or
recreate the project database, catalog, story state, conversations, or prose.
A stale retired `settings.sqlite` file has no runtime authority and cannot
disable reset.
