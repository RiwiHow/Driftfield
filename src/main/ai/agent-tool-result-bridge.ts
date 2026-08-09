import type {
  AgentToolExecutionResult,
  AgentToolName,
} from '../../shared/contracts/agent-tools';

interface PendingToolResult {
  reject: (error: Error) => void;
  resolve: (result: AgentToolExecutionResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface AgentToolRequest {
  arguments: unknown;
  requestId: string;
  toolCallId: string;
  toolName: AgentToolName;
}

export class AgentToolResultBridge {
  private readonly pending = new Map<string, PendingToolResult>();

  constructor(
    private readonly sendRequest: (request: AgentToolRequest) => void,
    private readonly timeoutMs: number,
  ) {}

  request(
    requestId: string,
    toolCallId: string,
    toolName: AgentToolName,
    args: unknown,
  ): Promise<AgentToolExecutionResult> {
    const key = this.key(requestId, toolCallId);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error('Agent tool timed out'));
      }, this.timeoutMs);
      this.pending.set(key, { reject, resolve, timeout });
      this.sendRequest({ arguments: args, requestId, toolCallId, toolName });
    });
  }

  resolve(
    requestId: string,
    toolCallId: string,
    result: AgentToolExecutionResult,
  ): boolean {
    const key = this.key(requestId, toolCallId);
    const pending = this.pending.get(key);
    if (pending === undefined) return false;
    clearTimeout(pending.timeout);
    this.pending.delete(key);
    pending.resolve(result);
    return true;
  }

  rejectRequest(requestId: string): void {
    for (const [key, pending] of this.pending) {
      if (!key.startsWith(`${requestId}:`)) continue;
      clearTimeout(pending.timeout);
      pending.reject(new Error('Agent request ended'));
      this.pending.delete(key);
    }
  }

  private key(requestId: string, toolCallId: string): string {
    return `${requestId}:${toolCallId}`;
  }
}
