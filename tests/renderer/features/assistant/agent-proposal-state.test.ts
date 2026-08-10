import { describe, expect, it } from 'vitest';

import type { WorkspaceDocument } from '../../../../src/renderer/app/types';
import { canApplyAgentProposal } from '../../../../src/renderer/features/assistant/use-agent-conversation';
import type {
  AgentDeleteDocumentProposal,
  AgentEditProposal,
  AgentMoveDocumentProposal,
} from '../../../../src/shared/contracts/agent-proposals';

const document: WorkspaceDocument = {
  backingFileStatus: 'available',
  id: 'document-1',
  isDirty: true,
  markdown: '# Request-start draft',
  order: 0,
  previousMarkdown: '# Disk',
  relativePath: 'document.md',
  revision: 'a'.repeat(64),
  sourceRevision: 1,
  title: 'Chapter',
};

const proposal: AgentEditProposal = {
  baseContentRevision: 'b'.repeat(64),
  baseMarkdown: document.markdown,
  baseRevision: document.revision,
  documentId: document.id,
  markdown: '# Proposed',
  proposalId: 'proposal-1',
  requestId: 'request-1',
  title: document.title,
};

describe('Agent proposal state', () => {
  it('only applies to the unchanged request-start renderer draft', () => {
    expect(canApplyAgentProposal(document, proposal)).toBe(true);
    expect(canApplyAgentProposal({ ...document, markdown: '# Later edit' }, proposal)).toBe(false);
    expect(canApplyAgentProposal({ ...document, revision: 'c'.repeat(64) }, proposal)).toBe(false);
    expect(canApplyAgentProposal(null, proposal)).toBe(false);
  });

  it('does not move a document with unsaved renderer changes', () => {
    const move: AgentMoveDocumentProposal = {
      baseRevision: document.revision,
      documentId: document.id,
      operation: 'move_document',
      projectRevision: 'c'.repeat(64),
      proposalId: 'proposal-move',
      requestId: 'request-1',
      sourceParentId: 'manuscript-1',
      sourceParentTitle: 'Manuscript',
      targetParentId: 'volume-2',
      targetParentTitle: 'Volume Two',
      title: document.title,
    };
    expect(canApplyAgentProposal(document, move, [document])).toBe(false);
    expect(canApplyAgentProposal(
      { ...document, isDirty: false },
      move,
      [{ ...document, isDirty: false }],
    )).toBe(true);
  });

  it('does not delete a document with unsaved renderer changes', () => {
    const deletion: AgentDeleteDocumentProposal = {
      baseMarkdown: document.previousMarkdown,
      baseRevision: document.revision,
      documentId: document.id,
      operation: 'delete',
      projectRevision: 'c'.repeat(64),
      proposalId: 'proposal-delete',
      requestId: 'request-1',
      title: document.title,
    };
    expect(canApplyAgentProposal(document, deletion, [document])).toBe(false);
    expect(canApplyAgentProposal(
      { ...document, isDirty: false, markdown: document.previousMarkdown },
      deletion,
      [{ ...document, isDirty: false, markdown: document.previousMarkdown }],
    )).toBe(true);
  });
});
