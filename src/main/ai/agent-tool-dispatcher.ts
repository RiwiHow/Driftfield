import type {
  AgentDraftSnapshot,
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
import type { AgentDocumentProposal } from '../../shared/contracts/agent-proposals';

export interface AgentToolScope {
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
  sendProposal?: (proposal: AgentDocumentProposal) => void;
}

export interface AgentToolPolicy {
  maxCalls: number;
  maxResultBytes: number;
  maxTotalResultBytes: number;
  timeoutMs: number;
}

export const DEFAULT_AGENT_TOOL_POLICY: AgentToolPolicy = {
  maxCalls: 12,
  maxResultBytes: 640 * 1024,
  maxTotalResultBytes: 2 * 1024 * 1024,
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
      return this.error(request.toolName, 'invalid-arguments');
    }

    try {
      const operation = this.executeValidated(scope, request);
      const result = await this.withTimeout(operation);
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
    if (request.toolName === 'get_novel_structure') {
      return {
        data: await this.context.getNovelStructure(contextScope),
        ok: true,
        toolName: request.toolName,
      };
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
      scope.sendProposal?.(proposal);
      return {
        data: { proposalId: proposal.proposalId, status: 'proposed' },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_document_file_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const proposal = await this.proposals.createFileOperation(
        scope,
        request.arguments,
      );
      scope.sendProposal?.(proposal);
      return {
        data: { proposalId: proposal.proposalId, status: 'proposed' },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_project_structure_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const proposal = await this.proposals.createStructureOperation(
        scope,
        request.arguments,
      );
      scope.sendProposal?.(proposal);
      return {
        data: { proposalId: proposal.proposalId, status: 'proposed' },
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
  ): AgentToolFailureResult<Name> {
    return { error: { code }, ok: false, toolName } as AgentToolFailureResult<Name>;
  }
}

class ToolTimeoutError extends Error {}
