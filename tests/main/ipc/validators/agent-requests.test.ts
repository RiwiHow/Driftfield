import { describe, expect, it } from 'vitest';

import {
  isRejectAgentProposalRequest,
  isStartAgentPromptRequest,
} from '../../../../src/main/ipc/validators/agent-requests';

const revision = 'a'.repeat(64);

describe('Agent IPC request validation', () => {
  it('accepts a bounded current-document draft pair', () => {
    expect(
      isStartAgentPromptRequest({
        conversationId: 'conversation-1',
        currentDocumentId: 'chapter-1',
        draftSnapshot: {
          baseRevision: revision,
          documentId: 'chapter-1',
          markdown: '# Draft',
        },
        prompt: 'Review this',
        requestId: 'request-1',
        userMessageId: 'user-1',
      }),
    ).toBe(true);
  });

  it('rejects unpaired, malformed, and oversized drafts', () => {
    expect(
      isStartAgentPromptRequest({
        currentDocumentId: 'chapter-1',
        prompt: 'Review this',
        requestId: 'request-1',
      }),
    ).toBe(false);
    expect(
      isStartAgentPromptRequest({
        currentDocumentId: 'chapter-1',
        draftSnapshot: {
          baseRevision: 'not-a-revision',
          documentId: 'chapter-1',
          markdown: '# Draft',
        },
        prompt: 'Review this',
        requestId: 'request-1',
      }),
    ).toBe(false);
    expect(
      isStartAgentPromptRequest({
        currentDocumentId: 'chapter-1',
        draftSnapshot: {
          baseRevision: revision,
          documentId: 'chapter-1',
          markdown: 'x'.repeat(512 * 1024 + 1),
        },
        prompt: 'Review this',
        requestId: 'request-1',
      }),
    ).toBe(false);
  });

  it('accepts only the narrow stale reason for a proposal rejection', () => {
    expect(isRejectAgentProposalRequest({ proposalId: 'proposal-1' })).toBe(true);
    expect(isRejectAgentProposalRequest({
      proposalId: 'proposal-1',
      reason: 'stale',
    })).toBe(true);
    expect(isRejectAgentProposalRequest({
      proposalId: 'proposal-1',
      reason: 'accepted',
    })).toBe(false);
    expect(isRejectAgentProposalRequest({
      extra: true,
      proposalId: 'proposal-1',
    })).toBe(false);
  });
});
