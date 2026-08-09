# Project Format

A Driftfield project is a portable, versioned directory. A newly initialized
project has one root manifest and lowercase manuscript and lorebook roots:

```text
novel/
├── driftfield.yaml
├── .driftfield/
│   ├── .gitignore
│   └── project.sqlite
├── manuscript/
│   └── _index.yaml
└── lorebook/
    └── _index.yaml
```

Selecting an empty folder initializes `driftfield.yaml`, `manuscript/`, and
`lorebook/`, including an `_index.yaml` for each semantic root. A missing
`lorebook/` in an existing project never prevents the manuscript from opening.
Nonempty directories without a manifest remain available through temporary
legacy scanning and are not rewritten implicitly.

`.driftfield` is an optional, application-owned hidden data directory created
when structured project state is first needed. It is ignored by manuscript
scanning and watcher refresh decisions. Users and Agents do not edit it
directly; credentials never enter it. Its SQLite database is excluded from Git
by the nested `.gitignore` but travels with ordinary folder copies and backups.

## Physical names and metadata ownership

- Keep the physical roots exactly `manuscript` and `lorebook`. New projects
  create both; existing projects may omit `lorebook`. Lowercase spelling is part
  of the format.
- UI labels are user-authored metadata and may be renamed or localized without
  changing physical paths.
- Use `driftfield.yaml` only at the project root for stable project identity and
  overall format version. Do not repeat the format version in directory indexes.
- Use `_index.yaml` in each semantic directory. It owns that directory's stable
  ID, kind, title, child order, and inherited child-label or numbering policy.
- Do not duplicate the same metadata in parent and child indexes.
- Markdown files contain content. Filenames, paths, display titles, numbers, and
  array positions are not stable domain identity.

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
- Reject unsupported keys and kinds.
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

The last successfully opened project directory is persisted in application
settings and restored at startup after main-owned path and project validation.
Open documents and unsaved edits remain session-only. Agent conversations and
generation records are restored from the project database.
