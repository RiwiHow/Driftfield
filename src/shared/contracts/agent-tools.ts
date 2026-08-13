import {
  isProjectStoryOperation,
  isProjectStorySnapshot,
} from './project-story';
import { PROJECT_ICON_IDS } from './project-layout';

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

export interface AgentDocumentToolResult {
  baseRevision: string;
  contentRevision: string;
  displayTitle: string;
  documentId: string;
  markdown: string;
  metadataTitle: string;
  source: 'disk' | 'draft';
}

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

export const AGENT_NOVEL_CONTEXT_SECTIONS = [
  'structure',
  'current_document',
  'story_state',
  'accepted_reconciliation',
] as const;

export type AgentNovelContextSection =
  (typeof AGENT_NOVEL_CONTEXT_SECTIONS)[number];

export interface AgentNovelContextToolResult {
  currentDocument?: AgentDocumentToolResult | null;
  documents: AgentDocumentToolResult[];
  reconciliation?: AgentAcceptedReconciliationContext;
  storyState?: import('./project-story').ProjectStorySnapshot;
  structure?: AgentNovelStructureToolResult;
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

export interface AgentProposalToolResult {
  proposalId: string;
  status: 'accepted' | 'rejected' | 'conflict' | 'missing' | 'stale' | 'failed';
}

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

export type AgentStoryMaintenanceChange =
  | (StoryCreateOperation & { clientRef?: string })
  | Extract<
      import('./project-story').ProjectStoryOperation,
      { operation: 'link_beat_event' }
    >;

export interface AgentStoryQuestionToolResult {
  questionId: string;
  revision: number;
  status: 'recorded' | 'resolved';
}

export type AgentStoryQuestionEvidence =
  | import('./project-story').StoryQuestionEvidence
  | { anchor: string; sourceRef: 'document:accepted' };

export interface AgentStoryQuestionArguments {
  context: string;
  evidence: AgentStoryQuestionEvidence | null;
  kind: import('./project-story').StoryQuestionKind;
  options: string[];
  question: string;
}

export type AgentCanonicalStoryQuestionArguments = Omit<
  AgentStoryQuestionArguments,
  'evidence'
> & { evidence: import('./project-story').StoryQuestionEvidence | null };

export interface AgentWritingAssignment {
  documentAction: 'create' | 'replace';
  documentDomain: AgentDocumentDomain;
  objective: string;
  requirements: string[];
  targetDocumentId: string | null;
  targetLength: number | null;
}

export interface AgentWritingAssignmentToolResult {
  assignmentId: string;
  characterCount: number;
  documentAction: 'create' | 'replace';
  documentDomain: AgentDocumentDomain;
  status: 'completed';
}

export interface AgentWritingArtifactSubmissionToolResult {
  status: 'submitted';
}

export interface AgentWritingArtifactReplacement {
  expectedOccurrences: number;
  find: string;
  replace: string;
}

export interface AgentWritingArtifactRevisionToolResult {
  assignmentId: string;
  replacementsApplied: number;
  status: 'revised';
}

type AgentDocumentContentSource =
  | { markdown: string; writingAssignmentId: null }
  | { markdown: null; writingAssignmentId: string };

export type AgentDocumentEditArguments = {
  baseContentRevision: string;
  baseRevision: string;
  documentId: string;
} & AgentDocumentContentSource;

export interface AgentDocumentWritingProposalArguments {
  baseContentRevision: string | null;
  baseRevision: string | null;
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
  projectRevision: string | null;
  requirements: string[];
  targetLength: number | null;
}

export type AgentDocumentFileOperationArguments =
  | ({
      kind:
        | 'chapter'
        | 'prologue'
        | 'interlude'
        | 'epilogue'
        | 'appendix'
        | 'entry';
      operation: 'create';
      parentId: string;
      projectRevision: string;
      metadataTitle: string;
    } & AgentDocumentContentSource)
  | {
      baseRevision: string;
      documentId: string;
      operation: 'delete';
      projectRevision: string;
    };

export type AgentProjectStructureOperationArguments =
  | {
      operation: 'create_volume';
      projectRevision: string;
      title: string;
    }
  | {
      icon: import('./project-layout').ProjectIconId;
      operation: 'create_lore_category';
      projectRevision: string;
      title: string;
    }
  | {
      directoryId: string;
      operation: 'delete_lore_category';
      projectRevision: string;
    }
  | {
      baseRevision: string;
      documentId: string;
      operation: 'move_document';
      projectRevision: string;
      targetParentId: string;
    }
  | {
      documentId: string;
      metadataTitle: string;
      operation: 'rename_document';
      projectRevision: string;
    };

export interface AgentToolContractMap {
  delegate_writing: {
    arguments: AgentWritingAssignment;
    result: AgentWritingAssignmentToolResult;
  };
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
  revise_writing_artifact: {
    arguments: {
      replacements: AgentWritingArtifactReplacement[];
      writingAssignmentId: string;
    };
    result: AgentWritingArtifactRevisionToolResult;
  };
  maintain_story_records: {
    arguments: {
      changes: AgentStoryMaintenanceChange[];
      storyRevision: number;
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
    result: AgentProposalToolResult;
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
      change: import('./project-story').ProjectStoryOperation;
      storyRevision: number;
    };
    result: AgentProposalToolResult;
  };
}

export type AgentToolName = keyof AgentToolContractMap;

export const AGENT_TOOL_NAMES = [
  'delegate_writing',
  'read_novel_context',
  'submit_writing_artifact',
  'revise_writing_artifact',
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
  'get_novel_structure',
  'get_current_document',
  'get_document',
  'get_story_state',
] as const;

export type LegacyAgentToolName = (typeof LEGACY_AGENT_TOOL_NAMES)[number];
export type AgentToolAuditName = AgentToolName | LegacyAgentToolName;

const LONG_RUNNING_AGENT_TOOL_NAMES = new Set<AgentToolName>([
  'delegate_writing',
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

export const isAgentToolArguments = <Name extends AgentToolName>(
  toolName: Name,
  value: unknown,
): value is AgentToolContractMap[Name]['arguments'] => {
  if (!isRecord(value)) return false;
  if (toolName === 'delegate_writing') {
    return (
      Object.keys(value).length === 6 &&
      (value.documentAction === 'create' || value.documentAction === 'replace') &&
      (value.documentDomain === 'lore' || value.documentDomain === 'manuscript') &&
      isBoundedText(value.objective, 4_000, false) &&
      Array.isArray(value.requirements) &&
      value.requirements.length <= 20 &&
      value.requirements.every((requirement) =>
        isBoundedText(requirement, 1_000, false)) &&
      ((value.documentAction === 'create' && value.targetDocumentId === null) ||
        (value.documentAction === 'replace' && isDocumentId(value.targetDocumentId))) &&
      (value.targetLength === null ||
        (Number.isSafeInteger(value.targetLength) &&
          (value.targetLength as number) >= 1 &&
          (value.targetLength as number) <= 200_000))
    );
  }
  if (toolName === 'propose_document_writing') {
    if (
      Object.keys(value).length !== 12 ||
      (value.documentAction !== 'create' && value.documentAction !== 'replace') ||
      (value.documentDomain !== 'lore' && value.documentDomain !== 'manuscript') ||
      !isBoundedText(value.objective, 4_000, false) ||
      !Array.isArray(value.requirements) ||
      value.requirements.length > 20 ||
      !value.requirements.every((requirement) =>
        isBoundedText(requirement, 1_000, false)) ||
      !(value.targetLength === null ||
        (Number.isSafeInteger(value.targetLength) &&
          (value.targetLength as number) >= 1 &&
          (value.targetLength as number) <= 200_000))
    ) return false;
    if (value.documentAction === 'create') {
      return value.baseContentRevision === null &&
        value.baseRevision === null && value.documentId === null &&
        isDocumentId(value.parentId) && isRevision(value.projectRevision) &&
        isValidMetadataTitle(value.metadataTitle) &&
        typeof value.kind === 'string' &&
        ['chapter', 'prologue', 'interlude', 'epilogue', 'appendix', 'entry']
          .includes(value.kind);
    }
    return isRevision(value.baseContentRevision) &&
      isRevision(value.baseRevision) && isDocumentId(value.documentId) &&
      value.kind === null && value.metadataTitle === null &&
      value.parentId === null && value.projectRevision === null;
  }
  if (toolName === 'submit_writing_artifact') {
    return (
      Object.keys(value).length === 1 &&
      typeof value.markdown === 'string' &&
      value.markdown.trim().length > 0 &&
      new TextEncoder().encode(value.markdown).byteLength <= 512 * 1024
    );
  }
  if (toolName === 'revise_writing_artifact') {
    return (
      Object.keys(value).length === 2 &&
      isDocumentId(value.writingAssignmentId) &&
      Array.isArray(value.replacements) &&
      value.replacements.length >= 1 &&
      value.replacements.length <= 12 &&
      value.replacements.every(isWritingArtifactReplacement)
    );
  }
  if (toolName === 'propose_document_edit') {
    return (
      Object.keys(value).length === 5 &&
      isDocumentId(value.documentId) &&
      isRevision(value.baseRevision) &&
      isRevision(value.baseContentRevision) &&
      isDocumentContentSource(value)
    );
  }
  if (toolName === 'propose_document_file_operation') {
    if (
      value.operation === 'create' &&
      Object.keys(value).length === 7
    ) {
      return (
        isDocumentId(value.parentId) &&
        isRevision(value.projectRevision) &&
        typeof value.metadataTitle === 'string' &&
        value.metadataTitle.trim().length > 0 &&
        value.metadataTitle.length <= 500 &&
        !/[\u0000-\u001f\u007f]/u.test(value.metadataTitle) &&
        isDocumentContentSource(value) &&
        typeof value.kind === 'string' &&
        ['chapter', 'prologue', 'interlude', 'epilogue', 'appendix', 'entry'].includes(value.kind)
      );
    }
    return (
      value.operation === 'delete' &&
      Object.keys(value).length === 4 &&
      isDocumentId(value.documentId) &&
      isRevision(value.baseRevision) &&
      isRevision(value.projectRevision)
    );
  }
  if (toolName === 'propose_project_structure_operation') {
    if (
      value.operation === 'rename_document' &&
      Object.keys(value).length === 4
    ) {
      return (
        isDocumentId(value.documentId) &&
        isRevision(value.projectRevision) &&
        typeof value.metadataTitle === 'string' &&
        value.metadataTitle.trim().length > 0 &&
        value.metadataTitle.length <= 500 &&
        !/[\u0000-\u001f\u007f]/u.test(value.metadataTitle)
      );
    }
    if (
      value.operation === 'create_volume' &&
      Object.keys(value).length === 3
    ) {
      return (
        isRevision(value.projectRevision) &&
        typeof value.title === 'string' &&
        value.title.trim().length > 0 &&
        value.title.length <= 500 &&
        !/[\u0000-\u001f\u007f]/u.test(value.title)
      );
    }
    if (
      value.operation === 'create_lore_category' &&
      Object.keys(value).length === 4
    ) {
      return (
        isRevision(value.projectRevision) &&
        isProjectIcon(value.icon) &&
        typeof value.title === 'string' &&
        value.title.trim().length > 0 &&
        value.title.length <= 500 &&
        !/[\u0000-\u001f\u007f]/u.test(value.title)
      );
    }
    if (
      value.operation === 'delete_lore_category' &&
      Object.keys(value).length === 3
    ) {
      return isDocumentId(value.directoryId) && isRevision(value.projectRevision);
    }
    return (
      value.operation === 'move_document' &&
      Object.keys(value).length === 5 &&
      isDocumentId(value.documentId) &&
      isDocumentId(value.targetParentId) &&
      isRevision(value.baseRevision) &&
      isRevision(value.projectRevision)
    );
  }
  if (toolName === 'propose_story_operation') {
    return (
      Object.keys(value).length === 2 &&
      Number.isSafeInteger(value.storyRevision) &&
      (value.storyRevision as number) >= 0 &&
      isAgentStoryOperation(value.change)
    );
  }
  if (toolName === 'maintain_story_records') {
    return (
      Object.keys(value).length === 2 &&
      Number.isSafeInteger(value.storyRevision) &&
      (value.storyRevision as number) >= 0 &&
      Array.isArray(value.changes) && value.changes.length >= 1 &&
      value.changes.length <= 24 && value.changes.every(isStoryMaintenanceChange)
    );
  }
  if (toolName === 'complete_story_reconciliation') {
    return Object.keys(value).length === 2 &&
      typeof value.status === 'string' &&
      ['applied', 'no_changes', 'questions_recorded'].includes(value.status) &&
      isBoundedText(value.reason, 2_000, false);
  }
  if (toolName === 'reconcile_accepted_document') {
    const keys = Object.keys(value);
    const newPersonae = value.newPersonae;
    return keys.length >= 4 && keys.length <= 5 &&
      keys.every((key) => [
        'events',
        'newPersonae',
        'newThreads',
        'primaryTimeline',
        'threadAdvances',
      ].includes(key)) &&
      Array.isArray(value.events) && value.events.length === 1 &&
      value.events.every(isAcceptedReconciliationEvent) &&
      Array.isArray(newPersonae) && newPersonae.length <= 6 &&
      newPersonae.every(isAcceptedNewPersona) &&
      new Set(newPersonae.map((persona) =>
        isRecord(persona) ? persona.clientRef : undefined)).size === newPersonae.length &&
      Array.isArray(value.newThreads) && value.newThreads.length <= 2 &&
      value.newThreads.every(isAcceptedNewThread) &&
      (value.primaryTimeline === undefined ||
        isAcceptedPrimaryTimeline(value.primaryTimeline)) &&
      Array.isArray(value.threadAdvances) &&
      value.threadAdvances.length <= 4 &&
      value.threadAdvances.every(isAcceptedThreadAdvance);
  }
  if (toolName === 'record_story_question') {
    return Object.keys(value).length === 5 &&
      typeof value.kind === 'string' &&
      ['possible_alias', 'uncertain_time', 'unclear_relationship', 'contradiction', 'other']
        .includes(value.kind) &&
      isBoundedText(value.question, 2_000, false) &&
      isBoundedText(value.context, 10_000, true) &&
      Array.isArray(value.options) && value.options.length <= 6 &&
      value.options.every((option) => isBoundedText(option, 500, false)) &&
      (value.evidence === null || isQuestionEvidence(value.evidence));
  }
  if (toolName === 'resolve_story_question') {
    return Object.keys(value).length === 2 &&
      isDocumentId(value.questionId) && isBoundedText(value.answer, 2_000, false);
  }
  if (toolName === 'read_novel_context') {
    return Object.keys(value).length === 3 &&
      Array.isArray(value.include) && value.include.length <= 4 &&
      value.include.every((section) =>
        typeof section === 'string' &&
        AGENT_NOVEL_CONTEXT_SECTIONS.includes(section as AgentNovelContextSection)) &&
      new Set(value.include).size === value.include.length &&
      Array.isArray(value.documentIds) && value.documentIds.length <= 4 &&
      value.documentIds.every(isDocumentId) &&
      new Set(value.documentIds).size === value.documentIds.length &&
      Array.isArray(value.directoryIds) && value.directoryIds.length <= 4 &&
      value.directoryIds.every(isDocumentId) &&
      new Set(value.directoryIds).size === value.directoryIds.length &&
      (value.include.length > 0 || value.documentIds.length > 0 ||
        value.directoryIds.length > 0);
  }
  return Object.keys(value).length === 0;
};

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
  toolName === 'delegate_writing'
    ? isWritingAssignmentResult(value)
    : toolName === 'submit_writing_artifact'
      ? isWritingArtifactSubmissionResult(value)
    : toolName === 'revise_writing_artifact'
      ? isWritingArtifactRevisionResult(value)
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
    : toolName === 'propose_document_edit' ||
        toolName === 'propose_document_writing' ||
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

const isWritingAssignmentResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 5 &&
  isDocumentId(value.assignmentId) &&
  Number.isSafeInteger(value.characterCount) &&
  (value.characterCount as number) >= 1 &&
  (value.characterCount as number) <= 512 * 1024 &&
  (value.documentAction === 'create' || value.documentAction === 'replace') &&
  (value.documentDomain === 'lore' || value.documentDomain === 'manuscript') &&
  value.status === 'completed';

const isAgentStorySnapshot = (value: unknown): boolean => {
  if (isProjectStorySnapshot(value)) return true;
  if (!isRecord(value) || !Array.isArray(value.eventSources) ||
    !Array.isArray(value.questions)) return false;
  const canonicalRevision = (revision: unknown): unknown =>
    typeof revision === 'string' && /^revision:[1-9][0-9]*$/u.test(revision)
      ? 'a'.repeat(64)
      : revision;
  return isProjectStorySnapshot({
    ...value,
    eventSources: value.eventSources.map((source) => isRecord(source)
      ? { ...source, documentRevision: canonicalRevision(source.documentRevision) }
      : source),
    questions: value.questions.map((question) => {
      if (!isRecord(question) || !isRecord(question.evidence)) return question;
      return {
        ...question,
        evidence: {
          ...question.evidence,
          documentRevision: canonicalRevision(question.evidence.documentRevision),
        },
      };
    }),
  });
};

const isWritingArtifactSubmissionResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  value.status === 'submitted';

const isWritingArtifactRevisionResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 3 &&
  isDocumentId(value.assignmentId) &&
  Number.isSafeInteger(value.replacementsApplied) &&
  (value.replacementsApplied as number) >= 1 &&
  (value.replacementsApplied as number) <= 1_200 &&
  value.status === 'revised';

const isEditProposalResult = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.proposalId === 'string' &&
  value.proposalId.length > 0 &&
  typeof value.status === 'string' &&
  ['accepted', 'rejected', 'conflict', 'missing', 'stale', 'failed']
    .includes(value.status);

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

const isAcceptedReconciliationEvent = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 5 &&
  isBoundedText(value.displayTime, 500, false) &&
  typeof value.precision === 'string' &&
  ['exact', 'day', 'month', 'season', 'approximate', 'unknown']
    .includes(value.precision) &&
  isBoundedText(value.title, 500, false) &&
  isBoundedText(value.summary, 30_000, true) &&
  Array.isArray(value.participants) && value.participants.length <= 100 &&
  value.participants.every((participant) =>
    isRecord(participant) && Object.keys(participant).length === 3 &&
    isBoundedText(participant.personaRef, 64, false) &&
    isBoundedText(participant.description, 10_000, true) &&
    typeof participant.role === 'string' &&
    ['actor', 'target', 'witness', 'affected'].includes(participant.role));

const isAcceptedThreadBeat = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length >= 4 && keys.length <= 6 &&
    keys.every((key) => [
      'description',
      'desiredOutcome',
      'dramaticPurpose',
      'kind',
      'relation',
      'title',
    ].includes(key)) &&
    isBoundedText(value.title, 500, false) &&
    isBoundedText(value.description, 30_000, true) &&
    (value.desiredOutcome === undefined ||
      isBoundedText(value.desiredOutcome, 10_000, true)) &&
    (value.dramaticPurpose === undefined ||
      isBoundedText(value.dramaticPurpose, 10_000, true)) &&
    typeof value.kind === 'string' &&
    ['beat', 'setup', 'turning_point', 'climax', 'resolution']
      .includes(value.kind) &&
    typeof value.relation === 'string' &&
    ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves']
      .includes(value.relation);
};

const isAcceptedThreadAdvance = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).includes('threadRef') &&
  isBoundedText(value.threadRef, 64, false) &&
  isAcceptedThreadBeat(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'threadRef'),
  ));

const isAcceptedNewPersona = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 4 &&
  typeof value.clientRef === 'string' &&
  /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value.clientRef) &&
  isBoundedText(value.name, 500, false) &&
  (value.role === null || isBoundedText(value.role, 500, true)) &&
  isBoundedText(value.summary, 20_000, true);

const isAcceptedNewThread = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 4 &&
  isBoundedText(value.title, 500, false) &&
  isBoundedText(value.summary, 20_000, true) &&
  typeof value.threadStatus === 'string' &&
  ['planned', 'active', 'resolved', 'abandoned'].includes(value.threadStatus) &&
  isAcceptedThreadBeat(value.beat);

const isAcceptedPrimaryTimeline = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 2 &&
  isBoundedText(value.title, 500, false) &&
  isBoundedText(value.summary, 20_000, true);

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
    isBoundedText(persona.ref, 64, false) &&
    isBoundedText(persona.name, 500, false)) &&
  Array.isArray(value.chronicle) &&
  value.chronicle.every((event) => isRecord(event) &&
    isBoundedText(event.title, 500, false) &&
    isBoundedText(event.summary, 30_000, true)) &&
  Array.isArray(value.threads) &&
  value.threads.every((thread) => isRecord(thread) &&
    isBoundedText(thread.ref, 64, false) &&
    isBoundedText(thread.title, 500, false) &&
    Array.isArray(thread.beats)) &&
  Array.isArray(value.questions) &&
  (value.primaryTimeline === null ||
    (isRecord(value.primaryTimeline) &&
      value.primaryTimeline.ref === 'timeline:primary'));

const isStoryMaintenanceChange = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const { clientRef, ...operation } = value;
  if (!isAgentStoryOperation(operation)) return false;
  if (clientRef === undefined) return true;
  return operation.operation !== 'link_beat_event' && isStoryClientRef(clientRef);
};

const isAgentStoryOperation = (value: unknown): boolean => {
  if (isProjectStoryOperation(value)) return true;
  if (!isRecord(value) || value.operation !== 'create_event' ||
    !Array.isArray(value.sources)) return false;
  const sources = value.sources.map((source) => {
    if (!isRecord(source) || !isRevision(source.documentRevision)) return source;
    return {
      ...source,
      documentRevision: /^revision:/u.test(source.documentRevision as string)
        ? 'a'.repeat(64)
        : source.documentRevision,
    };
  });
  return isProjectStoryOperation({ ...value, sources });
};

const isStoryClientRef = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);

const isStoryQuestionResult = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 3 &&
  (value.status === 'recorded' || value.status === 'resolved') &&
  isDocumentId(value.questionId) && Number.isSafeInteger(value.revision) &&
  (value.revision as number) >= 0;

const isQuestionEvidence = (value: unknown): boolean =>
  isRecord(value) && isBoundedText(value.anchor, 10_000, false) &&
  ((Object.keys(value).length === 2 &&
    value.sourceRef === 'document:accepted') ||
    (Object.keys(value).length === 4 &&
      value.sourceKind === 'manuscript' &&
      isDocumentId(value.documentId) && isRevision(value.documentRevision)));

const isBoundedText = (
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): value is string => typeof value === 'string' && value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const isValidMetadataTitle = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 &&
  value.length <= 500 && !/[\u0000-\u001f\u007f]/u.test(value);

const isDocumentId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const isDocumentContentSource = (value: Record<string, unknown>): boolean =>
  (
    typeof value.markdown === 'string' &&
    new TextEncoder().encode(value.markdown).byteLength <= 512 * 1024 &&
    value.writingAssignmentId === null
  ) || (
    value.markdown === null &&
    isDocumentId(value.writingAssignmentId)
  );

const isWritingArtifactReplacement = (
  value: unknown,
): value is AgentWritingArtifactReplacement =>
  isRecord(value) &&
  Object.keys(value).length === 3 &&
  isBoundedText(value.find, 8_000, false) &&
  typeof value.replace === 'string' &&
  value.replace.length <= 8_000 &&
  value.replace !== value.find &&
  Number.isSafeInteger(value.expectedOccurrences) &&
  (value.expectedOccurrences as number) >= 1 &&
  (value.expectedOccurrences as number) <= 100;

const isRevision = (value: unknown): value is string =>
  typeof value === 'string' && (
    /^revision:[1-9][0-9]*$/u.test(value) ||
    // Accept canonical hashes from an already-running pre-upgrade worker. The
    // current Main dispatcher never emits them to a model.
    /^[a-f0-9]{64}$/u.test(value)
  );

const isDocumentResult = (value: unknown): value is AgentDocumentToolResult =>
  isRecord(value) &&
  typeof value.baseRevision === 'string' &&
  typeof value.contentRevision === 'string' &&
  typeof value.displayTitle === 'string' &&
  typeof value.documentId === 'string' &&
  typeof value.markdown === 'string' &&
  typeof value.metadataTitle === 'string' &&
  (value.source === 'disk' || value.source === 'draft') &&
  Object.keys(value).length === 7;

const isNovelStructureResult = (
  value: unknown,
): value is AgentNovelStructureToolResult => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.availableIcons) ||
    value.availableIcons.length !== PROJECT_ICON_IDS.length ||
    !value.availableIcons.every(isProjectIcon) ||
    new Set(value.availableIcons).size !== value.availableIcons.length ||
    value.format !== 'driftfield' ||
    !isRecord(value.project) ||
    typeof value.project.id !== 'string' ||
    typeof value.project.revision !== 'string' ||
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
    typeof value.id !== 'string' ||
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
    typeof value.id === 'string' &&
    typeof value.displayTitle === 'string' &&
    typeof value.metadataTitle === 'string' &&
    (value.revision === undefined || typeof value.revision === 'string') &&
    [
      'chapter',
      'prologue',
      'interlude',
      'epilogue',
      'appendix',
      'entry',
      'document',
    ].includes(value.kind as string)
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
