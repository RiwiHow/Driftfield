# Reliability Baseline

Preserve these properties when changing affected subsystems.

## Window and IPC security

- Main windows deny new windows, unexpected navigation, and redirects away from
  the exact development or packaged renderer URL.
- Privileged IPC verifies the application-owned main frame and current URL.

## Document lifecycle

- One dirty-document lifecycle covers tab close, project switch and refresh,
  external deletion or rename, window close, and application quit.
- Destructive paths require an explicit save, discard, or cancel decision.
- Loaded documents carry SHA-256 disk revisions.
- Main saves return typed saved, conflict, or missing results and compare the
  current disk revision before writing.
- Conflict UI supports reload, compare/merge, and reviewed overwrite.
- Dirty documents remain recoverable in renderer state if their backing file
  disappears.
- Saves serialize per document, use unique temporary files, and validate sender,
  size, extension, canonical containment, and regular-file status.

## Project sessions and metadata

- Recursive `fs.watch` is only a change signal. Sessions debounce and
  revision-deduplicate scans, report health, retain manual refresh, and retry
  failures.
- Main strictly validates physical root/index casing, regular non-symlink files,
  stable-ID uniqueness, bounded YAML, explicit order, safe formatters, and
  referenced Markdown before exposing a snapshot.
- Sessions map stable document IDs to validated relative paths; IDs are never
  treated as paths.
- Main responsibilities remain separated across windows, IPC, and services.
  Renderer project/settings state remains in feature hooks; `App.tsx` remains a
  composition layer.
- Settings schema version 3 migrates earlier unversioned and versioned shapes,
  including English-default language and Agent settings.

## Agent reliability

- Requests bind to project-session identity. Project switches cancel the owner;
  obsolete streamed output and tool calls are rejected.
- Cancellation remains terminal when it races with completion or output.
- Current tools are `get_novel_structure`, `get_current_document`, and
  `get_document`; they are typed, bounded, path-free, and main-owned.
- Request-start draft snapshots preserve unsaved current-document content.
- Pi works from application-owned Agent data, not the novel folder.
- Assistant Markdown does not interpret raw HTML, load remote images, or permit
  link navigation.
- Packaged Pi smoke starts `agent-worker.mjs` from ASAR and verifies local model
  discovery for every exposed API-key provider without billable requests.

## Coverage

Focused tests cover path containment, scanning, revisions and conflicts,
settings migration, strict project YAML, stable IDs, ordering and labels, dirty
decisions, snapshot merges, navigation policy, Agent protocol and state,
cancellation races, project invalidation, credentials, worker restart, tool
timeouts and budgets, targeted reads, path-free structure, safe Markdown,
locale parity and switching, native dialogs, and MDXEditor initialization and
translation.
