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

export interface AgentDocumentToolResult {
  baseRevision: string;
  contentRevision: string;
  documentId: string;
  markdown: string;
  source: 'disk' | 'draft';
  title: string;
}

export interface AgentStructureDocument {
  id: string;
  kind:
    | 'chapter'
    | 'prologue'
    | 'interlude'
    | 'epilogue'
    | 'appendix'
    | 'entry';
  revision?: string;
  title: string;
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
] as const;

export type AgentNovelContextSection =
  (typeof AGENT_NOVEL_CONTEXT_SECTIONS)[number];

export interface AgentNovelContextToolResult {
  currentDocument?: AgentDocumentToolResult;
  documents: AgentDocumentToolResult[];
  storyState?: import('./project-story').ProjectStorySnapshot;
  structure?: AgentNovelStructureToolResult;
}

export interface AgentProposalToolResult {
  proposalId: string;
  status: 'accepted' | 'rejected' | 'conflict' | 'missing' | 'stale' | 'failed';
}

export interface AgentStoryMaintenanceToolResult {
  changes: AgentStoryMaintenanceChangeResult[];
  operationIds: string[];
  revision: number;
  status: 'applied';
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

export interface AgentStoryMaintenanceChangeResult {
  clientRef: string | null;
  entityId: string | null;
  operation: import('./project-story').ProjectStoryOperation['operation'];
  operationId: string;
}

export interface AgentStoryQuestionToolResult {
  questionId: string;
  revision: number;
  status: 'recorded' | 'resolved';
}

export interface AgentWritingAssignment {
  objective: string;
  requirements: string[];
  targetDocumentId: string | null;
  targetLength: number | null;
}

export interface AgentWritingAssignmentToolResult {
  assignmentId: string;
  markdown: string;
  status: 'completed';
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
      markdown: string;
      operation: 'create';
      parentId: string;
      projectRevision: string;
      title: string;
    }
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
  maintain_story_records: {
    arguments: {
      changes: AgentStoryMaintenanceChange[];
      storyRevision: number;
    };
    result: AgentStoryMaintenanceToolResult;
  };
  record_story_question: {
    arguments: {
      context: string;
      evidence: import('./project-story').StoryQuestionEvidence | null;
      kind: import('./project-story').StoryQuestionKind;
      options: string[];
      question: string;
    };
    result: AgentStoryQuestionToolResult;
  };
  resolve_story_question: {
    arguments: { answer: string; questionId: string };
    result: AgentStoryQuestionToolResult;
  };
  propose_document_edit: {
    arguments: {
      baseContentRevision: string;
      baseRevision: string;
      documentId: string;
      markdown: string;
    };
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
  'maintain_story_records',
  'record_story_question',
  'resolve_story_question',
  'propose_document_edit',
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

export const isAgentToolArguments = <Name extends AgentToolName>(
  toolName: Name,
  value: unknown,
): value is AgentToolContractMap[Name]['arguments'] => {
  if (!isRecord(value)) return false;
  if (toolName === 'delegate_writing') {
    return (
      Object.keys(value).length === 4 &&
      isBoundedText(value.objective, 4_000, false) &&
      Array.isArray(value.requirements) &&
      value.requirements.length <= 20 &&
      value.requirements.every((requirement) =>
        isBoundedText(requirement, 1_000, false)) &&
      (value.targetDocumentId === null || isDocumentId(value.targetDocumentId)) &&
      (value.targetLength === null ||
        (Number.isSafeInteger(value.targetLength) &&
          (value.targetLength as number) >= 1 &&
          (value.targetLength as number) <= 200_000))
    );
  }
  if (toolName === 'propose_document_edit') {
    return (
      Object.keys(value).length === 4 &&
      isDocumentId(value.documentId) &&
      isRevision(value.baseRevision) &&
      isRevision(value.baseContentRevision) &&
      typeof value.markdown === 'string' &&
      new TextEncoder().encode(value.markdown).byteLength <= 512 * 1024
    );
  }
  if (toolName === 'propose_document_file_operation') {
    if (
      value.operation === 'create' &&
      Object.keys(value).length === 6
    ) {
      return (
        isDocumentId(value.parentId) &&
        isRevision(value.projectRevision) &&
        typeof value.title === 'string' &&
        value.title.trim().length > 0 &&
        value.title.length <= 500 &&
        !/[\u0000-\u001f\u007f]/u.test(value.title) &&
        typeof value.markdown === 'string' &&
        new TextEncoder().encode(value.markdown).byteLength <= 512 * 1024 &&
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
      isProjectStoryOperation(value.change)
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
      Array.isArray(value.include) && value.include.length <= 3 &&
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
    : toolName === 'read_novel_context'
      ? isNovelContextResult(value)
    : toolName === 'maintain_story_records'
      ? isStoryMaintenanceResult(value)
    : toolName === 'record_story_question' || toolName === 'resolve_story_question'
      ? isStoryQuestionResult(value)
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
    ['currentDocument', 'documents', 'storyState', 'structure'].includes(key)) &&
  Array.isArray(value.documents) && value.documents.length <= 4 &&
  value.documents.every(isDocumentResult) &&
  (value.currentDocument === undefined || isDocumentResult(value.currentDocument)) &&
  (value.storyState === undefined || isProjectStorySnapshot(value.storyState)) &&
  (value.structure === undefined || isNovelStructureResult(value.structure));

const isWritingAssignmentResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 3 &&
  isDocumentId(value.assignmentId) &&
  typeof value.markdown === 'string' &&
  value.markdown.trim().length > 0 &&
  new TextEncoder().encode(value.markdown).byteLength <= 512 * 1024 &&
  value.status === 'completed';

const isEditProposalResult = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.proposalId === 'string' &&
  value.proposalId.length > 0 &&
  typeof value.status === 'string' &&
  ['accepted', 'rejected', 'conflict', 'missing', 'stale', 'failed']
    .includes(value.status);

const isStoryMaintenanceResult = (value: unknown): boolean =>
  isRecord(value) &&
  Object.keys(value).length === 4 &&
  value.status === 'applied' &&
  Array.isArray(value.changes) && value.changes.length >= 1 &&
  value.changes.length <= 24 && value.changes.every((change, index) =>
    isRecord(change) && Object.keys(change).length === 4 &&
    (change.clientRef === null || isStoryClientRef(change.clientRef)) &&
    (change.entityId === null || isDocumentId(change.entityId)) &&
    typeof change.operation === 'string' &&
    [
      'create_persona',
      'create_timeline',
      'create_moment',
      'create_event',
      'create_thread',
      'create_beat',
      'link_beat_event',
    ].includes(change.operation) &&
    (change.operation === 'link_beat_event'
      ? change.entityId === null && change.clientRef === null
      : isDocumentId(change.entityId)) &&
    isDocumentId(change.operationId) &&
    Array.isArray(value.operationIds) &&
    value.operationIds[index] === change.operationId) &&
  Array.isArray(value.operationIds) && value.operationIds.length >= 1 &&
  value.operationIds.length === value.changes.length &&
  value.operationIds.length <= 24 && value.operationIds.every((operationId) =>
    typeof operationId === 'string' && operationId.length > 0 &&
    operationId.length <= 128) &&
  Number.isSafeInteger(value.revision) &&
  (value.revision as number) > 0;

const isStoryMaintenanceChange = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const { clientRef, ...operation } = value;
  if (!isProjectStoryOperation(operation)) return false;
  if (clientRef === undefined) return true;
  return operation.operation !== 'link_beat_event' && isStoryClientRef(clientRef);
};

const isStoryClientRef = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);

const isStoryQuestionResult = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 3 &&
  (value.status === 'recorded' || value.status === 'resolved') &&
  isDocumentId(value.questionId) && Number.isSafeInteger(value.revision) &&
  (value.revision as number) >= 0;

const isQuestionEvidence = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 4 &&
  value.sourceKind === 'manuscript' &&
  isDocumentId(value.documentId) && isRevision(value.documentRevision) &&
  isBoundedText(value.anchor, 10_000, false);

const isBoundedText = (
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): value is string => typeof value === 'string' && value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const isDocumentId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const isRevision = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

const isDocumentResult = (value: unknown): value is AgentDocumentToolResult =>
  isRecord(value) &&
  typeof value.baseRevision === 'string' &&
  typeof value.contentRevision === 'string' &&
  typeof value.documentId === 'string' &&
  typeof value.markdown === 'string' &&
  (value.source === 'disk' || value.source === 'draft') &&
  typeof value.title === 'string';

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
    typeof value.title === 'string' &&
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
