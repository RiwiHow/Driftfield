import {
  isProjectStoryOperation,
  isProjectStorySnapshot,
} from './project-story';

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
  kind: 'manuscript' | 'volume' | 'lore' | 'category';
  title: string;
  type: 'directory';
}

export type AgentStructureNode =
  | AgentStructureDirectory
  | AgentStructureDocument;

export interface AgentNovelStructureToolResult {
  format: 'driftfield';
  lore?: AgentStructureDirectory;
  manuscript: AgentStructureDirectory;
  project: {
    id: string;
    revision: string;
    title: string;
  };
}

export interface AgentProposalToolResult {
  proposalId: string;
  status: 'accepted' | 'rejected' | 'conflict' | 'missing' | 'stale' | 'failed';
}

export interface AgentStoryMaintenanceToolResult {
  operationId: string;
  revision: number;
  status: 'applied';
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
      operation: 'create_volume' | 'create_lore_category';
      projectRevision: string;
      title: string;
    }
  | {
      baseRevision: string;
      documentId: string;
      operation: 'move_document';
      projectRevision: string;
      targetParentId: string;
    };

export interface AgentToolContractMap {
  get_story_state: {
    arguments: Record<string, never>;
    result: import('./project-story').ProjectStorySnapshot;
  };
  maintain_story_records: {
    arguments: {
      change: import('./project-story').ProjectStoryOperation;
      storyRevision: number;
    };
    result: AgentStoryMaintenanceToolResult;
  };
  get_current_document: {
    arguments: Record<string, never>;
    result: AgentDocumentToolResult;
  };
  get_document: {
    arguments: { documentId: string };
    result: AgentDocumentToolResult;
  };
  get_novel_structure: {
    arguments: Record<string, never>;
    result: AgentNovelStructureToolResult;
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
  'get_novel_structure',
  'get_current_document',
  'get_document',
  'get_story_state',
  'maintain_story_records',
  'propose_document_edit',
  'propose_document_file_operation',
  'propose_project_structure_operation',
  'propose_story_operation',
] as const satisfies readonly AgentToolName[];

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
  | 'document-too-large'
  | 'proposal-base-changed'
  | 'tool-timeout'
  | 'tool-budget-exceeded'
  | 'internal-error';

export const AGENT_TOOL_ERROR_CODES = [
  'invalid-arguments',
  'project-session-changed',
  'document-not-found',
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
    error: { code: AgentToolErrorCode };
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

export const isAgentToolArguments = <Name extends AgentToolName>(
  toolName: Name,
  value: unknown,
): value is AgentToolContractMap[Name]['arguments'] => {
  if (!isRecord(value)) return false;
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
      (value.operation === 'create_volume' ||
        value.operation === 'create_lore_category') &&
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
      isProjectStoryOperation(value.change)
    );
  }
  if (toolName !== 'get_document') return Object.keys(value).length === 0;
  return (
    Object.keys(value).length === 1 &&
    isDocumentId(value.documentId)
  );
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
    AGENT_TOOL_ERROR_CODES.includes(value.error.code as AgentToolErrorCode)
  );
};

const isToolData = (toolName: AgentToolName, value: unknown): boolean =>
  toolName === 'get_novel_structure'
    ? isNovelStructureResult(value)
    : toolName === 'get_story_state'
      ? isProjectStorySnapshot(value)
    : toolName === 'maintain_story_records'
      ? isStoryMaintenanceResult(value)
    : toolName === 'propose_document_edit' ||
        toolName === 'propose_document_file_operation' ||
        toolName === 'propose_project_structure_operation' ||
        toolName === 'propose_story_operation'
      ? isEditProposalResult(value)
    : isDocumentResult(value);

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
  typeof value.operationId === 'string' &&
  value.operationId.length > 0 &&
  value.operationId.length <= 128 &&
  Number.isSafeInteger(value.revision) &&
  (value.revision as number) > 0;

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
