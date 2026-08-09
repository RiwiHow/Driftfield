# Agent Tools and Prompts

Agents receive novel data only through bounded, application-owned domain tools.
Main-process services and repositories remain authoritative for files, metadata,
future databases, permissions, and persistence.

## Current read-only tools

The initial Agent data surface contains only:

- `get_novel_structure`
- `get_current_document`
- `get_document`

The reviewed mutation surface additionally contains
`propose_document_edit`. It accepts a complete replacement only for the
request-start current-document snapshot and binds it to both the disk base
revision and draft content revision. Calling it stores an in-memory proposal;
it does not write the novel.

Main validates typed arguments, resolves stable IDs through the active project
session, rechecks document containment and regular-file status, and enforces
per-request call, timeout, individual-result, and cumulative-result budgets.
Results do not expose physical project paths or raw YAML.
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
Driftfield replays user and assistant text only; persisted Tool activity remains
an audit/UI record and is not injected as dialogue.

## Tool definitions and prompt policy

Each tool's `defineTool()` registration is the single source of truth for its
name, description, and parameter schema. Native model Tool Calling communicates
those definitions to the model. Do not copy individual tool descriptions into
the system prompt.

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

Use one application-owned coordinator Agent to interpret the user's goal,
decompose work, start and cancel specialist sessions, collect results, and
prepare the final proposal. Coordination never bypasses persistence, permission,
revision, or review boundaries.

- Give specialists only the context required for their role.
- Use distinct roles such as continuity, plot, style, research, or editing only
  when they provide distinct context or output.
- Do not create multiple Agents to duplicate the same reasoning.
- Return typed application-owned results with task, parent request, document,
  and base-revision identity where applicable.
- Do not pass Pi session objects or raw SDK events between application layers.
- Propagate cancellation and bound concurrency, context, calls, and output.
- Treat child results as untrusted proposals. Only main can confirm persistence.

## Generated Markdown changes

Agents may propose a complete document or edits at character, word, line,
paragraph, or section granularity, but they never write files directly.

The current implementation supports whole-current-document edit proposals.
Main assigns the proposal ID and retains the authoritative proposed Markdown.
Renderer acceptance sends only that ID back to Main. Main rejects proposals
from another window or project session, and applies an accepted proposal only
when its disk base revision still matches. Create and selective-edit proposals
remain future work.

- A create proposal carries complete Markdown and a validated
  application-relative destination. Main enforces extensions, containment, size,
  and non-overwrite behavior.
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
