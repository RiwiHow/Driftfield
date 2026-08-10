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
import type { ProjectSession } from '../../../src/main/services/project/session-service';
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
  it('applies a direct maintenance changeset atomically with one story revision', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-maintain-batch-'));
    await initializeProjectLayout(directoryPath);
    const session = {
      directoryPath,
      documentPaths: new Map<string, string>(),
      id: 'session-maintain-batch',
      project: await createProjectSnapshot(directoryPath),
    } as unknown as ProjectSession;
    const stories = new ProjectStoryService();

    const result = stories.maintainOperations(session, 0, [
      { name: 'Mara', operation: 'create_persona', role: 'Student', summary: '' },
      { name: 'Teacher Zhou', operation: 'create_persona', role: 'Teacher', summary: '' },
    ], 'request-maintain-batch');

    expect(result.snapshot).toMatchObject({
      personae: [{ name: 'Mara' }, { name: 'Teacher Zhou' }],
      revision: 1,
    });
    expect(result.operationIds).toHaveLength(2);
    const database = new ProjectDatabase(directoryPath);
    expect(database.connection.prepare(`
      SELECT base_revision, applied_revision, status
      FROM story_operations ORDER BY created_at, operation_id
    `).all()).toEqual([
      { applied_revision: 1, base_revision: 0, status: 'applied' },
      { applied_revision: 1, base_revision: 0, status: 'applied' },
    ]);
    database.close();
  });

  it('rolls back every direct maintenance change when one item fails', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-maintain-batch-'));
    await initializeProjectLayout(directoryPath);
    const session = {
      directoryPath,
      documentPaths: new Map<string, string>(),
      id: 'session-maintain-batch-failure',
      project: await createProjectSnapshot(directoryPath),
    } as unknown as ProjectSession;
    const stories = new ProjectStoryService();

    expect(() => stories.maintainOperations(session, 0, [
      { name: 'Mara', operation: 'create_persona', role: null, summary: '' },
      {
        displayTime: 'Unknown',
        note: '',
        operation: 'create_moment',
        orderKey: 1,
        precision: 'unknown',
        timelineId: 'missing-timeline',
      },
    ], 'request-maintain-batch-failure')).toThrow();
    expect(stories.getSnapshot(session)).toMatchObject({ personae: [], revision: 0 });
    const database = new ProjectDatabase(directoryPath);
    expect(database.connection.prepare(`SELECT COUNT(*) AS count FROM story_operations`).get())
      .toEqual({ count: 0 });
    database.close();
  });

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

  it('applies concurrent reviewed story proposals atomically with one decision', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-story-batch-'));
    await initializeProjectLayout(directoryPath);
    const session = {
      directoryPath,
      documentPaths: new Map<string, string>(),
      id: 'session-story-batch',
      project: await createProjectSnapshot(directoryPath),
    };
    const sessions = { get: () => session } as unknown as ProjectSessionService;
    const stories = new ProjectStoryService();
    const service = new AgentProposalService(sessions, undefined, stories);
    const scope = {
      ownerId: 7,
      projectSessionId: session.id,
      requestId: 'request-story-batch',
    };
    const persona = service.createStoryOperation(scope, {
      change: {
        name: 'Mara',
        operation: 'create_persona',
        role: 'Student',
        summary: '',
      },
      storyRevision: 0,
    });
    const timeline = service.createStoryOperation(scope, {
      change: {
        isPrimary: true,
        operation: 'create_timeline',
        summary: '',
        title: 'Primary Chronicle',
      },
      storyRevision: 0,
    });
    const personaDecision = service.waitForDecision(scope.requestId, persona.proposalId);
    const timelineDecision = service.waitForDecision(scope.requestId, timeline.proposalId);

    await expect(service.applyStoryBatch(7, [
      persona.proposalId,
      timeline.proposalId,
    ])).resolves.toMatchObject({
      proposalIds: [persona.proposalId, timeline.proposalId],
      status: 'story-updated',
      story: {
        personae: [{ name: 'Mara' }],
        revision: 2,
        timelines: [{ title: 'Primary Chronicle' }],
      },
    });
    await expect(personaDecision).resolves.toMatchObject({ status: 'accepted' });
    await expect(timelineDecision).resolves.toMatchObject({ status: 'accepted' });
    const database = new ProjectDatabase(directoryPath);
    expect(database.connection.prepare(`
      SELECT base_revision, applied_revision, status
      FROM story_operations ORDER BY applied_revision
    `).all()).toEqual([
      { applied_revision: 1, base_revision: 0, status: 'applied' },
      { applied_revision: 2, base_revision: 1, status: 'applied' },
    ]);
    database.close();
  });

  it('rolls back the whole reviewed story batch when one change fails', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-story-batch-'));
    await initializeProjectLayout(directoryPath);
    const session = {
      directoryPath,
      documentPaths: new Map<string, string>(),
      id: 'session-story-batch-failure',
      project: await createProjectSnapshot(directoryPath),
    };
    const sessions = { get: () => session } as unknown as ProjectSessionService;
    const stories = new ProjectStoryService();
    const service = new AgentProposalService(sessions, undefined, stories);
    const scope = {
      ownerId: 7,
      projectSessionId: session.id,
      requestId: 'request-story-batch-failure',
    };
    const persona = service.createStoryOperation(scope, {
      change: { name: 'Mara', operation: 'create_persona', role: null, summary: '' },
      storyRevision: 0,
    });
    const invalidMoment = service.createStoryOperation(scope, {
      change: {
        displayTime: 'Unknown',
        note: '',
        operation: 'create_moment',
        orderKey: 1,
        precision: 'unknown',
        timelineId: 'missing-timeline',
      },
      storyRevision: 0,
    });

    await expect(service.applyStoryBatch(7, [
      persona.proposalId,
      invalidMoment.proposalId,
    ])).rejects.toThrow();
    expect(stories.getSnapshot(session as unknown as ProjectSession)).toMatchObject({
      personae: [],
      questions: [],
      revision: 0,
    });
  });

  it('binds a reviewed Chronicle event to the exact accepted manuscript revision', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-story-source-'));
    await initializeProjectLayout(directoryPath);
    const markdown = '# Chapter\n\nMara opens the sealed door.\n';
    await writeFile(path.join(directoryPath, 'chapter.md'), markdown);
    const session = {
      directoryPath,
      documentPaths: new Map([['chapter-1', 'chapter.md']]),
      id: 'session-story-source',
      project: await createProjectSnapshot(directoryPath),
    };
    const sessions = { get: () => session } as unknown as ProjectSessionService;
    const stories = new ProjectStoryService();
    const storySession = session as unknown as ProjectSession;
    const timeline = stories.applyOperation(storySession, 0, {
      isPrimary: true,
      operation: 'create_timeline',
      summary: '',
      title: 'Primary Chronicle',
    }).timelines[0];
    const moment = stories.applyOperation(storySession, 1, {
      displayTime: 'Opening night',
      note: '',
      operation: 'create_moment',
      orderKey: 1,
      precision: 'unknown',
      timelineId: timeline.id,
    }).moments[0];
    const service = new AgentProposalService(sessions, undefined, stories);
    const proposal = service.createStoryOperation(
      {
        ownerId: 7,
        projectSessionId: session.id,
        requestId: 'request-story-source',
      },
      {
        change: {
          causes: '',
          consequences: '',
          endMomentId: null,
          operation: 'create_event',
          participants: [],
          sources: [{
            anchor: 'Mara opens the sealed door.',
            documentId: 'chapter-1',
            documentRevision: contentRevision(markdown),
            relation: 'depicted',
            sourceKind: 'manuscript',
          }],
          startMomentId: moment.id,
          status: 'established',
          summary: '',
          timelineId: timeline.id,
          title: 'The sealed door opens',
        },
        storyRevision: 2,
      },
    );

    await expect(service.apply(7, proposal.proposalId)).resolves.toMatchObject({
      status: 'story-updated',
      story: {
        eventSources: [{
          anchor: 'Mara opens the sealed door.',
          documentId: 'chapter-1',
          documentRevision: contentRevision(markdown),
          relation: 'depicted',
          sourceKind: 'manuscript',
        }],
      },
    });

    const staleProposal = service.createStoryOperation(
      {
        ownerId: 7,
        projectSessionId: session.id,
        requestId: 'request-story-source-stale',
      },
      {
        change: {
          causes: '',
          consequences: '',
          endMomentId: null,
          operation: 'create_event',
          participants: [],
          sources: [{
            anchor: null,
            documentId: 'chapter-1',
            documentRevision: contentRevision(markdown),
            relation: 'mentioned',
            sourceKind: 'manuscript',
          }],
          startMomentId: moment.id,
          status: 'established',
          summary: '',
          timelineId: timeline.id,
          title: 'A stale sourced event',
        },
        storyRevision: 3,
      },
    );
    const staleDecision = service.waitForDecision(
      'request-story-source-stale',
      staleProposal.proposalId,
    );
    await writeFile(path.join(directoryPath, 'chapter.md'), '# Changed\n');

    await expect(service.apply(7, staleProposal.proposalId)).rejects.toThrow(
      'Chronicle source revision changed',
    );
    await expect(staleDecision).resolves.toEqual({
      proposalId: staleProposal.proposalId,
      status: 'failed',
    });
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
