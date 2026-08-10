import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentConversationService } from '../../../../src/main/services/agent/conversation-service';
import type { ProjectSession } from '../../../../src/main/services/project/session-service';

const directories: string[] = [];

const createSession = async (): Promise<ProjectSession> => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-conversations-'));
  directories.push(directoryPath);
  return {
    directoryPath,
    documentPaths: new Map(),
    id: 'session-1',
    lastRevision: 'revision',
    project: {
      directory: { name: 'Novel', path: directoryPath },
      documents: [],
      projectId: 'project-1',
      revision: 'revision',
      tree: [],
    },
    refreshTimer: null,
    restartTimer: null,
    watcher: null,
  };
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true }),
  ));
});

describe('Agent conversation persistence', () => {
  it('renames a conversation and restores the persisted title', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const initial = service.getState(session);

    const renamed = service.rename(
      session,
      initial.activeConversation.id,
      'Revised opening',
    );
    expect(renamed.activeConversation.title).toBe('Revised opening');
    service.dispose();

    const restoredService = new AgentConversationService();
    expect(restoredService.getState(session).activeConversation.title).toBe(
      'Revised opening',
    );
    restoredService.dispose();
  });

  it('creates the project-owned database and restores completed messages', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const initial = service.getState(session);
    service.beginPrompt(session, {
      conversationId: initial.activeConversation.id,
      prompt: 'Remember the lantern.',
      requestId: 'assistant-1',
      userMessageId: 'user-1',
    });
    service.recordEvent({ delta: 'I will remember it.', requestId: 'assistant-1', type: 'text-delta' });
    service.recordEvent({ requestId: 'assistant-1', type: 'completed' });
    service.dispose();

    const restoredService = new AgentConversationService();
    const restored = restoredService.getState(session);
    expect(restored.activeConversation.messages.map(({ content, role, terminal }) => ({ content, role, terminal }))).toEqual([
      { content: 'Remember the lantern.', role: 'user', terminal: undefined },
      { content: 'I will remember it.', role: 'assistant', terminal: undefined },
    ]);
    expect(
      (await stat(path.join(session.directoryPath, '.driftfield', 'conversations.sqlite')))
        .isFile(),
    ).toBe(true);
    restoredService.dispose();
  });

  it('marks an unfinished generation as interrupted after shutdown', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Continue.',
      requestId: 'assistant-1',
      userMessageId: 'user-1',
    });
    service.recordEvent({ delta: 'Partial', requestId: 'assistant-1', type: 'text-delta' });
    service.dispose();

    const restoredService = new AgentConversationService();
    const restored = restoredService.getState(session);
    expect(restored.activeConversation.messages.at(-1)).toMatchObject({
      content: 'Partial',
      terminal: 'interrupted',
    });
    restoredService.dispose();
  });

  it('keeps an edited user message as the active branch', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Old prompt',
      requestId: 'assistant-1',
      userMessageId: 'user-1',
    });
    service.recordEvent({ delta: 'Old answer', requestId: 'assistant-1', type: 'text-delta' });
    service.recordEvent({ requestId: 'assistant-1', type: 'completed' });
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      editMessageId: 'user-1',
      prompt: 'Revised prompt',
      requestId: 'assistant-2',
      userMessageId: 'user-1',
    });

    expect(service.getState(session).activeConversation.messages.map(({ content, id }) => ({ content, id }))).toEqual([
      { content: 'Revised prompt', id: 'user-1' },
      { content: '', id: 'assistant-2' },
    ]);
    service.dispose();
  });

  it('restores a pending edit proposal for main-owned revalidation', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    const revision = 'a'.repeat(64);
    const proposal = {
      baseContentRevision: revision,
      baseMarkdown: '# Original\n',
      baseRevision: revision,
      documentId: 'chapter-1',
      markdown: '# Proposed\n',
      proposalId: 'proposal-1',
      requestId: 'assistant-1',
      title: 'Chapter One',
    };
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Revise this.',
      requestId: 'assistant-1',
      userMessageId: 'user-1',
    });
    service.recordEvent({
      proposal,
      requestId: 'assistant-1',
      type: 'proposal',
    });
    service.recordEvent({ requestId: 'assistant-1', type: 'completed' });
    service.dispose();

    const restoredService = new AgentConversationService();
    expect(restoredService.getProposal(session, proposal.proposalId)).toEqual(proposal);
    restoredService.dispose();
  });

  it('restores a pending structural proposal for main-owned revalidation', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    const proposal = {
      documentId: 'chapter-created',
      documentKind: 'chapter' as const,
      markdown: '# Created\n',
      operation: 'create' as const,
      parentId: 'manuscript-1',
      parentTitle: 'Manuscript',
      projectRevision: 'a'.repeat(64),
      proposalId: 'proposal-create',
      requestId: 'assistant-create',
      title: 'Created',
    };
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Create a chapter.',
      requestId: 'assistant-create',
      userMessageId: 'user-create',
    });
    service.recordEvent({
      proposal,
      requestId: 'assistant-create',
      type: 'proposal',
    });
    service.recordEvent({ requestId: 'assistant-create', type: 'completed' });
    service.dispose();

    const restoredService = new AgentConversationService();
    expect(restoredService.getProposal(session, proposal.proposalId)).toEqual(proposal);
    restoredService.dispose();
  });

  it('returns accepted proposal outcomes as trusted context on the next turn', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    const revision = 'a'.repeat(64);
    const proposal = {
      baseContentRevision: revision,
      baseMarkdown: '# Original\n',
      baseRevision: revision,
      documentId: 'chapter-1',
      markdown: '# Proposed\n',
      proposalId: 'proposal-outcome',
      requestId: 'assistant-outcome',
      title: 'Chapter One',
    };
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Revise this.',
      requestId: 'assistant-outcome',
      userMessageId: 'user-outcome',
    });
    service.recordEvent({ proposal, requestId: 'assistant-outcome', type: 'proposal' });
    service.recordEvent({ requestId: 'assistant-outcome', type: 'completed' });
    service.setProposalStatus(session, proposal.proposalId, 'saved');

    const next = service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'What happened?',
      requestId: 'assistant-next',
      userMessageId: 'user-next',
    });
    expect(next.proposalOutcomes).toEqual([{
      operation: 'edit',
      proposalId: proposal.proposalId,
      status: 'accepted',
    }]);
    service.dispose();
  });

  it('preserves multiple sequential proposal decisions in one Agent run', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    const revision = 'a'.repeat(64);
    const first = {
      baseContentRevision: revision,
      baseMarkdown: '# Original\n',
      baseRevision: revision,
      documentId: 'chapter-1',
      markdown: '# First\n',
      proposalId: 'proposal-first',
      requestId: 'assistant-sequential',
      title: 'Chapter One',
    };
    const second = {
      ...first,
      markdown: '# Second\n',
      proposalId: 'proposal-second',
    };
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Make two reviewed changes.',
      requestId: 'assistant-sequential',
      userMessageId: 'user-sequential',
    });
    service.recordEvent({ proposal: first, requestId: 'assistant-sequential', type: 'proposal' });
    service.setProposalStatus(session, first.proposalId, 'saved');
    service.recordEvent({ proposal: second, requestId: 'assistant-sequential', type: 'proposal' });
    service.setProposalStatus(session, second.proposalId, 'rejected');
    service.recordEvent({ requestId: 'assistant-sequential', type: 'completed' });

    const proposalParts = service.getState(session).activeConversation.messages
      .at(-1)?.parts?.filter((part) => part.type === 'proposal');
    expect(proposalParts).toEqual([
      { proposal: first, status: 'saved', type: 'proposal' },
      { proposal: second, status: 'rejected', type: 'proposal' },
    ]);
    const next = service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Summarize the decisions.',
      requestId: 'assistant-after-sequential',
      userMessageId: 'user-after-sequential',
    });
    expect(next.proposalOutcomes).toEqual([
      { operation: 'edit', proposalId: first.proposalId, status: 'accepted' },
      { operation: 'edit', proposalId: second.proposalId, status: 'rejected' },
    ]);
    service.dispose();

    const restored = new AgentConversationService();
    expect(
      restored.getState(session).activeConversation.messages
        .find((message) => message.id === 'assistant-sequential')?.parts
        ?.filter((part) => part.type === 'proposal'),
    ).toEqual(proposalParts);
    restored.dispose();
  });
});
