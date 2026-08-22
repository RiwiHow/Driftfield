import { describe, expect, it } from 'vitest';

import { serializeSuccessfulToolResult } from '../../../src/main/ai/agent-tool-model-result';

describe('Agent tool model results', () => {
  it('serializes a successful Bash inspection result', () => {
    expect(serializeSuccessfulToolResult({
      data: { exitCode: 0, stderr: '', stdout: './PROJECT.json\n' },
      ok: true,
      toolName: 'bash',
    })).toBe('{"data":{"exitCode":0,"stderr":"","stdout":"./PROJECT.json\\n"},"ok":true,"toolName":"bash"}');
  });
});
