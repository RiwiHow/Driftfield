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
    project: {
      directory: { name: 'Novel', path: directoryPath },
      documents: [],
      loreTree: null,
      projectId: 'project-1',
      revision: 'revision',
      rootTitles: { manuscript: 'Manuscript' },
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
    service.recordEvent({
      agentRole: 'scribe',
      input: '{"directoryIds":[],"documentIds":[],"include":["structure"]}',
      requestId: 'assistant-1',
      toolCallId: 'tool-1',
      toolName: 'read_novel_context',
      type: 'tool-started',
    });
    service.recordEvent({
      agentRole: 'scribe',
      failed: false,
      output: '{"ok":true}',
      requestId: 'assistant-1',
      toolCallId: 'tool-1',
      toolName: 'read_novel_context',
      type: 'tool-completed',
    });
    service.recordEvent({ requestId: 'assistant-1', type: 'completed' });
    service.dispose();

    const restoredService = new AgentConversationService();
    const restored = restoredService.getState(session);
    expect(restored.activeConversation.messages.map(({ content, role, terminal }) => ({ content, role, terminal }))).toEqual([
      { content: 'Remember the lantern.', role: 'user', terminal: undefined },
      { content: 'I will remember it.', role: 'assistant', terminal: undefined },
    ]);
    expect(
      (await stat(path.join(session.directoryPath, '.driftfield', 'project.sqlite')))
        .isFile(),
    ).toBe(true);
    expect(restored.activeConversation.messages.at(-1)?.parts).toContainEqual(
      expect.objectContaining({
        activity: expect.objectContaining({ agentRole: 'scribe' }),
        type: 'tool',
      }),
    );
    restoredService.dispose();
  });

  it('treats story refresh notifications as non-terminal transient events', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Record Lin.',
      requestId: 'assistant-maintain',
      userMessageId: 'user-maintain',
    });

    service.recordEvent({
      requestId: 'assistant-maintain',
      revision: 1,
      type: 'story-changed',
    });
    service.recordEvent({
      delta: 'Lin has been recorded.',
      requestId: 'assistant-maintain',
      type: 'text-delta',
    });
    service.recordEvent({ requestId: 'assistant-maintain', type: 'completed' });

    expect(service.getState(session).activeConversation.messages.at(-1)).toMatchObject({
      content: 'Lin has been recorded.',
      role: 'assistant',
    });
    service.dispose();
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

  it('expires request refs only in replayed model history', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Create the World entry.',
      requestId: 'assistant-with-refs',
      userMessageId: 'user-with-refs',
    });
    const visibleText =
      'Use directory:5 with revision:2, then reconcile document:accepted on timeline:primary.';
    service.recordEvent({
      delta: visibleText,
      requestId: 'assistant-with-refs',
      type: 'text-delta',
    });
    service.recordEvent({ requestId: 'assistant-with-refs', type: 'completed' });

    const next = service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Continue.',
      requestId: 'assistant-after-refs',
      userMessageId: 'user-after-refs',
    });

    expect(next.history).toEqual([
      { content: 'Create the World entry.', role: 'user' },
      {
        content:
          'Use [expired request-scoped directory ref] with [expired request-scoped revision ref], then reconcile [expired request-scoped document ref] on [expired request-scoped timeline ref].',
        role: 'assistant',
      },
    ]);
    expect(
      service.getState(session).activeConversation.messages
        .find(({ id }) => id === 'assistant-with-refs')?.content,
    ).toBe(visibleText);
    service.dispose();
  });

  it('previews the current model history without mutating the conversation', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Remember persona:4.',
      requestId: 'assistant-preview',
      userMessageId: 'user-preview',
    });
    service.recordEvent({
      delta: 'Remembered document:2.',
      requestId: 'assistant-preview',
      type: 'text-delta',
    });
    service.recordEvent({ requestId: 'assistant-preview', type: 'completed' });

    expect(service.getPromptHistory(session).history).toEqual([
      {
        content: 'Remember [expired request-scoped persona ref].',
        role: 'user',
      },
      {
        content: 'Remembered [expired request-scoped document ref].',
        role: 'assistant',
      },
    ]);
    expect(service.getState(session).activeConversation.messages).toHaveLength(2);
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

  it('restores a pending document-title proposal for main-owned revalidation', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    const proposal = {
      documentId: 'chapter-3',
      operation: 'rename_document' as const,
      previousTitle: '3. Silent Island',
      projectRevision: 'a'.repeat(64),
      proposalId: 'proposal-rename',
      requestId: 'assistant-rename',
      title: 'Silent Island',
    };
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Fix the chapter title.',
      requestId: 'assistant-rename',
      userMessageId: 'user-rename',
    });
    service.recordEvent({ proposal, requestId: 'assistant-rename', type: 'proposal' });
    service.recordEvent({ requestId: 'assistant-rename', type: 'completed' });
    service.dispose();

    const restoredService = new AgentConversationService();
    expect(restoredService.getProposal(session, proposal.proposalId)).toEqual(proposal);
    restoredService.dispose();
  });

  it('restores a pending Lore category icon proposal for revalidation', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    const proposal = {
      directoryId: 'category-factions',
      icon: 'flag' as const,
      operation: 'set_lore_category_icon' as const,
      previousIcon: 'group' as const,
      projectRevision: 'a'.repeat(64),
      proposalId: 'proposal-icon',
      requestId: 'assistant-icon',
      title: 'Factions',
    };
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Change the category icon.',
      requestId: 'assistant-icon',
      userMessageId: 'user-icon',
    });
    service.recordEvent({
      proposal,
      requestId: 'assistant-icon',
      type: 'proposal',
    });
    service.recordEvent({ requestId: 'assistant-icon', type: 'completed' });
    service.dispose();

    const restoredService = new AgentConversationService();
    expect(restoredService.getProposal(session, proposal.proposalId)).toEqual(proposal);
    restoredService.dispose();
  });

  it('restores a pending story proposal for main-owned revalidation', async () => {
    const session = await createSession();
    const service = new AgentConversationService();
    const state = service.getState(session);
    const proposal = {
      change: {
        name: 'Lin',
        operation: 'create_persona' as const,
        role: 'Protagonist',
        summary: 'An unwilling heir.',
      },
      operation: 'story' as const,
      proposalId: 'proposal-story',
      requestId: 'assistant-story',
      storyRevision: 0,
      title: 'Lin',
    };
    service.beginPrompt(session, {
      conversationId: state.activeConversation.id,
      prompt: 'Record the protagonist.',
      requestId: 'assistant-story',
      userMessageId: 'user-story',
    });
    service.recordEvent({ proposal, requestId: 'assistant-story', type: 'proposal' });
    service.recordEvent({ requestId: 'assistant-story', type: 'completed' });
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
