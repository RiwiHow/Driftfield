import { describe, expect, it } from 'vitest';

import {
  isAgentToolExecutionResult,
  isAgentToolRequest,
} from '../../../src/shared/contracts/agent-tools';

describe('Agent proposal tool contract', () => {
  it('validates bounded Curator-to-Scribe assignments and artifacts', () => {
    expect(isAgentToolRequest({
      arguments: {
        objective: 'Continue the confrontation scene.',
        requirements: ['Keep Mara in close third person.', 'End on the door opening.'],
        targetDocumentId: 'chapter-1',
        targetLength: 1_200,
      },
      toolName: 'delegate_writing',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        objective: '',
        requirements: [],
        targetDocumentId: null,
        targetLength: null,
      },
      toolName: 'delegate_writing',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: {
        assignmentId: 'scribe-task-1',
        markdown: '# Draft',
        status: 'completed',
      },
      ok: true,
      toolName: 'delegate_writing',
    })).toBe(true);
  });

  it('validates bounded atomic story-maintenance changesets', () => {
    expect(isAgentToolRequest({
      arguments: {
        changes: [
          { name: 'Mara', operation: 'create_persona', role: null, summary: '' },
          { name: 'Teacher Zhou', operation: 'create_persona', role: 'Teacher', summary: '' },
        ],
        storyRevision: 0,
      },
      toolName: 'maintain_story_records',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: { changes: [], storyRevision: 0 },
      toolName: 'maintain_story_records',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: { operationIds: ['operation-1', 'operation-2'], revision: 1, status: 'applied' },
      ok: true,
      toolName: 'maintain_story_records',
    })).toBe(true);
  });

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

  it('accepts bounded typed tool-error details and rejects oversized details', () => {
    expect(isAgentToolExecutionResult({
      error: {
        code: 'invalid-arguments',
        detail: 'create_beat status must be active.',
      },
      ok: false,
      toolName: 'maintain_story_records',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      error: { code: 'invalid-arguments', detail: 'x'.repeat(1_001) },
      ok: false,
      toolName: 'maintain_story_records',
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

  it('validates manuscript evidence on reviewed Chronicle events', () => {
    const request = {
      arguments: {
        change: {
          causes: '',
          consequences: '',
          endMomentId: null,
          operation: 'create_event',
          participants: [],
          sources: [{
            anchor: 'Mara opens the sealed door.',
            documentId: 'chapter-1',
            documentRevision: 'a'.repeat(64),
            relation: 'depicted',
            sourceKind: 'manuscript',
          }],
          startMomentId: 'moment-1',
          status: 'established',
          summary: '',
          timelineId: 'timeline-1',
          title: 'The sealed door opens',
        },
        storyRevision: 2,
      },
      toolName: 'propose_story_operation',
    } as const;

    expect(isAgentToolRequest(request)).toBe(true);
    expect(isAgentToolRequest({
      ...request,
      arguments: {
        ...request.arguments,
        change: {
          ...request.arguments.change,
          sources: [{
            ...request.arguments.change.sources[0],
            relation: 'invented',
          }],
        },
      },
    })).toBe(false);
  });

  it('validates structured story questions and resolutions', () => {
    expect(isAgentToolRequest({
      arguments: {
        context: 'Lin already exists.',
        evidence: null,
        kind: 'possible_alias',
        options: ['Alias', 'New person'],
        question: 'Is Little Lin the same person as Lin?',
      },
      toolName: 'record_story_question',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: { answer: '', questionId: 'question-1' },
      toolName: 'resolve_story_question',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: { questionId: 'question-1', revision: 0, status: 'recorded' },
      ok: true,
      toolName: 'record_story_question',
    })).toBe(true);
  });
});
