export type AgentConversationPhase =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'cancelling'
  | 'cancelled'
  | 'failed'
  | 'completed';

export type AgentConversationErrorCode =
  | 'cancel-ended'
  | 'cancel-failed'
  | 'credential-missing'
  | 'model-not-configured'
  | 'request-failed'
  | 'response-truncated'
  | 'runtime-exited'
  | 'start-failed'
  | 'workflow-incomplete';

export interface AgentConversationRunState {
  errorCode: AgentConversationErrorCode | null;
  phase: AgentConversationPhase;
  requestId: string | null;
}

export type AgentConversationRunAction =
  | { requestId: string; type: 'start' }
  | { requestId: string; type: 'started' }
  | { requestId: string; type: 'cancel-requested' }
  | { requestId: string; type: 'completed' }
  | { requestId: string; type: 'cancelled' }
  | { errorCode: AgentConversationErrorCode; requestId: string; type: 'failed' }
  | { type: 'reset' };

export const INITIAL_AGENT_RUN_STATE: AgentConversationRunState = {
  errorCode: null,
  phase: 'idle',
  requestId: null,
};

export const isAgentConversationActive = (
  phase: AgentConversationPhase,
): boolean =>
  phase === 'starting' || phase === 'streaming' || phase === 'cancelling';

export const isAgentConversationNearBottom = (
  metrics: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>,
  threshold = 72,
): boolean =>
  metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop <= threshold;

export const reduceAgentConversationRun = (
  state: AgentConversationRunState,
  action: AgentConversationRunAction,
): AgentConversationRunState => {
  if (action.type === 'reset') return INITIAL_AGENT_RUN_STATE;
  if (action.type === 'start') {
    return { errorCode: null, phase: 'starting', requestId: action.requestId };
  }
  if (state.requestId !== action.requestId) return state;
  if (action.type === 'started') {
    if (state.phase === 'cancelling') return state;
    return { ...state, phase: 'streaming' };
  }
  if (action.type === 'cancel-requested') {
    return { ...state, phase: 'cancelling' };
  }
  if (action.type === 'failed') {
    return { errorCode: action.errorCode, phase: 'failed', requestId: null };
  }
  return {
    errorCode: null,
    phase: action.type,
    requestId: null,
  };
};
