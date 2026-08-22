import { describe, expect, it } from 'vitest';

import {
  isAgentToolExecutionResult,
  isAgentToolName,
  isAgentToolRequest,
} from '../../../src/shared/contracts/agent-tools';

describe('Agent tool contracts', () => {
  it('uses Bash as the only project read tool', () => {
    expect(isAgentToolName('bash')).toBe(true);
    expect(isAgentToolName('obsolete_context_reader')).toBe(false);
    expect(isAgentToolName('delegate_writing')).toBe(false);
    expect(isAgentToolName('revise_writing_artifact')).toBe(false);
    expect(isAgentToolRequest({
      arguments: { command: "rg -n 'White Tower' lore" }, toolName: 'bash',
    })).toBe(true);
  });

  it('validates bounded Bash results', () => {
    expect(isAgentToolExecutionResult({
      data: { exitCode: 0, stderr: '', stdout: 'lore/World.md\n' },
      ok: true,
      toolName: 'bash',
    })).toBe(true);
  });

  it('correlates path-based mutation arguments with their tool names', () => {
    expect(isAgentToolRequest({
      arguments: { documentPath: 'lore/World.md', markdown: '# World' },
      toolName: 'propose_document_edit',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: { documentId: 'document:1', markdown: '# World' },
      toolName: 'propose_document_edit',
    })).toBe(false);
  });
});
