import { describe, expect, it } from 'vitest';

import {
  INITIAL_AGENT_RUN_STATE,
  isAgentConversationActive,
  reduceAgentConversationRun,
} from './agent-conversation-state';

describe('Agent conversation run state', () => {
  it('tracks startup, streaming, cancellation and completion explicitly', () => {
    const starting = reduceAgentConversationRun(INITIAL_AGENT_RUN_STATE, {
      requestId: 'request-1',
      type: 'start',
    });
    expect(starting.phase).toBe('starting');
    const streaming = reduceAgentConversationRun(starting, {
      requestId: 'request-1',
      type: 'started',
    });
    expect(streaming.phase).toBe('streaming');
    const cancelling = reduceAgentConversationRun(streaming, {
      requestId: 'request-1',
      type: 'cancel-requested',
    });
    expect(cancelling.phase).toBe('cancelling');
    expect(isAgentConversationActive(cancelling.phase)).toBe(true);
    expect(
      reduceAgentConversationRun(cancelling, {
        requestId: 'request-1',
        type: 'started',
      }).phase,
    ).toBe('cancelling');
    expect(
      reduceAgentConversationRun(cancelling, {
        requestId: 'request-1',
        type: 'cancelled',
      }).phase,
    ).toBe('cancelled');
  });

  it('ignores terminal events from stale requests', () => {
    const current = reduceAgentConversationRun(INITIAL_AGENT_RUN_STATE, {
      requestId: 'current',
      type: 'start',
    });
    expect(
      reduceAgentConversationRun(current, {
        requestId: 'stale',
        type: 'completed',
      }),
    ).toBe(current);
  });

  it('stores a semantic error code instead of localized prose', () => {
    const current = reduceAgentConversationRun(INITIAL_AGENT_RUN_STATE, {
      requestId: 'current',
      type: 'start',
    });
    expect(
      reduceAgentConversationRun(current, {
        errorCode: 'runtime-exited',
        requestId: 'current',
        type: 'failed',
      }),
    ).toEqual({
      errorCode: 'runtime-exited',
      phase: 'failed',
      requestId: null,
    });
  });
});
