import type {
  AgentToolContractMap,
  AgentToolExecutionResult,
  AgentToolName,
  AgentToolRequest as SharedAgentToolRequest,
} from '../../shared/contracts/agent-tools';

interface PendingToolResult {
  reject: (error: Error) => void;
  resolve: (result: AgentToolExecutionResult) => void;
  timeout: ReturnType<typeof setTimeout>;
  toolName: AgentToolName;
}

export type AgentToolBridgeRequest = SharedAgentToolRequest & {
  requestId: string;
  toolCallId: string;
};

export class AgentToolResultBridge {
  private readonly pending = new Map<string, PendingToolResult>();

  constructor(
    private readonly sendRequest: (request: AgentToolBridgeRequest) => void,
    private readonly timeoutMs: number,
  ) {}

  request<Name extends AgentToolName>(
    requestId: string,
    toolCallId: string,
    toolName: Name,
    args: AgentToolContractMap[Name]['arguments'],
  ): Promise<AgentToolExecutionResult<Name>> {
    const key = this.key(requestId, toolCallId);
    return new Promise<AgentToolExecutionResult<Name>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error('Agent tool timed out'));
      }, this.timeoutMs);
      this.pending.set(key, {
        reject,
        resolve: (result) => resolve(result as AgentToolExecutionResult<Name>),
        timeout,
        toolName,
      });
      this.sendRequest({
        arguments: args,
        requestId,
        toolCallId,
        toolName,
      } as AgentToolBridgeRequest);
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
    if (result.toolName !== pending.toolName) {
      pending.reject(new Error('Agent tool result identity mismatch'));
      return false;
    }
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
