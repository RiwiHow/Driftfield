export interface StartAgentPromptRequest {
  currentDocumentId?: string;
  prompt: string;
}

export interface StartAgentPromptResult {
  requestId: string;
}

export interface CancelAgentRequest {
  requestId: string;
}

export interface CancelAgentResult {
  cancelled: boolean;
}

export type AgentEvent =
  | { requestId: string; type: 'started' }
  | { delta: string; requestId: string; type: 'text-delta' }
  | { requestId: string; type: 'completed' }
  | { requestId: string; type: 'cancelled' }
  | { message: string; requestId: string; type: 'error' };
