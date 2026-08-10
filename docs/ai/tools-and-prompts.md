# Agent Tools and Prompts

Agents receive novel data only through bounded, application-owned domain tools.
Main-process services and repositories remain authoritative for files, metadata,
future databases, permissions, and persistence.

## Current read-only tools

The initial Agent data surface contains only:

- `get_novel_structure`
- `get_current_document`
- `get_document`
- `get_story_state`, which returns the bounded, path-free Personae, Chronicle,
  and Threads snapshot with its numeric story revision.

The bounded direct-maintenance surface contains:

- `maintain_story_records`, which applies one typed additive or linking change
  to Personae, Chronicle, or Threads within the user's explicit request. It
  requires the current story revision and stable IDs. Main validates and
  applies the operation transactionally, records it in the project ledger, and
  returns the new revision. It does not expose SQL and cannot delete, merge,
  reorder, or edit Manuscript/Lore documents.

The provider-facing Maintain schema keeps Chronicle event lifecycle and Thread
lifecycle distinct: `create_event` uses `eventStatus` (`planned` or
`established`), while `create_thread` and `create_beat` use `threadStatus`
(`planned`, `active`, `resolved`, or `abandoned`). The worker normalizes these
wire fields to the canonical repository `status` field before Main performs its
strict operation-shape validation. This avoids advertising a status value for
an operation that Main would reject. Invalid story shapes return a bounded
operation-specific hint rather than only an opaque error code.

The reviewed mutation surface additionally contains:

- `propose_document_edit`, which accepts a complete replacement only for the
  request-start current-document snapshot and binds it to both the disk base
  revision and draft content revision;
- `propose_document_file_operation`, which proposes either creating a Markdown
  document under a stable directory ID or deleting a document by stable ID.
  Creation carries a title, domain kind, and complete Markdown. Deletion binds
  to both the project revision and persisted document revision.
- `propose_project_structure_operation`, which proposes creating a manuscript
  volume, creating a lore category, or moving a document between compatible
  stable directory IDs. Moves bind to both the project revision and persisted
  document revision; manuscript documents cannot be moved into lore or vice
  versa.
- `propose_story_operation`, the reviewed protocol for additive or linking
  story mutations that should not use direct Maintain. The worker uses it to
  reconcile accepted generated prose with Personae, Chronicle, and Threads.
  Reconciliation rereads the exact persisted document and current story state,
  proposes one change at a time, and waits for review before writing canonical
  records. Chronicle events may carry validated manuscript source identity,
  revision, relation, and a bounded evidence anchor.

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
and refreshes its story snapshot. Maintain currently applies one operation per
tool call; batch changesets and user-facing undo are not yet implemented.

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
`get_novel_structure` exposes the optional knowledge root as `lore` with
directory kind `lore`, matching the project format and application domain.

The worker emits bounded Tool activity events around the Driftfield-owned tool
bridge. Renderer shows the current call and its completion result in collapsible
rows. Serialized activity is capped at 8 KiB per payload, and Markdown bodies
are represented by byte counts instead of being duplicated into the activity
log.

`AgentToolContractMap` is the shared compile-time mapping from each tool name to
its arguments and result. Request and result unions are derived from that map so
a tool cannot be paired with another tool's payload. Runtime validators enforce
the same correlation at the utility-process boundary. The worker derives the
enabled Pi tool-name list from the actual `defineTool()` collection instead of
maintaining separate prompt and session arrays.

Agent requests capture a size-bounded immutable editor draft with its stable
document ID and disk base revision. `get_current_document` returns that snapshot,
including unsaved edits. `get_document` deliberately reads persisted content.

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

Coordination is an application-owned task graph, not a permanent hierarchy or
a fixed set of role names. Prompt-profile IDs describe current capabilities;
they are not protocol-level assumptions such as a mandatory Leader or Writer.
As concurrent collaboration is introduced, Main owns task identity, parentage,
authorization, budgets, cancellation, and artifact routing. An Agent may request
a bounded task capability, but it never starts arbitrary processes or broadens
the user's authority. The current build executes one Agent session and performs
accepted-prose reconciliation in that run; the reviewed artifact and proposal
protocol is designed so the reconciliation stage can later move to a separate
specialist without changing persistence semantics.

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
- An edit proposal identifies a document and SHA-256 `baseRevision`, and carries
  application-owned structured replacements or a patch against that revision.
- Prefer exact-text anchors or ranges in the base snapshot over bare line
  numbers.
- Render a diff or equivalent preview. The user can accept, reject, selectively
  apply, or cancel.
- Apply accepted changes through `ProjectService` so revision checks,
  serialization, atomic writes, conflicts, and recovery remain intact.
- If the disk revision changed, stop and enter the conflict workflow or request
  a reread. Never guess a merge or silently overwrite text.
- Persist prompt, model metadata, tool activity, proposal, approval decision,
  and resulting revision as application-owned generation records.
