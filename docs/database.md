# Project Databases

Driftfield stores project-owned structured state in three SQLite databases under
the opened novel's `.driftfield` directory:

- `project.sqlite` owns stable project identity and is the long-term home for
  future approved world-model data such as entities, story events, temporal
  facts, relationships, plot state, and mutation-operation records.
- `conversations.sqlite` owns Agent conversations, messages, generation state,
  and tool-call audit data.
- `settings.sqlite` owns project-level model selection, thinking level, and
  bounded model overrides.

Global UI/application settings, provider credentials, and OAuth tokens remain
under Electron `userData`. They must never be copied into a project database.
A generated Pi `models.json` under `userData` is only a rebuildable per-project
runtime cache.

## Ownership and access

- Electron main exclusively owns database paths, connections, migrations, SQL,
  transactions, validation, and repositories.
- Preload exposes narrow typed project-domain operations. Renderer and Agent
  workers never receive a database path, handle, or generic query operation.
- `.driftfield` must be a regular non-symlink directory. SQLite extensions are
  disabled and migrations are application-owned immutable source code.
- Project scanning and watching ignore `.driftfield` so database writes cannot
  cause manuscript refresh loops.
- Each database uses internal foreign keys, strict tables, a bounded busy
  timeout, and rollback-journal mode. Project databases may live in copied or
  synchronized folders, so do not require persistent WAL sidecars.
- Cross-database foreign keys and attached-database joins are not part of the
  persistence contract. Main-owned services validate stable IDs and coordinate
  workflows across repositories when necessary.
- Copy and back up all three files together. SQLite files are not mergeable
  source artifacts, and Driftfield does not create Git metadata for them.

## Migrations

Each database has an independent `schema_migrations` history. Every future
schema change must be an ordered, transactional migration. Opening a database
created by a newer Driftfield version fails closed. Application code never
accepts migrations from the project directory.

Projects created by the earlier combined schema are upgraded lazily. Driftfield
first copies conversation or settings rows into the corresponding target
database and records an idempotent import marker. Only after that transaction
commits does it remove those legacy tables from `project.sqlite`. An interrupted
upgrade can therefore retry without losing the source rows.

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

## Project settings

`project_metadata` in `project.sqlite` owns stable project identity and project
format version. `agent_settings` in `settings.sqlite` owns the selected
provider/model and thinking level. `agent_model_overrides` stores validated
project-specific compatibility, routing, header, and thinking-map overrides.
Credentials never enter these tables.

Global settings use the versioned `userData/settings.json` schema and contain no
Agent model selection. Switching projects reloads both the project settings and
the generated Pi runtime cache.

The explicit model-settings reset operation clears all global provider
credentials, the active project's Agent selection and overrides in
`settings.sqlite`, and all rebuildable Pi model caches. It never deletes
conversations, manuscript files, or other application preferences.

## Conversations and world state

Conversation history does not own or duplicate canonical world state. A message
may retain a stable tool-operation or proposal ID so the transcript can explain
what happened, but deleting a conversation never deletes an approved character,
timeline event, relationship, or plot fact.

Future Agent world operations remain narrow domain tools implemented in main.
Models receive typed operations and bounded results, never SQL, a database
handle, a generic query tool, or filesystem access. Mutating tools create a
reviewable operation or proposal in `project.sqlite`; main validates project
session, scope, revision, and approval before applying it. The conversation
database stores only the tool-call/result audit projection needed to render the
chat.

## Future world state

Canonical manuscript Markdown, approved structured world facts, derived search
or embedding indexes, and generation audit records remain logically separate.
Future fictional time must use application-owned timeline/moment identities and
ordering rather than assuming real-world SQL timestamps. Agent-derived facts
remain proposals until explicitly approved.
