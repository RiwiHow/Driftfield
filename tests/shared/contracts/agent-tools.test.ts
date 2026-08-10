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
      data: { proposalId: 'proposal-1', status: 'accepted' },
      ok: true,
      toolName: 'propose_document_edit',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: { proposalId: 'proposal-1', status: 'proposed' },
      ok: true,
      toolName: 'propose_document_edit',
    })).toBe(false);
  });

  it('validates project structure proposal variants', () => {
    expect(isAgentToolRequest({
      arguments: {
        operation: 'create_volume',
        projectRevision: 'a'.repeat(64),
        title: 'Volume Two',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        operation: 'move_document',
        projectRevision: 'a'.repeat(64),
        targetParentId: 'volume-2',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        documentId: 'chapter-1',
        operation: 'move_document',
        projectRevision: 'a'.repeat(64),
        targetParentId: 'volume-2',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(false);
  });

  it('validates create and delete document proposal variants', () => {
    expect(isAgentToolRequest({
      arguments: {
        kind: 'chapter',
        markdown: '# New',
        operation: 'create',
        parentId: 'manuscript-1',
        projectRevision: 'a'.repeat(64),
        title: 'New chapter',
      },
      toolName: 'propose_document_file_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        operation: 'delete',
        projectRevision: 'a'.repeat(64),
      },
      toolName: 'propose_document_file_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        documentId: 'chapter-1',
        operation: 'delete',
        projectRevision: 'a'.repeat(64),
      },
      toolName: 'propose_document_file_operation',
    })).toBe(false);
  });
});
