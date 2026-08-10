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

const scope = { ownerId: 7, projectSessionId: 'session-1', requestId: 'request-1' };

describe('AgentToolDispatcher', () => {
  it('applies bounded story maintenance and emits the new revision', async () => {
    const change = {
      name: 'Lin',
      operation: 'create_persona' as const,
      role: 'Protagonist',
      summary: '',
    };
    const context = {
      maintainStoryRecords: vi.fn(() => ({
        operationId: 'operation-1',
        revision: 1,
        status: 'applied' as const,
      })),
    } as unknown as ProjectContextService;
    const storyChanged = vi.fn();
    const dispatcher = new AgentToolDispatcher(context);

    await expect(dispatcher.execute(
      { ...scope, storyChanged },
      {
        arguments: { change, storyRevision: 0 },
        toolName: 'maintain_story_records',
      },
    )).resolves.toEqual({
      data: { operationId: 'operation-1', revision: 1, status: 'applied' },
      ok: true,
      toolName: 'maintain_story_records',
    });
    expect(context.maintainStoryRecords).toHaveBeenCalledWith(
      { ownerId: 7, projectSessionId: 'session-1' },
      'request-1',
      0,
      change,
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
      arguments: {},
      toolName: 'get_story_state',
    })).resolves.toMatchObject({ data: story, ok: true });
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
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 1,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 10_000,
      timeoutMs: 1_000,
    });

    await expect(dispatcher.execute(scope, {
      arguments: { path: '/tmp/book.md' },
      toolName: 'get_document',
    })).resolves.toEqual({
      error: { code: 'invalid-arguments' },
      ok: false,
      toolName: 'get_document',
    });
    await expect(dispatcher.execute(scope, {
      arguments: { documentId: 'chapter-1' },
      toolName: 'get_document',
    })).resolves.toEqual({
      error: { code: 'tool-budget-exceeded' },
      ok: false,
      toolName: 'get_document',
    });
    expect(context.getDocument).not.toHaveBeenCalled();
  });

  it('returns a typed timeout error', async () => {
    vi.useFakeTimers();
    const context = {
      getDocument: vi.fn(() => new Promise(() => {})),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 2,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 10_000,
      timeoutMs: 25,
    });
    const result = dispatcher.execute(scope, {
      arguments: { documentId: 'chapter-1' },
      toolName: 'get_document',
    });

    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toEqual({
      error: { code: 'tool-timeout' },
      ok: false,
      toolName: 'get_document',
    });
  });

  it('enforces cumulative result bytes and can release request state', async () => {
    const context = {
      getDocument: vi.fn().mockResolvedValue(documentResult),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context, {
      maxCalls: 3,
      maxResultBytes: 10_000,
      maxTotalResultBytes: 250,
      timeoutMs: 1_000,
    });
    const first = await dispatcher.execute(scope, {
      arguments: { documentId: 'chapter-1' },
      toolName: 'get_document',
    });
    const second = await dispatcher.execute(scope, {
      arguments: { documentId: 'chapter-1' },
      toolName: 'get_document',
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      error: { code: 'tool-budget-exceeded' },
      ok: false,
      toolName: 'get_document',
    });
    dispatcher.release(scope.requestId);
    await expect(dispatcher.execute(scope, {
      arguments: { documentId: 'chapter-1' },
      toolName: 'get_document',
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
