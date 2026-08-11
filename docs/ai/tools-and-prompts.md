# Agent Tools and Prompts

Agents receive novel data only through bounded, application-owned domain tools.
Main-process services and repositories remain authoritative for files, metadata,
future databases, permissions, and persistence.

## Current read-only tool

The Agent data surface contains one bounded `read_novel_context` tool. One call
may request any combination of the fixed `structure`, `current_document`, and
`story_state` sections, persisted documents by stable ID, and directories by
stable ID. A directory selection expands only its immediate document children,
never nested directories. Explicit and expanded documents are deduplicated in
request order and limited to four total results. Main validates every requested
node against the current structure before reading and returns only path-free
application-owned data. Missing nodes, document/directory kind mismatches, and
oversized selections return distinct bounded typed errors.
The current-document section is the immutable request-start editor draft,
including unsaved edits; explicit document IDs deliberately read persisted
content. The story-state section contains Personae, Chronicle, Threads, open
questions, and the numeric story revision. Empty requests and duplicate IDs
within either selector are rejected. Agents batch already-known requirements
but use a later call when an earlier structure result is needed to discover
stable IDs.

The bounded direct-maintenance surface contains:

- `maintain_story_records`, which applies one ordered changeset of 1 to 24
  typed additive or linking changes
  to Personae, Chronicle, or Threads within the user's explicit request or
  when unambiguously evidenced by accepted persisted prose. It
  requires the current story revision and stable IDs. Main validates and
  applies the changeset transactionally, records each item in the project
  ledger, and returns the new revision. Ordered create operations may declare a
  bounded `clientRef`; later operations in the same changeset refer to the
  Main-generated entity as `@clientRef`. Main validates reference order and
  entity kind, resolves references inside the transaction, and returns the
  generated entity ID for every create item. It does not expose SQL and cannot
  delete, merge, reorder, or edit Manuscript/Lore documents.
- `record_story_question`, which records a deduplicated unresolved ambiguity
  without changing canonical story records or their revision. Questions carry
  a bounded kind, author-facing wording, optional answer choices, request
  identity, and optional exact manuscript evidence.
- `resolve_story_question`, which closes an open question only after an
  explicit user answer. Resolution does not itself mutate canonical story
  records; any resulting clear additive/linking fact is a separate Maintain
  operation with its own audit entry.

The bounded collaboration surface contains:

- `delegate_writing`, which lets the Curator commission one Scribe draft for a
  user-authorized manuscript-writing request. The assignment contains a bounded
  objective, requirements, nullable stable target-document ID, and nullable
  target length. New-document assignments use `targetDocumentId: null`;
  existing-document assignments use a stable document ID returned by structure,
  never a directory ID or invented placeholder. Main validates non-null target
  IDs against the current structure. Main creates and owns the child task
  identity, parentage, cancellation, timeout, and artifact-size limit. Scribe
  receives the read-only novel tools plus one terminal
  `submit_writing_artifact` tool. Only the bounded Markdown submitted through
  that tool becomes the draft; ordinary assistant text before or after the
  submission is discarded, so planning or commentary cannot leak into the
  manuscript. Scribe cannot delegate, propose, maintain story state, or persist content. Main
  retains the completed artifact only inside its parent request. Curator reviews
  the Markdown, then passes the returned assignment ID to one creation or
  replacement proposal. Main resolves that request- and target-bound reference
  exactly once to the original Markdown, so Curator never regenerates it and no
  placeholder or persisted intermediate draft is created.

The provider-facing Maintain schema keeps Chronicle event lifecycle and Thread
lifecycle distinct: `create_event` uses `eventStatus` (`planned` or
`established`), while `create_thread` and `create_beat` use `threadStatus`
(`planned`, `active`, `resolved`, or `abandoned`). The worker normalizes these
wire fields to the canonical repository `status` field before Main performs its
strict operation-shape validation. This avoids advertising a status value for
an operation that Main would reject. Invalid story shapes return a bounded
operation-specific hint rather than only an opaque error code.

The reviewed mutation surface additionally contains:

- `propose_document_edit`, which accepts either direct replacement Markdown or
  the current request's unclaimed Scribe assignment ID for the request-start
  current-document snapshot and binds it to both the disk base revision and
  draft content revision;
- `propose_document_file_operation`, which proposes either creating a Markdown
  document under a stable directory ID or deleting a document by stable ID.
  Creation carries a title, domain kind, and either direct Markdown or the
  current request's unclaimed Scribe assignment ID. Deletion binds to both the
  project revision and persisted document revision.
- `propose_project_structure_operation`, which proposes creating a manuscript
  volume, creating an icon-bearing lore category, deleting an empty lore
  category, or moving a document between compatible stable directory IDs.
  `read_novel_context.structure` returns both each directory's selected icon and the
  complete fixed icon allow-list. Category creation accepts only an icon from
  that list. Category deletion is rejected until every contained document has
  been separately reviewed and deleted. Moves bind to both the project revision
  and persisted document revision; manuscript documents cannot be moved into
  lore or vice versa.
- `propose_story_operation`, the reviewed protocol for additive or linking
  story mutations when the user explicitly requests review before application.
  Routine reconciliation of clear facts from accepted generated prose uses
  bounded Maintain instead and does not interrupt the user. Main applies an
  accepted set atomically and
  rebases its individual ledger entries inside that transaction. Chronicle
  events may carry validated manuscript source identity, revision, relation,
  and a bounded evidence anchor.

Calling a reviewed mutation tool stores a reviewable proposal; it does not
write the novel. Main generates created document and directory IDs, owns
physical names and index updates, and the Agent never constructs or receives
metadata paths.
Story proposals are recorded as pending operations in `project.sqlite` while
the conversation database retains the bounded audit projection needed by the
chat UI. Acceptance applies the canonical rows, increments the story revision,
and marks that same operation applied in one database transaction. Rejection,
conflict, cancellation, and failure settle it without changing canonical story
state.

A successful Maintain call writes canonical story rows immediately. The
canonical change, revision increment, and applied `story_operations` row share
one transaction. Each ledger row carries the originating Agent request ID, so a
multi-step run remains auditable even though it does not interrupt the user for
each additive step. Renderer receives a bounded `story-changed` notification
and refreshes its story snapshot. Maintain applies one atomic changeset per
tool call: all items share the original base revision and resulting revision,
and any item failure rolls the entire set back. Dependencies between items use
ordered `clientRef` references within that changeset. Concurrent reviewed story
proposals from the same request and base
revision are grouped in the UI and applied atomically with one decision.
User-facing undo is not yet implemented.

Story reconciliation follows a risk split rather than universal approval:
clear, low-risk, additive or linking facts from accepted persisted prose are
maintained automatically; possible aliases, uncertain time, unclear
relationships, contradictions, and other author judgments become open story
questions and never enter canonical records; destructive or high-impact story
mutations remain unavailable until a dedicated reviewed operation exists. The
Agent raises newly recorded questions concisely in its response and avoids
duplicating questions already returned by `read_novel_context.storyState`.

Before finishing reconciliation, Curator explicitly checks Personae, Chronicle,
Threads, and open questions in turn. Thread reconciliation first tests whether
accepted prose advances, turns, reveals, resolves, or abandons an existing plot
line, then creates and links a beat when that relationship is clear. A new
Thread requires evidence of a continuing goal, conflict, dramatic question,
suspense, or relationship progression. A chapter, scene, or isolated Chronicle
event does not by itself justify a Thread, and Thread records must not merely
duplicate Chronicle or invent dramatic purpose to achieve category coverage.

Routine synchronization is executed without narrating tool planning,
intermediate identifiers, schema choices, or retries. The user receives a
concise summary of canonical changes and any unresolved questions after the
tool workflow finishes.

A mutation tool call remains pending after the proposal is shown. Accepting or
rejecting the proposal settles that exact tool call with a typed terminal result,
then the worker resumes the same Agent run from that result. Approval does not
create a second request, insert a synthetic user message, or authorize work
beyond the user's original scope. For example, accepting a proposal that writes
chapter one does not by itself authorize writing chapter two. One run may submit
multiple sequential proposals when the original request requires them; every
proposal and decision remains ordered in the assistant message audit timeline.

Main validates typed arguments, resolves stable IDs through the active project
session, rechecks document containment and regular-file status, and enforces
per-request call, timeout, individual-result, and cumulative-result budgets.
Results do not expose physical project paths or raw YAML.
Maintain execution, proposal construction, and validation remain time-bounded,
while the subsequent human review wait is intentionally excluded from the
ordinary tool timeout.
`read_novel_context.structure` exposes the optional knowledge root as `lore` with
directory kind `lore`, matching the project format and application domain. Its
path-free result includes directory icons and the fixed `availableIcons` list;
it never exposes YAML or physical metadata paths.

The worker emits bounded Tool activity events around the Driftfield-owned tool
bridge. Main annotates those events with the executing Agent role before they
enter the conversation audit, so Renderer can distinguish delegated Scribe
calls without inferring ownership from tool names or timeline position.
Renderer shows the current call and its completion result in collapsible rows.
Serialized activity is capped at 8 KiB per payload, and Markdown bodies are
represented by byte counts instead of being duplicated into the activity log.

`AgentToolContractMap` is the shared compile-time mapping from each tool name to
its arguments and result. Request and result unions are derived from that map so
a tool cannot be paired with another tool's payload. Runtime validators enforce
the same correlation at the utility-process boundary. The worker derives the
enabled Pi tool-name list from the actual `defineTool()` collection instead of
maintaining separate prompt and session arrays.

Agent requests capture a size-bounded immutable editor draft with its stable
document ID and disk base revision. The `current_document` section returns that
snapshot, while `documentIds` deliberately read persisted content.

Prefer future domain operations such as chapter summaries, context search,
characters, timelines, and outlines over generic database, filesystem, shell, or
code-execution tools. Validate project and document scope and bound output on
every call.

Canonical novel data, derived Agent memory or indexes, and generation audit
records remain logically separate. Generated summaries are not canonical facts
unless the application explicitly promotes them.

Multi-turn dialogue is assembled from the active project conversation by Main
and trimmed again in the worker against the selected model context window.
Driftfield replays user and assistant text. Persisted Tool activity remains an
audit/UI record and is not injected as dialogue. Terminal proposal outcomes are
the exception: Main supplies a bounded typed list of accepted, rejected, or
failed outcomes as trusted application context on later turns, so the model
does not mistake an already accepted proposal for one still awaiting approval.
This list includes every terminal proposal recorded in a multi-proposal
assistant message, not only its latest proposal.

## Tool definitions and prompt policy

Each tool's `defineTool()` registration is the single source of truth for its
name, description, and parameter schema. Native model Tool Calling communicates
those definitions to the model. Do not copy individual tool descriptions into
the system prompt.

Keep model-facing parameter schemas portable across supported providers. Use a
top-level object schema and plain `{ type: 'string', enum: [...] }` schemas for
string enums; do not use root `Type.Union` or `Type.Literal` unions for
operation variants. Express provider-sensitive conditional requirements
through descriptions and enforce the exact discriminated shape again in
Driftfield's shared runtime validator.

System prompts live under `src/main/ai/prompts/` as versioned,
application-owned role profiles. The prompt registry composes:

- immutable application boundaries;
- role instructions;
- cross-tool usage policy.

Do not embed complete prompts in the worker entry or accept arbitrary
renderer-supplied system prompts. Future user writing instructions may be
size-bounded additions, but cannot replace application boundaries.

Whenever a tool is added, removed, or its semantics change:

1. Update the `defineTool()` registration and shared typed protocol.
2. Review `src/main/ai/prompts/prompt-builder.ts` for changes needed to the
   cross-tool policy.
3. Do not add per-tool descriptions to the system prompt.
4. If model-facing prompt behavior changes, bump the affected prompt profile
   versions.
5. Add focused protocol, dispatcher, and packaged-worker coverage appropriate
   to the capability.

## Agent coordination

Coordination is an application-owned task graph, not an authority hierarchy.
`Curator` and `Scribe` are the default product and prompt-profile names for the
current planning/review and drafting capabilities; task identity and permission
checks never depend on those display names. Main owns task identity, parentage,
authorization, budgets, cancellation, and artifact routing. An Agent may request
a registered bounded task capability, but it never starts arbitrary processes
or broadens the user's authority. The current build permits one Scribe child
task during a Curator request. Accepted-prose reconciliation remains in the
Curator run; the reviewed artifact and proposal protocol allows that stage to
move to a separate specialist later without changing persistence semantics.

- Give specialists only the context required for their role.
- Register distinct capabilities such as drafting, continuity, plot, style,
  research, editing, or story reconciliation only when they provide distinct
  context or typed output. Display names may change without changing task or
  artifact semantics.
- Do not create multiple Agents to duplicate the same reasoning.
- Return typed application-owned results with task, parent request, document,
  and base-revision identity where applicable.
- Do not pass Pi session objects or raw SDK events between application layers.
- Propagate cancellation and bound concurrency, context, calls, and output.
- Treat child results as untrusted proposals. Only main can confirm persistence.

## Generated Markdown changes

Agents may propose a complete document or edits at character, word, line,
paragraph, or section granularity, but they never write files directly.

The current implementation supports whole-current-document edit proposals and
whole-document create/delete proposals.
Main assigns the proposal ID and retains the authoritative proposed Markdown.
Renderer acceptance sends only that ID back to Main. Main rejects proposals
from another window or project session, and applies an accepted proposal only
when its disk/project base revisions still match. Selective-edit proposals
remain future work.

- A create proposal carries complete Markdown and a stable parent directory ID.
  Main chooses the stable document ID and physical filename, enforces the
  parent/kind relationship, extension, containment, size, and non-overwrite
  behavior, then updates the owning `_index.yaml`.
- A delete proposal carries a stable document ID and reviewed base revisions.
  Main removes the document from its owning index before deleting the regular,
  non-symlink Markdown file, restoring the index if deletion fails.
- An empty Lore-category deletion proposal carries its stable directory ID and
  project revision. Main rejects nonempty categories and untracked files, then
  removes the category from the Lore index before deleting its metadata-only
  directory.
- An edit proposal identifies a document and SHA-256 `baseRevision`, and carries
  application-owned structured replacements or a patch against that revision.
- Prefer exact-text anchors or ranges in the base snapshot over bare line
  numbers.
- Render a diff or equivalent preview. The current whole-document workflow lets
  the user accept, reject, or cancel; selective application remains future work.
- Apply accepted changes through `ProjectService` so revision checks,
  serialization, atomic writes, conflicts, and recovery remain intact.
- If the disk revision changed, stop and enter the conflict workflow or request
  a reread. Never guess a merge or silently overwrite text.
- Persist prompt, model metadata, tool activity, proposal, approval decision,
  and resulting revision as application-owned generation records.
