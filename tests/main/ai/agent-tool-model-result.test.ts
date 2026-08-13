import { describe, expect, it } from 'vitest';

import { serializeSuccessfulToolResult } from '../../../src/main/ai/agent-tool-model-result';

describe('Agent tool model result', () => {
  it('serializes successful results as native tool content', () => {
    expect(serializeSuccessfulToolResult({
      data: { status: 'submitted' },
      ok: true,
      toolName: 'submit_writing_artifact',
    })).toBe('{"data":{"status":"submitted"},"ok":true,"toolName":"submit_writing_artifact"}');
  });

  it('throws Main failures so Pi marks the tool result as an error', () => {
    expect(() => serializeSuccessfulToolResult({
      error: { code: 'expired-request-reference' },
      ok: false,
      toolName: 'read_novel_context',
    })).toThrow('expired-request-reference');
  });
});
