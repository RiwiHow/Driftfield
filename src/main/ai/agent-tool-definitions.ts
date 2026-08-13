import type { AgentToolName } from '../../shared/contracts/agent-tools';
import {
  ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  DOCUMENT_EDIT_PARAMETERS,
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  DOCUMENT_WRITING_PARAMETERS,
  NOVEL_CONTEXT_PARAMETERS,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  RESOLVE_STORY_QUESTION_PARAMETERS,
  STORY_MAINTENANCE_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
  STORY_QUESTION_PARAMETERS,
  STORY_RECONCILIATION_COMPLETION_PARAMETERS,
  WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
} from './agent-tool-parameters';

type AgentToolDefinitionRegistry = {
  [Name in AgentToolName]: {
    description: string;
    executionMode: 'parallel' | 'sequential';
    label: string;
    name: Name;
    parameters: object;
  };
};

/**
 * The model-facing source of truth for Driftfield's native tools.
 * Execution adapters live in the worker, but must spread one of these entries
 * into defineTool() without redefining its model-facing metadata.
 */
export const AGENT_TOOL_DEFINITIONS = {
  read_novel_context: {
    description:
      'Read one bounded, path-free novel-context batch. Select only needed sections or current-request document/directory refs. Refs expire with the request; acquire them from a minimal discovery read, never from user text or history. At most four persisted documents are returned.',
    executionMode: 'parallel',
    label: 'Read novel context',
    name: 'read_novel_context',
    parameters: NOVEL_CONTEXT_PARAMETERS,
  },
  submit_writing_artifact: {
    description:
      'Submit the complete assigned Manuscript or Lore Markdown exactly once. Exclude analysis, planning, commentary, status text, and persistence claims. Ordinary assistant text is not part of the artifact.',
    executionMode: 'sequential',
    label: 'Submit writing artifact',
    name: 'submit_writing_artifact',
    parameters: WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
  },
  maintain_story_records: {
    description:
      'Atomically maintain one ordered changeset of 1 to 24 low-risk additive or linking changes in Personae, Chronicle, or Threads when explicitly requested by the user or unambiguously evidenced by accepted persisted prose. Read story_state first and use its current numeric revision plus its request-scoped entity refs. For a created entity needed by a later change, assign clientRef and reference it later as @clientRef; include the complete dependency graph in this one call. Main resolves references, owns persistent identities, and applies all or none with one story revision. The concise result reports only status, revision, and appliedCount. Never include ambiguity or inference requiring author judgment; record a story question instead. This tool cannot delete, merge, reorder, edit manuscript text, or execute SQL.',
    executionMode: 'sequential',
    label: 'Maintain story records',
    name: 'maintain_story_records',
    parameters: STORY_MAINTENANCE_PARAMETERS,
  },
  complete_story_reconciliation: {
    description:
      'Complete the required reconciliation checkpoint after an accepted Scribe-backed manuscript proposal when reconcile_accepted_document did not already complete it automatically. Call this only after rereading the accepted persisted document and current story state, and after applying every clear low-risk change through ordinary Maintain, recording each material author question, or finding no changes. This does not write story data. Use no_changes only when the checked accepted prose requires no canonical story update.',
    executionMode: 'sequential',
    label: 'Complete story reconciliation',
    name: 'complete_story_reconciliation',
    parameters: STORY_RECONCILIATION_COMPLETION_PARAMETERS,
  },
  reconcile_accepted_document: {
    description:
      'Atomically reconcile the Chronicle event depicted by the accepted Scribe-backed manuscript document, including clearly established new Personae, optional new Threads with their first linked beat, and advances to existing Threads. First read accepted_reconciliation. Existing entities use its refs; new Personae declare clientRef and event participants reference them as @clientRef in this same call. If no primary timeline exists, optionally supply its semantic title and summary or let Main create a neutral default. Main owns the accepted source/revision, story revision, timeline fallback, moments, ordering, IDs, links, and successful checkpoint completion. Use ordinary Maintain only for shapes this focused tool cannot represent.',
    executionMode: 'sequential',
    label: 'Reconcile accepted document',
    name: 'reconcile_accepted_document',
    parameters: ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  },
  record_story_question: {
    description:
      'Record one unresolved author question without changing canonical Personae, Chronicle, or Threads. Use this for possible aliases, uncertain fictional time, unclear relationships, contradictions, or another ambiguity whose answer materially affects canonical records. An intentionally unnamed character, omitted background detail, or unknown fact that does not block a faithful record is not by itself a question. Read story state first, do not duplicate an existing open question, and attach exact evidence when available. After accepted_reconciliation, use evidence sourceRef document:accepted so Main binds the persisted document ID and revision. Options are suggestions, not decisions.',
    executionMode: 'sequential',
    label: 'Record story question',
    name: 'record_story_question',
    parameters: STORY_QUESTION_PARAMETERS,
  },
  resolve_story_question: {
    description:
      "Resolve an existing open story question only from the user's explicit answer. Read story_state with read_novel_context first and pass its request-scoped question ref with a concise faithful answer. Resolving the question does not itself mutate Personae, Chronicle, or Threads; apply any now-unambiguous low-risk record change separately with maintain_story_records.",
    executionMode: 'sequential',
    label: 'Resolve story question',
    name: 'resolve_story_question',
    parameters: RESOLVE_STORY_QUESTION_PARAMETERS,
  },
  propose_document_edit: {
    description:
      'Submit a direct complete replacement for the current document as a reviewable proposal. Supply the complete Markdown. Generated Scribe prose must use propose_document_writing so its target is frozen before generation. This never writes without explicit acceptance.',
    executionMode: 'sequential',
    label: 'Propose document edit',
    name: 'propose_document_edit',
    parameters: DOCUMENT_EDIT_PARAMETERS,
  },
  propose_document_writing: {
    description:
      'Commission Scribe and submit exactly one pre-bound reviewed document proposal. Use create for every new chapter or Lore entry, with its parent directory, raw title, kind, and project revision; an existing chapter read for continuity is not the target. Use replace only when the user explicitly asked to replace that exact current document, with its request-start revisions. Main validates the entire target plan before Scribe runs and cannot rebind the artifact afterward. An accepted result authoritatively means the exact validated artifact was persisted and returns request-scoped document and content-revision refs for optional in-scope follow-up; omission of the full Markdown is intentional, not uncertainty.',
    executionMode: 'sequential',
    label: 'Propose generated document',
    name: 'propose_document_writing',
    parameters: DOCUMENT_WRITING_PARAMETERS,
  },
  propose_document_file_operation: {
    description:
      'Submit a direct reviewable proposal to create a supplied Markdown document under a directory ref or delete a document by ref. Read structure first and reuse its request-scoped project revision ref. For creation, pass the raw metadataTitle without generated numbering and the complete Markdown; displayTitle is read-only context. Generated Scribe prose must use propose_document_writing. Before deletion, read the target and reuse its baseRevision ref. This never changes files without explicit acceptance.',
    executionMode: 'sequential',
    label: 'Propose document creation or deletion',
    name: 'propose_document_file_operation',
    parameters: DOCUMENT_FILE_OPERATION_PARAMETERS,
  },
  propose_project_structure_operation: {
    description:
      "Submit a reviewable proposal to create a manuscript volume, create a lore category with an approved icon, delete an empty lore category, move a document, or rename a document's metadata title without changing its physical filename. Read structure first and reuse its request-scoped project revision ref. Use only document and directory refs returned in this request. Before moving, read the document and reuse its baseRevision ref. Delete lore documents before deleting their now-empty category. This never changes project structure without explicit acceptance. The tool call waits for the user's decision; after acceptance, continue only the user's existing requested scope.",
    executionMode: 'sequential',
    label: 'Propose project structure change',
    name: 'propose_project_structure_operation',
    parameters: PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  },
  propose_story_operation: {
    description:
      'Submit one additive or linking Personae, Chronicle, or Threads change for explicit human review when the user asks to inspect a structured change before it is applied. Do not use this for routine synchronization of clear facts from accepted prose; use maintain_story_records for those. Do not turn ambiguity into a proposal; record a story question instead. The tool waits for the decision and never writes story state before review.',
    executionMode: 'sequential',
    label: 'Propose story record change',
    name: 'propose_story_operation',
    parameters: STORY_OPERATION_PARAMETERS,
  },
} as const satisfies AgentToolDefinitionRegistry;
