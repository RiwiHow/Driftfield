import {
  isLongRunningAgentTool,
  type AgentToolContractMap,
  type AgentToolExecutionResult,
  type AgentToolName,
  type AgentToolRequest as SharedAgentToolRequest,
} from '../../../shared/contracts/agent-tools';

interface PendingToolResult {
  abortListener?: () => void;
  reject: (error: Error) => void;
  requestId: string;
  resolve: (result: AgentToolExecutionResult) => void;
  signal?: AbortSignal;
  timeout: ReturnType<typeof setTimeout> | null;
  toolName: AgentToolName;
}

type AgentToolBridgeRequest = SharedAgentToolRequest & {
  requestId: string;
  toolCallId: string;
};

/** Bridges worker tool calls to their bounded Main-owned results. */
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
    signal?: AbortSignal,
  ): Promise<AgentToolExecutionResult<Name>> {
    const key = this.key(requestId, toolCallId);
    if (this.pending.has(key)) {
      return Promise.reject(new Error('Duplicate Agent tool call identity'));
    }
    if (signal?.aborted === true) {
      return Promise.reject(new Error('Agent tool aborted'));
    }
    return new Promise<AgentToolExecutionResult<Name>>((resolve, reject) => {
      const timeout = isLongRunningAgentTool(toolName)
        ? null
        : setTimeout(() => {
            const pending = this.take(key);
            pending?.reject(new Error('Agent tool timed out'));
          }, this.timeoutMs);
      const pending: PendingToolResult = {
        reject,
        resolve: (result) => resolve(result as AgentToolExecutionResult<Name>),
        ...(signal === undefined ? {} : { signal }),
        requestId,
        timeout,
        toolName,
      };
      if (signal !== undefined) {
        pending.abortListener = () => {
          const aborted = this.take(key);
          aborted?.reject(new Error('Agent tool aborted'));
        };
      }
      this.pending.set(key, pending);
      if (pending.abortListener !== undefined) {
        signal!.addEventListener('abort', pending.abortListener, { once: true });
      }
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
    const pending = this.take(key);
    if (pending === undefined) return false;
    if (result.toolName !== pending.toolName) {
      pending.reject(new Error('Agent tool result identity mismatch'));
      return false;
    }
    pending.resolve(result);
    return true;
  }

  rejectRequest(requestId: string): void {
    for (const [key, pending] of this.pending) {
      if (pending.requestId !== requestId) continue;
      this.take(key)?.reject(new Error('Agent request ended'));
    }
  }

  private take(key: string): PendingToolResult | undefined {
    const pending = this.pending.get(key);
    if (pending === undefined) return undefined;
    this.pending.delete(key);
    if (pending.timeout !== null) clearTimeout(pending.timeout);
    if (pending.signal !== undefined && pending.abortListener !== undefined) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
    return pending;
  }

  private key(requestId: string, toolCallId: string): string {
    return JSON.stringify([requestId, toolCallId]);
  }
}
