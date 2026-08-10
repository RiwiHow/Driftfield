import type {
  AgentDraftSnapshot,
  AgentWritingAssignment,
  AgentWritingAssignmentToolResult,
  AgentToolExecutionResult,
  AgentToolFailureResult,
  AgentToolName,
  AgentToolRequest,
  AgentToolSuccessResult,
} from '../../shared/contracts/agent-tools';
import { isAgentToolRequest } from '../../shared/contracts/agent-tools';
import {
  ProjectContextError,
  type ProjectContextService,
} from './project-context-service';
import type { AgentProposalService } from './agent-proposal-service';
import type { AgentProposal } from '../../shared/contracts/agent-proposals';

export interface AgentToolScope {
  delegateWriting?: (
    assignment: AgentWritingAssignment,
  ) => Promise<AgentWritingAssignmentToolResult>;
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
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
        storyOperationShapeHint(request.toolName, request.arguments),
      );
    }

    try {
      const operation = this.executeValidated(scope, request);
      const result = isProposalTool(request.toolName)
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
      if (error instanceof ProjectContextError) return this.error(request.toolName, error.code);
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
      return {
        data: await scope.delegateWriting(request.arguments),
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'get_novel_structure') {
      return {
        data: await this.context.getNovelStructure(contextScope),
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'get_story_state') {
      return {
        data: await this.context.getStoryState(contextScope),
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
    if (request.toolName === 'get_current_document') {
      return {
        data: await this.context.getCurrentDocument(contextScope),
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_document_edit') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const proposal = this.proposals.create(scope, request.arguments);
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
      const proposal = await this.withTimeout(
        this.proposals.createFileOperation(scope, request.arguments),
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
    return {
      data: await this.context.getDocument(
        contextScope,
        request.arguments.documentId,
      ),
      ok: true,
      toolName: request.toolName,
    };
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

const isProposalTool = (toolName: AgentToolName): boolean =>
  toolName === 'delegate_writing' ||
  toolName === 'propose_document_edit' ||
  toolName === 'propose_document_file_operation' ||
  toolName === 'propose_project_structure_operation' ||
  toolName === 'propose_story_operation';

const storyOperationShapeHint = (
  toolName: AgentToolName,
  args: unknown,
): string | undefined => {
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
  return STORY_OPERATION_SHAPE_HINTS[operation];
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
