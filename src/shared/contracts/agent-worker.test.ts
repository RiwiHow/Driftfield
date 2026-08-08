import { describe, expect, it } from 'vitest';

import {
  isAgentWorkerCommand,
  isAgentWorkerMessage,
} from './agent-worker';

describe('Agent utility-process protocol', () => {
  it('accepts application-owned worker commands', () => {
    expect(
      isAgentWorkerCommand({
        authPath: '/app-data/auth.json',
        cwd: '/project',
        modelsPath: '/app-data/models.json',
        prompt: 'Review this chapter',
        requestId: 'request-1',
        type: 'start',
      }),
    ).toBe(true);
    expect(
      isAgentWorkerCommand({
        content: 'Chapter text',
        requestId: 'request-1',
        toolCallId: 'tool-1',
        type: 'tool-result',
      }),
    ).toBe(true);
  });

  it('rejects malformed worker commands', () => {
    expect(
      isAgentWorkerCommand({ prompt: 'missing identity', type: 'start' }),
    ).toBe(false);
    expect(
      isAgentWorkerCommand({ requestId: 'request-1', type: 'tool-result' }),
    ).toBe(false);
  });

  it('accepts typed stream and tool messages', () => {
    expect(isAgentWorkerMessage({ type: 'ready' })).toBe(true);
    expect(
      isAgentWorkerMessage({
        delta: 'text',
        requestId: 'request-1',
        type: 'text-delta',
      }),
    ).toBe(true);
    expect(
      isAgentWorkerMessage({
        requestId: 'request-1',
        toolCallId: 'tool-1',
        type: 'tool-request',
      }),
    ).toBe(true);
  });

  it('rejects malformed worker messages', () => {
    expect(
      isAgentWorkerMessage({ requestId: 'request-1', type: 'text-delta' }),
    ).toBe(false);
    expect(
      isAgentWorkerMessage({ requestId: 1, type: 'completed' }),
    ).toBe(false);
  });
});
