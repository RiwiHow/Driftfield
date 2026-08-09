# Project Database

Driftfield stores project-owned structured state in
`.driftfield/project.sqlite` under the opened novel directory. This database is
the long-term home for conversations, generation records, and future approved
world-model data such as entities, story events, temporal facts, relationships,
and plot state.

Global settings, provider credentials, OAuth tokens, and Pi configuration remain
under Electron `userData`. They must never be copied into a project database.

## Ownership and access

- Electron main exclusively owns database paths, connections, migrations, SQL,
  transactions, validation, and repositories.
- Preload exposes narrow typed project-domain operations. Renderer and Agent
  workers never receive a database path, handle, or generic query operation.
- `.driftfield` must be a regular non-symlink directory. SQLite extensions are
  disabled and migrations are application-owned immutable source code.
- Project scanning and watching ignore `.driftfield` so database writes cannot
  cause manuscript refresh loops.
- Each database uses foreign keys, strict tables, a bounded busy timeout, and
  rollback-journal mode. Project databases may live in copied or synchronized
  folders, so do not require persistent WAL sidecars.
- `.driftfield/.gitignore` excludes the database, journals, and future backups.
  SQLite files are not mergeable source artifacts.

## Migrations

`schema_migrations` records monotonically increasing application schema
versions. Opening a newer unsupported schema fails safely. Every schema change
adds a forward migration and focused migration/repository coverage; application
code never accepts migrations from the project directory.

## Conversations

Conversations are project-scoped and Driftfield-owned rather than Pi session
files. Messages retain stable IDs, active-branch sequence, terminal generation
state, bounded tool activity, and reviewable edit proposals. Streamed responses
are periodically flushed and terminal events are committed immediately. A
request left running at shutdown restores as interrupted.

Starting a model request builds a bounded transcript from the active branch.
Tool traces are retained for audit/UI but are not replayed as model dialogue.
Editing an earlier user message hides the abandoned continuation and creates a
new active branch without deleting the old records.

Pending edit proposals survive relaunch. Main permits a recovered proposal only
when the active project/document identity, disk revision, and base Markdown all
still match. Otherwise the proposal becomes stale; no merge or overwrite is
guessed.

## Future world state

Canonical manuscript Markdown, approved structured world facts, derived search
or embedding indexes, and generation audit records remain logically separate.
Future fictional time must use application-owned timeline/moment identities and
ordering rather than assuming real-world SQL timestamps. Agent-derived facts
remain proposals until explicitly approved.

