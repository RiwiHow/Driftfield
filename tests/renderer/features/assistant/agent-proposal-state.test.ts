import { describe, expect, it } from 'vitest';

import type { Chapter } from '../../../../src/renderer/app/types';
import { canApplyAgentProposal } from '../../../../src/renderer/features/assistant/use-agent-conversation';
import type { AgentEditProposal } from '../../../../src/shared/contracts/agent-proposals';

const chapter: Chapter = {
  backingFileStatus: 'available',
  id: 'chapter-1',
  isDirty: true,
  markdown: '# Request-start draft',
  order: 0,
  previousMarkdown: '# Disk',
  relativePath: 'chapter.md',
  revision: 'a'.repeat(64),
  sourceRevision: 1,
  title: 'Chapter',
};

const proposal: AgentEditProposal = {
  baseContentRevision: 'b'.repeat(64),
  baseMarkdown: chapter.markdown,
  baseRevision: chapter.revision,
  documentId: chapter.id,
  markdown: '# Proposed',
  proposalId: 'proposal-1',
  requestId: 'request-1',
  title: chapter.title,
};

describe('Agent proposal state', () => {
  it('only applies to the unchanged request-start renderer draft', () => {
    expect(canApplyAgentProposal(chapter, proposal)).toBe(true);
    expect(canApplyAgentProposal({ ...chapter, markdown: '# Later edit' }, proposal)).toBe(false);
    expect(canApplyAgentProposal({ ...chapter, revision: 'c'.repeat(64) }, proposal)).toBe(false);
    expect(canApplyAgentProposal(null, proposal)).toBe(false);
  });
});
