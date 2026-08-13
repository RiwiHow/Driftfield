# Agent Tools and Prompts

Agents receive novel data only through bounded, application-owned domain tools.
Main-process services and repositories remain authoritative for files, metadata,
future databases, permissions, and persistence.

The composition, context-budget, compact-receipt, and durable reconciliation
rules for these tools are defined in
[Domain Workflows and Context](domain-workflows-and-context.md).

## Current read-only tool

The Agent data surface contains one bounded `read_novel_context` tool. One call
may request any combination of the fixed `structure`, `current_document`,
`story_state`, and `accepted_reconciliation` sections, persisted documents by
request-scoped ref, and directories by request-scoped ref.
`accepted_reconciliation` is available
only after an accepted Scribe-backed manuscript proposal. It returns the exact
persisted accepted document and a compact semantic view of Personae, Chronicle,
Threads, and open questions. Existing entities use request-scoped refs such as
`persona:1`, `thread:1`, and `timeline:primary`; persistent UUIDs and revisions
remain Main-owned. A directory selection expands only its immediate document children,
never nested directories. Explicit and expanded documents are deduplicated in
request order and limited to four total results. Main validates every requested
node against the current structure before reading and returns only path-free
application-owned data. Missing nodes, document/directory kind mismatches, and
oversized selections return distinct bounded typed errors. Every ordinary
context result replaces persistent project, directory, document, story-entity,
question, and source IDs plus SHA-256 content revisions with short refs such as
`directory:3`, `document:2`, and `revision:1`. Main owns the per-request reverse
mapping, reuses refs across repeated reads, resolves them before privileged
operations, and releases them with request state. The model-facing surface does
not emit persistent UUIDs or content hashes.
When `current_document` is requested without a request-start editor document,
the section is returned as `null`; this is a successful absence and must not be
retried.
Refs are acquired lazily rather than injected into every conversation. A request
that needs structure or story refs first reads only the relevant context with
empty document and directory selectors, then reuses the returned refs for the
rest of that request. Ref-like strings copied from user text or replayed
conversation history are never authority. Main returns
`expired-request-reference` when a well-formed ref was not issued by the active
request, includes a bounded recovery hint, and refunds at most one such failure
from the ordinary call budget so the Agent can reacquire minimal context once.
Every document result separates its raw `metadataTitle` from its formatted
`displayTitle`. Numbering and label templates affect only `displayTitle`; Agents
use `metadataTitle` for creation and title changes and never copy generated
numbering back into metadata.
The current-document section is the immutable request-start editor draft,
including unsaved edits; explicit document refs deliberately read persisted
content. The story-state section contains Personae, Chronicle, Threads, open
questions, and the numeric story revision. Empty requests and duplicate IDs
within either selector are rejected. Agents batch already-known requirements
but use a later call when an earlier structure result is needed to discover
request-scoped refs.

The bounded direct-maintenance surface contains:

- `maintain_story_records`, which applies one ordered changeset of 1 to 24
  typed additive or linking changes
  to Personae, Chronicle, or Threads within the user's explicit request or
  when unambiguously evidenced by accepted persisted prose. It
  requires the current numeric story revision and request-scoped refs. Main
  validates and
  applies the changeset transactionally, records each item in the project
  ledger, and returns the new revision. Ordered create operations may declare a
  bounded `clientRef`; later operations in the same changeset refer to the
  Main-generated entity as `@clientRef`. Main validates reference order and
  entity kind and resolves references inside the transaction. Its concise
  result contains only `status`, `revision`, and `appliedCount`; audit and
  generated entity IDs remain Main-owned. It does not expose SQL and cannot
  delete, merge, reorder, or edit Manuscript/Lore documents.
- `reconcile_accepted_document`, which consumes only refs returned by the
  current request's `accepted_reconciliation` read. It accepts one depicted
  Chronicle event, clearly established new Personae, optional new Threads with
  their first linked beat, and zero or more advances to existing Threads. New
  Personae use call-local refs so the same event can link them without a second
  read. When the project has no primary timeline, Main creates one in the same
  transaction using an optional semantic title supplied by the Agent or a
  neutral fallback. Main resolves the accepted document source and revision,
  story revision, Persona and Thread UUIDs, moment, Thread and beat order keys,
  generated IDs, and event-to-beat links, then applies the complete graph
  through the same atomic Maintain transaction. A successful focused call also
  closes the reconciliation checkpoint. Missing, stale, cross-request, or
  wrong-kind refs fail closed. Low-level Maintain remains available for clear
  shapes outside this focused path.
- `complete_story_reconciliation`, which closes the Main-owned durable
  reconciliation job after an accepted Scribe-backed Manuscript proposal when the
  focused reconciliation tool did not already close it. Main requires
  post-acceptance reads of both the persisted document and story state, and
  validates that `applied` or
  `questions_recorded` matches successful tool activity. `no_changes` is valid
  only when no canonical mutation or question was recorded. The checkpoint does
  not itself write story data.
- `record_story_question`, which records a deduplicated unresolved ambiguity
  without changing canonical story records or their revision. Questions carry
  a bounded kind, author-facing wording, optional answer choices, request
  identity, and optional exact manuscript evidence. In accepted-document
  reconciliation, the `document:accepted` ref lets Main supply the persisted
  document ID and revision without exposing either to the model.
- `resolve_story_question`, which closes an open question only after an
  explicit user answer. Resolution does not itself mutate canonical story
  records; any resulting clear additive/linking fact is a separate Maintain
  operation with its own audit entry.

The bounded collaboration surface contains `propose_document_writing`, the
Curator's single Scribe-backed document operation. It binds the semantic
assignment and reviewed mutation target before generation begins:

- `create` requires the exact request-scoped parent directory and project
  revision, document kind, raw metadata title, and a null document target;
- `replace` requires the exact request-start document plus its disk and content
  revisions, and has no create destination;
- both actions carry the domain, bounded objective and requirements, and
  optional target length.

Main resolves and validates this entire plan before starting Scribe. A
preceding chapter read for continuity is context for a new chapter, never its
replacement target. Main owns the child identity, parentage, cancellation,
timeout, and artifact-size limit. Scribe receives only the read-only novel
tools plus the terminal `submit_writing_artifact` tool. Only Markdown submitted
through that tool becomes the draft; ordinary assistant text is discarded.
Scribe cannot delegate, propose, maintain story state, or persist content.

After artifact validation, Main constructs exactly the already-bound create or
replace proposal and Renderer shows the complete Markdown for review. Curator
does not receive a reusable assignment ref and cannot redirect the artifact in
a later call. The lower-level `delegate_writing` receipt remains an internal
worker compatibility protocol and is not enabled for Curator.

Acceptance of a Scribe-backed Manuscript proposal creates or ensures one
durable `story_reconciliation_jobs` row bound to the accepted document and its
exact content revision. The normal Curator run completes it; a later run
restores any pending job after interruption. Proposal-to-artifact linkage lets
recovery roll forward the narrow window where the document proposal was saved
before the Agent observed its result, but only when the observed document hash
matches the retained artifact. Lore acceptance never creates this job.
Main blocks a new Scribe assignment until any restored pending job is settled,
so later Lore or Manuscript work cannot hide an older checkpoint.

The provider-facing Maintain schema keeps Chronicle event lifecycle and Thread
lifecycle distinct: `create_event` uses `eventStatus` (`planned` or
`established`), while `create_thread` and `create_beat` use `threadStatus`
(`planned`, `active`, `resolved`, or `abandoned`). The worker normalizes these
wire fields to the canonical repository `status` field before Main performs its
strict operation-shape validation. This avoids advertising a status value for
an operation that Main would reject. Invalid story shapes return a bounded
operation-specific hint rather than only an opaque error code.
Invalid Maintain batches report the exact failing array index and field using
the provider-facing wire name, such as `changes[2].eventStatus`, rather than
describing the first operation regardless of where validation failed.

The reviewed mutation surface additionally contains:

- `propose_document_edit`, which accepts direct replacement Markdown for the
  request-start current-document snapshot and binds it to both the disk base
  revision and draft content revision. Generated replacement prose uses the
  atomic `propose_document_writing` path;
- `propose_document_file_operation`, which proposes either creating a Markdown
  document under a request-scoped directory ref or deleting a document by ref.
  Direct creation carries a raw `metadataTitle`, domain kind, and supplied
  Markdown. Generated creation uses `propose_document_writing`. Deletion binds
  to both the project revision and persisted document revision.
- `propose_project_structure_operation`, which proposes creating a manuscript
  volume, creating an icon-bearing lore category, deleting an empty lore
  category, moving a document between compatible request-scoped directory refs, or
  changing a document's metadata title without renaming its physical file.
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

Routine synchronization keeps concise progress narration, tool activity, and
failures visible so the user can inspect whether the application workflow is
behaving correctly. The final response summarizes canonical changes and any
material unresolved questions. Intentionally unnamed characters and omitted
background facts do not become questions unless resolving them materially
affects canonical records.

The worker retains the final provider stop reason. A completed but unclaimed
Scribe artifact is a protocol error and receives one corrective continuation
that must submit the artifact through a reviewed proposal. A `length` response and a
response that prints known tool-call markup as ordinary text receive one
application-owned concise corrective continuation. If the retry is still
truncated, contains pseudo tool markup, or leaves a required reconciliation
checkpoint open, the request terminates with a typed incomplete error rather
than `completed`. Main independently refuses completion while the checkpoint is
open; pseudo tool text is never parsed or executed.

A mutation tool call remains pending after the proposal is shown. Accepting or
rejecting the proposal settles that exact tool call with a typed terminal result,
then the worker resumes the same Agent run from that result. Approval does not
create a second request, insert a synthetic user message, or authorize work
beyond the user's original scope. For example, accepting a proposal that writes
chapter one does not by itself authorize writing chapter two. One run may submit
multiple sequential proposals when the original request requires them; every
proposal and decision remains ordered in the assistant message audit timeline.

Main validates typed arguments, resolves request-scoped refs through the active project
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
Driftfield replays user and assistant text through a model-only history
projection that replaces prior request-scoped refs with explicit expired-ref
markers. Persisted conversation text is unchanged, so Renderer continues to
show the original narration, refs, and Tool activity for inspection. Persisted
Tool activity remains an audit/UI record and is not injected as dialogue.
Terminal proposal outcomes are the exception: Main supplies a bounded typed
list of accepted, rejected, or
failed outcomes as trusted application context on later turns, so the model
does not mistake an already accepted proposal for one still awaiting approval.
This list includes every terminal proposal recorded in a multi-proposal
assistant message, not only its latest proposal.

Main snapshots the validated application locale at request start and sends only
the `en` or `zh-CN` enum to the worker. Curator uses it as the default language
for user-facing explanations, questions, and summaries unless the user
explicitly requests another language. The worker appends this policy at the end
of the system prompt in the target language so that English tool policy does not
overpower it. It is fixed application-owned policy, not a localized
renderer-supplied prompt. It covers visible text before and after tool calls but
never translates manuscript text or tool data. Scribe instead follows the
assignment's explicit language and otherwise preserves the language of relevant
existing prose.

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
  behavior, then applies the reviewed catalog/file mutation through Main's
  project operation coordinator.
- A delete proposal carries a stable document ID and reviewed base revisions.
  Main moves the regular, non-symlink Markdown file to project trash and removes
  its catalog node through the durable operation ledger, restoring the file if
  the database step fails.
- An empty Lore-category deletion proposal carries its stable directory ID and
  project revision. Main rejects nonempty categories and untracked files, then
  moves the directory to project trash and removes its catalog node through the
  same durable operation ledger.
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
