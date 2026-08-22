import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectContextService } from '../../../src/main/ai/project-context-service';
import { initializeProjectLayout } from '../../../src/main/services/project/layout-service';
import { createProjectSnapshot } from '../../../src/main/services/project/snapshot-service';
import { ProjectStoryService } from '../../../src/main/services/project/story-service';
import type {
  ProjectSession,
  ProjectSessionService,
} from '../../../src/main/services/project/session-service';
import { createStructuredProjectDocument } from '../../../src/main/services/project/structural-document-service';
import { ProjectCatalogRepository } from '../../../src/main/database/project-catalog-repository';
import { ProjectDatabase } from '../../../src/main/database/project-database';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

const createContext = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-context-'));
  temporaryDirectories.push(directory);
  const layout = await initializeProjectLayout(directory);
  const database = new ProjectDatabase(directory);
  new ProjectCatalogRepository(database).updateTitle(
    layout.manuscript.index.id,
    'Story',
  );
  database.close();
  await createStructuredProjectDocument(directory, {
    documentId: 'chapter-1',
    kind: 'chapter',
    markdown: '# Disk\n',
    parentId: layout.manuscript.index.id,
    title: 'Arrival',
  });
  const project = await createProjectSnapshot(directory);
  const session: ProjectSession = {
    directoryPath: directory,
    documentPaths: new Map(project.documents.map((document) => [document.id, document.relativePath])),
    id: 'session-1',
    project,
    refreshTimer: null,
    restartTimer: null,
    watcher: null,
  };
  const sessions = { get: (ownerId: number) => ownerId === 7 ? session : undefined } as ProjectSessionService;
  return {
    context: new ProjectContextService(sessions, new ProjectStoryService()),
    project,
    session,
  };
};

describe('ProjectContextService', () => {
  it('returns the immutable editor draft for the current document', async () => {
    const { context, project } = await createContext();
    const baseRevision = project.documents[0].revision;

    const result = await context.getCurrentDocument({
      draftSnapshot: { baseRevision, documentId: 'chapter-1', markdown: '# Unsaved\n' },
      ownerId: 7,
      projectSessionId: 'session-1',
    });

    expect(result).toMatchObject({
      baseRevision,
      displayTitle: '1. Arrival',
      documentId: 'chapter-1',
      markdown: '# Unsaved\n',
      metadataTitle: 'Arrival',
      source: 'draft',
    });
    expect(result.contentRevision).not.toBe(baseRevision);
  });

  it('keeps the captured draft readable after its backing file leaves the latest snapshot', async () => {
    const { context, project, session } = await createContext();
    const baseRevision = project.documents[0].revision;
    session.project = { ...project, documents: [], loreTree: [], tree: [] };

    await expect(context.getCurrentDocument({
      draftSnapshot: { baseRevision, documentId: 'chapter-1', markdown: '# Recoverable\n' },
      ownerId: 7,
      projectSessionId: 'session-1',
    })).resolves.toMatchObject({
      documentId: 'chapter-1',
      markdown: '# Recoverable\n',
      source: 'draft',
    });
  });

  it('reads persisted text by stable ID and exposes path-free structure', async () => {
    const { context } = await createContext();
    const scope = { ownerId: 7, projectSessionId: 'session-1' };

    const [document, structure] = await Promise.all([
      context.getDocument(scope, 'chapter-1'),
      context.getNovelStructure(scope),
    ]);

    expect(document).toMatchObject({
      displayTitle: '1. Arrival',
      documentId: 'chapter-1',
      markdown: '# Disk\n',
      metadataTitle: 'Arrival',
      source: 'disk',
    });
    expect(structure).toMatchObject({
      format: 'driftfield',
      lore: {
        children: [
          { children: [], icon: 'users', kind: 'category', title: 'Personae' },
          { children: [], icon: 'map', kind: 'category', title: 'Locations' },
          { children: [], icon: 'earth', kind: 'category', title: 'World' },
        ],
        kind: 'lore',
        title: 'Lore',
      },
      manuscript: {
        children: [{
          displayTitle: '1. Arrival',
          id: 'chapter-1',
          kind: 'chapter',
          metadataTitle: 'Arrival',
        }],
        id: expect.any(String),
        title: 'Story',
      },
    });
    expect(JSON.stringify(structure)).not.toContain('manuscript/chapter.md');
    expect(JSON.stringify(structure)).not.toContain(path.sep + 'driftfield-context-');
  });

  it('rejects obsolete sessions and unknown stable IDs', async () => {
    const { context } = await createContext();
    await expect(
      context.getDocument({ ownerId: 7, projectSessionId: 'old-session' }, 'chapter-1'),
    ).rejects.toEqual(expect.objectContaining({ code: 'project-session-changed' }));
    await expect(
      context.getDocument({ ownerId: 7, projectSessionId: 'session-1' }, 'missing'),
    ).rejects.toEqual(expect.objectContaining({ code: 'document-not-found' }));
  });

  it('returns a typed error for invalid local story references without partial writes', async () => {
    const { context } = await createContext();
    const scope = { ownerId: 7, projectSessionId: 'session-1' };

    expect(() => context.maintainStoryRecords(scope, 'request-1', 0, [
      {
        clientRef: 'main',
        isPrimary: true,
        operation: 'create_timeline',
        summary: '',
        title: 'Primary Chronicle',
      },
      {
        causes: '',
        consequences: '',
        endMomentId: null,
        operation: 'create_event',
        participants: [],
        startMomentId: '@main',
        status: 'established',
        summary: '',
        timelineId: '@main',
        title: 'Invalid event',
      },
    ])).toThrow(expect.objectContaining({
      code: 'invalid-arguments',
      detail: expect.stringContaining('startMomentId expects moment'),
    }));
    await expect(context.getStoryState(scope)).resolves.toMatchObject({
      events: [],
      revision: 0,
      timelines: [],
    });
  });
});
