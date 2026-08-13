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
        directoryIds: ['directory:1'],
        documentIds: ['document:1', 'document:2'],
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
    expect(isAgentToolRequest({
      arguments: {
        directoryIds: [],
        documentIds: ['document:100000'],
        include: [],
      },
      toolName: 'read_novel_context',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: {
        documents: [{
          baseRevision: 'revision:1',
          contentRevision: 'revision:2',
          displayTitle: '1. Chapter One',
          documentId: 'document:1',
          markdown: '# Chapter',
          metadataTitle: 'Chapter One',
          source: 'disk',
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
    expect(isAgentToolExecutionResult({
      data: { currentDocument: null, documents: [] },
      ok: true,
      toolName: 'read_novel_context',
    })).toBe(true);
  });

  it('validates the terminal Scribe artifact and keeps retired tools audit-only', () => {
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
    expect(isAgentToolName('delegate_writing')).toBe(false);
    expect(isAgentToolName('revise_writing_artifact')).toBe(false);
    expect(isAgentToolAuditName('delegate_writing')).toBe(true);
    expect(isAgentToolAuditName('revise_writing_artifact')).toBe(true);
  });

  it('validates atomic generated-document target plans', () => {
    const createArguments = {
      baseContentRevision: null,
      baseRevision: null,
      documentAction: 'create' as const,
      documentDomain: 'manuscript' as const,
      documentId: null,
      kind: 'chapter' as const,
      metadataTitle: 'Second chapter',
      objective: 'Write a new second chapter.',
      parentId: 'directory:1',
      projectRevision: 'revision:1',
      requirements: [],
      targetLength: 3_000,
    };
    expect(isAgentToolRequest({
      arguments: createArguments,
      toolName: 'propose_document_writing',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        ...createArguments,
        projectRevision: 'a'.repeat(64),
      },
      toolName: 'propose_document_writing',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: { ...createArguments, documentId: 'document:1' },
      toolName: 'propose_document_writing',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        ...createArguments,
        baseContentRevision: 'revision:3',
        baseRevision: 'revision:2',
        documentAction: 'replace',
        documentId: 'document:1',
        kind: null,
        metadataTitle: null,
        parentId: null,
        projectRevision: null,
      },
      toolName: 'propose_document_writing',
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
        changes: [{
          clientRef: 'a'.repeat(33),
          name: 'Mara',
          operation: 'create_persona',
          role: null,
          summary: '',
        }],
        storyRevision: 0,
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
            timelineId: 'timeline:1',
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
            timelineId: 'timeline:1',
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
            timelineId: 'timeline:1',
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
            timelineId: 'timeline:1',
            title: 'Arrival',
          },
        ],
        storyRevision: 1,
      },
      toolName: 'maintain_story_records',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: {
        appliedCount: 2,
        revision: 1,
        status: 'applied',
      },
      ok: true,
      toolName: 'maintain_story_records',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: {
        appliedCount: 2,
        operationIds: ['internal-audit-id'],
        revision: 1,
        status: 'applied',
      },
      ok: true,
      toolName: 'maintain_story_records',
    })).toBe(false);
  });

  it('validates one-call first-chapter reconciliation', () => {
    const request = {
      arguments: {
        events: [{
          displayTime: 'Dawn',
          participants: [{
            description: 'Makes the agreement.',
            personaRef: '@shan',
            role: 'actor',
          }],
          precision: 'approximate',
          summary: 'Shan meets the reader by the canal.',
          title: 'Canal meeting',
        }],
        newPersonae: [{
          clientRef: 'shan',
          name: 'Shan',
          role: 'protagonist',
          summary: 'A student newly arrived in Morning Bay.',
        }],
        newThreads: [],
        primaryTimeline: { summary: '', title: 'Morning Bay timeline' },
        threadAdvances: [],
      },
      toolName: 'reconcile_accepted_document',
    };

    expect(isAgentToolRequest(request)).toBe(true);
    expect(isAgentToolExecutionResult({
      data: {
        appliedCount: 4,
        reconciliationStatus: 'complete',
        revision: 1,
        status: 'applied',
      },
      ok: true,
      toolName: 'reconcile_accepted_document',
    })).toBe(true);
    expect(isAgentToolRequest({
      ...request,
      arguments: {
        ...request.arguments,
        newPersonae: [
          request.arguments.newPersonae[0],
          request.arguments.newPersonae[0],
        ],
      },
    })).toBe(false);
  });

  it('correlates validated proposal arguments and results', () => {
    expect(isAgentToolRequest({
      arguments: {
        baseContentRevision: 'revision:2',
        baseRevision: 'revision:1',
        documentId: 'document:1',
        markdown: '# Proposed',
      },
      toolName: 'propose_document_edit',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        baseContentRevision: 'revision:2',
        baseRevision: 'revision:1',
        documentId: 'document:1',
        markdown: null,
      },
      toolName: 'propose_document_edit',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        baseContentRevision: 'revision:2',
        baseRevision: 'revision:1',
        documentId: 'document:1',
        markdown: '# Proposed',
        unexpected: true,
      },
      toolName: 'propose_document_edit',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: { documentId: 'document:1', markdown: '# Proposed' },
      toolName: 'propose_document_edit',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: { status: 'accepted' },
      ok: true,
      toolName: 'propose_document_edit',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: {
        proposalId: 'ba778599-40fd-4718-b596-75ca5933ef04',
        status: 'accepted',
      },
      ok: true,
      toolName: 'propose_document_edit',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: { status: 'proposed' },
      ok: true,
      toolName: 'propose_document_edit',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: {
        contentRevision: 'revision:2',
        documentId: 'document:3',
        status: 'accepted',
      },
      ok: true,
      toolName: 'propose_document_writing',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: { status: 'rejected' },
      ok: true,
      toolName: 'propose_document_writing',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: {
        contentRevision: 'revision:2',
        documentId: 'document:3',
        proposalId: 'ba778599-40fd-4718-b596-75ca5933ef04',
        status: 'accepted',
      },
      ok: true,
      toolName: 'propose_document_writing',
    })).toBe(false);
    expect(isAgentToolExecutionResult({
      data: {
        contentRevision: 'revision:2',
        documentId: 'document:3',
        status: 'rejected',
      },
      ok: true,
      toolName: 'propose_document_writing',
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
      error: {
        code: 'expired-request-reference',
        detail: 'Read structure again without selectors.',
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

  it('accepts request-scoped refs in model-facing story snapshots', () => {
    const storyState = {
      beats: [],
      eventLinks: [],
      eventParticipants: [],
      eventSources: [{
        anchor: null,
        documentId: 'document:1',
        documentRevision: 'revision:1',
        eventId: 'event:1',
        id: 'request:1',
        relation: 'depicted' as const,
        sourceKind: 'manuscript' as const,
      }],
      events: [],
      moments: [],
      personae: [],
      questions: [],
      revision: 1,
      threads: [],
      timelines: [],
    };
    expect(isAgentToolExecutionResult({
      data: {
        documents: [],
        storyState,
      },
      ok: true,
      toolName: 'read_novel_context',
    })).toBe(true);
    expect(isAgentToolExecutionResult({
      data: {
        documents: [],
        storyState: {
          ...storyState,
          eventSources: [{
            ...storyState.eventSources[0],
            documentId: '550e8400-e29b-41d4-a716-446655440000',
          }],
        },
      },
      ok: true,
      toolName: 'read_novel_context',
    })).toBe(false);
  });

  it('validates project structure proposal variants', () => {
    expect(isAgentToolRequest({
      arguments: {
        operation: 'create_volume',
        projectRevision: 'revision:1',
        title: 'Volume Two',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        icon: 'landmark',
        operation: 'create_lore_category',
        projectRevision: 'revision:1',
        title: 'Society',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        icon: 'not-an-icon',
        operation: 'create_lore_category',
        projectRevision: 'revision:1',
        title: 'Society',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        directoryId: 'directory:1',
        operation: 'delete_lore_category',
        projectRevision: 'revision:1',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        baseRevision: 'revision:2',
        documentId: 'document:1',
        operation: 'move_document',
        projectRevision: 'revision:1',
        targetParentId: 'directory:2',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        documentId: 'document:1',
        operation: 'move_document',
        projectRevision: 'revision:1',
        targetParentId: 'directory:2',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        documentId: 'document:1',
        metadataTitle: 'The silent island',
        operation: 'rename_document',
        projectRevision: 'revision:1',
      },
      toolName: 'propose_project_structure_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        displayTitle: '3. The silent island',
        documentId: 'document:1',
        operation: 'rename_document',
        projectRevision: 'revision:1',
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
        parentId: 'directory:1',
        projectRevision: 'revision:1',
        metadataTitle: 'New chapter',
      },
      toolName: 'propose_document_file_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        kind: 'chapter',
        markdown: '# New',
        operation: 'create',
        parentId: 'directory:1',
        projectRevision: 'revision:1',
        metadataTitle: 'New chapter',
        unexpected: true,
      },
      toolName: 'propose_document_file_operation',
    })).toBe(false);
    expect(isAgentToolRequest({
      arguments: {
        baseRevision: 'revision:2',
        documentId: 'document:1',
        operation: 'delete',
        projectRevision: 'revision:1',
      },
      toolName: 'propose_document_file_operation',
    })).toBe(true);
    expect(isAgentToolRequest({
      arguments: {
        documentId: 'document:1',
        operation: 'delete',
        projectRevision: 'revision:1',
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
            documentId: 'document:1',
            documentRevision: 'revision:1',
            relation: 'depicted',
            sourceKind: 'manuscript',
          }],
          startMomentId: 'moment:1',
          status: 'established',
          summary: '',
          timelineId: 'timeline:1',
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
          timelineId: '550e8400-e29b-41d4-a716-446655440000',
        },
      },
    })).toBe(false);
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
      data: { questionId: 'question:1', revision: 0, status: 'recorded' },
      ok: true,
      toolName: 'record_story_question',
    })).toBe(true);
  });
});
