import {
  ACCEPTED_DOCUMENT_REFERENCE,
  AGENT_NOVEL_CONTEXT_SECTIONS,
  agentToolArgumentHint,
  isAgentStoryOperation,
  isAgentToolArguments,
} from './agent-tool-schema';
import { isProjectStorySnapshot } from './project-story';
import { PROJECT_ICON_IDS } from './project-layout';

export {
  ACCEPTED_DOCUMENT_REFERENCE,
  AGENT_NOVEL_CONTEXT_SECTIONS,
  agentToolArgumentHint,
  isAgentStoryOperation,
  isAgentToolArguments,
};

const isProjectIcon = (
  value: unknown,
): value is import('./project-layout').ProjectIconId =>
  typeof value === 'string' &&
  PROJECT_ICON_IDS.includes(value as import('./project-layout').ProjectIconId);

export interface AgentDraftSnapshot {
  baseRevision: string;
  documentId: string;
  markdown: string;
}

export type AgentDocumentDomain = 'lore' | 'manuscript';

/** Main-internal document read. Revisions never reach the model. */
export interface AgentDocumentToolResult {
  baseRevision: string;
  contentRevision: string;
  displayTitle: string;
  documentId: string;
  markdown: string;
  metadataTitle: string;
  source: 'disk' | 'draft';
}

/**
 * Model-facing document context. Main keeps the disk and content revisions in
 * its own request anchors, so the model never echoes a concurrency token back.
 */
export type AgentDocumentContext = Omit<
  AgentDocumentToolResult,
  'baseRevision' | 'contentRevision'
>;

export interface AgentStructureDocument {
  displayTitle: string;
  id: string;
  kind:
    | 'chapter'
    | 'prologue'
    | 'interlude'
    | 'epilogue'
    | 'appendix'
    | 'entry';
  metadataTitle: string;
  revision?: string;
  type: 'document';
}

export interface AgentStructureDirectory {
  children: AgentStructureNode[];
  id: string;
  icon?: import('./project-layout').ProjectIconId;
  kind: 'manuscript' | 'volume' | 'lore' | 'category';
  title: string;
  type: 'directory';
}

export type AgentStructureNode =
  | AgentStructureDirectory
  | AgentStructureDocument;

/** Main-internal structure read. `revision` fields stay on the Main side. */
export interface AgentNovelStructureToolResult {
  availableIcons: import('./project-layout').ProjectIconId[];
  format: 'driftfield';
  lore?: AgentStructureDirectory;
  manuscript: AgentStructureDirectory;
  project: {
    id: string;
    revision: string;
    title: string;
  };
}

/** Model-facing structure. Node and project revisions are omitted. */
export interface AgentNovelStructureContext
  extends Omit<AgentNovelStructureToolResult, 'project'> {
  project: {
    id: string;
    title: string;
  };
}

export type AgentNovelContextSection =
  (typeof AGENT_NOVEL_CONTEXT_SECTIONS)[number];

export interface AgentNovelContextToolResult {
  currentDocument?: AgentDocumentContext | null;
  documents: AgentDocumentContext[];
  reconciliation?: AgentAcceptedReconciliationContext;
  storyState?: AgentStoryStateContext;
  structure?: AgentNovelStructureContext;
}

/**
 * Model-facing story state. Provenance revisions are dropped because they are
 * Main-side concurrency tokens rather than authorial information.
 */
export type AgentStoryStateContext = Omit<
  import('./project-story').ProjectStorySnapshot,
  'eventSources' | 'questions'
> & {
  eventSources: Array<
    Omit<import('./project-story').ChronicleEventSource, 'documentRevision'>
  >;
  questions: Array<
    Omit<import('./project-story').StoryQuestion, 'evidence'> & {
      evidence: AgentStoryQuestionEvidenceContext | null;
    }
  >;
};

export interface AgentStoryQuestionEvidenceContext {
  anchor: string;
  documentId: string;
  sourceKind: 'manuscript';
}

export interface AgentAcceptedReconciliationContext {
  acceptedDocument: {
    displayTitle: string;
    markdown: string;
    metadataTitle: string;
    ref: 'document:accepted';
  };
  chronicle: Array<{
    displayTime: string;
    participants: string[];
    status: import('./project-story').ChronicleEventStatus;
    summary: string;
    title: string;
  }>;
  personae: Array<{
    name: string;
    ref: string;
    role: string | null;
    summary: string;
  }>;
  primaryTimeline: {
    ref: 'timeline:primary';
    summary: string;
    title: string;
  } | null;
  questions: Array<{
    context: string;
    kind: import('./project-story').StoryQuestionKind;
    options: string[];
    question: string;
  }>;
  storyRef: 'story:accepted';
  threads: Array<{
    beats: Array<{
      description: string;
      kind: import('./project-story').ThreadBeatKind;
      status: import('./project-story').ThreadStatus;
      title: string;
    }>;
    ref: string;
    status: import('./project-story').ThreadStatus;
    summary: string;
    title: string;
  }>;
}

export interface AgentAcceptedDocumentReconciliationArguments {
  events: Array<{
    displayTime: string;
    participants: Array<{
      description: string;
      personaRef: string;
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
    threadRef: string;
    title: string;
  }>;
}

export type AgentProposalToolStatus =
  import('./agent-proposals').AgentProposalOutcomeStatus;

/** Terminal model-facing receipt. The internal proposal identity stays in Main. */
export interface AgentProposalToolResult {
  status: AgentProposalToolStatus;
}

/**
 * Accepted generated writing exposes only the persisted artifact refs needed by
 * an optional in-scope follow-up. The generated Markdown remains out of the
 * Curator context.
 */
export type AgentDocumentWritingToolResult =
  | {
      documentId: string;
      status: 'accepted';
    }
  | {
      status: Exclude<AgentProposalToolStatus, 'accepted'>;
    };

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
  'documentRevision'
>;

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
 * Model-facing evidence. `documentId` is a served document ref or the accepted
 * reconciliation document; Main binds the revision it served for it.
 */
export interface AgentStoryQuestionEvidenceInput {
  anchor: string;
  documentId: string;
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
  documentId: string;
  markdown: string;
}

export interface AgentDocumentWritingProposalArguments {
  documentAction: 'create' | 'replace';
  documentDomain: AgentDocumentDomain;
  documentId: string | null;
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
  parentId: string | null;
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
      parentId: string;
      metadataTitle: string;
      markdown: string;
    }
  | {
      documentId: string;
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
      directoryId: string;
      operation: 'delete_lore_category';
    }
  | {
      documentId: string;
      operation: 'move_document';
      targetParentId: string;
    }
  | {
      documentId: string;
      metadataTitle: string;
      operation: 'rename_document';
    };

export interface AgentToolContractMap {
  read_novel_context: {
    arguments: {
      directoryIds: string[];
      documentIds: string[];
      include: AgentNovelContextSection[];
    };
    result: AgentNovelContextToolResult;
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
  'read_novel_context',
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
  'get_novel_structure',
  'get_current_document',
  'get_document',
  'get_story_state',
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
  | 'expired-request-reference'
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
  'expired-request-reference',
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
  toolName === 'submit_writing_artifact'
      ? isWritingArtifactSubmissionResult(value)
    : toolName === 'read_novel_context'
      ? isNovelContextResult(value)
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

const isNovelContextResult = (
  value: unknown,
): value is AgentNovelContextToolResult =>
  isRecord(value) &&
  Object.keys(value).every((key) =>
    [
      'currentDocument',
      'documents',
      'reconciliation',
      'storyState',
      'structure',
    ].includes(key)) &&
  Array.isArray(value.documents) && value.documents.length <= 4 &&
  value.documents.every(isDocumentResult) &&
  (value.currentDocument === undefined || value.currentDocument === null ||
    isDocumentResult(value.currentDocument)) &&
  (value.reconciliation === undefined ||
    isAcceptedReconciliationContext(value.reconciliation)) &&
  (value.storyState === undefined || isAgentStorySnapshot(value.storyState)) &&
  (value.structure === undefined || isNovelStructureResult(value.structure));

const isAgentStorySnapshot = (value: unknown): boolean => {
  if (!isRecord(value) || !Array.isArray(value.eventSources) ||
    !Array.isArray(value.questions)) return false;
  if (value.eventSources.some((source) =>
    isRecord(source) && source.documentRevision !== undefined)) return false;
  if (value.questions.some((question) => isRecord(question) &&
    isRecord(question.evidence) &&
    question.evidence.documentRevision !== undefined)) return false;
  const canonical = {
    ...value,
    eventSources: value.eventSources.map((source) => isRecord(source)
      ? { ...source, documentRevision: PLACEHOLDER_REVISION }
      : source),
    questions: value.questions.map((question) => {
      if (!isRecord(question) || !isRecord(question.evidence)) return question;
      return {
        ...question,
        evidence: {
          ...question.evidence,
          documentRevision: PLACEHOLDER_REVISION,
        },
      };
    }),
  };
  if (!isProjectStorySnapshot(canonical)) return false;
  const story = value as unknown as AgentStoryStateContext;
  return story.personae.every(({ id }) =>
    isRequestReferenceOfKind(id, 'persona')) &&
    story.timelines.every(({ id }) =>
      isRequestReferenceOfKind(id, 'timeline')) &&
    story.moments.every(({ id, timelineId }) =>
      isRequestReferenceOfKind(id, 'moment') &&
      isRequestReferenceOfKind(timelineId, 'timeline')) &&
    story.events.every(({ endMomentId, id, startMomentId, timelineId }) =>
      isRequestReferenceOfKind(id, 'event') &&
      isRequestReferenceOfKind(timelineId, 'timeline') &&
      isRequestReferenceOfKind(startMomentId, 'moment') &&
      (endMomentId === null ||
        isRequestReferenceOfKind(endMomentId, 'moment'))) &&
    story.eventParticipants.every(({ eventId, personaId }) =>
      isRequestReferenceOfKind(eventId, 'event') &&
      isRequestReferenceOfKind(personaId, 'persona')) &&
    story.eventSources.every((source) =>
      isRequestReferenceOfKind(source.id, 'request') &&
      isRequestReferenceOfKind(source.eventId, 'event') &&
      isRequestReferenceOfKind(source.documentId, 'document')) &&
    story.threads.every(({ id, parentId }) =>
      isRequestReferenceOfKind(id, 'thread') &&
      (parentId === null || isRequestReferenceOfKind(parentId, 'thread'))) &&
    story.beats.every(({ id, parentId, threadId }) =>
      isRequestReferenceOfKind(id, 'beat') &&
      isRequestReferenceOfKind(threadId, 'thread') &&
      (parentId === null || isRequestReferenceOfKind(parentId, 'beat'))) &&
    story.eventLinks.every(({ eventId, threadBeatId }) =>
      isRequestReferenceOfKind(eventId, 'event') &&
      isRequestReferenceOfKind(threadBeatId, 'beat')) &&
    story.questions.every(({ evidence, id, originRequestId }) =>
      isRequestReferenceOfKind(id, 'question') &&
      isRequestReferenceOfKind(originRequestId, 'request') &&
      (evidence === null ||
        isRequestReferenceOfKind(evidence.documentId, 'document')));
};

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

const isDocumentWritingProposalResult = (value: unknown): boolean => {
  if (!isRecord(value) || typeof value.status !== 'string') return false;
  if (value.status === 'accepted') {
    return Object.keys(value).length === 2 &&
      isRequestReferenceOfKind(value.documentId, 'document');
  }
  return Object.keys(value).length === 1 &&
    ['rejected', 'conflict', 'missing', 'stale', 'failed'].includes(value.status);
};

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

const isAcceptedReconciliationContext = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 7 &&
  value.storyRef === 'story:accepted' &&
  isRecord(value.acceptedDocument) &&
  value.acceptedDocument.ref === 'document:accepted' &&
  isBoundedText(value.acceptedDocument.displayTitle, 500, false) &&
  isBoundedText(value.acceptedDocument.metadataTitle, 500, false) &&
  typeof value.acceptedDocument.markdown === 'string' &&
  Array.isArray(value.personae) &&
  value.personae.every((persona) => isRecord(persona) &&
    isRequestReferenceOfKind(persona.ref, 'persona') &&
    isBoundedText(persona.name, 500, false)) &&
  Array.isArray(value.chronicle) &&
  value.chronicle.every((event) => isRecord(event) &&
    isBoundedText(event.title, 500, false) &&
    isBoundedText(event.summary, 30_000, true)) &&
  Array.isArray(value.threads) &&
  value.threads.every((thread) => isRecord(thread) &&
    isRequestReferenceOfKind(thread.ref, 'thread') &&
    isBoundedText(thread.title, 500, false) &&
    Array.isArray(thread.beats)) &&
  Array.isArray(value.questions) &&
  (value.primaryTimeline === null ||
    (isRecord(value.primaryTimeline) &&
      value.primaryTimeline.ref === 'timeline:primary'));

const isStoryQuestionResult = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 3 &&
  (value.status === 'recorded' || value.status === 'resolved') &&
  isRequestReferenceOfKind(value.questionId, 'question') &&
  Number.isSafeInteger(value.revision) &&
  (value.revision as number) >= 0;

const isBoundedText = (
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): value is string => typeof value === 'string' && value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const isRequestReference = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z]+:[1-9][0-9]{0,4}$/u.test(value);

const isRequestReferenceOfKind = (
  value: unknown,
  kind: string,
): value is string => typeof value === 'string' &&
  value.startsWith(`${kind}:`) && isRequestReference(value);

/**
 * Stands in for the content revision Main binds after validation, so exposed
 * and model-supplied shapes can reuse the canonical story validators.
 */
const PLACEHOLDER_REVISION = 'a'.repeat(64);

const isDocumentResult = (value: unknown): value is AgentDocumentContext =>
  isRecord(value) &&
  typeof value.displayTitle === 'string' &&
  isRequestReferenceOfKind(value.documentId, 'document') &&
  typeof value.markdown === 'string' &&
  typeof value.metadataTitle === 'string' &&
  (value.source === 'disk' || value.source === 'draft') &&
  Object.keys(value).length === 5;

const isNovelStructureResult = (
  value: unknown,
): value is AgentNovelStructureContext => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.availableIcons) ||
    value.availableIcons.length !== PROJECT_ICON_IDS.length ||
    !value.availableIcons.every(isProjectIcon) ||
    new Set(value.availableIcons).size !== value.availableIcons.length ||
    value.format !== 'driftfield' ||
    !isRecord(value.project) ||
    Object.keys(value.project).length !== 2 ||
    !isRequestReferenceOfKind(value.project.id, 'project') ||
    typeof value.project.title !== 'string'
  ) {
    return false;
  }
  const state = { nodes: 0 };
  return (
    isStructureDirectory(value.manuscript, 0, state) &&
    (value.lore === undefined ||
      isStructureDirectory(value.lore, 0, state))
  );
};

const isStructureDirectory = (
  value: unknown,
  depth: number,
  state: { nodes: number },
): value is AgentStructureDirectory => {
  if (
    depth > 16 ||
    !isRecord(value) ||
    value.type !== 'directory' ||
    typeof value.title !== 'string' ||
    !isRequestReferenceOfKind(value.id, 'directory') ||
    (value.icon !== undefined && !isProjectIcon(value.icon)) ||
    ![
      'manuscript',
      'volume',
      'lore',
      'category',
    ].includes(value.kind as string) ||
    !Array.isArray(value.children)
  ) {
    return false;
  }
  return value.children.every((child) => {
    state.nodes += 1;
    return state.nodes <= 10_000 && isStructureNode(child, depth + 1, state);
  });
};

const isStructureNode = (
  value: unknown,
  depth: number,
  state: { nodes: number },
): value is AgentStructureNode => {
  if (!isRecord(value)) return false;
  if (value.type === 'directory') {
    return isStructureDirectory(value, depth, state);
  }
  return (
    value.type === 'document' &&
    isRequestReferenceOfKind(value.id, 'document') &&
    typeof value.displayTitle === 'string' &&
    typeof value.metadataTitle === 'string' &&
    value.revision === undefined &&
    [
      'chapter',
      'prologue',
      'interlude',
      'epilogue',
      'appendix',
      'entry',
    ].includes(value.kind as string)
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
