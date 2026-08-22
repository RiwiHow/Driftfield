# Agent Tools and Prompts

Agents receive project context through a disposable, Main-owned virtual
filesystem and mutate projects only through narrow typed domain tools. Main
remains authoritative for files, catalog metadata, story records, revisions,
approvals, and persistence.

See [Domain Workflows and Context](domain-workflows-and-context.md),
[Pi Worker Integration](pi-worker.md), and the
[Reliability Baseline](../reliability.md).

## Bash project snapshot

`bash` is the only model-facing read surface. Each call creates a fresh
in-memory `/project` filesystem using `just-bash`. It is not the host shell and
does not mount the opened novel directory.

The `/project` tree contains:

- registered Manuscript and Lore directories, including empty catalog
  directories;
- registered Manuscript and Lore Markdown at their project-relative paths;
- a virtual `.index.json` in each registered directory containing only that
  directory's display metadata and direct children.

Application-generated context is separate from the novel under `/context`:

- `/context/story/index.json`, a small count-and-navigation index whose
  referenced, bounded JSONL shards contain current Personae, Chronicle,
  Threads, relations, and questions;
- `/context/icons.txt`, the complete bundled Lucide icon-name catalog;
- `/context/accepted.md` and `/context/accepted.json` while an accepted
  Manuscript reconciliation is pending.

Main overlays the immutable request-start editor draft over its persisted file
inside the snapshot. The model may inspect the projected tree with commands
such as `ls`, `find`, `tree`, `rg`, `cat`, `sed`, `jq`, and `wc`. Empty
registered directories remain visible, while unregistered and Main-owned
paths do not. Writes affect only that one in-memory call and are discarded
immediately.

Ordinary project inspection stays under `/project`. `ls` and `tree` omit the
hidden indexes, while a domain tool can read only the nearest `.index.json`
needed to map a display title, icon, or explicit child order. Prose scans use
the `.md` and `.markdown` extensions so they do not collect indexes. Other
context files are routed by the domain tool that needs them: story work reads
`story/index.json` and searches only relevant JSONL shards, icon work searches
`icons.txt`, and reconciliation uses the accepted document plus story state.
The generic Bash description does not advertise individual context files as an
initialization checklist.

The virtual shell has no host filesystem, `.driftfield`, database, credentials,
network, Node.js, JavaScript, Python, or persistent write access. Main applies
filesystem-size, source-size, command-count, loop, traversal, execution-time,
and output limits. The Renderer never receives filesystem authority.

Local `.index.json` files and Markdown use exact project-relative paths.
Story JSONL records contain stable story entity IDs and path-based manuscript
citations; the index contains only counts and shard paths. No
revision tokens, document IDs, or request IDs are exposed. Main retains
a private snapshot map from paths and story IDs to internal identities and the
revisions represented by that Bash call.

## Mutation authority

Every document, structure, or story mutation requires a successful Bash call
in the same Agent request. Model-facing mutation arguments use:

- exact `manuscript/...` or `lore/...` paths for documents and directories;
- stable IDs from JSONL shards referenced by the latest
  `/context/story/index.json` for existing story entities;
- bounded `@clientRef` aliases only for dependencies created earlier in the
  same atomic story changeset;
- exact icon names listed in `/context/icons.txt`.

Main resolves these values only through the latest private Bash snapshot,
anchors the project, document, content, and story revisions that snapshot
represented, and performs the ordinary revision check during apply. A path or
ID copied from conversation history is not sufficient authority. A mutation
invalidates the snapshot, so dependent work must inspect a fresh snapshot.

Paths must remain below the fixed lowercase `manuscript` or `lore` roots.
Absolute paths, backtracking segments, unregistered files, and wrong-kind
targets fail closed. Stable story IDs are checked against the latest snapshot
before Main calls repositories.

## Story tools

`maintain_story_records` applies one ordered transaction of 1 to 24 low-risk
additive or linking changes to Personae, Chronicle, or Threads. It requires a
fresh index inspection and a focused search of the relevant JSONL shards. Main
validates reference kinds and ordering, applies all or none, records the
mutation ledger, and returns a compact status, revision, and count. It cannot
delete, merge, reorder, edit prose, or run SQL.

`record_story_question` records a deduplicated unresolved ambiguity with
optional manuscript evidence resolved from a project path. It does not change
canonical story records.

`resolve_story_question` accepts only an open question ID present in the latest
open-question JSONL shards, plus the user's explicit answer.

`propose_story_operation` submits a higher-impact story change for review. It
uses the same Bash snapshot anchoring and Main-owned apply path.

## Accepted Manuscript reconciliation

Accepting a Scribe-backed Manuscript proposal creates or restores a durable
reconciliation job bound to the exact persisted document revision. Lore
acceptance does not create this job.

During reconciliation, Bash exposes the persisted accepted prose as
`/context/accepted.md`, its presentation metadata as
`/context/accepted.json`, and current story records as `/context/story/index.json`.
Main rejects completion until the Agent has issued
Bash commands that explicitly address both accepted-document and story files.

`reconcile_accepted_document` is the focused atomic path. It accepts one
depicted event, clearly established new Personae, optional new Threads and
beats, and advances to existing Threads. Main owns source binding, the exact
accepted revision, timeline fallback, ordering, generated IDs, and links. A
successful call closes the durable checkpoint.

`complete_story_reconciliation` closes the checkpoint after non-focused
maintenance, recorded questions, or a verified no-change result. Main verifies
that the declared status matches successful activity in the current request.

## Writing and reviewed project changes

`propose_document_writing` binds a create or replace target before Scribe runs.
Create operations supply a parent path, document kind, metadata title, domain,
objective, requirements, and optional length. Replace operations supply the
exact current document path and are checked against the immutable request-start
draft. Curator binds the target; Scribe owns story-state and relevant prose
research after binding, including Lore subjects not yet represented by a Lore
document. Scribe can inspect the same bounded Bash snapshot and can only return
Markdown through `submit_writing_artifact`.

Main validates the artifact and constructs exactly the pre-bound proposal.
Renderer previews the full Markdown. The user can accept or reject it; generated
prose is never silently persisted. Curator receives only the terminal proposal
status, not a reusable proposal or document reference.

`propose_document_edit` submits direct replacement Markdown for a path from the
latest snapshot. `propose_document_file_operation` creates below an exact
directory path or deletes an exact document path.

`propose_project_structure_operation` can create a volume, create/delete a Lore
category, update a Lore-category icon, move a document, or change its metadata
title. Category creation implicitly targets Lore and does not accept a parent
argument. User-facing default category names come from the UI locale; model
output, filenames, and user-provided names are not localized.

## Contracts and registration

Each tool's `defineTool()` registration is the source of truth for its name,
description, and TypeBox parameter schema. The shared schema and Refine boundary
live in `src/shared/contracts/agent-tool-schema.ts`. Do not create parallel
dispatcher argument tables or duplicate individual tool descriptions in the
system prompt.

Main validates worker envelopes, tool names, arguments, project-session
identity, request state, call count, result size, and timeouts before executing
privileged work. Internal failures become small serializable error contracts.
Tool results are bounded and path-free except for the project-relative paths
the Bash snapshot intentionally exposes.

Versioned prompts under `src/main/ai/prompts/` contain role instructions,
application boundaries, and cross-tool policy. Whenever tools or semantics
change, review `prompt-builder.ts`, update the relevant policy, bump affected
prompt profile versions, and update protocol, dispatcher, lifecycle, and
packaged-worker tests.

## UI audit and history

Renderer receives structured tool-call audit parts for progress and expandable
details. Tool audit is not replayed as trusted context. Ordinary conversation
text remains ordinary text; any path or story ID in earlier narration must be
revalidated through a new Bash snapshot before mutation.

Conversation history stores only currently registered tool names.
