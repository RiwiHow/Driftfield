# Domain Workflows and Context

Status: current design contract

Driftfield gives models a project-shaped inspection surface while Main owns
authority, validation, approvals, persistence, and recovery.

## Responsibility split

```text
User request
    |
    v
Curator
    +-- inspect disposable /project snapshot with Bash
    +-- commission one bounded Scribe artifact
    +-- submit typed story maintenance
    +-- submit reviewed document or structure proposals
    |
    v
Main
    +-- build snapshot and retain revision anchors
    +-- resolve paths and stable story IDs
    +-- validate session, scope, revisions, and proposals
    +-- persist approved prose and atomic story changes
    +-- recover durable reconciliation jobs
```

Curator owns the conversation and semantic routing. Scribe is a bounded writing
specialist, not a second conversation owner.

## Context policy

There is no ambient host-directory access. Context is acquired lazily with
`bash`, which receives a new in-memory project snapshot for each call.

- Discussion needs no project inspection unless exact project facts matter.
- Lore writing inspects the target area and relevant Lore Markdown.
- Manuscript writing inspects relevant Lore, story state, preceding prose, and
  the target draft when replacing.
- Story maintenance reads `/context/story/index.json`, searches its relevant
  JSONL shards, and inspects relevant source Markdown.
- Structure work reads only the nearest virtual `.index.json`; icon work
  searches `/context/icons.txt`.
- Accepted-prose reconciliation inspects `/context/accepted.md`, reads
  `/context/story/index.json`, and searches the relevant story shards.

Main overlays the request-start editor draft. It privately binds paths and IDs
to the revisions represented by the latest snapshot. A mutation consumes that
authority and forces a fresh inspection before dependent work.

## Writing workflow

Curator uses `propose_document_writing` for generated prose:

1. Bash inspection identifies the exact target path and relevant context.
2. Curator binds create/replace, domain, destination, kind, title, objective,
   requirements, and optional length.
3. Main resolves and validates the complete target before starting Scribe.
4. Scribe inspects bounded context and submits Markdown through
   `submit_writing_artifact`.
5. Main validates the artifact and creates exactly the bound proposal.
6. Renderer previews the complete Markdown; user acceptance performs the
   revision-checked mutation.

Proposal IDs, assignment IDs, revisions, and artifact claims stay inside Main.
The model receives a compact terminal status. A rejected or invalid artifact
never becomes a blank or partial document.

## Story maintenance

The model supplies semantic facts and stable IDs from JSONL shards referenced
by `/context/story/index.json`. Main owns transactions, dependency resolution,
generated identities, ordering, and the mutation ledger. `@clientRef` is
limited to dependencies created earlier in one atomic changeset and has no
lifetime beyond that call.

Ambiguous claims become story questions instead of canonical facts. Resolving a
question requires an explicit user answer; any resulting fact is a separate
story mutation.

## Accepted-Manuscript reconciliation

An accepted Scribe-backed Manuscript proposal creates one durable pending job
bound to the accepted artifact and exact content revision. On the next Curator
run, Main restores unfinished jobs and blocks another writing assignment until
the checkpoint is settled.

```text
accepted Manuscript proposal
    |
    +-- /context/accepted.md / accepted.json
    +-- /context/story/index.json + relevant JSONL shards
    |
    v
focused story delta or verified no-change decision
    |
    +-- Main validation and one story transaction
    +-- durable checkpoint completion
```

Main requires explicit Bash inspection of both accepted prose and story state.
The focused reconciliation operation owns provenance, primary-timeline
bootstrap, moments, ordering, IDs, and event/beat links. Lore acceptance never
creates this job.

## Receipts and visibility

The UI retains full proposal previews and structured tool audit. Model-facing
receipts stay compact: status plus only the small semantic result needed to
continue. Tool audit and earlier assistant narration are not authority. A later
mutation must always be grounded in a new Bash snapshot.

## Non-goals

Do not expose:

- the host shell or an opened-directory mount;
- SQL, database handles, `.driftfield`, credentials, or network access;
- generic filesystem mutation;
- renderer-supplied system prompts;
- revision tokens that the model must echo;
- unreviewed generated prose persistence.
