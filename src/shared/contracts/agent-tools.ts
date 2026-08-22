import {
  ACCEPTED_DOCUMENT_PATH,
  PROJECT_BASH_PARAMETERS,
  agentToolArgumentHint,
  isAgentStoryOperation,
  isAgentToolArguments,
} from './agent-tool-schema';

export {
  ACCEPTED_DOCUMENT_PATH,
  PROJECT_BASH_PARAMETERS,
  agentToolArgumentHint,
  isAgentStoryOperation,
  isAgentToolArguments,
};

export interface AgentDraftSnapshot {
  baseRevision: string;
  documentId: string;
  markdown: string;
}

export type AgentDocumentDomain = 'lore' | 'manuscript';

export interface AgentProjectBashResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface AgentAcceptedDocumentReconciliationArguments {
  events: Array<{
    displayTime: string;
    participants: Array<{
      description: string;
      personaId: string;
      role: import('./project-story').ChronicleParticipantRole;
    }>;
    precision: import('./project-story').ChronicleMomentPrecision;
    summary: string;
    title: string;
  }>;
  newPersonae: Array<{
    clientRef: string;
    name: string;
    role: string | null;
    summary: string;
  }>;
  newThreads: Array<{
    beat: {
      description: string;
      desiredOutcome?: string;
      dramaticPurpose?: string;
      kind: import('./project-story').ThreadBeatKind;
      relation: import('./project-story').ThreadEventRelation;
      title: string;
    };
    summary: string;
    threadStatus: import('./project-story').ThreadStatus;
    title: string;
  }>;
  primaryTimeline?: {
    summary: string;
    title: string;
  };
  threadAdvances: Array<{
    description: string;
    desiredOutcome?: string;
    dramaticPurpose?: string;
    kind: import('./project-story').ThreadBeatKind;
    relation: import('./project-story').ThreadEventRelation;
    threadId: string;
    title: string;
  }>;
}

export type AgentProposalToolStatus =
  import('./agent-proposals').AgentProposalOutcomeStatus;

/** Terminal model-facing receipt. The internal proposal identity stays in Main. */
export interface AgentProposalToolResult {
  status: AgentProposalToolStatus;
}

/** The generated Markdown remains out of the Curator context. */
export type AgentDocumentWritingToolResult = AgentProposalToolResult;

export interface AgentStoryMaintenanceToolResult {
  appliedCount: number;
  revision: number;
  status: 'applied';
}

export interface AgentAcceptedDocumentReconciliationToolResult
  extends AgentStoryMaintenanceToolResult {
  reconciliationStatus: 'complete';
}

export interface AgentStoryReconciliationCompletionToolResult {
  status: 'complete';
}

type StoryCreateOperation = Exclude<
  import('./project-story').ProjectStoryOperation,
  { operation: 'link_beat_event' }
>;

type StoryLinkOperation = Extract<
  import('./project-story').ProjectStoryOperation,
  { operation: 'link_beat_event' }
>;

/** Canonical Main-side change, with every provenance revision resolved. */
export type AgentStoryMaintenanceChange =
  | (StoryCreateOperation & { clientRef?: string })
  | StoryLinkOperation;

type CanonicalStoryEventOperation = Extract<
  import('./project-story').ProjectStoryOperation,
  { operation: 'create_event' }
>;

/** A manuscript citation as the model supplies it: which document, not which revision. */
export type AgentStoryEventSourceInput = Omit<
  NonNullable<CanonicalStoryEventOperation['sources']>[number],
  'documentId' | 'documentRevision'
> & { documentPath: string };

export type AgentStoryOperationInput =
  | Exclude<
      import('./project-story').ProjectStoryOperation,
      CanonicalStoryEventOperation
    >
  | (Omit<CanonicalStoryEventOperation, 'sources'> & {
      sources?: AgentStoryEventSourceInput[];
    });

/** Model-facing change. Main resolves citations to a served document revision. */
export type AgentStoryChangeInput =
  | (Exclude<AgentStoryOperationInput, StoryLinkOperation> & {
      clientRef?: string;
    })
  | StoryLinkOperation;

export interface AgentStoryQuestionToolResult {
  questionId: string;
  revision: number;
  status: 'recorded' | 'resolved';
}

/**
 * Model-facing evidence. Main resolves the project path to the document and
 * revision represented by the latest Bash snapshot.
 */
export interface AgentStoryQuestionEvidenceInput {
  anchor: string;
  documentPath: string;
}

export interface AgentStoryQuestionArguments {
  context: string;
  evidence: AgentStoryQuestionEvidenceInput | null;
  kind: import('./project-story').StoryQuestionKind;
  options: string[];
  question: string;
}

export type AgentCanonicalStoryQuestionArguments = Omit<
  AgentStoryQuestionArguments,
  'evidence'
> & { evidence: import('./project-story').StoryQuestionEvidence | null };

export interface AgentWritingArtifactSubmissionToolResult {
  status: 'submitted';
}

export interface AgentDocumentEditArguments {
  documentPath: string;
  markdown: string;
}

export interface AgentDocumentWritingProposalArguments {
  documentAction: 'create' | 'replace';
  documentDomain: AgentDocumentDomain;
  documentPath: string | null;
  kind:
    | 'chapter'
    | 'prologue'
    | 'interlude'
    | 'epilogue'
    | 'appendix'
    | 'entry'
    | null;
  metadataTitle: string | null;
  objective: string;
  parentPath: string | null;
  requirements: string[];
  targetLength: number | null;
}

export type AgentDocumentFileOperationArguments =
  | {
      kind:
        | 'chapter'
        | 'prologue'
        | 'interlude'
        | 'epilogue'
        | 'appendix'
        | 'entry';
      operation: 'create';
      parentPath: string;
      metadataTitle: string;
      markdown: string;
    }
  | {
      documentPath: string;
      operation: 'delete';
    };

export type AgentProjectStructureOperationArguments =
  | {
      operation: 'create_volume';
      title: string;
    }
  | {
      icon: import('./project-layout').ProjectIconId;
      operation: 'create_lore_category';
      title: string;
    }
  | {
      directoryPath: string;
      operation: 'delete_lore_category';
    }
  | {
      directoryPath: string;
      icon: import('./project-layout').ProjectIconId;
      operation: 'set_lore_category_icon';
    }
  | {
      documentPath: string;
      operation: 'move_document';
      targetParentPath: string;
    }
  | {
      documentPath: string;
      metadataTitle: string;
      operation: 'rename_document';
    };

export interface AgentToolContractMap {
  bash: {
    arguments: { command: string };
    result: AgentProjectBashResult;
  };
  submit_writing_artifact: {
    arguments: { markdown: string };
    result: AgentWritingArtifactSubmissionToolResult;
  };
  maintain_story_records: {
    arguments: {
      changes: AgentStoryChangeInput[];
    };
    result: AgentStoryMaintenanceToolResult;
  };
  complete_story_reconciliation: {
    arguments: {
      reason: string;
      status: 'applied' | 'no_changes' | 'questions_recorded';
    };
    result: AgentStoryReconciliationCompletionToolResult;
  };
  reconcile_accepted_document: {
    arguments: AgentAcceptedDocumentReconciliationArguments;
    result: AgentAcceptedDocumentReconciliationToolResult;
  };
  record_story_question: {
    arguments: AgentStoryQuestionArguments;
    result: AgentStoryQuestionToolResult;
  };
  resolve_story_question: {
    arguments: { answer: string; questionId: string };
    result: AgentStoryQuestionToolResult;
  };
  propose_document_edit: {
    arguments: AgentDocumentEditArguments;
    result: AgentProposalToolResult;
  };
  propose_document_writing: {
    arguments: AgentDocumentWritingProposalArguments;
    result: AgentDocumentWritingToolResult;
  };
  propose_document_file_operation: {
    arguments: AgentDocumentFileOperationArguments;
    result: AgentProposalToolResult;
  };
  propose_project_structure_operation: {
    arguments: AgentProjectStructureOperationArguments;
    result: AgentProposalToolResult;
  };
  propose_story_operation: {
    arguments: {
      change: AgentStoryOperationInput;
    };
    result: AgentProposalToolResult;
  };
}

export type AgentToolName = keyof AgentToolContractMap;

export const AGENT_TOOL_NAMES = [
  'bash',
  'submit_writing_artifact',
  'maintain_story_records',
  'complete_story_reconciliation',
  'reconcile_accepted_document',
  'record_story_question',
  'resolve_story_question',
  'propose_document_edit',
  'propose_document_writing',
  'propose_document_file_operation',
  'propose_project_structure_operation',
  'propose_story_operation',
] as const satisfies readonly AgentToolName[];

export const LEGACY_AGENT_TOOL_NAMES = [
  'delegate_writing',
  'revise_writing_artifact',
] as const;

export type LegacyAgentToolName = (typeof LEGACY_AGENT_TOOL_NAMES)[number];
export type AgentToolAuditName = AgentToolName | LegacyAgentToolName;

const LONG_RUNNING_AGENT_TOOL_NAMES = new Set<AgentToolName>([
  'propose_document_edit',
  'propose_document_writing',
  'propose_document_file_operation',
  'propose_project_structure_operation',
  'propose_story_operation',
]);

export const isLongRunningAgentTool = (toolName: AgentToolName): boolean =>
  LONG_RUNNING_AGENT_TOOL_NAMES.has(toolName);

export type AgentToolRequest<
  Name extends AgentToolName = AgentToolName,
> = {
  [ToolName in Name]: {
    arguments: AgentToolContractMap[ToolName]['arguments'];
    toolName: ToolName;
  };
}[Name];

export type AgentToolSuccessResult<
  Name extends AgentToolName = AgentToolName,
> = {
  [ToolName in Name]: {
    data: AgentToolContractMap[ToolName]['result'];
    ok: true;
    toolName: ToolName;
  };
}[Name];

export type AgentToolErrorCode =
  | 'invalid-arguments'
  | 'project-session-changed'
  | 'document-not-found'
  | 'node-not-found'
  | 'node-kind-mismatch'
  | 'selection-too-large'
  | 'document-too-large'
  | 'proposal-base-changed'
  | 'tool-timeout'
  | 'tool-budget-exceeded'
  | 'internal-error';

export const AGENT_TOOL_ERROR_CODES = [
  'invalid-arguments',
  'project-session-changed',
  'document-not-found',
  'node-not-found',
  'node-kind-mismatch',
  'selection-too-large',
  'document-too-large',
  'proposal-base-changed',
  'tool-timeout',
  'tool-budget-exceeded',
  'internal-error',
] as const satisfies readonly AgentToolErrorCode[];

export type AgentToolFailureResult<
  Name extends AgentToolName = AgentToolName,
> = {
  [ToolName in Name]: {
    error: { code: AgentToolErrorCode; detail?: string };
    ok: false;
    toolName: ToolName;
  };
}[Name];

export type AgentToolExecutionResult<
  Name extends AgentToolName = AgentToolName,
> = AgentToolSuccessResult<Name> | AgentToolFailureResult<Name>;

export const isAgentToolName = (value: unknown): value is AgentToolName =>
  typeof value === 'string' &&
  AGENT_TOOL_NAMES.includes(value as AgentToolName);

export const isAgentToolAuditName = (
  value: unknown,
): value is AgentToolAuditName =>
  isAgentToolName(value) ||
  (typeof value === 'string' &&
    LEGACY_AGENT_TOOL_NAMES.includes(value as LegacyAgentToolName));

export const isAgentToolRequest = (value: unknown): value is AgentToolRequest => {
  if (!isRecord(value) || !isAgentToolName(value.toolName)) return false;
  return isAgentToolArguments(value.toolName, value.arguments);
};

export const isAgentToolExecutionResult = (
  value: unknown,
): value is AgentToolExecutionResult => {
  if (!isRecord(value) || !isAgentToolName(value.toolName)) return false;
  if (value.ok === true) return isToolData(value.toolName, value.data);
  if (value.ok !== false || !isRecord(value.error)) return false;
  return (
    typeof value.error.code === 'string' &&
    AGENT_TOOL_ERROR_CODES.includes(value.error.code as AgentToolErrorCode) &&
    (value.error.detail === undefined ||
      (typeof value.error.detail === 'string' && value.error.detail.length <= 1_000))
  );
};

const isToolData = (toolName: AgentToolName, value: unknown): boolean =>
  toolName === 'bash'
    ? isProjectBashResult(value)
    : toolName === 'submit_writing_artifact'
      ? isWritingArtifactSubmissionResult(value)
    : toolName === 'maintain_story_records'
      ? isStoryMaintenanceResult(value)
    : toolName === 'complete_story_reconciliation'
      ? isStoryReconciliationCompletionResult(value)
    : toolName === 'reconcile_accepted_document'
      ? isAcceptedDocumentReconciliationResult(value)
    : toolName === 'record_story_question' || toolName === 'resolve_story_question'
      ? isStoryQuestionResult(value)
    : toolName === 'propose_document_writing'
      ? isDocumentWritingProposalResult(value)
    : toolName === 'propose_document_edit' ||
        toolName === 'propose_document_file_operation' ||
        toolName === 'propose_project_structure_operation' ||
        toolName === 'propose_story_operation'
      ? isEditProposalResult(value)
    : false;

const isProjectBashResult = (
  value: unknown,
): value is AgentProjectBashResult =>
  isRecord(value) &&
  Object.keys(value).every((key) =>
    ['exitCode', 'stderr', 'stdout'].includes(key)) &&
  Number.isInteger(value.exitCode) &&
  typeof value.stderr === 'string' &&
  typeof value.stdout === 'string';

const isWritingArtifactSubmissionResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  value.status === 'submitted';

const isEditProposalResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  typeof value.status === 'string' &&
  ['accepted', 'rejected', 'conflict', 'missing', 'stale', 'failed']
    .includes(value.status);

const isDocumentWritingProposalResult = isEditProposalResult;

const isStoryMaintenanceResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 3 &&
  value.status === 'applied' &&
  Number.isSafeInteger(value.appliedCount) &&
  (value.appliedCount as number) >= 1 &&
  (value.appliedCount as number) <= 24 &&
  Number.isSafeInteger(value.revision) &&
  (value.revision as number) > 0;

const isAcceptedDocumentReconciliationResult = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 4 &&
  value.reconciliationStatus === 'complete' &&
  isStoryMaintenanceResult({
    appliedCount: value.appliedCount,
    revision: value.revision,
    status: value.status,
  });

const isStoryReconciliationCompletionResult = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 1 &&
  value.status === 'complete';

const isStoryQuestionResult = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 3 &&
  (value.status === 'recorded' || value.status === 'resolved') &&
  typeof value.questionId === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.questionId) &&
  Number.isSafeInteger(value.revision) &&
  (value.revision as number) >= 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
