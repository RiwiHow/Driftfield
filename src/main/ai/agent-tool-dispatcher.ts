import type {
  AgentDraftSnapshot,
  AgentNovelStructureToolResult,
  AgentStructureNode,
  AgentWritingAssignment,
  AgentWritingAssignmentToolResult,
  AgentWritingArtifactReplacement,
  AgentWritingArtifactRevisionToolResult,
  AgentToolExecutionResult,
  AgentToolFailureResult,
  AgentToolName,
  AgentToolRequest,
  AgentToolSuccessResult,
} from '../../shared/contracts/agent-tools';
import {
  isAgentToolRequest,
  isLongRunningAgentTool,
} from '../../shared/contracts/agent-tools';
import {
  ProjectContextError,
  type ProjectContextService,
} from './project-context-service';
import type {
  AgentProposalService,
  ResolvedDocumentFileOperationArguments,
} from './agent-proposal-service';
import type { AgentProposal } from '../../shared/contracts/agent-proposals';
import { isProjectStoryOperation } from '../../shared/contracts/project-story';

export interface AgentToolScope {
  claimWritingArtifact?: (
    assignmentId: string,
    targetDocumentId: string | null,
  ) => string | undefined;
  delegateWriting?: (
    assignment: AgentWritingAssignment,
  ) => Promise<AgentWritingAssignmentToolResult>;
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
  releaseWritingArtifactClaim?: (assignmentId: string) => void;
  reviseWritingArtifact?: (
    assignmentId: string,
    replacements: AgentWritingArtifactReplacement[],
  ) =>
    | { ok: true; result: AgentWritingArtifactRevisionToolResult }
    | { detail: string; ok: false };
  sendProposal?: (proposal: AgentProposal) => void;
  storyChanged?: (revision: number) => void;
}

export interface AgentToolPolicy {
  maxCalls: number;
  maxResultBytes: number;
  maxTotalResultBytes: number;
  timeoutMs: number;
}

export const DEFAULT_AGENT_TOOL_POLICY: AgentToolPolicy = {
  maxCalls: 24,
  maxResultBytes: 640 * 1024,
  maxTotalResultBytes: 4 * 1024 * 1024,
  timeoutMs: 15_000,
};

interface RequestBudget {
  calls: number;
  resultBytes: number;
}

export class AgentToolDispatcher {
  private readonly budgets = new Map<string, RequestBudget>();

  constructor(
    private readonly context: ProjectContextService,
    private readonly policy: AgentToolPolicy = DEFAULT_AGENT_TOOL_POLICY,
    private readonly proposals?: AgentProposalService,
  ) {}

  async execute(
    scope: AgentToolScope,
    request: { arguments: unknown; toolName: AgentToolName },
  ): Promise<AgentToolExecutionResult> {
    const budget = this.budgets.get(scope.requestId) ?? { calls: 0, resultBytes: 0 };
    if (budget.calls >= this.policy.maxCalls) {
      return this.error(request.toolName, 'tool-budget-exceeded');
    }
    budget.calls += 1;
    this.budgets.set(scope.requestId, budget);

    if (!isAgentToolRequest(request)) {
      return this.error(
        request.toolName,
        'invalid-arguments',
        toolArgumentShapeHint(request.toolName, request.arguments),
      );
    }

    try {
      const operation = this.executeValidated(scope, request);
      const result = isLongRunningAgentTool(request.toolName)
        ? await operation
        : await this.withTimeout(operation);
      const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
      if (
        bytes > this.policy.maxResultBytes ||
        budget.resultBytes + bytes > this.policy.maxTotalResultBytes
      ) {
        return this.error(request.toolName, 'tool-budget-exceeded');
      }
      budget.resultBytes += bytes;
      return result;
    } catch (error) {
      if (error instanceof ProjectContextError) {
        return this.error(request.toolName, error.code, error.detail);
      }
      if (error instanceof ToolTimeoutError) return this.error(request.toolName, 'tool-timeout');
      return this.error(request.toolName, 'internal-error');
    }
  }

  release(requestId: string): void {
    this.budgets.delete(requestId);
    this.proposals?.cancelRequest(requestId);
  }

  private async executeValidated(
    scope: AgentToolScope,
    request: AgentToolRequest,
  ): Promise<AgentToolSuccessResult> {
    const contextScope = {
      ...(scope.draftSnapshot === undefined ? {} : { draftSnapshot: scope.draftSnapshot }),
      ownerId: scope.ownerId,
      projectSessionId: scope.projectSessionId,
    };
    if (request.toolName === 'delegate_writing') {
      if (scope.delegateWriting === undefined) {
        throw new ProjectContextError('internal-error');
      }
      if (request.arguments.targetDocumentId !== null) {
        const structure = await this.context.getNovelStructure(contextScope);
        const node = indexStructureNodes(structure).get(
          request.arguments.targetDocumentId,
        );
        if (node === undefined) {
          throw nodeNotFound(request.arguments.targetDocumentId);
        }
        if (node.type !== 'document') {
          throw nodeKindMismatch(
            request.arguments.targetDocumentId,
            'document',
            node,
          );
        }
      }
      return {
        data: await scope.delegateWriting(request.arguments),
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'revise_writing_artifact') {
      if (scope.reviseWritingArtifact === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const outcome = scope.reviseWritingArtifact(
        request.arguments.writingAssignmentId,
        request.arguments.replacements,
      );
      if (!outcome.ok) {
        throw new ProjectContextError('invalid-arguments', outcome.detail);
      }
      return {
        data: outcome.result,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'read_novel_context') {
      const { directoryIds, documentIds, include } = request.arguments;
      const includeSet = new Set(include);
      const needsStructure = includeSet.has('structure') ||
        documentIds.length > 0 || directoryIds.length > 0;
      const [resolvedStructure, currentDocument, storyState] =
        await Promise.all([
          needsStructure
            ? this.context.getNovelStructure(contextScope)
            : undefined,
          includeSet.has('current_document')
            ? this.context.getCurrentDocument(contextScope)
            : undefined,
          includeSet.has('story_state')
            ? this.context.getStoryState(contextScope)
            : undefined,
        ]);
      const nodes = resolvedStructure === undefined
        ? new Map<string, AgentStructureNode>()
        : indexStructureNodes(resolvedStructure);
      const resolvedDocumentIds: string[] = [];
      const seenDocumentIds = new Set<string>();
      const addDocumentId = (documentId: string): void => {
        if (seenDocumentIds.has(documentId)) return;
        seenDocumentIds.add(documentId);
        resolvedDocumentIds.push(documentId);
      };
      for (const documentId of documentIds) {
        const node = nodes.get(documentId);
        if (node === undefined) throw nodeNotFound(documentId);
        if (node.type !== 'document') {
          throw nodeKindMismatch(documentId, 'document', node);
        }
        addDocumentId(documentId);
      }
      for (const directoryId of directoryIds) {
        const node = nodes.get(directoryId);
        if (node === undefined) throw nodeNotFound(directoryId);
        if (node.type !== 'directory') {
          throw nodeKindMismatch(directoryId, 'directory', node);
        }
        for (const child of node.children) {
          if (child.type === 'document') addDocumentId(child.id);
        }
      }
      if (resolvedDocumentIds.length > 4) {
        throw new ProjectContextError(
          'selection-too-large',
          JSON.stringify({
            limit: 4,
            resolvedDocumentCount: resolvedDocumentIds.length,
          }),
        );
      }
      const documents = await Promise.all(resolvedDocumentIds.map(
        (documentId) => this.context.getDocument(contextScope, documentId),
      ));
      return {
        data: {
          ...(currentDocument === undefined ? {} : { currentDocument }),
          documents,
          ...(storyState === undefined ? {} : { storyState }),
          ...(includeSet.has('structure') && resolvedStructure !== undefined
            ? { structure: resolvedStructure }
            : {}),
        },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'maintain_story_records') {
      const data = await this.context.maintainStoryRecords(
        contextScope,
        scope.requestId,
        request.arguments.storyRevision,
        request.arguments.changes,
      );
      scope.storyChanged?.(data.revision);
      return {
        data,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'record_story_question') {
      const data = this.context.recordStoryQuestion(
        contextScope,
        scope.requestId,
        request.arguments,
      );
      scope.storyChanged?.(data.revision);
      return { data, ok: true, toolName: request.toolName };
    }
    if (request.toolName === 'resolve_story_question') {
      const data = this.context.resolveStoryQuestion(
        contextScope,
        request.arguments.questionId,
        request.arguments.answer,
      );
      scope.storyChanged?.(data.revision);
      return { data, ok: true, toolName: request.toolName };
    }
    if (request.toolName === 'propose_document_edit') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const content = claimDocumentContent(
        scope,
        request.arguments,
        request.arguments.documentId,
      );
      let proposal: ReturnType<AgentProposalService['create']>;
      try {
        proposal = this.proposals.create(scope, {
          baseContentRevision: request.arguments.baseContentRevision,
          baseRevision: request.arguments.baseRevision,
          documentId: request.arguments.documentId,
          markdown: content.markdown,
        });
      } catch (error) {
        content.release();
        throw error;
      }
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      return {
        data: await decision,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_document_file_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const content = request.arguments.operation === 'create'
        ? claimDocumentContent(scope, request.arguments, null)
        : null;
      let proposal: Awaited<ReturnType<AgentProposalService['createFileOperation']>>;
      try {
        const resolvedRequest = request.arguments.operation === 'create'
          ? {
              kind: request.arguments.kind,
              markdown: content!.markdown,
              operation: request.arguments.operation,
              parentId: request.arguments.parentId,
              projectRevision: request.arguments.projectRevision,
              metadataTitle: request.arguments.metadataTitle,
            } satisfies ResolvedDocumentFileOperationArguments
          : request.arguments;
        proposal = await this.withTimeout(
          this.proposals.createFileOperation(scope, resolvedRequest),
        );
      } catch (error) {
        content?.release();
        throw error;
      }
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      return {
        data: await decision,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_project_structure_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const proposal = await this.withTimeout(
        this.proposals.createStructureOperation(scope, request.arguments),
      );
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      return {
        data: await decision,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_story_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const proposal = this.proposals.createStoryOperation(
        scope,
        request.arguments,
      );
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      return {
        data: await decision,
        ok: true,
        toolName: request.toolName,
      };
    }
    throw new ProjectContextError('internal-error');
  }

  disposeOwner(ownerId: number): void {
    this.proposals?.disposeOwner(ownerId);
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new ToolTimeoutError()), this.policy.timeoutMs);
      operation.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  private error<Name extends AgentToolName>(
    toolName: Name,
    code: Extract<AgentToolExecutionResult, { ok: false }>['error']['code'],
    detail?: string,
  ): AgentToolFailureResult<Name> {
    return {
      error: { code, ...(detail === undefined ? {} : { detail }) },
      ok: false,
      toolName,
    } as AgentToolFailureResult<Name>;
  }
}

class ToolTimeoutError extends Error {}

const claimDocumentContent = (
  scope: AgentToolScope,
  source: { markdown: string | null; writingAssignmentId: string | null },
  targetDocumentId: string | null,
): { markdown: string; release: () => void } => {
  if (source.markdown !== null) {
    return { markdown: source.markdown, release: () => {} };
  }
  const assignmentId = source.writingAssignmentId;
  if (assignmentId === null || scope.claimWritingArtifact === undefined) {
    throw new ProjectContextError(
      'invalid-arguments',
      'A Scribe-backed proposal requires the current request’s writingAssignmentId.',
    );
  }
  const markdown = scope.claimWritingArtifact(assignmentId, targetDocumentId);
  if (markdown === undefined) {
    throw new ProjectContextError(
      'invalid-arguments',
      'The writingAssignmentId is missing, belongs to another request or target, or was already used.',
    );
  }
  return {
    markdown,
    release: () => scope.releaseWritingArtifactClaim?.(assignmentId),
  };
};

const indexStructureNodes = (
  structure: AgentNovelStructureToolResult,
): Map<string, AgentStructureNode> => {
  const nodes = new Map<string, AgentStructureNode>();
  const visit = (node: AgentStructureNode): void => {
    nodes.set(node.id, node);
    if (node.type === 'directory') node.children.forEach(visit);
  };
  visit(structure.manuscript);
  if (structure.lore !== undefined) visit(structure.lore);
  return nodes;
};

const nodeNotFound = (nodeId: string): ProjectContextError =>
  new ProjectContextError('node-not-found', JSON.stringify({ nodeId }));

const nodeKindMismatch = (
  nodeId: string,
  expectedKind: 'directory' | 'document',
  node: AgentStructureNode,
): ProjectContextError =>
  new ProjectContextError(
    'node-kind-mismatch',
    JSON.stringify({
      actualKind: node.type,
      expectedKind,
      nodeId,
      title: node.type === 'document' ? node.displayTitle : node.title,
    }),
  );

const toolArgumentShapeHint = (
  toolName: AgentToolName,
  args: unknown,
): string | undefined => {
  if (toolName === 'delegate_writing') {
    return 'delegate_writing requires exactly objective, requirements, targetDocumentId, and targetLength. It is available at most once per user request and must not be retried for draft corrections. For a new document, set targetDocumentId to null; for an existing document, use its stable document ID, never a directory ID or placeholder. Set targetLength to an integer from 1 to 200000, or null when unspecified.';
  }
  if (toolName === 'revise_writing_artifact') {
    return 'revise_writing_artifact requires exactly writingAssignmentId and 1 to 12 ordered replacements. Each replacement requires exactly find, replace, and expectedOccurrences; find must be non-empty and differ from replace.';
  }
  if (toolName === 'propose_document_edit') {
    return 'propose_document_edit requires exactly baseContentRevision, baseRevision, documentId, markdown, and writingAssignmentId. Supply direct markdown with writingAssignmentId null, or set markdown null and use the assignmentId returned by delegate_writing.';
  }
  if (
    toolName === 'propose_document_file_operation' &&
    typeof args === 'object' && args !== null &&
    (args as { operation?: unknown }).operation === 'create'
  ) {
    return 'Document creation requires exactly operation, parentId, projectRevision, metadataTitle, kind, markdown, and writingAssignmentId. metadataTitle is the raw title without generated numbering. Supply direct markdown with writingAssignmentId null, or set markdown null and use the assignmentId returned by delegate_writing.';
  }
  if (
    toolName === 'propose_project_structure_operation' &&
    typeof args === 'object' && args !== null &&
    (args as { operation?: unknown }).operation === 'rename_document'
  ) {
    return 'rename_document requires exactly operation, projectRevision, documentId, and metadataTitle. metadataTitle is the raw title without generated numbering; the physical filename is preserved.';
  }
  if (
    (toolName !== 'maintain_story_records' && toolName !== 'propose_story_operation') ||
    typeof args !== 'object' || args === null
  ) return undefined;
  if (toolName === 'maintain_story_records') {
    const changes = (args as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) return 'changes must be an array of 1 to 24 operations.';
    for (const [index, change] of changes.entries()) {
      const error = storyOperationArgumentError(change, `changes[${index}]`, true);
      if (error !== undefined) return error;
    }
    return undefined;
  }
  return storyOperationArgumentError(
    (args as { change?: unknown }).change,
    'change',
    false,
  );
};

const STORY_OPERATION_FIELDS: Record<string, {
  optional?: string[];
  required: string[];
}> = {
  create_beat: {
    required: [
      'operation',
      'threadId',
      'parentId',
      'kind',
      'title',
      'description',
      'status',
      'orderKey',
      'dramaticPurpose',
      'desiredOutcome',
    ],
  },
  create_event: {
    optional: ['sources'],
    required: [
      'operation',
      'timelineId',
      'startMomentId',
      'endMomentId',
      'title',
      'summary',
      'status',
      'causes',
      'consequences',
      'participants',
    ],
  },
  create_moment: {
    required: ['operation', 'timelineId', 'displayTime', 'precision', 'orderKey', 'note'],
  },
  create_persona: { required: ['operation', 'name', 'role', 'summary'] },
  create_thread: {
    required: ['operation', 'parentId', 'title', 'summary', 'status', 'orderKey'],
  },
  create_timeline: { required: ['operation', 'title', 'summary', 'isPrimary'] },
  link_beat_event: { required: ['operation', 'beatId', 'eventId', 'relation'] },
};

const storyOperationArgumentError = (
  value: unknown,
  path: string,
  allowClientRef: boolean,
): string | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `${path} must be an object.`;
  }
  const change = value as Record<string, unknown>;
  const operation = change.operation;
  if (typeof operation !== 'string' || STORY_OPERATION_FIELDS[operation] === undefined) {
    return `${path}.operation must be a supported story operation.`;
  }
  const clientRef = change.clientRef;
  if (clientRef !== undefined) {
    if (!allowClientRef || operation === 'link_beat_event') {
      return `${path}.clientRef is valid only on Maintain create operations.`;
    }
    if (typeof clientRef !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(clientRef)) {
      return `${path}.clientRef must start with a letter and contain at most 64 letters, digits, underscores, or hyphens.`;
    }
  }
  const { optional = [], required } = STORY_OPERATION_FIELDS[operation];
  const allowed = new Set([
    ...required,
    ...optional,
    ...(allowClientRef ? ['clientRef'] : []),
  ]);
  const unexpected = Object.keys(change).find((key) => !allowed.has(key));
  if (unexpected !== undefined) return `${path}.${unexpected} is not valid for ${operation}.`;
  const missing = required.find((key) => change[key] === undefined);
  if (missing !== undefined) {
    return `${storyWirePath(path, operation, missing)} is required for ${operation}.`;
  }
  const { clientRef: _clientRef, ...canonical } = change;
  if (isProjectStoryOperation(canonical)) return undefined;
  return storyOperationValueError(canonical, path, operation);
};

const storyOperationValueError = (
  change: Record<string, unknown>,
  path: string,
  operation: string,
): string => {
  const text = (field: string, max: number, allowEmpty: boolean): string | undefined =>
    isBoundedStoryText(change[field], max, allowEmpty)
      ? undefined
      : `${path}.${field} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${max} characters.`;
  const id = (field: string, nullable = false): string | undefined =>
    (nullable && change[field] === null) || isStoryId(change[field])
      ? undefined
      : `${path}.${field} must be ${nullable ? 'null or ' : ''}a stable ID or compatible earlier @clientRef.`;
  const integer = (field: string): string | undefined =>
    Number.isSafeInteger(change[field]) ? undefined : `${path}.${field} must be an integer.`;
  let checks: Array<string | undefined>;
  switch (operation) {
    case 'create_persona':
      checks = [
        text('name', 500, false),
        change.role === null ? undefined : text('role', 500, true),
        text('summary', 20_000, true),
      ];
      break;
    case 'create_timeline':
      checks = [
        text('title', 500, false),
        text('summary', 20_000, true),
        typeof change.isPrimary === 'boolean'
          ? undefined
          : `${path}.isPrimary must be a boolean.`,
      ];
      break;
    case 'create_moment':
      checks = [
        id('timelineId'),
        text('displayTime', 500, false),
        ['exact', 'day', 'month', 'season', 'approximate', 'unknown']
          .includes(change.precision as string)
          ? undefined
          : `${path}.precision is invalid.`,
        integer('orderKey'),
        text('note', 10_000, true),
      ];
      break;
    case 'create_event':
      checks = [
        id('timelineId'),
        id('startMomentId'),
        id('endMomentId', true),
        text('title', 500, false),
        text('summary', 30_000, true),
        change.status === 'planned' || change.status === 'established'
          ? undefined
          : `${path}.eventStatus must be planned or established.`,
        text('causes', 20_000, true),
        text('consequences', 20_000, true),
        storyParticipantsError(change.participants, `${path}.participants`),
        change.sources === undefined
          ? undefined
          : storySourcesError(change.sources, `${path}.sources`),
      ];
      break;
    case 'create_thread':
      checks = [
        id('parentId', true),
        text('title', 500, false),
        text('summary', 20_000, true),
        isStoryThreadStatus(change.status)
          ? undefined
          : `${path}.threadStatus must be planned, active, resolved, or abandoned.`,
        integer('orderKey'),
      ];
      break;
    case 'create_beat':
      checks = [
        id('threadId'),
        id('parentId', true),
        ['beat', 'setup', 'turning_point', 'climax', 'resolution']
          .includes(change.kind as string)
          ? undefined
          : `${path}.kind is invalid.`,
        text('title', 500, false),
        text('description', 30_000, true),
        isStoryThreadStatus(change.status)
          ? undefined
          : `${path}.threadStatus must be planned, active, resolved, or abandoned.`,
        integer('orderKey'),
        text('dramaticPurpose', 10_000, true),
        text('desiredOutcome', 10_000, true),
      ];
      break;
    default:
      checks = [
        id('beatId'),
        id('eventId'),
        ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves']
          .includes(change.relation as string)
          ? undefined
          : `${path}.relation is invalid.`,
      ];
  }
  return checks.find((error) => error !== undefined) ?? `${path} contains invalid nested values for ${operation}.`;
};

const storyWirePath = (path: string, operation: string, field: string): string =>
  field !== 'status'
    ? `${path}.${field}`
    : operation === 'create_event'
      ? `${path}.eventStatus`
      : `${path}.threadStatus`;

const isStoryId = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const isStoryThreadStatus = (value: unknown): boolean =>
  typeof value === 'string' && ['planned', 'active', 'resolved', 'abandoned'].includes(value);

const isBoundedStoryText = (
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): boolean => typeof value === 'string' && value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0) &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const storyParticipantsError = (
  value: unknown,
  path: string,
): string | undefined => {
  if (!Array.isArray(value) || value.length > 100) {
    return `${path} must be an array of at most 100 participants.`;
  }
  for (const [index, participant] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (typeof participant !== 'object' || participant === null || Array.isArray(participant)) {
      return `${itemPath} must be an object.`;
    }
    const item = participant as Record<string, unknown>;
    const keys = Object.keys(item);
    if (keys.length !== 3 || keys.some((key) =>
      !['description', 'personaId', 'role'].includes(key))) {
      return `${itemPath} requires exactly description, personaId, and role.`;
    }
    if (!isStoryId(item.personaId)) {
      return `${itemPath}.personaId must be a stable ID or compatible earlier @clientRef.`;
    }
    if (!['actor', 'target', 'witness', 'affected'].includes(item.role as string)) {
      return `${itemPath}.role is invalid.`;
    }
    if (!isBoundedStoryText(item.description, 10_000, true)) {
      return `${itemPath}.description must be a string of at most 10000 characters.`;
    }
  }
  return undefined;
};

const storySourcesError = (
  value: unknown,
  path: string,
): string | undefined => {
  if (!Array.isArray(value) || value.length > 100) {
    return `${path} must be an array of at most 100 manuscript sources.`;
  }
  for (const [index, source] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return `${itemPath} must be an object.`;
    }
    const item = source as Record<string, unknown>;
    const keys = Object.keys(item);
    if (keys.length !== 5 || keys.some((key) =>
      !['anchor', 'documentId', 'documentRevision', 'relation', 'sourceKind']
        .includes(key))) {
      return `${itemPath} requires exactly anchor, documentId, documentRevision, relation, and sourceKind.`;
    }
    if (item.anchor !== null && !isBoundedStoryText(item.anchor, 10_000, true)) {
      return `${itemPath}.anchor must be null or a string of at most 10000 characters.`;
    }
    if (!isStoryId(item.documentId)) return `${itemPath}.documentId is invalid.`;
    if (typeof item.documentRevision !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(item.documentRevision)) {
      return `${itemPath}.documentRevision must be a SHA-256 revision.`;
    }
    if (!['depicted', 'mentioned', 'inferred'].includes(item.relation as string)) {
      return `${itemPath}.relation is invalid.`;
    }
    if (item.sourceKind !== 'manuscript') return `${itemPath}.sourceKind must be manuscript.`;
  }
  return undefined;
};
