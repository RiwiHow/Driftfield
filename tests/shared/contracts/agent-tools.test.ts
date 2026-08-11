import { describe, expect, it } from 'vitest';

import {
  isAgentToolAuditName,
  isAgentToolExecutionResult,
  isAgentToolName,
  isAgentToolRequest,
} from '../../../src/shared/contracts/agent-tools';

describe('Agent proposal tool contract', () => {
  it('keeps former read names only for historical conversation audit', () => {
    expect(isAgentToolName('get_novel_structure')).toBe(false);
    expect(isAgentToolAuditName('get_novel_structure')).toBe(true);
    expect(isAgentToolName('read_novel_context')).toBe(true);
  });

  it('validates bounded batched novel-context reads', () => {
    expect(isAgentToolRequest({
      arguments: {
        directoryIds: ['world-directory'],
        documentIds: ['chapter-1', 'lore-1'],
        include: ['structure', 'story_state'],
      },
      toolName: 'read_novel_context',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: { directoryIds: [], documentIds: [], include: [] },
      toolName: 'read_novel_context',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        directoryIds: ['world-directory', 'world-directory'],
        documentIds: [],
        include: [],
      },
      toolName: 'read_novel_context',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        directoryIds: [],
        documentIds: ['chapter-1', 'chapter-1'],
        include: ['structure'],
      },
      toolName: 'read_novel_context',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: {
        documents: [{
          baseRevision: 'a'.repeat(64),
          contentRevision: 'b'.repeat(64),
          documentId: 'chapter-1',
          markdown: '# Chapter',
          source: 'disk',
          title: 'Chapter One',
        }],
      },
      ok: true,
      toolName: 'read_novel_context',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: { documents: [] },
      ok: true,
      toolName: 'read_novel_context',
    })).toBe(true);
  });

  it('validates bounded Curator-to-Scribe assignments and artifacts', () => {
    expect(isAgentToolRequest({
      arguments: { markdown: '# Draft\n\nOnly manuscript prose.' },
      toolName: 'submit_writing_artifact',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: { markdown: '   ' },
      toolName: 'submit_writing_artifact',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: { status: 'submitted' },
      ok: true,
      toolName: 'submit_writing_artifact',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        replacements: [{
          expectedOccurrences: 2,
          find: '织母议会议会',
          replace: '织母议会',
        }],
        writingAssignmentId: 'scribe-task-1',
      },
      toolName: 'revise_writing_artifact',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        replacements: [{
          expectedOccurrences: 1,
          find: 'same',
          replace: 'same',
        }],
        writingAssignmentId: 'scribe-task-1',
      },
      toolName: 'revise_writing_artifact',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: {
        assignmentId: 'scribe-task-1',
        replacementsApplied: 2,
        status: 'revised',
      },
      ok: true,
      toolName: 'revise_writing_artifact',
    })).toBe(true);
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
        objective: 'Write a new opening chapter.',
        requirements: ['Return a complete Markdown draft.'],
        targetDocumentId: null,
        targetLength: null,
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
    expect(isAgentToolRequest({
      arguments: {
        changes: [
          {
            clientRef: 'arrival',
            displayTime: 'Late spring',
            note: '',
            operation: 'create_moment',
            orderKey: 1,
            precision: 'season',
            timelineId: 'timeline-1',
          },
          {
            causes: '',
            consequences: '',
            endMomentId: null,
            eventStatus: undefined,
            operation: 'create_event',
            participants: [],
            startMomentId: '@arrival',
            status: 'established',
            summary: '',
            timelineId: 'timeline-1',
            title: 'Arrival',
          },
        ],
        storyRevision: 1,
      },
      toolName: 'maintain_story_records',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        changes: [
          {
            clientRef: 'arrival',
            displayTime: 'Late spring',
            note: '',
            operation: 'create_moment',
            orderKey: 1,
            precision: 'season',
            timelineId: 'timeline-1',
          },
          {
            causes: '',
            consequences: '',
            endMomentId: null,
            operation: 'create_event',
            participants: [],
            startMomentId: '@arrival',
            status: 'established',
            summary: '',
            timelineId: 'timeline-1',
            title: 'Arrival',
          },
        ],
        storyRevision: 1,
      },
      toolName: 'maintain_story_records',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: {
        changes: [
          {
            clientRef: 'arrival',
            entityId: 'moment-1',
            operation: 'create_moment',
            operationId: 'operation-1',
          },
          {
            clientRef: null,
            entityId: null,
            operation: 'link_beat_event',
            operationId: 'operation-2',
          },
        ],
        operationIds: ['operation-1', 'operation-2'],
        revision: 1,
        status: 'applied',
      },
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
        writingAssignmentId: null,
      },
      toolName: 'propose_document_edit',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        baseContentRevision: 'a'.repeat(64),
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        markdown: null,
        writingAssignmentId: 'scribe-task-1',
      },
      toolName: 'propose_document_edit',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        baseContentRevision: 'a'.repeat(64),
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        markdown: '# Proposed',
        writingAssignmentId: 'scribe-task-1',
      },
      toolName: 'propose_document_edit',
    })).toBe(false);
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
      error: {
        code: 'node-kind-mismatch',
        detail: '{"expectedKind":"document","actualKind":"directory"}',
      },
      ok: false,
      toolName: 'read_novel_context',
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
        icon: 'landmark',
        operation: 'create_lore_category',
        projectRevision: 'a'.repeat(64),
        title: 'Society',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        icon: 'not-an-icon',
        operation: 'create_lore_category',
        projectRevision: 'a'.repeat(64),
        title: 'Society',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        directoryId: 'society-id',
        operation: 'delete_lore_category',
        projectRevision: 'a'.repeat(64),
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
        writingAssignmentId: null,
      },
      toolName: 'propose_document_file_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        kind: 'chapter',
        markdown: null,
        operation: 'create',
        parentId: 'manuscript-1',
        projectRevision: 'a'.repeat(64),
        title: 'New chapter',
        writingAssignmentId: 'scribe-task-1',
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
