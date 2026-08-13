# Domain Workflows and Context

Status: current design contract

Driftfield presents a small set of novel-domain capabilities to models while
keeping project resolution, context assembly, validation, approvals,
transactions, and recovery in Main. The model chooses semantic work; ordinary
code owns deterministic workflow mechanics.

This contract refines, rather than replaces, the tools and security boundaries
in [Agent Tools and Prompts](tools-and-prompts.md),
[Pi Worker Integration](pi-worker.md), and the
[Reliability Baseline](../reliability.md).

## Design goals

- Follow the user's requested domain: Lore writing produces a Lore proposal,
  Manuscript writing produces a Manuscript proposal, and explicit story-record
  requests use typed Personae, Chronicle, or Threads operations.
- Spend model context on high-signal prose and facts, not repeated tool
  descriptions, database rows, durable IDs, or deterministic workflow steps.
- Keep generated Markdown previewable and revision-checked. A model never
  silently writes or overwrites prose.
- Reconcile accepted Manuscript prose with story records reliably. Lore
  documents do not implicitly create Chronicle events or advance Threads.
- Preserve concise user-visible progress and detailed expandable Tool audit
  without replaying that audit into later model context.

## Responsibility split

```text
User request
    |
    v
Curator (owns the conversation and semantic routing)
    |
    +-- bounded context reads
    +-- atomic generated-document proposal --> Scribe
    +-- explicit story maintenance
    +-- direct reviewed document/project proposals
    |
    v
Main-owned workflow services
    +-- resolve project/session/target
    +-- compile and validate context
    +-- validate generated Markdown
    +-- enforce revisions and approval
    +-- persist artifacts and reconciliation jobs
    +-- apply story changes transactionally
    |
    v
Compact typed receipt to the model + full structured activity for the UI
```

Curator remains the manager. Scribe is a bounded specialist capability, not a
handoff that owns the user conversation. Reconciliation remains a focused
workflow with a structured result. Additional specialists are justified only
when they need materially different instructions, tools, policy, or context.

## Tool granularity

Model-facing tools describe domain intentions. Fine-grained repositories and
filesystem/database operations remain internal.

Good model-facing shapes include:

- commission one bounded Manuscript or Lore draft;
- read a bounded novel-context pack;
- propose one reviewed document or project-structure change;
- apply one atomic low-risk story changeset;
- submit one accepted-document reconciliation delta.

Do not expose SQL, generic filesystem access, catalog row CRUD, individual
operation-ledger steps, or a generic union that asks the model to reproduce a
Main-owned transaction plan.

The current Curator surface remains below the practical small-tool threshold.
If it grows, group tools into `context`, `documents`, `story`, and `project`
capabilities and dynamically enable or defer whole groups. Do not add a second
model call merely to classify obvious intent without evaluation evidence that
the extra call improves routing.

## Context policy

There is no ambient full-project snapshot. Context is acquired lazily for the
current request and purpose.

- Discussion uses no project read unless exact project facts are needed.
- Lore writing reads the target Lore area and relevant Lore documents.
- Manuscript writing reads relevant established Lore, Personae, Chronicle,
  Threads, the preceding prose, and the target draft when applicable.
- Explicit Persona maintenance reads story state and likely duplicate names.
- Project structure changes read only the compact catalog projection.
- Accepted-prose reconciliation reads the accepted persisted revision and the
  compact current story state.

When no editor document was open at request start, `current_document` is a
successful `null` context value rather than a failed read. A caller does not
retry it; new-document writing continues from structure, selected documents,
story state, and the assignment itself.

Main returns path-free request-scoped refs, bounded snippets, and typed
metadata. Large results support selection and truncation rather than dumping an
entire table or directory. A ref is authority only in the request in which Main
issued it.

Prompt policy is capability-sensitive. A role receives cross-tool instructions
only for tools enabled in that run. Individual tool descriptions remain the
source of truth for their schemas and local semantics.

## Writing workflow

Curator uses one high-level `propose_document_writing` operation. Its arguments
bind the semantic assignment and the eventual reviewed mutation before Scribe
runs:

- `create` binds domain, parent directory, document kind, raw metadata title,
  and project revision;
- `replace` binds domain, exact current document, request-start content and disk
  revisions;
- both bind objective, requirements, language through the assignment, and
  optional target length.

Main validates the complete target plan before spending a Scribe call. An
existing chapter may be read as continuity context for a `create` operation, but
it is never the operation target. After validation:

1. Main commissions one Scribe artifact using the already-bound action and
   domain.
2. Scribe receives the assignment, its small read surface, and the terminal
   artifact-submission tool.
3. Main validates Markdown, protocol contamination, size, parseability, and
   severe under-length truncation.
4. Main persists the artifact and constructs exactly the pre-bound create or
   replacement proposal. Curator cannot rebind it through a second tool call.
5. Renderer previews the complete Markdown. Acceptance performs the established
   revision-checked Main-owned mutation.

The internal assignment identity remains compact Main-owned state and is never
returned to Curator for manual composition. The retired lower-level delegation
and artifact-revision tool names remain audit-only for historical conversations;
they are not registered in the worker or enabled on either role surface.

Invalid artifacts are terminal workflow results and never become blank or
partial document proposals. A target-plan mistake is rejected before Scribe
runs; an artifact can never be salvaged by replacing a different existing
document. Full content remains available to the user through the proposal UI and
to Main through the artifact store, not through repeated model messages.

## Accepted-Manuscript reconciliation

Acceptance of a Scribe-backed Manuscript proposal creates or ensures one
durable reconciliation job keyed by the accepted artifact. The job binds the
document identity and exact persisted content revision. Lore acceptance does
not create this job.

Before review, Main persistently links the artifact to the proposal and target
document. If the proposal reaches its saved terminal state but the worker stops
before observing the result, recovery rolls that artifact forward from
`proposed` to `accepted` only after the catalog's observed document revision
matches the retained artifact Markdown, then ensures the same job. This avoids
depending on an in-memory post-approval callback or on chat audit alone.

```text
accepted Manuscript proposal
    |
    +-- artifact state = accepted
    +-- reconciliation job = pending
    |
    v
accepted_reconciliation context
    |
    v
structured story delta
    |
    +-- Main validation
    +-- one story transaction
    +-- mutation audit
    |
    v
reconciliation job = completed
```

The normal path completes in the same Curator run. The database job is the
recovery authority if the application or worker stops after prose acceptance.
At the next Agent run for that project, Main restores the pending checkpoint and
requires completion before reporting the run complete. Re-ensuring the job is
idempotent. While such a job is pending, Main rejects a new Scribe assignment so
another accepted document cannot replace or hide the outstanding checkpoint. A
future idle/background runner may consume the same jobs without changing their
schema or authority.

The focused reconciliation operation owns primary-timeline bootstrap, moments,
source binding, stable IDs, ordering, and event/beat links. The model supplies
semantic facts, not dependency plumbing. Ambiguous author judgments become
deduplicated questions. An intentionally unnamed character is not automatically
a question. Its successful `reconciliationStatus: complete` closes both Main's
durable job and the worker's completion gate. A redundant explicit completion
call in the same run is idempotently successful instead of becoming a visible
error.

## Visibility and receipts

User visibility and model context are separate products of the same operation.

The model receives a compact typed receipt, for example:

```json
{
  "assignmentId": "assignment:1",
  "documentDomain": "manuscript",
  "characterCount": 6234,
  "status": "completed"
}
```

Renderer retains expandable structured activity showing the tool, role,
bounded inputs, outcome, validation reason, proposal, and decision. Markdown
bodies are represented by sizes in Tool audit and by their actual content in
the proposal preview. Persisted Tool audit is never replayed as model dialogue.

Errors use small stable codes plus one actionable detail. They do not expose
paths, SQL, stack traces, credentials, private deliberation, or entire rejected
artifacts.

## Approval and risk

Tool visibility, authorization, and approval are distinct:

- visibility: whether the role can select the tool in this run;
- authorization: whether the user's request permits the operation;
- approval: whether execution must pause for review.

Bounded reads and explicitly requested low-risk additive story maintenance may
run without a separate review. Generated document changes, deletion, moves,
renames, and other high-impact mutations remain proposal-gated. Validation is
placed next to the operation that creates the side effect; prompt instructions
are not an authorization boundary.

## Evaluation gates

Changes to tool grouping, context packs, or workflow composition are evaluated
against realistic tasks. Track at least:

- correct workflow/tool selection;
- invalid argument and stale-ref recovery rate;
- context tokens and duplicate prose tokens;
- accepted artifact validity and severe truncation rate;
- proposal created only for valid artifacts;
- reconciliation completion, duplicate-record, and crash-recovery behavior;
- unauthorized or approval-bypassing mutation attempts;
- total latency, tool calls, retries, and terminal error codes.

Add complexity only when these measurements show a material improvement.
