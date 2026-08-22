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
- Main strictly validates physical root casing, regular non-symlink files,
  database-owned stable-ID uniqueness, explicit catalog order, safe formatters,
  contained locators, and referenced Markdown before exposing a snapshot.
- Project recognition requires a regular `.driftfield/project.sqlite` with the
  fixed Driftfield marker, stable project ID, and positive format version.
  Missing and damaged project databases produce distinct internal error codes.
- Sessions map stable document IDs to validated relative paths; IDs are never
  treated as paths.
- Main responsibilities remain separated across windows, IPC, and services.
  Renderer project/settings state remains in feature hooks; `App.tsx` remains a
  composition layer.
- Global settings schema version 4 accepts only the complete current shape and
  retains the optional last project directory used for validated startup
  restoration. The complete version 3 shape migrates by adding empty Agent
  custom instructions; earlier development shapes fall back to defaults.

## Agent reliability

- Requests bind to project-session identity. Project switches cancel the owner;
  obsolete streamed output and tool calls are rejected.
- Main snapshots the validated application locale when an Agent request starts.
  The worker uses that enum only as Curator's default conversational language;
  explicit language requests take precedence, and Scribe manuscript language
  remains determined by the assignment and existing prose.
- Curator may commission at most one Scribe task per request for either the
  Manuscript or Lore domain. Main owns the
  child task ID and parent binding, limits Scribe to the bounded novel-context
  reader and a terminal artifact-submission tool,
  caps the returned Markdown at 512 KiB, times the task out after five minutes,
  validates and freezes the complete create-or-replace target plan before
  starting Scribe, and cancels it with its parent or project session. A new
  document binds its parent, kind, title, project revision, and a null document
  target; replacement binds the exact request-start document and revisions.
  Completed output is a Main-owned, persisted artifact bound to that plan.
  Main constructs the reviewed proposal directly; Curator receives no reusable
  assignment ID and therefore cannot redirect a create artifact into an
  existing document. Main accepts only the Markdown argument of the single
  artifact-submission call and discards
  ordinary Scribe assistant text, preventing planning or commentary from
  entering the document. Scribe output remains untrusted and cannot write or
  propose changes directly. A second delegation returns a
  typed non-retryable budget error rather than an internal error.
- Cancellation remains terminal when it races with completion or output.
- The worker preserves the provider stop reason, retries output truncation,
  printed pseudo tool-call markup, or a response that stops while narrating an
  unexecuted immediate action at most once, and never reports a still-open
  accepted-manuscript reconciliation workflow or completed-but-unclaimed Scribe
  artifact as completed. Main validates the
  reconciliation checkpoint independently; pseudo tool markup is never
  interpreted as an operation.
- The disposable `bash` inspection tool rebuilds `/project` from the current
  Main-owned snapshot on every call, overlays the request-start draft, excludes
  `.driftfield` and host paths, and bounds source, commands, loops, traversal,
  filesystem bytes, runtime, and output. Virtual writes never survive a call.
- local virtual `.index.json` files, project-relative Markdown,
  `/context/story/index.json` with bounded JSONL story shards,
  `/context/icons.txt`, and the
  optional accepted-document files are generated by Main inside that snapshot.
  Model-facing mutations accept only exact snapshot paths or stable story IDs.
  Main privately binds them to the represented identities and revisions.
- Every mutation requires a Bash snapshot from the same request and consumes
  that snapshot. Unknown paths, wrong node kinds, stale project sessions, story
  IDs absent from the latest snapshot, and concurrent revisions fail closed.
- Accepted Scribe-backed Manuscript reconciliation exposes
  `/context/accepted.md` and indexed story JSONL shards in Bash. Main requires
  explicit inspection of both, resolves the
  accepted document revision, story revision, and append order, then delegates
  to the same atomic Maintain transaction.
- The reconciliation checkpoint is a durable project-database job keyed by the
  accepted writing artifact and exact persisted document revision. Main links
  the artifact to its proposal before review, restores a saved-but-unobserved
  acceptance after restart only when the retained Markdown hashes to the
  catalog's observed document revision, and resumes the oldest pending job on
  the next Agent run. Lore artifacts do not create reconciliation jobs. If a focused
  story transaction committed before its job completion marker, recovery
  detects the matching depicted source and completes the job idempotently.
- Focused accepted-document reconciliation can bootstrap an empty story store
  in one transaction: call-local new Persona refs may participate in the event,
  Main creates a missing primary timeline, and clearly established new Threads
  include their first beat and event link. Successful focused reconciliation
  closes its checkpoint without a separate completion call.
- The worker observes that focused completion result and clears its own
  completion gate. A redundant explicit completion in the same run is
  idempotently successful; it does not turn an already completed run into
  `workflow-incomplete`.
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
  proposal using exact paths from the latest Bash snapshot. Main owns generated filenames and IDs, validates
  parent/kind and current project/document revisions, updates metadata, and
  applies the structural mutation only after explicit acceptance. Renderer
  refuses deletion while its matching manuscript draft is dirty.
- `propose_project_structure_operation` can submit a document metadata-title
  change using a snapshot path. Acceptance updates only the owning
  catalog node; it preserves the physical filename and Markdown and remains safe while
  the renderer has an unsaved manuscript draft.
- Lore-category icon changes require a category path from the latest snapshot
  and an exact icon listed in `/context/icons.txt`. Acceptance updates
  only that catalog node and preserves its stable ID, physical directory,
  ordering, children, and manuscript drafts.
- Request-start draft snapshots preserve unsaved current-document content.
- Pi works from application-owned Agent data, not the novel folder.
- Assistant Markdown does not interpret raw HTML, load remote images, or permit
  link navigation.
- Packaged Pi smoke starts `agent-worker.mjs` from ASAR and verifies local model
  discovery for every exposed API-key provider without billable requests.
- Pi model overrides are main-owned, globally persisted under application data,
  bounded, and reloaded through a generated runtime cache only while
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
settings validation, v3 catalog validation, strict legacy migration YAML,
stable IDs, ordering and labels, dirty
decisions, snapshot merges, navigation policy, Agent protocol and state,
cancellation races, project invalidation, credentials, worker restart, tool
timeouts and budgets, targeted reads, path-free structure, safe Markdown,
locale parity and switching, native dialogs, and MDXEditor initialization and
translation.
