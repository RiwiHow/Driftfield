import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentToolResultBridge } from '../../../src/main/ai/agent-tool-result-bridge';

afterEach(() => vi.useRealTimers());

describe('AgentToolResultBridge', () => {
  it('rejects a tool request that exceeds its deadline', async () => {
    vi.useFakeTimers();
    const sendRequest = vi.fn();
    const bridge = new AgentToolResultBridge(sendRequest, 30_000);
    const result = bridge.request(
      'request-1',
      'tool-1',
      'get_current_document',
      {},
    );
    const rejection = expect(result).rejects.toThrow(
      'Agent tool timed out',
    );

    expect(sendRequest).toHaveBeenCalledWith({
      requestId: 'request-1',
      toolCallId: 'tool-1',
      toolName: 'get_current_document',
      arguments: {},
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(
      bridge.resolve('request-1', 'tool-1', {
        error: { code: 'internal-error' },
        ok: false,
        toolName: 'get_current_document',
      }),
    ).toBe(false);
  });

  it('rejects pending tools when their Agent request ends', async () => {
    const bridge = new AgentToolResultBridge(() => {}, 30_000);
    const result = bridge.request(
      'request-1',
      'tool-1',
      'get_current_document',
      {},
    );

    bridge.rejectRequest('request-1');

    await expect(result).rejects.toThrow('Agent request ended');
  });
});
