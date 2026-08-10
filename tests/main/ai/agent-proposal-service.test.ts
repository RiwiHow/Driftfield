import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AgentProposalService } from '../../../src/main/ai/agent-proposal-service';
import { contentRevision } from '../../../src/main/services/project/document-utils';
import type { ProjectSessionService } from '../../../src/main/services/project/session-service';
import { initializeProjectLayout, loadProjectLayout } from '../../../src/main/services/project/layout-service';
import { createProjectSnapshot } from '../../../src/main/services/project/snapshot-service';
import { ProjectStoryService } from '../../../src/main/services/project/story-service';
import { ProjectDatabase } from '../../../src/main/database/project-database';

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
  it('applies an approved story proposal and records its audit operation', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-story-proposal-'));
    await initializeProjectLayout(directoryPath);
    const session = {
      directoryPath,
      documentPaths: new Map<string, string>(),
      id: 'session-story',
      project: await createProjectSnapshot(directoryPath),
    };
    const sessions = { get: () => session } as unknown as ProjectSessionService;
    const stories = new ProjectStoryService();
    const service = new AgentProposalService(sessions, undefined, stories);
    const proposal = service.createStoryOperation(
      {
        ownerId: 7,
        projectSessionId: session.id,
        requestId: 'request-story',
      },
      {
        change: {
          isPrimary: true,
          operation: 'create_timeline',
          summary: 'The canonical sequence of events.',
          title: 'Primary Chronicle',
        },
        storyRevision: 0,
      },
    );
    const pendingDatabase = new ProjectDatabase(directoryPath);
    expect(pendingDatabase.connection.prepare(`
      SELECT status FROM story_operations WHERE operation_id = ?
    `).get(proposal.proposalId)).toEqual({ status: 'pending' });
    pendingDatabase.close();
    const decision = service.waitForDecision('request-story', proposal.proposalId);

    await expect(service.apply(7, proposal.proposalId)).resolves.toMatchObject({
      status: 'story-updated',
      story: {
        revision: 1,
        timelines: [{ isPrimary: true, title: 'Primary Chronicle' }],
      },
    });
    await expect(decision).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'accepted',
    });
    const database = new ProjectDatabase(directoryPath);
    expect(database.connection.prepare(`
      SELECT operation_id, operation_kind, base_revision, applied_revision, status
      FROM story_operations
    `).get()).toEqual({
      applied_revision: 1,
      base_revision: 0,
      operation_id: proposal.proposalId,
      operation_kind: 'create_timeline',
      status: 'applied',
    });
    database.close();
  });

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
    const decision = service.waitForDecision('request-1', proposal.proposalId);

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
    await expect(decision).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'accepted',
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
    const decision = service.waitForDecision('request-1', proposal.proposalId);
    await writeFile(path.join(directoryPath, 'chapter.md'), '# External\n');

    await expect(service.apply(7, proposal.proposalId)).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'conflict',
    });
    await expect(decision).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'conflict',
    });
    await expect(readFile(path.join(directoryPath, 'chapter.md'), 'utf8')).resolves.toBe('# External\n');
  });

  it('settles a waiting proposal when the Agent request is cancelled', async () => {
    const { markdown, service } = await createFixture();
    const revision = contentRevision(markdown);
    const proposal = service.create(
      {
        draftSnapshot: { baseRevision: revision, documentId: 'chapter-1', markdown },
        ownerId: 7,
        projectSessionId: 'session-1',
        requestId: 'request-cancel',
      },
      {
        baseContentRevision: revision,
        baseRevision: revision,
        documentId: 'chapter-1',
        markdown: '# Proposed\n',
      },
    );
    const decision = service.waitForDecision(
      'request-cancel',
      proposal.proposalId,
    );

    service.cancelRequest('request-cancel');

    await expect(decision).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'failed',
    });
    await expect(service.apply(7, proposal.proposalId)).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'not-found',
    });
  });

  it('settles a locally unsafe acceptance as stale', async () => {
    const { markdown, service } = await createFixture();
    const revision = contentRevision(markdown);
    const proposal = service.create(
      {
        draftSnapshot: { baseRevision: revision, documentId: 'chapter-1', markdown },
        ownerId: 7,
        projectSessionId: 'session-1',
        requestId: 'request-stale',
      },
      {
        baseContentRevision: revision,
        baseRevision: revision,
        documentId: 'chapter-1',
        markdown: '# Proposed\n',
      },
    );
    const decision = service.waitForDecision('request-stale', proposal.proposalId);

    expect(service.reject(7, proposal.proposalId, 'stale')).toBe(true);
    await expect(decision).resolves.toEqual({
      proposalId: proposal.proposalId,
      status: 'stale',
    });
  });

  it('creates and deletes documents only after proposal acceptance', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-proposal-'));
    await initializeProjectLayout(directoryPath);
    const project = await createProjectSnapshot(directoryPath);
    const session = {
      directoryPath,
      documentPaths: new Map<string, string>(),
      id: 'session-structural',
      project,
    };
    const sessions = {
      get: () => session,
      refresh: async () => {
        session.project = await createProjectSnapshot(directoryPath);
        session.documentPaths = new Map(
          session.project.documents.map(({ id, relativePath }) => [id, relativePath]),
        );
        return session.project;
      },
    } as unknown as ProjectSessionService;
    const service = new AgentProposalService(sessions);
    const parentId = (await loadProjectLayout(directoryPath)).manuscript.index.id;
    const scope = {
      ownerId: 7,
      projectSessionId: session.id,
      requestId: 'request-structure',
    };
    const creation = await service.createFileOperation(scope, {
      kind: 'chapter',
      markdown: '# Created\n',
      operation: 'create',
      parentId,
      projectRevision: session.project.revision,
      title: 'Created',
    });
    expect(session.project.documents).toEqual([]);

    await expect(service.apply(7, creation.proposalId)).resolves.toMatchObject({
      documentId: creation.documentId,
      status: 'created',
    });
    expect(session.project.documents).toEqual([
      expect.objectContaining({ id: creation.documentId, markdown: '# Created\n' }),
    ]);

    const deletion = await service.createFileOperation(scope, {
      baseRevision: contentRevision('# Created\n'),
      documentId: creation.documentId,
      operation: 'delete',
      projectRevision: session.project.revision,
    });
    await expect(service.apply(7, deletion.proposalId)).resolves.toMatchObject({
      documentId: creation.documentId,
      status: 'deleted',
    });
    expect(session.project.documents).toEqual([]);
  });

  it('creates a volume and moves a chapter only after proposal acceptance', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-proposal-'));
    await initializeProjectLayout(directoryPath);
    const session = {
      directoryPath,
      documentPaths: new Map<string, string>(),
      id: 'session-structure-move',
      project: await createProjectSnapshot(directoryPath),
    };
    const sessions = {
      get: () => session,
      refresh: async () => {
        session.project = await createProjectSnapshot(directoryPath);
        session.documentPaths = new Map(
          session.project.documents.map(({ id, relativePath }) => [id, relativePath]),
        );
        return session.project;
      },
    } as unknown as ProjectSessionService;
    const service = new AgentProposalService(sessions);
    const scope = {
      ownerId: 7,
      projectSessionId: session.id,
      requestId: 'request-move',
    };
    const manuscriptId = (await loadProjectLayout(directoryPath)).manuscript.index.id;
    const chapter = await service.createFileOperation(scope, {
      kind: 'chapter',
      markdown: '# Chapter\n',
      operation: 'create',
      parentId: manuscriptId,
      projectRevision: session.project.revision,
      title: 'Chapter',
    });
    await service.apply(7, chapter.proposalId);
    const volume = await service.createStructureOperation(scope, {
      operation: 'create_volume',
      projectRevision: session.project.revision,
      title: 'Volume Two',
    });
    expect((await loadProjectLayout(directoryPath)).manuscript.volumes).toEqual([]);
    await expect(service.apply(7, volume.proposalId)).resolves.toMatchObject({
      directoryId: volume.directoryId,
      status: 'created-directory',
    });
    const move = await service.createStructureOperation(scope, {
      baseRevision: contentRevision('# Chapter\n'),
      documentId: chapter.documentId,
      operation: 'move_document',
      projectRevision: session.project.revision,
      targetParentId: volume.directoryId,
    });
    await expect(service.apply(7, move.proposalId)).resolves.toMatchObject({
      documentId: chapter.documentId,
      status: 'moved',
    });
    expect((await loadProjectLayout(directoryPath)).manuscript.volumes[0].index.children)
      .toContainEqual(expect.objectContaining({ id: chapter.documentId }));
  });
});
