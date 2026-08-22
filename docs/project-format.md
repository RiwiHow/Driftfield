# Project Format

Driftfield Project Format v3 stores prose as ordinary Markdown and all
project-owned structured state in one Main-owned SQLite database. The detailed
implementation contract is [Project Format v3](project-format-v3.md).

```text
novel/
├── .driftfield/
│   ├── project.sqlite
│   ├── recovery/
│   ├── staging/
│   └── trash/
├── manuscript/
└── lore/
```

New projects do not create `_index.yaml`, `conversations.sqlite`, or
`settings.sqlite`.

## Authority

- Markdown files under registered Manuscript and Lore document nodes own prose.
- `.driftfield/project.sqlite` owns stable project and node IDs, hierarchy,
  sibling order, titles, numbering policy, file locators and revisions, project
  Agent settings, conversations, writing artifacts, Personae, Chronicle,
  Threads, questions, and mutation ledgers.
- Application language, appearance, global model configuration, credentials,
  and last-opened-project state remain under Electron `userData`.
- Paths, filenames, generated labels, and array positions are not identities.

Renderer and Agent workers never open the database. Agents inspect a disposable
Main-generated project tree with project-relative paths, while Main resolves
those paths and stable story IDs through narrow operations.

## Project recognition

A nonempty project is recognized through `.driftfield/project.sqlite`, the
fixed marker `driftfield-project`, a stable project ID, and supported positive
format version. Missing and damaged databases are different typed errors. A
newer project format is rejected instead of being opened with guessed
semantics.

The physical roots must use the exact lowercase names `manuscript` and `lore`.
Every registered locator is normalized, canonically contained, checked against
the expected regular file or directory kind, and limited to `.md` or
`.markdown` for documents. `.driftfield` is never scanned as content.

New-project initialization seeds the three default Lore categories using the
current application language (`Personae`, `Locations`, and `World` in English;
`人物`, `地点`, and `世界` in Simplified Chinese). The selected titles and
locators are persisted once; changing application language never renames an
existing project category.

## Catalog

`project_nodes` is the authoritative catalog. It stores stable IDs, parent IDs,
directory/document kind, metadata title, reviewed icon, normalized relative
path, explicit sort key, directory numbering policy, last content revision,
and backing-file status.

Structural changes never edit metadata files. Main validates and serializes the
operation, stages or trashes affected files, records it in
`project_operations`, performs the filesystem step, updates the catalog, and
marks the operation completed. An unfinished operation blocks normal opening
with `project-recovery-required`; Driftfield preserves the operation and files
instead of silently guessing or overwriting.

## Markdown

Driftfield supports Markdown, not MDX or arbitrary HTML. One Main-owned
validator is used for generated artifacts, proposals, proposal acceptance,
document creation, and save. It enforces size limits, rejects raw HTML,
Agent/prompt protocol remnants, forbidden control characters, parse failures,
and severely truncated assigned artifacts. Externally damaged Markdown may be
shown through source-mode recovery, but generated content cannot use that path
to bypass validation.

## External changes

- Content edits to a registered file use SHA-256 revision conflicts.
- Missing registered files retain their stable catalog record.
- Unregistered Markdown is not silently adopted.
- External rename or move is not guessed from names or similar content.
- Legacy `_index.yaml` found after migration is ignored and has no authority.

## V2 migration

Opening a valid v2 project performs a Main-owned pre-release migration:

1. Copy `project.sqlite`, legacy sidecar databases, and every metadata index to
   a unique `.driftfield/recovery/migration-v3-*` backup.
2. Validate the existing YAML hierarchy and Markdown files with the strict v2
   reader.
3. Add the v3 schema to `project.sqlite`, import the catalog, project settings,
   model-override handoff records, conversations, messages, and content
   revisions, then atomically change the project format version to 3.
4. Move live `_index.yaml`, `conversations.sqlite`, and `settings.sqlite` into
   the recovery backup. V3 ignores any legacy file that remains after an
   interrupted retirement step.

Migration never deletes prose or the recovery backup. Invalid optional legacy
settings or conversation sidecars are preserved and reported in the migration
manifest while the project opens with safe defaults; invalid project identity,
catalog metadata, or prose structure still blocks migration.
