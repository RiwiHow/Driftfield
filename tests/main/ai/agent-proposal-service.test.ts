import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AgentProposalService } from '../../../src/main/ai/agent-proposal-service';
import { contentRevision } from '../../../src/main/services/project-service';
import type { ProjectSessionService } from '../../../src/main/services/project-session-service';

const createFixture = async () => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-proposal-'));
  const markdown = '# Original\n';
  await writeFile(path.join(directoryPath, 'chapter.md'), markdown);
  const session = {
    directoryPath,
    documentPaths: new Map([['chapter-1', 'chapter.md']]),
    id: 'session-1',
    project: {
      documents: [{ id: 'chapter-1', name: 'Chapter One', revision: contentRevision(markdown) }],
    },
  };
  const sessions = { get: () => session } as unknown as ProjectSessionService;
  return { directoryPath, markdown, service: new AgentProposalService(sessions) };
};

describe('AgentProposalService', () => {
  it('keeps a proposal in memory until the owning renderer accepts it', async () => {
    const { directoryPath, markdown, service } = await createFixture();
    const revision = contentRevision(markdown);
    const proposal = service.create(
      {
        draftSnapshot: { baseRevision: revision, documentId: 'chapter-1', markdown },
        ownerId: 7,
        projectSessionId: 'session-1',
        requestId: 'request-1',
      },
      {
        baseContentRevision: revision,
        baseRevision: revision,
        documentId: 'chapter-1',
        markdown: '# Revised\n',
      },
    );

    await expect(readFile(path.join(directoryPath, 'chapter.md'), 'utf8')).resolves.toBe(markdown);
    await expect(service.apply(8, proposal.proposalId)).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'not-found',
    });
    await expect(service.apply(7, proposal.proposalId)).resolves.toMatchObject({
      documentId: 'chapter-1',
      markdown: '# Revised\n',
      status: 'saved',
    });
    await expect(readFile(path.join(directoryPath, 'chapter.md'), 'utf8')).resolves.toBe('# Revised\n');
  });

  it('does not overwrite a disk change made after the proposal', async () => {
    const { directoryPath, markdown, service } = await createFixture();
    const revision = contentRevision(markdown);
    const proposal = service.create(
      {
        draftSnapshot: { baseRevision: revision, documentId: 'chapter-1', markdown },
        ownerId: 7,
        projectSessionId: 'session-1',
        requestId: 'request-1',
      },
      {
        baseContentRevision: revision,
        baseRevision: revision,
        documentId: 'chapter-1',
        markdown: '# Proposed\n',
      },
    );
    await writeFile(path.join(directoryPath, 'chapter.md'), '# External\n');

    await expect(service.apply(7, proposal.proposalId)).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'conflict',
    });
    await expect(readFile(path.join(directoryPath, 'chapter.md'), 'utf8')).resolves.toBe('# External\n');
  });
});
