import type {
  AgentDraftSnapshot,
  AgentToolExecutionResult,
  AgentToolName,
} from '../../shared/contracts/agent-tools';
import {
  ProjectContextError,
  type ProjectContextService,
} from './project-context-service';

export interface AgentToolScope {
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
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
  ) {}

  async execute(
    scope: AgentToolScope,
    toolName: AgentToolName,
    args: unknown,
  ): Promise<AgentToolExecutionResult> {
    const budget = this.budgets.get(scope.requestId) ?? { calls: 0, resultBytes: 0 };
    if (budget.calls >= this.policy.maxCalls) {
      return this.error(toolName, 'tool-budget-exceeded');
    }
    budget.calls += 1;
    this.budgets.set(scope.requestId, budget);

    if (!this.hasValidArguments(toolName, args)) {
      return this.error(toolName, 'invalid-arguments');
    }

    try {
      const operation = this.executeValidated(scope, toolName, args);
      const data = await this.withTimeout(operation);
      const result: AgentToolExecutionResult = { data, ok: true, toolName };
      const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
      if (
        bytes > this.policy.maxResultBytes ||
        budget.resultBytes + bytes > this.policy.maxTotalResultBytes
      ) {
        return this.error(toolName, 'tool-budget-exceeded');
      }
      budget.resultBytes += bytes;
      return result;
    } catch (error) {
      if (error instanceof ProjectContextError) return this.error(toolName, error.code);
      if (error instanceof ToolTimeoutError) return this.error(toolName, 'tool-timeout');
      return this.error(toolName, 'internal-error');
    }
  }

  release(requestId: string): void {
    this.budgets.delete(requestId);
  }

  private async executeValidated(
    scope: AgentToolScope,
    toolName: AgentToolName,
    args: unknown,
  ) {
    const contextScope = {
      ...(scope.draftSnapshot === undefined ? {} : { draftSnapshot: scope.draftSnapshot }),
      ownerId: scope.ownerId,
      projectSessionId: scope.projectSessionId,
    };
    if (toolName === 'get_novel_structure') {
      return await this.context.getNovelStructure(contextScope);
    }
    if (toolName === 'get_current_document') {
      return await this.context.getCurrentDocument(contextScope);
    }
    return await this.context.getDocument(
      contextScope,
      (args as { documentId: string }).documentId,
    );
  }

  private hasValidArguments(toolName: AgentToolName, args: unknown): boolean {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) return false;
    const record = args as Record<string, unknown>;
    if (toolName !== 'get_document') return Object.keys(record).length === 0;
    return Object.keys(record).length === 1 &&
      typeof record.documentId === 'string' &&
      record.documentId.length > 0 &&
      record.documentId.length <= 128;
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

  private error(
    toolName: AgentToolName,
    code: Extract<AgentToolExecutionResult, { ok: false }>['error']['code'],
  ): AgentToolExecutionResult {
    return { error: { code }, ok: false, toolName };
  }
}

class ToolTimeoutError extends Error {}
