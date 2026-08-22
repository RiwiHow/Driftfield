import type { AgentToolName } from '../../shared/contracts/agent-tools';
import {
  ACCEPTED_DOCUMENT_PATH,
  AGENT_DIRECTORY_INDEX_NAME,
  AGENT_ICON_CONTEXT_PATH,
  AGENT_STORY_CONTEXT_PATH,
  ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  DOCUMENT_EDIT_PARAMETERS,
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  DOCUMENT_WRITING_PARAMETERS,
  PROJECT_BASH_PARAMETERS,
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
  bash: {
    description:
      'Inspect only the context needed for the current request. The fresh disposable /project filesystem contains registered Manuscript and Lore directories and Markdown; application metadata may be available under /context when a selected domain tool explicitly requires it. The filesystem has no .driftfield data, unregistered files, host paths, network, credentials, JavaScript, Python, or persistent writes. Run a new call after an accepted mutation before dependent work.',
    executionMode: 'parallel',
    label: 'Inspect project with Bash',
    name: 'bash',
    parameters: PROJECT_BASH_PARAMETERS,
  },
  submit_writing_artifact: {
    description:
      `Submit the complete assigned Manuscript or Lore Markdown exactly once. Before writing Lore, inspect ${AGENT_STORY_CONTEXT_PATH} and search only relevant registered Manuscript and Lore Markdown for the named subject; an empty target Lore directory means only that its document does not exist yet. For Manuscript, inspect only context needed for continuity. Exclude analysis, planning, commentary, status text, and persistence claims. Ordinary assistant text is not part of the artifact.`,
    executionMode: 'sequential',
    label: 'Submit writing artifact',
    name: 'submit_writing_artifact',
    parameters: WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
  },
  maintain_story_records: {
    description:
      `Atomically maintain one ordered changeset of 1 to 24 low-risk additive or linking changes in Personae, Chronicle, or Threads when explicitly requested by the user or unambiguously evidenced by accepted persisted prose. Inspect ${AGENT_STORY_CONTEXT_PATH} with Bash first and use its stable entity IDs. For a created entity needed by a later change, assign clientRef and reference it later as @clientRef; include the complete dependency graph in this one call. Main resolves references, owns persistent identities and revisions, and applies all or none with one story revision. The concise result reports only status, revision, and appliedCount. Never include ambiguity or inference requiring author judgment; record a story question instead. This tool cannot delete, merge, reorder, edit manuscript text, or execute SQL.`,
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
      `Atomically reconcile the Chronicle event depicted by ${ACCEPTED_DOCUMENT_PATH}. Run Bash first and use stable Persona and Thread IDs from ${AGENT_STORY_CONTEXT_PATH}; new Personae declare clientRef and participants reference them as @clientRef in the same call. Main owns the accepted source revision, story revision, ordering, IDs, links, and checkpoint completion.`,
    executionMode: 'sequential',
    label: 'Reconcile accepted document',
    name: 'reconcile_accepted_document',
    parameters: ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  },
  record_story_question: {
    description:
      `Record one unresolved author question without changing canonical story records. Run Bash first, avoid duplicating an open question from ${AGENT_STORY_CONTEXT_PATH}, and cite an exact project-relative manuscript path or ${ACCEPTED_DOCUMENT_PATH} when evidence exists.`,
    executionMode: 'sequential',
    label: 'Record story question',
    name: 'record_story_question',
    parameters: STORY_QUESTION_PARAMETERS,
  },
  resolve_story_question: {
    description:
      `Resolve an existing open story question only from the user's explicit answer. Run Bash first and pass the stable question ID from ${AGENT_STORY_CONTEXT_PATH} with a concise faithful answer.`,
    executionMode: 'sequential',
    label: 'Resolve story question',
    name: 'resolve_story_question',
    parameters: RESOLVE_STORY_QUESTION_PARAMETERS,
  },
  propose_document_edit: {
    description:
      'Submit a direct complete replacement for the current document as a reviewable proposal. Read the document in this request first, then supply the complete Markdown. Generated Scribe prose must use propose_document_writing so its target is frozen before generation. This never writes without explicit acceptance.',
    executionMode: 'sequential',
    label: 'Propose document edit',
    name: 'propose_document_edit',
    parameters: DOCUMENT_EDIT_PARAMETERS,
  },
  propose_document_writing: {
    description:
      `Commission Scribe and submit exactly one pre-bound reviewed document proposal. Curator inspects only enough structure to bind the target: for create, the exact parent directory and its nearest ${AGENT_DIRECTORY_INDEX_NAME}; for replace, the exact current document. Do not preflight character, event, setting, or prose continuity and do not infer missing source material from an empty target directory—Scribe owns story-state and relevant Markdown research after Main binds the target. Put the user's requested subject and output requirements in the assignment. Create uses the exact parentPath, raw title, and kind; replace uses the exact current documentPath. Main binds the latest snapshot revisions before Scribe runs and cannot rebind the artifact afterward.`,
    executionMode: 'sequential',
    label: 'Propose generated document',
    name: 'propose_document_writing',
    parameters: DOCUMENT_WRITING_PARAMETERS,
  },
  propose_document_file_operation: {
    description:
      'Submit a direct reviewable proposal to create supplied Markdown under parentPath or delete documentPath. Run Bash first; Main anchors project and document revisions from that snapshot. Generated Scribe prose must use propose_document_writing.',
    executionMode: 'sequential',
    label: 'Propose document creation or deletion',
    name: 'propose_document_file_operation',
    parameters: DOCUMENT_FILE_OPERATION_PARAMETERS,
  },
  propose_project_structure_operation: {
    description:
      `Submit a reviewable project-structure proposal using exact project-relative paths from the latest Bash snapshot. Read only the nearest ${AGENT_DIRECTORY_INDEX_NAME} needed to map display titles, icons, or explicit child order; only for category creation or icon changes, search ${AGENT_ICON_CONTEXT_PATH} with rg or grep and use one exact name. Creating a volume or Lore category targets its root implicitly. Main owns identities, revision checks, and persistence.`,
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
