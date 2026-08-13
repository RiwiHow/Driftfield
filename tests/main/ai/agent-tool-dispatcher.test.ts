import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AgentToolDispatcher,
  type AgentToolScope,
} from '../../../src/main/ai/agent-tool-dispatcher';
import {
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

/** What the model receives: the same read without Main's revision anchors. */
const documentContext = {
  displayTitle: documentResult.displayTitle,
  documentId: documentResult.documentId,
  markdown: documentResult.markdown,
  metadataTitle: documentResult.metadataTitle,
  source: documentResult.source,
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

const emptyStory = {
  beats: [],
  eventLinks: [],
  eventParticipants: [],
  eventSources: [],
  events: [],
  moments: [],
  personae: [],
  questions: [],
  revision: 3,
  threads: [],
  timelines: [],
};

const scope = { ownerId: 7, projectSessionId: 'session-1', requestId: 'request-1' };

const readStructureRefs = async (
  dispatcher: AgentToolDispatcher,
  toolScope: AgentToolScope = scope,
): Promise<void> => {
  const result = await dispatcher.execute(toolScope, {
    arguments: { directoryIds: [], documentIds: [], include: ['structure'] },
    toolName: 'read_novel_context',
  });
  expect(result).toMatchObject({ ok: true, toolName: 'read_novel_context' });
};

const readStoryStateRefs = async (
  dispatcher: AgentToolDispatcher,
  toolScope: AgentToolScope = scope,
): Promise<void> => {
  const result = await dispatcher.execute(toolScope, {
    arguments: { directoryIds: [], documentIds: [], include: ['story_state'] },
    toolName: 'read_novel_context',
  });
  expect(result).toMatchObject({ ok: true, toolName: 'read_novel_context' });
};

const readFirstDocumentRefs = async (
  dispatcher: AgentToolDispatcher,
  toolScope: AgentToolScope = scope,
): Promise<void> => {
  await readStructureRefs(dispatcher, toolScope);
  const result = await dispatcher.execute(toolScope, {
    arguments: { directoryIds: [], documentIds: ['document:1'], include: [] },
    toolName: 'read_novel_context',
  });
  expect(result).toMatchObject({ ok: true, toolName: 'read_novel_context' });
};

describe('AgentToolDispatcher', () => {
  it('reads selected novel context and persisted documents in one bounded call', async () => {
    const currentDocument = { ...documentResult, source: 'draft' as const };
    const storyState = {
      beats: [],
      eventLinks: [],
      eventParticipants: [],
      eventSources: [],
      events: [],
      moments: [],
      personae: [],
      questions: [],
      revision: 4,
      threads: [],
      timelines: [],
    };
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
    await readStructureRefs(dispatcher, {
      ...scope,
      draftSnapshot: {
        baseRevision: 'base',
        documentId: 'chapter-1',
        markdown: '# Chapter',
      },
    });

    await expect(dispatcher.execute({
      ...scope,
      draftSnapshot: {
        baseRevision: 'base',
        documentId: 'chapter-1',
        markdown: '# Chapter',
      },
    }, {
      arguments: {
        directoryIds: ['directory:3'],
        documentIds: ['document:1', 'document:2'],
        include: ['structure', 'current_document', 'story_state'],
      },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      data: {
        currentDocument: {
          ...documentContext,
          documentId: 'document:1',
          source: 'draft',
        },
        documents: [
          { ...documentContext, documentId: 'document:1' },
          { ...documentContext, documentId: 'document:2' },
        ],
        storyState,
        structure: {
          ...novelStructure,
          lore: {
            ...novelStructure.lore,
            children: [{
              ...novelStructure.lore.children[0],
              children: [{
                ...novelStructure.lore.children[0].children[0],
                id: 'document:2',
              }],
              id: 'directory:3',
            }],
            id: 'directory:2',
          },
          manuscript: {
            ...novelStructure.manuscript,
            children: [{
              ...novelStructure.manuscript.children[0],
              id: 'document:1',
            }],
            id: 'directory:1',
          },
          project: { id: 'project:1', title: 'Novel' },
        },
      },
      ok: true,
      toolName: 'read_novel_context',
    });
    expect(context.getDocument).toHaveBeenCalledTimes(2);
    expect(context.getNovelStructure).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 7,
      projectSessionId: 'session-1',
    }));
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
    const writeResult = await dispatcher.execute({
      ...acceptedScope,
      completeFocusedStoryReconciliation: () => true,
      storyChanged,
    }, {
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
        newPersonae: [],
        newThreads: [],
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
      data: {
        appliedCount: 4,
        reconciliationStatus: 'complete',
        revision: 7,
        status: 'applied',
      },
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
            documentId: 'document:accepted',
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

  it('bootstraps first-chapter Personae, Chronicle, and a new Thread atomically', async () => {
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
    const maintainStoryRecords = vi.fn((
      _scope: unknown,
      _requestId: string,
      _revision: number,
      _changes: Array<Record<string, unknown>>,
    ) => ({
      appliedCount: 8,
      revision: 1,
      status: 'applied' as const,
    }));
    const context = {
      getDocument: vi.fn().mockResolvedValue({
        ...documentResult,
        contentRevision: 'a'.repeat(64),
      }),
      getStoryState: vi.fn().mockResolvedValue(story),
      maintainStoryRecords,
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);
    const acceptedScope = { ...scope, acceptedDocumentId: 'chapter-1' };

    await dispatcher.execute(acceptedScope, {
      arguments: {
        directoryIds: [],
        documentIds: [],
        include: ['accepted_reconciliation'],
      },
      toolName: 'read_novel_context',
    });
    const result = await dispatcher.execute({
      ...acceptedScope,
      completeFocusedStoryReconciliation: () => true,
    }, {
      arguments: {
        events: [{
          displayTime: '晨晓',
          participants: [{
            description: '立下识字约定。',
            personaRef: '@shan',
            role: 'actor',
          }, {
            description: '以塔灯历史交换识字。',
            personaRef: '@reader',
            role: 'actor',
          }],
          precision: 'approximate',
          summary: '珊在水道遇见持书女孩并立下约定。',
          title: '晨湾水道初遇',
        }],
        newPersonae: [{
          clientRef: 'shan',
          name: '珊',
          role: '主角',
          summary: '迁居晨湾的共学所学生。',
        }, {
          clientRef: 'reader',
          name: '持书女孩',
          role: null,
          summary: '在水道遇见珊的无名学生。',
        }],
        newThreads: [{
          beat: {
            description: '两人以识字交换塔灯历史。',
            kind: 'setup',
            relation: 'foreshadows',
            title: '识字之约',
          },
          summary: '珊通过教女孩识字探寻塔灯历史。',
          threadStatus: 'active',
          title: '塔灯之谜',
        }],
        primaryTimeline: {
          summary: '晨湾故事的主要时序。',
          title: '晨湾主时间线',
        },
        threadAdvances: [],
      },
      toolName: 'reconcile_accepted_document',
    });

    expect(result).toEqual({
      data: {
        appliedCount: 8,
        reconciliationStatus: 'complete',
        revision: 1,
        status: 'applied',
      },
      ok: true,
      toolName: 'reconcile_accepted_document',
    });
    const changes = maintainStoryRecords.mock.calls[0]![3];
    expect(changes).toHaveLength(8);
    expect(changes[0]).toMatchObject({
      clientRef: 'accepted_persona_1',
      name: '珊',
      operation: 'create_persona',
    });
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRef: 'accepted_timeline',
        isPrimary: true,
        operation: 'create_timeline',
      }),
      expect.objectContaining({
        operation: 'create_event',
        participants: expect.arrayContaining([
          expect.objectContaining({ personaId: '@accepted_persona_1' }),
          expect.objectContaining({ personaId: '@accepted_persona_2' }),
        ]),
      }),
      expect.objectContaining({
        operation: 'create_thread',
        title: '塔灯之谜',
      }),
      expect.objectContaining({
        beatId: '@accepted_new_beat_1',
        eventId: '@accepted_event',
        operation: 'link_beat_event',
      }),
    ]));
  });

  it('rejects a directory request reference before reading it as a document', async () => {
    const context = {
      getDocument: vi.fn(),
      getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);
    await readStructureRefs(dispatcher);

    await expect(dispatcher.execute(scope, {
      arguments: {
        directoryIds: [],
        documentIds: ['directory:3'],
        include: [],
      },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      error: {
        code: 'invalid-arguments',
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
    await readStructureRefs(dispatcher);

    await expect(dispatcher.execute(scope, {
      arguments: {
        directoryIds: ['directory:3'],
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

  it('pre-binds a generated new document before Scribe runs', async () => {
    const proposal = {
      documentId: 'chapter-created',
      documentKind: 'chapter' as const,
      markdown: '# Second chapter',
      operation: 'create' as const,
      parentId: 'manuscript-root',
      parentTitle: 'Manuscript',
      projectRevision: 'revision',
      proposalId: 'proposal-create',
      requestId: 'request-1',
      title: 'Second chapter',
    };
    const proposals = {
      cancelRequest: vi.fn(),
      createFileOperation: vi.fn().mockResolvedValue(proposal),
      waitForDecision: vi.fn().mockResolvedValue({
        proposalId: proposal.proposalId,
        status: 'accepted',
      }),
    } as unknown as AgentProposalService;
    const delegateWriting = vi.fn(async () => ({
      assignmentId: 'scribe-task-1',
      characterCount: proposal.markdown.length,
      documentAction: 'create' as const,
      documentDomain: 'manuscript' as const,
      status: 'completed' as const,
    }));
    const claimWritingArtifact = vi.fn(() => proposal.markdown);
    const sendProposal = vi.fn();
    const dispatcher = new AgentToolDispatcher(
      { getNovelStructure: vi.fn().mockResolvedValue(novelStructure) } as unknown as ProjectContextService,
      undefined,
      proposals,
    );

    await dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: ['structure'] },
      toolName: 'read_novel_context',
    });
    await expect(dispatcher.execute({
      ...scope,
      claimWritingArtifact,
      delegateWriting,
      sendProposal,
    }, {
      arguments: {
        documentAction: 'create',
        documentDomain: 'manuscript',
        documentId: null,
        kind: 'chapter',
        metadataTitle: 'Second chapter',
        objective: 'Write the second chapter as a new document.',
        parentId: 'directory:1',
        requirements: ['Continue from the first chapter without replacing it.'],
        targetLength: 3_000,
      },
      toolName: 'propose_document_writing',
    })).resolves.toEqual({
      data: { documentId: 'document:3', status: 'accepted' },
      ok: true,
      toolName: 'propose_document_writing',
    });
    expect(delegateWriting).toHaveBeenCalledWith({
      documentAction: 'create',
      documentDomain: 'manuscript',
      objective: 'Write the second chapter as a new document.',
      requirements: ['Continue from the first chapter without replacing it.'],
      targetDocumentId: null,
      targetLength: 3_000,
    }, null);
    expect(claimWritingArtifact).toHaveBeenCalledWith(
      'scribe-task-1',
      'create',
      null,
      'manuscript',
    );
    expect(proposals.createFileOperation).toHaveBeenCalledWith(
      expect.anything(),
      {
        kind: 'chapter',
        markdown: proposal.markdown,
        metadataTitle: 'Second chapter',
        operation: 'create',
        parentId: 'manuscript-root',
        projectRevision: 'revision',
      },
    );
    expect(sendProposal).toHaveBeenCalledWith(proposal);
  });

  it('rejects a generated create plan that tries to bind an existing document', async () => {
    const delegateWriting = vi.fn();
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);

    await expect(dispatcher.execute({ ...scope, delegateWriting }, {
      arguments: {
        documentAction: 'create',
        documentDomain: 'manuscript',
        documentId: 'document:1',
        kind: 'chapter',
        metadataTitle: 'Second chapter',
        objective: 'Write the second chapter.',
        parentId: 'directory:1',
        requirements: [],
        targetLength: null,
      },
      toolName: 'propose_document_writing',
    })).resolves.toMatchObject({
      error: { code: 'invalid-arguments' },
      ok: false,
      toolName: 'propose_document_writing',
    });
    expect(delegateWriting).not.toHaveBeenCalled();
  });

  it('applies bounded story maintenance and emits the new revision', async () => {
    const change = {
      name: 'Lin',
      operation: 'create_persona' as const,
      role: 'Protagonist',
      summary: '',
    };
    const context = {
      getStoryState: vi.fn().mockResolvedValue(emptyStory),
      maintainStoryRecords: vi.fn(() => ({
        appliedCount: 1,
        revision: 1,
        status: 'applied' as const,
      })),
    } as unknown as ProjectContextService;
    const storyChanged = vi.fn();
    const dispatcher = new AgentToolDispatcher(context);

    await expect(dispatcher.execute({ ...scope, storyChanged }, {
      arguments: { changes: [change] },
      toolName: 'maintain_story_records',
    })).resolves.toMatchObject({
      error: { code: 'invalid-arguments' },
      ok: false,
    });

    await readStoryStateRefs(dispatcher);
    await expect(dispatcher.execute(
      { ...scope, storyChanged },
      {
        arguments: { changes: [change] },
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
      3,
      [change],
    );
    expect(storyChanged).toHaveBeenCalledWith(1);

    await dispatcher.execute({ ...scope, storyChanged }, {
      arguments: { changes: [change] },
      toolName: 'maintain_story_records',
    });
    expect(context.maintainStoryRecords).toHaveBeenLastCalledWith(
      expect.anything(),
      'request-1',
      1,
      [change],
    );
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
      data: { questionId: 'question:1', revision: 4, status: 'recorded' },
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
      arguments: { change },
      toolName: 'propose_story_operation',
    })).resolves.toMatchObject({
      data: { status: 'accepted' },
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
          timelineId: 'timeline:1',
        }, {
          causes: '',
          consequences: '',
          endMomentId: null,
          operation: 'create_event',
          participants: [],
          startMomentId: '@hearing',
          status: undefined,
          summary: '',
          timelineId: 'timeline:1',
          title: 'The hearing',
        }],
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

  it('names the offending reference instead of a generic shape complaint', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);
    await expect(dispatcher.execute(scope, {
      arguments: {
        changes: [{
          displayTime: 'Late spring',
          note: '',
          operation: 'create_moment',
          orderKey: 2,
          precision: 'season',
          timelineId: 'timeline-1',
        }],
      },
      toolName: 'maintain_story_records',
    })).resolves.toEqual({
      error: {
        code: 'invalid-arguments',
        detail:
          'changes[0].timelineId must be a request-scoped ref or compatible earlier @clientRef.',
      },
      ok: false,
      toolName: 'maintain_story_records',
    });
  });

  it('returns a recoverable source hint for malformed document proposals', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);

    await expect(dispatcher.execute(scope, {
      arguments: { documentId: 'chapter-1', markdown: null },
      toolName: 'propose_document_edit',
    })).resolves.toEqual({
      error: {
        code: 'invalid-arguments',
        detail: expect.stringContaining(
          'Generated Scribe prose uses propose_document_writing',
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
    const dispatcher = new AgentToolDispatcher(
      {
        getDocument: vi.fn().mockResolvedValue({
          ...documentResult,
          baseRevision: proposal.baseRevision,
          contentRevision: proposal.baseContentRevision,
        }),
        getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
      } as unknown as ProjectContextService,
      undefined,
      proposals,
    );
    await readFirstDocumentRefs(dispatcher);

    await expect(dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          documentId: 'document:1',
          markdown: proposal.markdown,
        },
        toolName: 'propose_document_edit',
      },
    )).resolves.toEqual({
      data: { status: 'accepted' },
      ok: true,
      toolName: 'propose_document_edit',
    });
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
      {
        getDocument: vi.fn().mockResolvedValue({
          ...documentResult,
          baseRevision: proposal.baseRevision,
          contentRevision: proposal.baseContentRevision,
        }),
        getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
      } as unknown as ProjectContextService,
      { maxCalls: 3, maxResultBytes: 10_000, maxTotalResultBytes: 10_000, timeoutMs: 10 },
      proposals,
    );
    await readFirstDocumentRefs(dispatcher);
    const result = dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          documentId: 'document:1',
          markdown: proposal.markdown,
        },
        toolName: 'propose_document_edit',
      },
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(sendProposal).toHaveBeenCalledWith(proposal);
    resolveDecision({ proposalId: proposal.proposalId, status: 'accepted' });
    await expect(result).resolves.toMatchObject({
      data: { status: 'accepted' },
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
    const dispatcher = new AgentToolDispatcher(
      { getNovelStructure: vi.fn().mockResolvedValue(novelStructure) } as unknown as ProjectContextService,
      undefined,
      proposals,
    );
    await readStructureRefs(dispatcher);

    await expect(dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          kind: 'chapter',
          markdown: proposal.markdown,
          operation: 'create',
          parentId: 'directory:1',
          metadataTitle: 'Created',
        },
        toolName: 'propose_document_file_operation',
      },
    )).resolves.toEqual({
      data: { status: 'accepted' },
      ok: true,
      toolName: 'propose_document_file_operation',
    });
    expect(proposals.createFileOperation).toHaveBeenCalledWith(
      expect.anything(),
      {
        kind: 'chapter',
        markdown: '# Created',
        operation: 'create',
        parentId: 'manuscript-root',
        projectRevision: 'revision',
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
      { getNovelStructure: vi.fn().mockResolvedValue(novelStructure) } as unknown as ProjectContextService,
      undefined,
      proposals,
    );
    await readStructureRefs(dispatcher);

    await expect(dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          operation: 'create_volume',
          title: 'Volume Two',
        },
        toolName: 'propose_project_structure_operation',
      },
    )).resolves.toEqual({
      data: { status: 'rejected' },
      ok: true,
      toolName: 'propose_project_structure_operation',
    });
    expect(sendProposal).toHaveBeenCalledWith(proposal);
  });

  it('emits a reviewed document metadata-title proposal', async () => {
    const proposal = {
      documentId: 'chapter-1',
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
      { getNovelStructure: vi.fn().mockResolvedValue(novelStructure) } as unknown as ProjectContextService,
      undefined,
      proposals,
    );
    await readStructureRefs(dispatcher);

    await expect(dispatcher.execute({ ...scope, sendProposal }, {
      arguments: {
        documentId: 'document:1',
        metadataTitle: proposal.title,
        operation: 'rename_document',
      },
      toolName: 'propose_project_structure_operation',
    })).resolves.toMatchObject({
      data: { status: 'accepted' },
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
      error: {
        code: 'tool-budget-exceeded',
        detail: expect.stringContaining('Stop calling tools'),
      },
      ok: false,
      toolName: 'read_novel_context',
    });
    expect(context.getDocument).not.toHaveBeenCalled();
  });

  it('checks mutation receipt capacity before running the side effect', async () => {
    const maintainStoryRecords = vi.fn();
    const dispatcher = new AgentToolDispatcher({
      maintainStoryRecords,
    } as unknown as ProjectContextService, {
      maxCalls: 1,
      maxResultBytes: 1,
      maxTotalResultBytes: 10_000,
      timeoutMs: 1_000,
    });

    await expect(dispatcher.execute(scope, {
      arguments: {
        changes: [{
          name: 'Lin',
          operation: 'create_persona',
          role: null,
          summary: '',
        }],
      },
      toolName: 'maintain_story_records',
    })).resolves.toEqual({
      error: {
        code: 'tool-budget-exceeded',
        detail: expect.stringContaining('Stop calling tools'),
      },
      ok: false,
      toolName: 'maintain_story_records',
    });
    expect(maintainStoryRecords).not.toHaveBeenCalled();
  });

  it('returns a typed expired-ref error and preserves one bounded recovery call', async () => {
    const context = {
      getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 1,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 10_000,
      timeoutMs: 1_000,
    });

    await expect(dispatcher.execute(scope, {
      arguments: {
        directoryIds: ['directory:5'],
        documentIds: [],
        include: ['structure'],
      },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      error: {
        code: 'expired-request-reference',
        detail: expect.stringContaining('Read the required context without reference selectors'),
      },
      ok: false,
      toolName: 'read_novel_context',
    });

    await expect(dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: ['structure'] },
      toolName: 'read_novel_context',
    })).resolves.toMatchObject({
      data: {
        documents: [],
        structure: {
          lore: { id: 'directory:2' },
          manuscript: { id: 'directory:1' },
        },
      },
      ok: true,
      toolName: 'read_novel_context',
    });

    await expect(dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: ['structure'] },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      error: {
        code: 'tool-budget-exceeded',
        detail: expect.stringContaining('Stop calling tools'),
      },
      ok: false,
      toolName: 'read_novel_context',
    });
  });

  it('returns a successful null current-document context when no editor document was open', async () => {
    const getCurrentDocument = vi.fn();
    const dispatcher = new AgentToolDispatcher({
      getCurrentDocument,
    } as unknown as ProjectContextService);

    await expect(dispatcher.execute(scope, {
      arguments: {
        directoryIds: [],
        documentIds: [],
        include: ['current_document'],
      },
      toolName: 'read_novel_context',
    })).resolves.toEqual({
      data: { currentDocument: null, documents: [] },
      ok: true,
      toolName: 'read_novel_context',
    });
    expect(getCurrentDocument).not.toHaveBeenCalled();
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
    await readStructureRefs(dispatcher);
    const result = dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: ['document:1'], include: [] },
      toolName: 'read_novel_context',
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({
      error: { code: 'tool-timeout' },
      ok: false,
      toolName: 'read_novel_context',
    });
  });

  it('abandons a proposal that finishes building after its call timed out', async () => {
    vi.useFakeTimers();
    let settle: (proposal: unknown) => void = () => {};
    const proposals = {
      abandon: vi.fn(),
      cancelRequest: vi.fn(),
      createStructureOperation: vi.fn(() => new Promise((resolve) => {
        settle = resolve;
      })),
      waitForDecision: vi.fn(),
    } as unknown as AgentProposalService;
    const dispatcher = new AgentToolDispatcher(
      {
        getNovelStructure: vi.fn().mockResolvedValue(novelStructure),
      } as unknown as ProjectContextService,
      { maxCalls: 4, maxResultBytes: 10_000, maxTotalResultBytes: 10_000, timeoutMs: 25 },
      proposals,
    );
    await readStructureRefs(dispatcher);
    const result = dispatcher.execute({ ...scope, sendProposal: vi.fn() }, {
      arguments: { operation: 'create_volume', title: 'Volume Two' },
      toolName: 'propose_project_structure_operation',
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toEqual({
      error: { code: 'tool-timeout' },
      ok: false,
      toolName: 'propose_project_structure_operation',
    });

    settle({ proposalId: 'proposal-late' });
    await vi.advanceTimersByTimeAsync(0);
    expect(proposals.abandon).toHaveBeenCalledWith('request-1', 'proposal-late');
    expect(proposals.waitForDecision).not.toHaveBeenCalled();
  });

  it('enforces cumulative result bytes and can release request state', async () => {
    const context = {
      getCurrentDocument: vi.fn(),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 3,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 120,
      timeoutMs: 1_000,
    });
    const first = await dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: ['current_document'] },
      toolName: 'read_novel_context',
    });
    const second = await dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: ['current_document'] },
      toolName: 'read_novel_context',
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      error: {
        code: 'tool-budget-exceeded',
        detail: expect.stringContaining('Stop calling tools'),
      },
      ok: false,
      toolName: 'read_novel_context',
    });
    dispatcher.release(scope.requestId);
    await expect(dispatcher.execute(scope, {
      arguments: { directoryIds: [], documentIds: [], include: ['current_document'] },
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
