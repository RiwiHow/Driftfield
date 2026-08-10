# Project Format

A Driftfield project is a portable, versioned directory. A newly initialized
project has three project databases and lowercase manuscript and lore
roots:

```text
novel/
├── .driftfield/
│   ├── project.sqlite
│   ├── conversations.sqlite
│   └── settings.sqlite
├── manuscript/
│   └── _index.yaml
└── lore/
    └── _index.yaml
```

Selecting an empty folder initializes all of these entries. A missing
`lore/` in an existing project never prevents the manuscript from opening.
Only a truly empty selected directory is initialized. A nonempty directory is
recognized only when `.driftfield/project.sqlite` is a regular, non-symlink
SQLite database containing Driftfield's fixed project marker, stable project
ID, and a positive format version. A missing database is reported separately
from a damaged database. Project format versions are recorded but are not yet
used to reject a project; database schema compatibility remains fail-closed.

`.driftfield` is an application-owned hidden data directory. It is ignored by
manuscript scanning and watcher refresh decisions. Users and Agents do not edit
it directly; credentials never enter it. Its databases travel together with
ordinary folder copies and backups. Driftfield does not create or depend on Git
metadata.

## Physical names and metadata ownership

- Keep the physical roots exactly `manuscript` and `lore`. New projects create
  both; existing projects may omit `lore`. Lowercase spelling is part
  of the format.
- `project.sqlite` owns the fixed Driftfield marker, stable project identity,
  project title, optional reviewed icon ID, and format/schema versions.
- Each semantic directory `_index.yaml` owns that directory's stable ID, kind,
  title, optional reviewed icon ID, child order, and inherited child-label or
  numbering policy.
- UI labels may be renamed or localized without changing physical paths. Do not
  duplicate the same metadata in parent and child indexes.
- Markdown files contain content. Filenames, paths, display titles, numbers,
  and array positions are not stable domain identity.

Icon values come from Driftfield's fixed Lucide-backed registry. YAML cannot
inject SVG, HTML, URLs, filesystem paths, or executable icon definitions.

## Ordering, numbering, and formatting

- Store child order explicitly in `children` arrays instead of inferring it from
  filenames.
- Keep numbering structured and separate from labels. Supported behavior
  includes continuous, per-volume, manual, and none.
- A directory `title` controls its own UI label. A constrained `format` controls
  child labels only.
- Formatters are data templates, never executable code. Allow only documented
  placeholders; reject unknown placeholders and bound their size.
- Never permit expressions, property traversal, environment access, custom YAML
  tags, or formatter-derived file paths and IDs.

## Parsing and authority

- Parse YAML in main with a safe schema and strict runtime validation.
- Bound file size, depth, aliases, collection size, strings, and child count.
- Reject unsupported keys, kinds, and icon IDs.
- Require regular, non-symlink metadata and content files.
- Canonicalize and contain every referenced path under its owning project and
  semantic root.
- Main project services own initialization, metadata reads, migrations,
  revisions, serialized atomic writes, and conflicts.
- Renderer features and Agent workers do not parse, mutate, or construct project
  metadata paths.
- Agents access structure through bounded domain tools and stable IDs. They
  never edit YAML directly.
- Structural mutations must use propose, preview, approve, revision-check, and
  main-owned apply semantics.

Whether application writes must preserve user-authored YAML comments and exact
formatting remains undecided. Do not promise round-trip preservation until the
product decision and parser strategy are explicit.

## Markdown documents

The project tree reads manuscript Markdown through narrow main-process IPC.
Existing `.md` and `.markdown` documents can be saved through validated,
conflict-aware handlers. General `.mdx` and JSX files are unsupported.

The last successfully opened project directory is persisted in global
application settings and restored at startup after main-owned validation. Open
documents and unsaved edits remain session-only. Project Agent settings are
restored from `settings.sqlite`; conversations and generation records are
restored from `conversations.sqlite`. Future approved world and plot state
belongs in `project.sqlite`.
