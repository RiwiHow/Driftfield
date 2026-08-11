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
              title: request.arguments.title,
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
      title: node.title,
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
    return 'Document creation requires exactly operation, parentId, projectRevision, title, kind, markdown, and writingAssignmentId. Supply direct markdown with writingAssignmentId null, or set markdown null and use the assignmentId returned by delegate_writing.';
  }
  if (
    (toolName !== 'maintain_story_records' && toolName !== 'propose_story_operation') ||
    typeof args !== 'object' || args === null
  ) return undefined;
  const change = toolName === 'maintain_story_records'
    ? (args as { changes?: unknown }).changes instanceof Array
      ? (args as { changes: unknown[] }).changes.find((item) =>
          typeof item === 'object' && item !== null,
        )
      : undefined
    : (args as { change?: unknown }).change;
  if (typeof change !== 'object' || change === null) return undefined;
  const operation = (change as { operation?: unknown }).operation;
  if (typeof operation !== 'string') return undefined;
  const hint = STORY_OPERATION_SHAPE_HINTS[operation];
  if (
    hint !== undefined &&
    toolName === 'maintain_story_records' &&
    operation.startsWith('create_')
  ) {
    return `${hint} Maintain create operations may additionally declare clientRef for later @clientRef references in the same changeset.`;
  }
  return hint;
};

const STORY_OPERATION_SHAPE_HINTS: Record<string, string> = {
  create_beat: 'create_beat requires exactly operation, threadId, parentId, kind, title, description, status, orderKey, dramaticPurpose, desiredOutcome; status must be planned, active, resolved, or abandoned.',
  create_event: 'create_event requires operation, timelineId, startMomentId, endMomentId, title, summary, status, causes, consequences, participants, and optional sources; status must be planned or established.',
  create_moment: 'create_moment requires exactly operation, timelineId, displayTime, precision, orderKey, note.',
  create_persona: 'create_persona requires exactly operation, name, role, summary.',
  create_thread: 'create_thread requires exactly operation, parentId, title, summary, status, orderKey; status must be planned, active, resolved, or abandoned.',
  create_timeline: 'create_timeline requires exactly operation, title, summary, isPrimary.',
  link_beat_event: 'link_beat_event requires exactly operation, beatId, eventId, relation.',
};
