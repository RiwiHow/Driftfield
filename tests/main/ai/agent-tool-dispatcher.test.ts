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
    const proposals = { create: vi.fn(() => proposal) } as unknown as AgentProposalService;
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
      data: { proposalId: 'proposal-1', status: 'proposed' },
      ok: true,
      toolName: 'propose_document_edit',
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
});
