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
      type: 'edit-proposal',
    });
    service.recordEvent({ requestId: 'assistant-1', type: 'completed' });
    service.dispose();

    const restoredService = new AgentConversationService();
    expect(restoredService.getProposal(session, proposal.proposalId)).toEqual(proposal);
    restoredService.dispose();
  });
});
