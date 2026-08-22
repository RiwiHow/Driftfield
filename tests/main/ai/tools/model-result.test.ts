import { describe, expect, it } from 'vitest';

import { serializeSuccessfulToolResult } from '../../../../src/main/ai/tools/model-result';

describe('Agent tool model results', () => {
  it('serializes a successful Bash inspection result', () => {
    expect(serializeSuccessfulToolResult({
      data: { exitCode: 0, stderr: '', stdout: '/project/.index.json\n' },
      ok: true,
      toolName: 'bash',
    })).toBe('{"data":{"exitCode":0,"stderr":"","stdout":"/project/.index.json\\n"},"ok":true,"toolName":"bash"}');
  });
});
