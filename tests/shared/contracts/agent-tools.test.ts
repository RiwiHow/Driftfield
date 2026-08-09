import { describe, expect, it } from 'vitest';

import {
  isAgentToolExecutionResult,
  isAgentToolRequest,
} from '../../../src/shared/contracts/agent-tools';

describe('Agent proposal tool contract', () => {
  it('correlates validated proposal arguments and results', () => {
    expect(isAgentToolRequest({
      arguments: {
        baseContentRevision: 'a'.repeat(64),
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        markdown: '# Proposed',
      },
      toolName: 'propose_document_edit',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: { documentId: 'chapter-1', markdown: '# Proposed' },
      toolName: 'propose_document_edit',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: { proposalId: 'proposal-1', status: 'proposed' },
      ok: true,
      toolName: 'propose_document_edit',
    })).toBe(true);
  });
});
