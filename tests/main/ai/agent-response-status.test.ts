import { describe, expect, it } from 'vitest';

import { didAssistantResponseFail } from '../../../src/main/ai/agent-response-status';

describe('Agent response status', () => {
  it('treats provider error and unexpected abort responses as failures', () => {
    expect(
      didAssistantResponseFail({ role: 'assistant', stopReason: 'error' }),
    ).toBe(true);
    expect(
      didAssistantResponseFail({ role: 'assistant', stopReason: 'aborted' }),
    ).toBe(true);
  });

  it('does not turn successful or non-assistant messages into failures', () => {
    expect(
      didAssistantResponseFail({ role: 'assistant', stopReason: 'stop' }),
    ).toBe(false);
    expect(didAssistantResponseFail({ role: 'toolResult' })).toBe(false);
  });
});
