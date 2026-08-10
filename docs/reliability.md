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
- Project recognition requires a regular `.driftfield/project.sqlite` with the
  fixed Driftfield marker, stable project ID, and positive format version.
  Missing and damaged project databases produce distinct internal error codes.
- Sessions map stable document IDs to validated relative paths; IDs are never
  treated as paths.
- Main responsibilities remain separated across windows, IPC, and services.
  Renderer project/settings state remains in feature hooks; `App.tsx` remains a
  composition layer.
- Global settings schema version 1 accepts only the complete current shape and
  retains the optional last project directory used for validated startup
  restoration. Earlier development shapes fall back to defaults.

## Agent reliability

- Requests bind to project-session identity. Project switches cancel the owner;
  obsolete streamed output and tool calls are rejected.
- Cancellation remains terminal when it races with completion or output.
- Current read tools are `get_novel_structure`, `get_current_document`, and
  `get_document`; they are typed, bounded, path-free, and main-owned.
- `propose_document_edit` can submit a bounded whole-document replacement for
  the request-start current draft. Main retains the proposal, Renderer previews
  it, and only an explicit proposal-ID acceptance can trigger a revision-checked
  atomic save.
- Proposal tools wait for an explicit accept or reject decision and then resume
  the same Agent run with that terminal tool result. No synthetic user turn or
  follow-up request is created, and acceptance does not expand the original
  user request. Multiple sequential proposals retain their ordered decisions in
  the assistant message audit timeline.
- The composer remains editable while a run is generating or waiting for a
  proposal decision, preserving a draft for the next turn without starting a
  concurrent Agent request.
- Renderer-side dirty-draft checks never overwrite newer edits; they settle the
  waiting proposal as stale so the Agent run cannot remain suspended locally.
- `propose_document_file_operation` can submit a bounded create or delete
  proposal using stable IDs. Main owns generated filenames and IDs, validates
  parent/kind and current project/document revisions, updates metadata, and
  applies the structural mutation only after explicit acceptance. Renderer
  refuses deletion while its matching manuscript draft is dirty.
- Request-start draft snapshots preserve unsaved current-document content.
- Pi works from application-owned Agent data, not the novel folder.
- Assistant Markdown does not interpret raw HTML, load remote images, or permit
  link navigation.
- Packaged Pi smoke starts `agent-worker.mjs` from ASAR and verifies local model
  discovery for every exposed API-key provider without billable requests.
- Pi model overrides are main-owned, project-scoped in `settings.sqlite`,
  bounded, and reloaded through a per-project generated runtime cache only while
  the worker is idle. UI-authored values cannot invoke shell commands
  or environment interpolation, and sensitive authorization headers are denied.
- Project-scoped conversations survive relaunch independently from Pi session
  formats. Streaming output is periodically flushed, terminal state is
  immediate, and unfinished runs restore as interrupted.
- Recovered proposals remain actionable only while project/document identity,
  disk revision, and base Markdown still match; otherwise they become stale.
- Cancellation, project invalidation, owner disposal, and worker termination
  settle outstanding proposal waits as failed before releasing request state;
  obsolete tool results are never forwarded into a cancelled run.

## Coverage

Focused tests cover path containment, scanning, revisions and conflicts,
settings validation, strict project YAML, stable IDs, ordering and labels, dirty
decisions, snapshot merges, navigation policy, Agent protocol and state,
cancellation races, project invalidation, credentials, worker restart, tool
timeouts and budgets, targeted reads, path-free structure, safe Markdown,
locale parity and switching, native dialogs, and MDXEditor initialization and
translation.
