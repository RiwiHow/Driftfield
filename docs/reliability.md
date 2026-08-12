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
- Global settings schema version 3 accepts only the complete current shape and
  retains the optional last project directory used for validated startup
  restoration. Earlier development shapes fall back to defaults without
  compatibility migration.

## Agent reliability

- Requests bind to project-session identity. Project switches cancel the owner;
  obsolete streamed output and tool calls are rejected.
- Main snapshots the validated application locale when an Agent request starts.
  The worker uses that enum only as Curator's default conversational language;
  explicit language requests take precedence, and Scribe manuscript language
  remains determined by the assignment and existing prose.
- Curator may commission at most one Scribe task per request. Main owns the
  child task ID and parent binding, limits Scribe to the bounded novel-context
  reader and a terminal artifact-submission tool,
  caps the returned Markdown at 512 KiB, times the task out after five minutes,
  resolves and validates non-null target document refs against the current structure, and
  cancels it with its parent or project session. New-document assignments use a
  null target rather than a directory or placeholder ID. Completed output is a
  Main-owned, single-use artifact bound to the active parent request and its
  assigned new or existing document target; reviewed proposals reference its
  assignment ID so Curator does not regenerate the Markdown. Main accepts only
  the Markdown argument of the single artifact-submission call and discards
  ordinary Scribe assistant text, preventing planning or commentary from
  entering the manuscript. Scribe output remains untrusted and cannot write or
  propose changes directly. A completed unclaimed artifact may receive one
  atomic batch of bounded exact replacements for obvious mechanical defects;
  every replacement carries an expected occurrence count, any mismatch rejects
  the whole batch, and the resulting artifact remains size-bounded, target-bound,
  single-use, and subject to proposal review. A second delegation returns a
  typed non-retryable budget error rather than an internal error.
- Cancellation remains terminal when it races with completion or output.
- The worker preserves the provider stop reason, retries output truncation or
  printed pseudo tool-call markup at most once, and never reports a still-open
  accepted-manuscript reconciliation workflow or completed-but-unclaimed Scribe
  artifact as completed. Main validates the
  reconciliation checkpoint independently; pseudo tool markup is never
  interpreted as an operation.
- The current `read_novel_context` tool batches only fixed typed sections,
  request-scoped document refs, and immediate document children of request-scoped
  directory refs. Explicit and expanded documents are deduplicated and limited to four
  total results; node kinds are checked before reading, and every result is
  bounded, path-free, and main-owned. Persistent IDs and SHA-256 revisions are
  replaced with short refs in every model-facing result; Main owns and releases
  the per-request reverse mapping.
- Accepted Scribe-backed manuscript reconciliation has a request-scoped context
  view that exposes semantic Persona, Thread, and primary-timeline refs instead
  of persistent UUIDs. The focused reconciliation mutation resolves those refs,
  the accepted document revision, the story revision, and append order in Main,
  then delegates to the same atomic Maintain transaction. Refs never cross a
  request or project session and are released with request state.
- `maintain_story_records` applies a bounded ordered changeset of 1 to 24
  additive or linking Personae, Chronicle, or Threads operations without
  per-step approval. It requires the
  current story revision, validates the active project session and references,
  and commits every canonical change, one revision increment, and individual
  applied audit rows atomically. Ordered local references let later items depend
  on Main-generated entities created earlier in the same changeset; Main
  validates reference order and entity kind. Any item failure rolls back the whole set.
  Renderer refreshes story state after each successful write.
- Event causes/consequences and beat dramatic-purpose/desired-outcome prose are
  optional at the Agent boundary and default to empty text in Main; the model is
  not required to invent narrative analysis to satisfy a wire schema.
- Clear low-risk facts from accepted persisted prose use Maintain without a
  second approval. Ambiguous aliases, time, relationships, contradictions, and
  other author judgments are stored as deduplicated open questions instead;
  recording or resolving a question never mutates canonical story rows or
  advances their revision.
- `propose_story_operation` records a pending reviewed operation in
  `project.sqlite` only when the user explicitly requests structured review.
  Concurrent proposals from one request and base
  revision are presented as one review set and applied inside one transaction;
  each operation retains its own rebased ledger entry. Chronicle sources bind
  accepted manuscript identity and disk revision, which Main revalidates before
  applying the story mutation.
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
  proposal using request-scoped refs. Main owns generated filenames and IDs, validates
  parent/kind and current project/document revisions, updates metadata, and
  applies the structural mutation only after explicit acceptance. Renderer
  refuses deletion while its matching manuscript draft is dirty.
- `propose_project_structure_operation` can submit a document metadata-title
  change by request-scoped refs. Acceptance updates only the owning
  index; it preserves the physical filename and Markdown and remains safe while
  the renderer has an unsaved manuscript draft.
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
