# Project Databases

Driftfield stores project-owned structured state in three SQLite databases under
the opened novel's `.driftfield` directory:

- `project.sqlite` owns stable project identity and is the long-term home for
  future approved world-model data such as entities, story events, temporal
  facts, relationships, plot state, and mutation-operation records.
- `conversations.sqlite` owns Agent conversations, messages, generation state,
  and tool-call audit data.
- `settings.sqlite` owns project inheritance state, optional model/thinking
  overrides, and bounded Pi model overrides.

Global UI/application settings, default model/thinking settings, provider
credentials, and OAuth tokens remain under Electron `userData`. Credentials
must never be copied into a project database.
A generated Pi `models.json` under `userData` is only a rebuildable per-project
runtime cache.

## Story domain vocabulary

The application uses five product domain names consistently:

- **Manuscript** is the authored novel text under `manuscript/`.
- **Lore** is the design book and setting material under `lore/`.
- **Chronicle** is fictional-world time, moments, and events in
  `project.sqlite`.
- **Threads** is plot lines, hierarchical beats, and their connections to
  Chronicle events in `project.sqlite`.
- **Personae** is the stable character registry used by Chronicle event
  participation in `project.sqlite`.

Manuscript and Lore remain Markdown/YAML document domains. Chronicle, Threads,
and Personae are structured database domains; they are not additional project
directories and do not duplicate authored documents.

## Chronicle, Threads, and Personae schema

`project_story_state` owns a monotonically increasing story revision. Every
canonical repository mutation checks an expected revision, applies all related
rows in one transaction, and increments the revision once. A stale mutation
does not partially change canonical state.

Personae records have stable IDs independent of character names. Chronicle uses
application-owned timeline and moment IDs. A moment stores a bounded display
label, precision, and ordering key rather than pretending every fictional
calendar is a real-world SQL timestamp. Events refer to start and optional end
moments on the same timeline; Main rejects an end ordered before its start.
Event participants connect events to Personae with explicit roles.

Chronicle evidence links may refer to a stable Manuscript or Lore document ID
and its content revision. These are cross-domain references rather than SQLite
foreign keys; the project service must validate the current document identity
and revision before accepting them.

Threads contain optionally nested plot lines. Thread beats form a hierarchy
within one Thread and record dramatic purpose, desired outcome, lifecycle
status, and explicit order. A many-to-many link records whether a beat plans,
realizes, reveals, foreshadows, or resolves a Chronicle event. This keeps
fictional occurrence separate from authorial plot function and from where an
event is depicted in the documents.

`story_operations` is the project-owned mutation ledger for Agent story
operations. Maintain inserts an applied ledger row alongside the canonical
additive/linking change and revision increment in one transaction; rows share
the originating Agent request ID for audit grouping. Reviewed operations are
inserted as pending before display, then applied or settled after a decision.
The ledger is not an authorization mechanism: all validation, revision checks,
transactions, and application remain Main-owned, and neither Renderer nor the
worker receives SQL access.

`story_questions` stores unresolved author judgments separately from canonical
Personae, Chronicle, and Threads. A question may retain exact manuscript
evidence and suggested answer options, but neither recording nor resolving it
changes the canonical story revision. Open questions are returned with the
story snapshot so Agents can avoid duplicate prompts. Only an explicit user
answer may resolve a question; any resulting canonical fact is applied through
a separately validated and audited story operation.

## Ownership and access

- Electron main exclusively owns database paths, connections, migrations, SQL,
  transactions, validation, and repositories.
- Preload exposes narrow typed project-domain operations. Renderer and Agent
  workers never receive a database path, handle, or generic query operation.
- The Agent's Maintain capability is limited to the typed additive/linking
  Personae, Chronicle, and Threads operations registered by the application.
  It cannot submit SQL, delete arbitrary rows, or mutate project documents.
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

The pre-release schema starts at version 1 in each database. During active
development, version 1 may be reset without compatibility code and old
development databases are rejected rather than imported. Once a public release
makes a schema persistent user data, later schema changes must add explicit
forward migrations rather than guessing from table shapes.

## Conversations

Conversations are project-scoped and Driftfield-owned rather than Pi session
files. Messages retain stable IDs, active-branch sequence, terminal generation
state, bounded tool activity, and reviewable edit proposals. Streamed responses
are periodically flushed and terminal events are committed immediately. A
request left running at shutdown restores as interrupted.

Text, tool activity, and proposals use one ordered message-parts representation.
The proposal columns index the latest proposal for main-owned approval recovery;
they are not a second renderer message representation.

Starting a model request builds a bounded transcript from the active branch.
Tool traces are retained for audit/UI but are not replayed as model dialogue.
Editing an earlier user message hides the abandoned continuation and creates a
new active branch without deleting the old records.

Pending edit proposals survive relaunch. Main permits a recovered proposal only
when the active project/document identity, disk revision, and base Markdown all
still match. Otherwise the proposal becomes stale; no merge or overwrite is
guessed.

## Project settings

`project_metadata` in `project.sqlite` owns the fixed Driftfield project marker,
stable project identity, positive project format version, title, and optional
reviewed icon ID. The format version is recorded but is not yet a compatibility
gate. `agent_settings` in `settings.sqlite` owns whether the project inherits
the global Agent settings and, when inheritance is disabled, its selected
provider/model and thinking level. `agent_model_overrides` stores validated
project-specific compatibility, routing, header, and thinking-map overrides.
Credentials never enter these tables.

Global settings use the versioned `userData/settings.json` schema and own the
default Agent provider/model and thinking level. New projects inherit this
selection by default. Existing configured project selections migrate as
explicit project overrides, while projects without a selection begin inheriting
the global default. Switching projects reloads both the effective settings and
the generated Pi runtime cache.

The explicit model-settings reset operation clears all global provider
credentials and Agent defaults, the active project's inheritance state,
selection, and overrides in
`settings.sqlite`, and all rebuildable Pi model caches. It never deletes
conversations, manuscript files, or other application preferences.

## Conversations and world state

Conversation history does not own or duplicate canonical world state. A message
may retain a stable tool-operation or proposal ID so the transcript can explain
what happened, but deleting a conversation never deletes an approved character,
timeline event, relationship, or plot fact.

Agent world operations remain narrow domain tools implemented in main.
Models receive typed operations and bounded results, never SQL, a database
handle, a generic query tool, or filesystem access. Maintain operations write
only the current additive/linking operation set; other mutations create a
reviewable proposal. Main validates project session, scope, revision, and the
applicable authorization path before applying either form. The conversation
database stores only the tool-call/result audit projection needed to render the
chat.

## Future world state

Canonical manuscript Markdown, canonical structured world facts, derived search
or embedding indexes, and generation audit records remain logically separate.
Future fictional time must use application-owned timeline/moment identities and
ordering rather than assuming real-world SQL timestamps. Agent-derived facts
may become canonical only through a successful bounded Maintain operation or an
explicitly approved proposal.
