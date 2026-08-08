export type AgentConversationPhase =
  | 'idle'
  | 'starting'
  | 'streaming'
  | 'cancelling'
  | 'cancelled'
  | 'failed'
  | 'completed';

export interface AgentConversationRunState {
  error: string | null;
  phase: AgentConversationPhase;
  requestId: string | null;
}

export type AgentConversationRunAction =
  | { requestId: string; type: 'start' }
  | { requestId: string; type: 'started' }
  | { requestId: string; type: 'cancel-requested' }
  | { requestId: string; type: 'completed' }
  | { requestId: string; type: 'cancelled' }
  | { error: string; requestId: string; type: 'failed' }
  | { type: 'reset' };

export const INITIAL_AGENT_RUN_STATE: AgentConversationRunState = {
  error: null,
  phase: 'idle',
  requestId: null,
};

export const isAgentConversationActive = (
  phase: AgentConversationPhase,
): boolean =>
  phase === 'starting' || phase === 'streaming' || phase === 'cancelling';

export const reduceAgentConversationRun = (
  state: AgentConversationRunState,
  action: AgentConversationRunAction,
): AgentConversationRunState => {
  if (action.type === 'reset') return INITIAL_AGENT_RUN_STATE;
  if (action.type === 'start') {
    return { error: null, phase: 'starting', requestId: action.requestId };
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
    return { error: action.error, phase: 'failed', requestId: null };
  }
  return {
    error: null,
    phase: action.type,
    requestId: null,
  };
};
