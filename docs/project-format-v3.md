# Project Format v3: Single Project Store

Status: current implementation contract

Project Format v3 replaces mutable YAML directory indexes and three independent
project databases with ordinary Markdown content plus one application-owned
SQLite control plane. This document is the source of truth for the v3 migration
and implementation. Existing security, IPC, revision-conflict, proposal, and
dirty-document requirements remain in force unless this document explicitly
strengthens them.

## Decision

A v3 project has this durable layout:

```text
novel/
├── .driftfield/
│   ├── project.sqlite
│   ├── staging/
│   ├── recovery/
│   └── trash/
├── manuscript/
│   └── chapter-one.md
└── lore/
    └── world.md
```

Only `project.sqlite` is authoritative for project-owned structured state.
Markdown files are authoritative for current Manuscript and Lore prose.
`staging`, `recovery`, and `trash` contain only Main-owned recoverable operation
material and are never scanned as project documents.

V3 does not create or depend on `_index.yaml`, `conversations.sqlite`, or
`settings.sqlite`. A migrated v2 project retains recoverable copies of legacy
metadata in a migration backup until the user explicitly removes it through a
future reviewed cleanup operation. Legacy files outside that backup are not
consulted after the v3 authority switch.

## Goals

- Preserve ordinary `.md` and `.markdown` prose as the open project format.
- Give every project-owned structured record one schema version, one backup
  boundary, and one transactional authority.
- Make stable identity, hierarchy, order, titles, settings, conversations,
  story state, proposals, artifacts, and operation recovery available through
  one Main-owned database.
- Make every filesystem mutation recoverable after process termination at any
  instruction boundary.
- Validate the same constrained Manuscript/Lore Markdown at generation,
  proposal, acceptance, save, scan, and editor-load boundaries.
- Keep Renderer and Agent workers path-free and database-free.
- Preserve visible Agent progress and Tool activity. V3 reduces invalid calls;
  it does not hide workflow behavior from the user.

## Non-goals

- V3 does not make arbitrary external directory moves identity-preserving.
- V3 does not put current prose inside SQLite or treat the database as a hidden
  replacement for Markdown.
- V3 does not permit raw HTML, MDX, JSX, generic filesystem access, or direct
  Agent mutation of files or database rows.
- V3 does not promise Git-merge semantics for SQLite.
- V3 does not add concurrent multi-process writers. Driftfield must hold one
  project writer lease before that is supported.

## Authority model

### Markdown authority

Files under registered Manuscript or Lore document nodes own current prose.
They contain no required Driftfield frontmatter, stable IDs, ordering values,
or executable metadata. Their SHA-256 content revision remains the optimistic
concurrency token.

### Database authority

`project.sqlite` owns:

- project marker, stable project ID, format version, title, and icon;
- the logical directory/document catalog and physical relative-path mapping;
- stable node IDs, hierarchy, explicit sibling order, document kind, metadata
  title, icons, and inherited numbering policy;
- the last observed content revision and backing-file state;
- project Agent settings;
- conversations, messages, ordered parts, generation state, proposal outcome,
  and bounded Tool audit;
- writing-artifact lifecycle and reviewed document/structure proposals;
- Personae, Chronicle, Threads, questions, and their mutation ledger;
- cross-domain operation state needed for crash recovery.

Physical names and paths are storage locators, not identities. Renderer and
Agent contracts continue to use stable IDs or request-scoped refs.

### Global authority

Application language, theme, zoom, last-project location, global model
selection, global model overrides, and credentials remain under Electron
`userData`. Credentials never enter a project.

## Unified schema domains

The database uses one ordered `schema_migrations` history. Repository classes
remain separated by domain even though they share one connection and
transaction boundary.

### Project catalog

`project_nodes` represents both semantic directories and documents:

```text
node_id             stable application ID
parent_node_id      nullable only for manuscript and lore roots
node_type           directory | document
kind                manuscript | lore | volume | category | chapter | ...
metadata_title      raw user title, without generated numbering
icon                 reviewed fixed registry value or null
relative_path       normalized project-relative locator
sort_key             explicit integer sibling order
numbering_mode       directory-only policy or null
numbering_format     constrained directory-only template or null
content_revision     document-only SHA-256 or null
backing_status       present | missing
created_at
updated_at
```

Constraints enforce compatible parent/child kinds, unique stable IDs, unique
relative paths, unique sibling order, lowercase physical roots, bounded values,
and the two required root records. Path containment and regular-file checks
remain runtime responsibilities because SQL cannot establish filesystem safety.

### Project settings

`agent_settings` retains one project inheritance/selection row. Global model
overrides remain global; the v2 legacy project override table is imported only
when needed and is not part of the v3 steady-state schema.

### Conversations and artifacts

Conversation tables retain their current logical contracts and use foreign keys
inside the unified database. Proposal outcomes remain ordered conversation
records; writing-artifact lifecycle rows share the same backup boundary.

`writing_artifacts` has explicit lifecycle states:

```text
generated → validated → proposed → accepted | rejected
          ↘ invalid
          ↘ discarded
```

Invalid artifacts are valid terminal workflow outcomes. The schema reserves a
discarded state for a future reviewed discard surface. An artifact is never
forced into a proposal merely because Scribe returned it.
The optional proposal linkage is written before review, allowing Main to
recover a proposal that reached `saved` before the active Agent observed the
decision. The proposed document ID is stored separately from the catalog-backed
target foreign key because a newly proposed document does not exist yet.
Recovery also requires the observed document content revision to match the
retained Markdown. Curator receives a compact receipt rather than the Markdown
body; the full artifact stays available to Main and the reviewed proposal UI.
Validation records bounded deterministic reason codes such as `raw-html`,
`protocol-markup`, `parse-failed`, `truncated`, and
`severely-under-target`. Length quality may be advisory; unsupported Markdown,
protocol markup, and parser failure are hard rejections.

`story_reconciliation_jobs` contains one idempotent job per accepted
Scribe-backed Manuscript artifact. It binds the source request, stable document
ID, and exact accepted content revision, and records a pending/completed status
plus completion outcome. Lore artifacts do not create jobs. Recovery can safely
complete a pending job whose matching depicted Chronicle source already exists,
covering a crash between the story transaction and the completion marker.

### Story state

Existing Personae, Chronicle, Threads, story-question, and mutation-ledger
tables remain logically unchanged. Document evidence stores a service-validated
stable document ID and content revision; the revision binds the exact evidence
version while preserving compatibility with imported story records.

### Operations and recovery

`project_operations` is the durable coordinator for mutations that touch both
SQLite and the filesystem:

```text
operation_id
operation_kind
state                  prepared | filesystem_applied | completed |
                       failed_recoverable | failed_terminal
base_project_revision
payload_json           bounded validated operation plan
created_at
updated_at
error_code
```

`project_operation_files` records each affected locator, expected old/new
revision, staging locator, recovery locator, and trash locator. Paths stored in
the database are normalized project-relative locators; Main resolves and
contains them again before every filesystem action.

## Filesystem mutation protocol

All application-owned create, save, move, and delete operations use one
serialized `ProjectMutationCoordinator`. Metadata-only rename is a single
database transaction.

1. Validate trusted sender, active project session, stable IDs, current project
   and content revisions, node kinds, size, Markdown, regular-file state, and
   canonical containment.
2. Insert a bounded `prepared` operation and affected-file manifest.
3. Apply filesystem changes. Saves use a same-directory temporary file and
   atomic rename; moves use same-volume rename; deletes move into
   `.driftfield/trash/` and are not immediately unlinked.
4. Mark `filesystem_applied`, apply the catalog change in a database
   transaction, then mark the operation `completed`.
5. If a synchronous database step fails, attempt the inverse filesystem step.
   A successful inverse is `failed_terminal`; an inverse failure is
   `failed_recoverable` and preserves all material.

On project open, Main checks the ledger before exposing a snapshot. Any
`prepared`, `filesystem_applied`, or `failed_recoverable` row is normalized to
`failed_recoverable` and produces the typed `project-recovery-required` error.
The current release deliberately stops there instead of guessing. Deterministic
automatic roll-forward from staging manifests remains a roadmap item; the
ledger and preserved files make that addition possible without changing the
authority model.

Database-only mutations remain one ordinary SQLite transaction and do not
create filesystem operation rows.

## Markdown contract

One Main-owned validator defines the supported document language. Every
producer and consumer uses it:

- project scan/open;
- user save;
- Scribe artifact submission;
- direct document proposal;
- proposal acceptance;
- external-change refresh;
- recovery roll-forward.

The validator enforces bounded UTF-8 Markdown, rejects raw HTML and MDX/JSX,
rejects known prompt/tool protocol markup and forbidden control characters, and
uses a parser compatible with the MDXEditor configuration. A document that
cannot enter rich-text mode cannot be accepted as a valid persisted proposal.
Source mode remains a recovery surface for externally damaged files, not a way
for generated content to bypass validation.

## External filesystem changes

- Content changes to a registered Markdown locator are detected by revision and
  enter the established conflict/refresh lifecycle.
- Missing registered files keep their stable document records with
  `backing_status = missing`; recoverable drafts are not discarded.
- New unregistered Markdown files are reported as import candidates. They do
  not silently become canonical nodes.
- External moves or renames are never guessed from names or content similarity.
  The original node becomes missing and the new file becomes an import
  candidate until the user performs an explicit reconciliation.
- `_index.yaml` files found after v3 migration are ignored as legacy files and
  never regain authority.

## V2 to v3 migration

Migration is automatic for supported v2 projects in this pre-release format,
Main-owned, and non-destructive.

1. Validate project identity and copy `project.sqlite`, both optional legacy
   sidecars, and every `_index.yaml` to a unique
   `.driftfield/recovery/migration-v3-*/legacy/` tree.
2. Validate the complete v2 catalog through the strict legacy YAML reader and
   read content revisions from regular contained Markdown files.
3. Apply schema migration 3 to the existing `project.sqlite`. This preserves
   its already-authoritative story tables. In one transaction, populate
   `project_nodes`, import valid project settings, model-override handoff rows,
   conversations and messages, and change `format_version` to 3.
4. Move live `_index.yaml`, `conversations.sqlite`, and `settings.sqlite` into
   the recovery directory and write the completed migration manifest. If an
   optional sidecar is invalid it remains backed up, the manifest records a
   warning, and v3 uses safe defaults for that optional domain.
5. Reopen through the v3 catalog and normal operation-ledger check before
   exposing a snapshot.

Migration never deletes Markdown, valid imported data, story state, or the
legacy backup. A migration failure before the authority switch leaves v2 as the
authority and may leave an additional recovery backup or forward-compatible
SQLite schema tables. A failure after the switch reopens v3 and ignores any
still-live legacy sidecar or YAML file; it never falls back to YAML authority.

V3 applications recognize supported v2 separately and migrate it automatically
in this pre-release format. A newer unknown format or schema still fails closed.

## Service boundaries

- `ProjectDatabase` owns schema migration and shared transactions.
- Focused repositories own catalog, settings, conversations, story state,
  artifacts/proposals, and operations; they receive a project database rather
  than opening separate files.
- `ProjectMutationCoordinator` is the only normal-runtime service that
  coordinates SQLite and filesystem mutations. Format migration is a separate
  one-time authority-switch service.
- Snapshot and layout services read the catalog plus validated Markdown; they
  do not parse YAML.
- Renderer/preload contracts remain narrow and serializable.
- Agent tools submit semantic operations. Main supplies paths, stable IDs,
  revisions, order keys, recovery operations, and lifecycle transitions.

## Verification

Current tests cover:

- initialization produces one database and no YAML indexes;
- v2 migration preserves catalog IDs/order, Markdown, settings, conversations,
  existing project story tables, and recovery material;
- catalog constraints and runtime path containment;
- unfinished operation detection and typed open failure;
- external edit conflicts and missing-file safety;
- shared Markdown validation for artifacts, proposals, creation, acceptance,
  and save;
- invalid Scribe artifacts can terminate without a proposal;
- accepted document creation and its conversation/proposal outcome remain
  recoverable and revision-checked;
- all existing navigation, IPC, dirty-document, cancellation, proposal, story,
  i18n, Pi, and ASAR security baselines.

Automatic crash roll-forward at every rename boundary, unregistered-file import
UI, application-owned integrity/restore UI, and a dedicated packaged database
smoke remain tracked in [Technical Debt and Roadmap](roadmap.md).
