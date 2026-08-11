import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentToolDispatcher } from '../../../src/main/ai/agent-tool-dispatcher';
import {
  ProjectContextError,
  type ProjectContextService,
} from '../../../src/main/ai/project-context-service';
import type { AgentProposalService } from '../../../src/main/ai/agent-proposal-service';
import { isAgentToolExecutionResult } from '../../../src/shared/contracts/agent-tools';

afterEach(() => vi.useRealTimers());

const documentResult = {
  baseRevision: 'base',
  contentRevision: 'content',
  displayTitle: '1. Chapter',
  documentId: 'chapter-1',
  markdown: '# Chapter',
  metadataTitle: 'Chapter',
  source: 'disk' as const,
};

const novelStructure = {
  availableIcons: [],
  format: 'driftfield' as const,
  lore: {
    children: [{
      children: [{
        displayTitle: 'World entry',
        id: 'lore-1',
        kind: 'entry' as const,
        metadataTitle: 'World entry',
        type: 'document' as const,
      }],
      id: 'world-directory',
      kind: 'category' as const,
      title: 'World',
      type: 'directory' as const,
    }],
    id: 'lore-root',
    kind: 'lore' as const,
    title: 'Lore',
    type: 'directory' as const,
  },
  manuscript: {
    children: [{
      displayTitle: '1. Chapter',
      id: 'chapter-1',
      kind: 'chapter' as const,
      metadataTitle: 'Chapter',
      type: 'document' as const,
    }],
    id: 'manuscript-root',
    kind: 'manuscript' as const,
    title: 'Manuscript',
    type: 'directory' as const,
  },
  project: { id: 'project-1', revision: 'revision', title: 'Novel' },
};

const scope = { ownerId: 7, projectSessionId: 'session-1', requestId: 'request-1' };

describe('AgentToolDispatcher', () => {
  it('reads selected novel context and persisted documents in one bounded call', async () => {
    const currentDocument = { ...documentResult, source: 'draft' as const };
    const storyState = { revision: 4 };
    const context = {
      getCurrentDocument: vi.fn().mockResolvedValue(currentDocument),
      getDocument: vi.fn().mockImplementation(async (_scope, documentId) => ({
        ...documentResult,
        documentId,
      })),
      getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
      getStoryState: vi.fn().mockResolvedValue(storyState),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);

    await expect(dispatcher.execute(scope, {
      arguments: {
        directoryIds: ['world-directory'],
        documentIds: ['chapter-1', 'lore-1'],
        include: ['structure', 'current_document', 'story_state'],
      },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      data: {
        currentDocument,
        documents: [
          documentResult,
          { ...documentResult, documentId: 'lore-1' },
        ],
        storyState,
        structure: novelStructure,
      },
      ok: true,
      toolName: 'read_novel_context',
    });
    expect(context.getDocument).toHaveBeenCalledTimes(2);
    expect(context.getNovelStructure).toHaveBeenCalledWith({
      ownerId: 7,
      projectSessionId: 'session-1',
    });
  });

  it('reconciles an accepted document through request-scoped refs without exposing UUIDs', async () => {
    const story = {
      beats: [{
        description: 'The first clue.',
        desiredOutcome: '',
        dramaticPurpose: '',
        id: 'beat-uuid',
        kind: 'setup' as const,
        orderKey: 0,
        parentId: null,
        status: 'active' as const,
        threadId: 'thread-uuid',
        title: 'First clue',
      }],
      eventLinks: [],
      eventParticipants: [{
        description: 'Witnessed the clue.',
        eventId: 'event-uuid',
        personaId: 'persona-uuid',
        role: 'actor' as const,
      }],
      eventSources: [],
      events: [{
        causes: '',
        consequences: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        endMomentId: null,
        id: 'event-uuid',
        startMomentId: 'moment-uuid',
        status: 'established' as const,
        summary: 'An earlier clue appeared.',
        timelineId: 'timeline-uuid',
        title: 'Earlier clue',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      moments: [{
        displayTime: 'Year 1',
        id: 'moment-uuid',
        note: '',
        orderKey: 0,
        precision: 'exact' as const,
        timelineId: 'timeline-uuid',
      }],
      personae: [{
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'persona-uuid',
        kind: 'character' as const,
        name: 'Serra',
        role: 'Weaver',
        summary: 'Investigates the crystal.',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      questions: [],
      revision: 6,
      threads: [{
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'thread-uuid',
        orderKey: 0,
        parentId: null,
        status: 'active' as const,
        summary: 'The blue crystal mystery.',
        title: 'Blue crystal',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      timelines: [{
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'timeline-uuid',
        isPrimary: true,
        summary: 'Main chronology.',
        title: 'Main timeline',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    };
    const maintainStoryRecords = vi.fn((
      _scope: unknown,
      _requestId: string,
      _revision: number,
      _changes: Array<Record<string, unknown>>,
    ) => ({
      appliedCount: 4,
      revision: 7,
      status: 'applied' as const,
    }));
    const recordStoryQuestion = vi.fn(() => ({
      questionId: 'question-1',
      revision: 8,
      status: 'recorded' as const,
    }));
    const context = {
      getDocument: vi.fn().mockResolvedValue({
        ...documentResult,
        contentRevision: 'a'.repeat(64),
      }),
      getStoryState: vi.fn().mockResolvedValue(story),
      maintainStoryRecords,
      recordStoryQuestion,
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);
    const acceptedScope = { ...scope, acceptedDocumentId: 'chapter-1' };

    const readResult = await dispatcher.execute(acceptedScope, {
      arguments: {
        directoryIds: [],
        documentIds: [],
        include: ['accepted_reconciliation'],
      },
      toolName: 'read_novel_context',
    });
    expect(readResult).toMatchObject({
      data: {
        documents: [],
        reconciliation: {
          acceptedDocument: { ref: 'document:accepted' },
          personae: [{ name: 'Serra', ref: 'persona:1' }],
          primaryTimeline: { ref: 'timeline:primary' },
          storyRef: 'story:accepted',
          threads: [{ ref: 'thread:1', title: 'Blue crystal' }],
        },
      },
      ok: true,
    });
    const serializedRead = JSON.stringify(readResult);
    expect(serializedRead).not.toContain('persona-uuid');
    expect(serializedRead).not.toContain('thread-uuid');
    expect(serializedRead).not.toContain('timeline-uuid');
    expect(isAgentToolExecutionResult(readResult)).toBe(true);

    const storyChanged = vi.fn();
    const writeResult = await dispatcher.execute({ ...acceptedScope, storyChanged }, {
      arguments: {
        events: [{
          displayTime: 'Year 1, late spring',
          participants: [{
            description: 'Follows the erased memory.',
            personaRef: 'persona:1',
            role: 'actor',
          }],
          precision: 'approximate',
          summary: 'The mirror glows blue and Serra turns back.',
          title: 'The mirror glows',
        }],
        threadAdvances: [{
          description: 'Serra chooses to investigate.',
          kind: 'turning_point',
          relation: 'realizes',
          threadRef: 'thread:1',
          title: 'Turn the boat back',
        }],
      },
      toolName: 'reconcile_accepted_document',
    });
    expect(writeResult).toEqual({
      data: { appliedCount: 4, revision: 7, status: 'applied' },
      ok: true,
      toolName: 'reconcile_accepted_document',
    });
    expect(isAgentToolExecutionResult(writeResult)).toBe(true);
    expect(maintainStoryRecords).toHaveBeenCalledWith(
      { ownerId: 7, projectSessionId: 'session-1' },
      'request-1',
      6,
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'create_event',
          sources: [expect.objectContaining({
            documentId: 'chapter-1',
            documentRevision: 'a'.repeat(64),
          })],
        }),
        expect.objectContaining({
          operation: 'create_beat',
          threadId: 'thread-uuid',
        }),
      ]),
    );
    const appliedChanges = maintainStoryRecords.mock.calls[0]![3];
    expect(appliedChanges.find(({ operation }) => operation === 'create_moment'))
      .toMatchObject({
        displayTime: 'Year 1, late spring',
        precision: 'approximate',
      });
    const createdEvent = appliedChanges.find(
      ({ operation }) => operation === 'create_event',
    );
    expect(createdEvent).toMatchObject({ startMomentId: '@accepted_moment' });
    expect(createdEvent).not.toHaveProperty('displayTime');
    expect(createdEvent).not.toHaveProperty('precision');
    expect(storyChanged).toHaveBeenCalledWith(7);

    const questionResult = await dispatcher.execute(
      { ...acceptedScope, storyChanged },
      {
        arguments: {
          context: 'The accepted chapter leaves the actor uncertain.',
          evidence: {
            anchor: 'The mirror glowed.',
            sourceRef: 'document:accepted',
          },
          kind: 'other',
          options: [],
          question: 'Who altered the mirror?',
        },
        toolName: 'record_story_question',
      },
    );
    expect(isAgentToolExecutionResult(questionResult)).toBe(true);
    expect(recordStoryQuestion).toHaveBeenCalledWith(
      { ownerId: 7, projectSessionId: 'session-1' },
      'request-1',
      expect.objectContaining({
        evidence: {
          anchor: 'The mirror glowed.',
          documentId: 'chapter-1',
          documentRevision: 'a'.repeat(64),
          sourceKind: 'manuscript',
        },
      }),
    );
  });

  it('returns a typed node-kind error before reading a directory as a document', async () => {
    const context = {
      getDocument: vi.fn(),
      getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);

    await expect(dispatcher.execute(scope, {
      arguments: {
        directoryIds: [],
        documentIds: ['world-directory'],
        include: [],
      },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      error: {
        code: 'node-kind-mismatch',
        detail: JSON.stringify({
          actualKind: 'directory',
          expectedKind: 'document',
          nodeId: 'world-directory',
          title: 'World',
        }),
      },
      ok: false,
      toolName: 'read_novel_context',
    });
    expect(context.getDocument).not.toHaveBeenCalled();
  });

  it('rejects directory expansion beyond the global document limit', async () => {
    const oversizedStructure = {
      ...novelStructure,
      lore: {
        ...novelStructure.lore,
        children: [{
          ...novelStructure.lore.children[0],
          children: Array.from({ length: 5 }, (_, index) => ({
            id: `lore-${index + 1}`,
            kind: 'entry' as const,
            title: `Entry ${index + 1}`,
            type: 'document' as const,
          })),
        }],
      },
    };
    const context = {
      getDocument: vi.fn(),
      getNovelStructure: vi.fn().mockResolvedValue(oversizedStructure),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);

    await expect(dispatcher.execute(scope, {
      arguments: {
        directoryIds: ['world-directory'],
        documentIds: [],
        include: [],
      },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      error: {
        code: 'selection-too-large',
        detail: JSON.stringify({ limit: 4, resolvedDocumentCount: 5 }),
      },
      ok: false,
      toolName: 'read_novel_context',
    });
    expect(context.getDocument).not.toHaveBeenCalled();
  });

  it('routes a bounded writing assignment through the Main-owned task callback', async () => {
    const getNovelStructure = vi.fn().mockResolvedValue(novelStructure);
    const dispatcher = new AgentToolDispatcher({
      getNovelStructure,
    } as unknown as ProjectContextService);
    const delegateWriting = vi.fn(async () => ({
      assignmentId: 'scribe-task-1',
      markdown: '# Draft',
      status: 'completed' as const,
    }));

    await expect(dispatcher.execute({
      delegateWriting,
      ownerId: 1,
      requestId: 'request-1',
    }, {
      arguments: {
        objective: 'Write the next scene.',
        requirements: ['Keep the established point of view.'],
        targetDocumentId: 'chapter-1',
        targetLength: 1_000,
      },
      toolName: 'delegate_writing',
    })).resolves.toEqual({
      data: {
        assignmentId: 'scribe-task-1',
        markdown: '# Draft',
        status: 'completed',
      },
      ok: true,
      toolName: 'delegate_writing',
    });
    expect(delegateWriting).toHaveBeenCalledOnce();
    expect(getNovelStructure).toHaveBeenCalledOnce();
  });

  it('delegates new-document writing with a null target and rejects directory targets', async () => {
    const getNovelStructure = vi.fn().mockResolvedValue(novelStructure);
    const dispatcher = new AgentToolDispatcher({
      getNovelStructure,
    } as unknown as ProjectContextService);
    const delegateWriting = vi.fn(async () => ({
      assignmentId: 'scribe-task-1',
      markdown: '# Draft',
      status: 'completed' as const,
    }));

    await expect(dispatcher.execute({
      ...scope,
      delegateWriting,
    }, {
      arguments: {
        objective: 'Write a new opening chapter.',
        requirements: ['Return complete Markdown.'],
        targetDocumentId: null,
        targetLength: null,
      },
      toolName: 'delegate_writing',
    })).resolves.toMatchObject({ ok: true, toolName: 'delegate_writing' });
    expect(getNovelStructure).not.toHaveBeenCalled();

    await expect(dispatcher.execute({
      ...scope,
      delegateWriting,
    }, {
      arguments: {
        objective: 'Write a new opening chapter.',
        requirements: ['Return complete Markdown.'],
        targetDocumentId: 'manuscript-root',
        targetLength: null,
      },
      toolName: 'delegate_writing',
    })).resolves.toEqual({
      error: {
        code: 'node-kind-mismatch',
        detail: JSON.stringify({
          actualKind: 'directory',
          expectedKind: 'document',
          nodeId: 'manuscript-root',
          title: 'Manuscript',
        }),
      },
      ok: false,
      toolName: 'delegate_writing',
    });
    expect(delegateWriting).toHaveBeenCalledOnce();
  });

  it('returns a recoverable hint for malformed writing assignments', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);

    await expect(dispatcher.execute(scope, {
      arguments: {
        objective: 'Write a new opening chapter.',
        requirements: [],
        targetDocumentId: '',
      },
      toolName: 'delegate_writing',
    })).resolves.toEqual({
      error: {
        code: 'invalid-arguments',
        detail: expect.stringContaining('For a new document, set targetDocumentId to null'),
      },
      ok: false,
      toolName: 'delegate_writing',
    });
  });

  it('routes bounded exact Scribe artifact revisions through the active request scope', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);
    const reviseWritingArtifact = vi.fn(() => ({
      ok: true as const,
      result: {
        assignmentId: 'scribe-task-1',
        replacementsApplied: 2,
        status: 'revised' as const,
      },
    }));
    const replacements = [{
      expectedOccurrences: 2,
      find: '织母议会议会',
      replace: '织母议会',
    }];

    await expect(dispatcher.execute({
      ...scope,
      reviseWritingArtifact,
    }, {
      arguments: {
        replacements,
        writingAssignmentId: 'scribe-task-1',
      },
      toolName: 'revise_writing_artifact',
    })).resolves.toEqual({
      data: {
        assignmentId: 'scribe-task-1',
        replacementsApplied: 2,
        status: 'revised',
      },
      ok: true,
      toolName: 'revise_writing_artifact',
    });
    expect(reviseWritingArtifact).toHaveBeenCalledWith(
      'scribe-task-1',
      replacements,
    );
  });

  it('applies bounded story maintenance and emits the new revision', async () => {
    const change = {
      name: 'Lin',
      operation: 'create_persona' as const,
      role: 'Protagonist',
      summary: '',
    };
    const context = {
      maintainStoryRecords: vi.fn(() => ({
        appliedCount: 1,
        revision: 1,
        status: 'applied' as const,
      })),
    } as unknown as ProjectContextService;
    const storyChanged = vi.fn();
    const dispatcher = new AgentToolDispatcher(context);

    await expect(dispatcher.execute(
      { ...scope, storyChanged },
      {
        arguments: { changes: [change], storyRevision: 0 },
        toolName: 'maintain_story_records',
      },
    )).resolves.toEqual({
      data: {
        appliedCount: 1,
        revision: 1,
        status: 'applied',
      },
      ok: true,
      toolName: 'maintain_story_records',
    });
    expect(context.maintainStoryRecords).toHaveBeenCalledWith(
      { ownerId: 7, projectSessionId: 'session-1' },
      'request-1',
      0,
      [change],
    );
    expect(storyChanged).toHaveBeenCalledWith(1);
  });

  it('records an ambiguity without applying a canonical story operation', async () => {
    const context = {
      recordStoryQuestion: vi.fn(() => ({
        questionId: 'question-1',
        revision: 4,
        status: 'recorded' as const,
      })),
    } as unknown as ProjectContextService;
    const storyChanged = vi.fn();
    const dispatcher = new AgentToolDispatcher(context);
    const arguments_ = {
      context: 'Lin already exists.',
      evidence: null,
      kind: 'possible_alias' as const,
      options: ['Alias', 'New person'],
      question: 'Is Little Lin the same person as Lin?',
    };

    await expect(dispatcher.execute({ ...scope, storyChanged }, {
      arguments: arguments_,
      toolName: 'record_story_question',
    })).resolves.toEqual({
      data: { questionId: 'question-1', revision: 4, status: 'recorded' },
      ok: true,
      toolName: 'record_story_question',
    });
    expect(context.recordStoryQuestion).toHaveBeenCalledWith(
      { ownerId: 7, projectSessionId: 'session-1' },
      'request-1',
      arguments_,
    );
    expect(storyChanged).toHaveBeenCalledWith(4);
  });

  it('reads story state and emits a reviewed story proposal', async () => {
    const story = {
      beats: [],
      eventLinks: [],
      eventParticipants: [],
      eventSources: [],
      events: [],
      moments: [],
      personae: [],
      questions: [],
      revision: 0,
      threads: [],
      timelines: [],
    };
    const change = {
      name: 'Lin',
      operation: 'create_persona' as const,
      role: 'Protagonist',
      summary: '',
    };
    const proposal = {
      change,
      operation: 'story' as const,
      proposalId: 'proposal-story',
      requestId: 'request-1',
      storyRevision: 0,
      title: 'Lin',
    };
    const context = {
      getStoryState: vi.fn().mockResolvedValue(story),
    } as unknown as ProjectContextService;
    const proposals = {
      cancelRequest: vi.fn(),
      createStoryOperation: vi.fn(() => proposal),
      waitForDecision: vi.fn().mockResolvedValue({
        proposalId: proposal.proposalId,
        status: 'accepted',
      }),
    } as unknown as AgentProposalService;
    const sendProposal = vi.fn();
    const dispatcher = new AgentToolDispatcher(context, undefined, proposals);

    await expect(dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: ['story_state'] },
      toolName: 'read_novel_context',
    })).resolves.toMatchObject({
      data: { documents: [], storyState: story },
      ok: true,
    });
    await expect(dispatcher.execute({ ...scope, sendProposal }, {
      arguments: { change, storyRevision: 0 },
      toolName: 'propose_story_operation',
    })).resolves.toMatchObject({
      data: { proposalId: proposal.proposalId, status: 'accepted' },
      ok: true,
    });
    expect(sendProposal).toHaveBeenCalledWith(proposal);
  });

  it('returns a typed argument error for a malformed story operation', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);
    await expect(dispatcher.execute(scope, {
      arguments: {
        change: {
          description: 'Wrong generic field',
          name: 'Imperial calendar',
          note: '',
          operation: 'create_timeline',
          title: 'Imperial calendar',
        },
        storyRevision: 0,
      },
      toolName: 'propose_story_operation',
    })).resolves.toEqual({
      error: {
        code: 'invalid-arguments',
        detail: 'change.description is not valid for create_timeline.',
      },
      ok: false,
      toolName: 'propose_story_operation',
    });
  });

  it('identifies the exact invalid item in a story maintenance batch', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);
    await expect(dispatcher.execute(scope, {
      arguments: {
        changes: [{
          clientRef: 'hearing',
          displayTime: 'Late spring',
          note: '',
          operation: 'create_moment',
          orderKey: 2,
          precision: 'season',
          timelineId: 'timeline-1',
        }, {
          causes: '',
          consequences: '',
          endMomentId: null,
          operation: 'create_event',
          participants: [],
          startMomentId: '@hearing',
          status: undefined,
          summary: '',
          timelineId: 'timeline-1',
          title: 'The hearing',
        }],
        storyRevision: 5,
      },
      toolName: 'maintain_story_records',
    })).resolves.toEqual({
      error: {
        code: 'invalid-arguments',
        detail: 'changes[1].eventStatus is required for create_event.',
      },
      ok: false,
      toolName: 'maintain_story_records',
    });
  });

  it('returns a recoverable source hint for malformed document proposals', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);

    await expect(dispatcher.execute(scope, {
      arguments: {
        baseContentRevision: 'a'.repeat(64),
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        markdown: null,
      },
      toolName: 'propose_document_edit',
    })).resolves.toEqual({
      error: {
        code: 'invalid-arguments',
        detail: expect.stringContaining(
          'set markdown null and use the assignmentId returned by delegate_writing',
        ),
      },
      ok: false,
      toolName: 'propose_document_edit',
    });
  });

  it('emits a reviewed proposal without writing through the context service', async () => {
    const proposal = {
      baseContentRevision: 'a'.repeat(64),
      baseMarkdown: '# Original',
      baseRevision: 'b'.repeat(64),
      documentId: 'chapter-1',
      markdown: '# Proposed',
      proposalId: 'proposal-1',
      requestId: 'request-1',
      title: 'Chapter',
    };
    const proposals = {
      cancelRequest: vi.fn(),
      create: vi.fn(() => proposal),
      waitForDecision: vi.fn().mockResolvedValue({
        proposalId: 'proposal-1',
        status: 'accepted',
      }),
    } as unknown as AgentProposalService;
    const sendProposal = vi.fn();
    const claimWritingArtifact = vi.fn(() => proposal.markdown);
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    await expect(dispatcher.execute(
      { ...scope, claimWritingArtifact, sendProposal },
      {
        arguments: {
          baseContentRevision: proposal.baseContentRevision,
          baseRevision: proposal.baseRevision,
          documentId: proposal.documentId,
          markdown: null,
          writingAssignmentId: 'scribe-task-1',
        },
        toolName: 'propose_document_edit',
      },
    )).resolves.toEqual({
      data: { proposalId: 'proposal-1', status: 'accepted' },
      ok: true,
      toolName: 'propose_document_edit',
    });
    expect(claimWritingArtifact).toHaveBeenCalledWith('scribe-task-1', 'chapter-1');
    expect(proposals.create).toHaveBeenCalledWith(
      expect.anything(),
      {
        baseContentRevision: proposal.baseContentRevision,
        baseRevision: proposal.baseRevision,
        documentId: proposal.documentId,
        markdown: proposal.markdown,
      },
    );
    expect(sendProposal).toHaveBeenCalledWith(proposal);
  });

  it('releases a Scribe artifact claim when proposal construction fails', async () => {
    const proposals = {
      cancelRequest: vi.fn(),
      create: vi.fn(() => {
        throw new ProjectContextError('proposal-base-changed');
      }),
    } as unknown as AgentProposalService;
    const claimWritingArtifact = vi.fn(() => '# Proposed');
    const releaseWritingArtifactClaim = vi.fn();
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    await expect(dispatcher.execute({
      ...scope,
      claimWritingArtifact,
      releaseWritingArtifactClaim,
    }, {
      arguments: {
        baseContentRevision: 'a'.repeat(64),
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        markdown: null,
        writingAssignmentId: 'scribe-task-1',
      },
      toolName: 'propose_document_edit',
    })).resolves.toEqual({
      error: { code: 'proposal-base-changed' },
      ok: false,
      toolName: 'propose_document_edit',
    });
    expect(releaseWritingArtifactClaim).toHaveBeenCalledWith('scribe-task-1');
  });

  it('keeps a proposal tool pending beyond ordinary tool timeouts until approval', async () => {
    vi.useFakeTimers();
    const proposal = {
      baseContentRevision: 'a'.repeat(64),
      baseMarkdown: '# Original',
      baseRevision: 'b'.repeat(64),
      documentId: 'chapter-1',
      markdown: '# Proposed',
      proposalId: 'proposal-waiting',
      requestId: 'request-1',
      title: 'Chapter',
    };
    let resolveDecision!: (value: {
      proposalId: string;
      status: 'accepted';
    }) => void;
    const decision = new Promise<{
      proposalId: string;
      status: 'accepted';
    }>((resolve) => {
      resolveDecision = resolve;
    });
    const proposals = {
      cancelRequest: vi.fn(),
      create: vi.fn(() => proposal),
      waitForDecision: vi.fn(() => decision),
    } as unknown as AgentProposalService;
    const sendProposal = vi.fn();
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      { maxCalls: 2, maxResultBytes: 10_000, maxTotalResultBytes: 10_000, timeoutMs: 10 },
      proposals,
    );
    const result = dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          baseContentRevision: proposal.baseContentRevision,
          baseRevision: proposal.baseRevision,
          documentId: proposal.documentId,
          markdown: proposal.markdown,
          writingAssignmentId: null,
        },
        toolName: 'propose_document_edit',
      },
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(sendProposal).toHaveBeenCalledWith(proposal);
    resolveDecision({ proposalId: proposal.proposalId, status: 'accepted' });
    await expect(result).resolves.toMatchObject({
      data: { proposalId: proposal.proposalId, status: 'accepted' },
      ok: true,
    });
  });

  it('emits a reviewed create proposal through the structural tool', async () => {
    const proposal = {
      documentId: 'chapter-created',
      documentKind: 'chapter' as const,
      markdown: '# Created',
      operation: 'create' as const,
      parentId: 'manuscript-1',
      parentTitle: 'Manuscript',
      projectRevision: 'a'.repeat(64),
      proposalId: 'proposal-create',
      requestId: 'request-1',
      title: 'Created',
    };
    const proposals = {
      cancelRequest: vi.fn(),
      createFileOperation: vi.fn().mockResolvedValue(proposal),
      waitForDecision: vi.fn().mockResolvedValue({
        proposalId: 'proposal-create',
        status: 'accepted',
      }),
    } as unknown as AgentProposalService;
    const sendProposal = vi.fn();
    const claimWritingArtifact = vi.fn(() => proposal.markdown);
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    await expect(dispatcher.execute(
      { ...scope, claimWritingArtifact, sendProposal },
      {
        arguments: {
          kind: 'chapter',
          markdown: null,
          operation: 'create',
          parentId: 'manuscript-1',
          projectRevision: 'a'.repeat(64),
          metadataTitle: 'Created',
          writingAssignmentId: 'scribe-task-1',
        },
        toolName: 'propose_document_file_operation',
      },
    )).resolves.toEqual({
      data: { proposalId: 'proposal-create', status: 'accepted' },
      ok: true,
      toolName: 'propose_document_file_operation',
    });
    expect(claimWritingArtifact).toHaveBeenCalledWith('scribe-task-1', null);
    expect(proposals.createFileOperation).toHaveBeenCalledWith(
      expect.anything(),
      {
        kind: 'chapter',
        markdown: '# Created',
        operation: 'create',
        parentId: 'manuscript-1',
        projectRevision: 'a'.repeat(64),
        metadataTitle: 'Created',
      },
    );
    expect(sendProposal).toHaveBeenCalledWith(proposal);
  });

  it('emits a reviewed project structure proposal', async () => {
    const proposal = {
      directoryId: 'volume-2',
      directoryKind: 'volume' as const,
      operation: 'create_volume' as const,
      parentId: 'manuscript-1',
      parentTitle: 'Manuscript',
      projectRevision: 'a'.repeat(64),
      proposalId: 'proposal-volume',
      requestId: 'request-1',
      title: 'Volume Two',
    };
    const proposals = {
      cancelRequest: vi.fn(),
      createStructureOperation: vi.fn().mockResolvedValue(proposal),
      waitForDecision: vi.fn().mockResolvedValue({
        proposalId: 'proposal-volume',
        status: 'rejected',
      }),
    } as unknown as AgentProposalService;
    const sendProposal = vi.fn();
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    await expect(dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          operation: 'create_volume',
          projectRevision: 'a'.repeat(64),
          title: 'Volume Two',
        },
        toolName: 'propose_project_structure_operation',
      },
    )).resolves.toEqual({
      data: { proposalId: 'proposal-volume', status: 'rejected' },
      ok: true,
      toolName: 'propose_project_structure_operation',
    });
    expect(sendProposal).toHaveBeenCalledWith(proposal);
  });

  it('emits a reviewed document metadata-title proposal', async () => {
    const proposal = {
      documentId: 'chapter-3',
      operation: 'rename_document' as const,
      previousTitle: '3. Silent Island',
      projectRevision: 'a'.repeat(64),
      proposalId: 'proposal-rename',
      requestId: 'request-1',
      title: 'Silent Island',
    };
    const proposals = {
      cancelRequest: vi.fn(),
      createStructureOperation: vi.fn().mockResolvedValue(proposal),
      waitForDecision: vi.fn().mockResolvedValue({
        proposalId: proposal.proposalId,
        status: 'accepted',
      }),
    } as unknown as AgentProposalService;
    const sendProposal = vi.fn();
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    await expect(dispatcher.execute({ ...scope, sendProposal }, {
      arguments: {
        documentId: proposal.documentId,
        metadataTitle: proposal.title,
        operation: 'rename_document',
        projectRevision: proposal.projectRevision,
      },
      toolName: 'propose_project_structure_operation',
    })).resolves.toMatchObject({
      data: { proposalId: proposal.proposalId, status: 'accepted' },
      ok: true,
    });
    expect(proposals.createStructureOperation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadataTitle: 'Silent Island',
        operation: 'rename_document',
      }),
    );
    expect(sendProposal).toHaveBeenCalledWith(proposal);
  });

  it('validates arguments and enforces the per-request call budget', async () => {
    const context = {
      getDocument: vi.fn().mockResolvedValue(documentResult),
      getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 1,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 10_000,
      timeoutMs: 1_000,
    });

    await expect(dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: [], path: '/tmp/book.md' },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      error: { code: 'invalid-arguments' },
      ok: false,
      toolName: 'read_novel_context',
    });
    await expect(dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: ['chapter-1'], include: [] },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      error: { code: 'tool-budget-exceeded' },
      ok: false,
      toolName: 'read_novel_context',
    });
    expect(context.getDocument).not.toHaveBeenCalled();
  });

  it('returns a typed timeout error', async () => {
    vi.useFakeTimers();
    const context = {
      getDocument: vi.fn(() => new Promise(() => {})),
      getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 2,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 10_000,
      timeoutMs: 25,
    });
    const result = dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: ['chapter-1'], include: [] },
      toolName: 'read_novel_context',
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({
      error: { code: 'tool-timeout' },
      ok: false,
      toolName: 'read_novel_context',
    });
  });

  it('enforces cumulative result bytes and can release request state', async () => {
    const context = {
      getDocument: vi.fn().mockResolvedValue(documentResult),
      getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 3,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 250,
      timeoutMs: 1_000,
    });
    const first = await dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: ['chapter-1'], include: [] },
      toolName: 'read_novel_context',
    });
    const second = await dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: ['chapter-1'], include: [] },
      toolName: 'read_novel_context',
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      error: { code: 'tool-budget-exceeded' },
      ok: false,
      toolName: 'read_novel_context',
    });
    dispatcher.release(scope.requestId);
    await expect(dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: ['chapter-1'], include: [] },
      toolName: 'read_novel_context',
    })).resolves.toMatchObject({ ok: true });
  });

  it('cancels a pending proposal decision when request state is released', () => {
    const proposals = {
      cancelRequest: vi.fn(),
    } as unknown as AgentProposalService;
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    dispatcher.release(scope.requestId);

    expect(proposals.cancelRequest).toHaveBeenCalledWith(scope.requestId);
  });

  it('uses a Main-owned checkpoint to complete story reconciliation', async () => {
    const completeStoryReconciliation = vi.fn(() => ({ ok: true }));
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);

    await expect(dispatcher.execute(
      { ...scope, completeStoryReconciliation },
      {
        arguments: { reason: 'No canonical changes found.', status: 'no_changes' },
        toolName: 'complete_story_reconciliation',
      },
    )).resolves.toEqual({
      data: { status: 'complete' },
      ok: true,
      toolName: 'complete_story_reconciliation',
    });
    expect(completeStoryReconciliation).toHaveBeenCalledWith('no_changes');
  });
});
