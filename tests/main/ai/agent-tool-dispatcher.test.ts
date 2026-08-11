import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentToolDispatcher } from '../../../src/main/ai/agent-tool-dispatcher';
import type { ProjectContextService } from '../../../src/main/ai/project-context-service';
import type { AgentProposalService } from '../../../src/main/ai/agent-proposal-service';

afterEach(() => vi.useRealTimers());

const documentResult = {
  baseRevision: 'base',
  contentRevision: 'content',
  documentId: 'chapter-1',
  markdown: '# Chapter',
  source: 'disk' as const,
  title: 'Chapter',
};

const novelStructure = {
  availableIcons: [],
  format: 'driftfield' as const,
  lore: {
    children: [{
      children: [{
        id: 'lore-1',
        kind: 'entry' as const,
        title: 'World entry',
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
      id: 'chapter-1',
      kind: 'chapter' as const,
      title: 'Chapter',
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

  it('applies bounded story maintenance and emits the new revision', async () => {
    const change = {
      name: 'Lin',
      operation: 'create_persona' as const,
      role: 'Protagonist',
      summary: '',
    };
    const context = {
      maintainStoryRecords: vi.fn(() => ({
        changes: [{
          clientRef: null,
          entityId: 'persona-1',
          operation: 'create_persona' as const,
          operationId: 'operation-1',
        }],
        operationIds: ['operation-1'],
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
        changes: [{
          clientRef: null,
          entityId: 'persona-1',
          operation: 'create_persona',
          operationId: 'operation-1',
        }],
        operationIds: ['operation-1'],
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
        detail: 'create_timeline requires exactly operation, title, summary, isPrimary.',
      },
      ok: false,
      toolName: 'propose_story_operation',
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
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    await expect(dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          baseContentRevision: proposal.baseContentRevision,
          baseRevision: proposal.baseRevision,
          documentId: proposal.documentId,
          markdown: proposal.markdown,
        },
        toolName: 'propose_document_edit',
      },
    )).resolves.toEqual({
      data: { proposalId: 'proposal-1', status: 'accepted' },
      ok: true,
      toolName: 'propose_document_edit',
    });
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
    const dispatcher = new AgentToolDispatcher(
      {} as ProjectContextService,
      undefined,
      proposals,
    );

    await expect(dispatcher.execute(
      { ...scope, sendProposal },
      {
        arguments: {
          kind: 'chapter',
          markdown: '# Created',
          operation: 'create',
          parentId: 'manuscript-1',
          projectRevision: 'a'.repeat(64),
          title: 'Created',
        },
        toolName: 'propose_document_file_operation',
      },
    )).resolves.toEqual({
      data: { proposalId: 'proposal-create', status: 'accepted' },
      ok: true,
      toolName: 'propose_document_file_operation',
    });
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
});
