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
      'read_novel_context',
      { directoryIds: [], documentIds: [], include: ['current_document'] },
    );
    const rejection = expect(result).rejects.toThrow(
      'Agent tool timed out',
    );

    expect(sendRequest).toHaveBeenCalledWith({
      requestId: 'request-1',
      toolCallId: 'tool-1',
      toolName: 'read_novel_context',
      arguments: { directoryIds: [], documentIds: [], include: ['current_document'] },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(
      bridge.resolve('request-1', 'tool-1', {
        error: { code: 'internal-error' },
        ok: false,
        toolName: 'read_novel_context',
      }),
    ).toBe(false);
  });

  it('rejects pending tools when their Agent request ends', async () => {
    const bridge = new AgentToolResultBridge(() => {}, 30_000);
    const result = bridge.request(
      'request-1',
      'tool-1',
      'read_novel_context',
      { directoryIds: [], documentIds: [], include: ['current_document'] },
    );

    bridge.rejectRequest('request-1');

    await expect(result).rejects.toThrow('Agent request ended');
  });

  it('stops waiting for a Main result when Pi aborts the tool call', async () => {
    const controller = new AbortController();
    const bridge = new AgentToolResultBridge(() => {}, 30_000);
    const result = bridge.request(
      'request-1',
      'tool-1',
      'read_novel_context',
      { directoryIds: [], documentIds: [], include: ['current_document'] },
      controller.signal,
    );

    controller.abort();

    await expect(result).rejects.toThrow('Agent tool aborted');
    expect(bridge.resolve('request-1', 'tool-1', {
      data: { documents: [] },
      ok: true,
      toolName: 'read_novel_context',
    })).toBe(false);
  });

  it('keeps reviewed proposal tools pending until a user decision', async () => {
    vi.useFakeTimers();
    const bridge = new AgentToolResultBridge(() => {}, 30_000);
    const result = bridge.request(
      'request-1',
      'tool-story',
      'propose_story_operation',
      {
        change: {
          isPrimary: true,
          operation: 'create_timeline',
          summary: '',
          title: 'Primary Chronicle',
        },
        storyRevision: 0,
      },
    );

    await vi.advanceTimersByTimeAsync(120_000);
    expect(bridge.resolve('request-1', 'tool-story', {
      data: { proposalId: 'proposal-1', status: 'accepted' },
      ok: true,
      toolName: 'propose_story_operation',
    })).toBe(true);
    await expect(result).resolves.toMatchObject({
      data: { status: 'accepted' },
      ok: true,
    });
  });

  it('rejects a result for a different tool identity', async () => {
    const bridge = new AgentToolResultBridge(() => {}, 30_000);
    const result = bridge.request(
      'request-1',
      'tool-1',
      'read_novel_context',
      { directoryIds: [], documentIds: [], include: ['current_document'] },
    );

    expect(
      bridge.resolve('request-1', 'tool-1', {
        error: { code: 'document-not-found' },
        ok: false,
        toolName: 'maintain_story_records',
      }),
    ).toBe(false);
    await expect(result).rejects.toThrow('identity mismatch');
  });

  it('rejects a duplicate call identity without orphaning the first call', async () => {
    const bridge = new AgentToolResultBridge(() => {}, 30_000);
    const first = bridge.request(
      'request:with:colons',
      'tool:with:colons',
      'read_novel_context',
      { directoryIds: [], documentIds: [], include: ['current_document'] },
    );
    await expect(bridge.request(
      'request:with:colons',
      'tool:with:colons',
      'read_novel_context',
      { directoryIds: [], documentIds: [], include: ['current_document'] },
    )).rejects.toThrow('Duplicate Agent tool call identity');

    expect(bridge.resolve('request:with:colons', 'tool:with:colons', {
      data: { currentDocument: null, documents: [] },
      ok: true,
      toolName: 'read_novel_context',
    })).toBe(true);
    await expect(first).resolves.toMatchObject({ ok: true });
  });
});
