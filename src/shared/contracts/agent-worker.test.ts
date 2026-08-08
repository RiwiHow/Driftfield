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
        modelId: 'claude-sonnet',
        modelsPath: '/app-data/models.json',
        prompt: 'Review this chapter',
        providerId: 'anthropic',
        requestId: 'request-1',
        thinkingLevel: 'medium',
        type: 'start',
      }),
    ).toBe(true);
    expect(
      isAgentWorkerCommand({
        authPath: '/app-data/auth.json',
        modelsPath: '/app-data/models.json',
        requestId: 'models-1',
        type: 'list-models',
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
        models: [
          {
            contextWindow: 100_000,
            id: 'claude-sonnet',
            maxOutputTokens: 8_192,
            name: 'Claude Sonnet',
            providerId: 'anthropic',
            reasoning: true,
          },
        ],
        requestId: 'models-1',
        type: 'models',
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
