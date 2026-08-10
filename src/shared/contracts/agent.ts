export const AGENT_ROLES = [
  'coordinator',
  'writing',
  'continuity',
  'editing',
  'research',
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];
export type AgentErrorCode = 'request-failed' | 'runtime-exited';
export type StartAgentErrorCode =
  | 'credential-missing'
  | 'model-not-configured'
  | 'runtime-unavailable';

export interface StartAgentPromptRequest {
  conversationId: string;
  currentDocumentId?: string;
  draftSnapshot?: import('./agent-tools').AgentDraftSnapshot;
  editMessageId?: string;
  prompt: string;
  requestId: string;
  userMessageId: string;
}

export type StartAgentPromptResult =
  | { requestId: string; status: 'started' }
  | { code: StartAgentErrorCode; status: 'error' };

export interface CancelAgentRequest {
  requestId: string;
}

export interface CancelAgentResult {
  cancelled: boolean;
}

export type AgentEvent =
  | { requestId: string; type: 'started' }
  | { delta: string; requestId: string; type: 'text-delta' }
  | {
      input: string;
      requestId: string;
      toolCallId: string;
      toolName: import('./agent-tools').AgentToolName;
      type: 'tool-started';
    }
  | {
      failed: boolean;
      output: string;
      requestId: string;
      toolCallId: string;
      toolName: import('./agent-tools').AgentToolName;
      type: 'tool-completed';
    }
  | {
      proposal: import('./agent-proposals').AgentDocumentProposal;
      requestId: string;
      type: 'proposal';
    }
  | { requestId: string; type: 'completed' }
  | { requestId: string; type: 'cancelled' }
  | { code: AgentErrorCode; requestId: string; type: 'error' };
