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
  it('exposes a fresh disposable Bash snapshot without host or database access', async () => {
    const { context, project } = await createContext();
    const relativePath = project.documents[0].relativePath;
    const scope = {
      draftSnapshot: {
        baseRevision: project.documents[0].revision,
        documentId: 'chapter-1',
        markdown: '# Unsaved in editor\n',
      },
      ownerId: 7,
      projectSessionId: 'session-1',
    };

    const inspected = await context.executeProjectBash(
      scope,
      `find . -type f -print && cat PROJECT.json && cat ${JSON.stringify(relativePath)} && rg -n Unsaved .`,
    );
    expect(inspected.result.exitCode).toBe(0);
    expect(inspected.result.stdout).toContain('./PROJECT.json');
    expect(inspected.result.stdout).toContain(`# Unsaved in editor`);
    expect(inspected.result.stdout).not.toContain('.driftfield');
    expect(inspected.result.stdout).not.toContain(temporaryDirectories[0]);
    expect(inspected.result.stdout).not.toContain('chapter-1');

    await context.executeProjectBash(
      scope,
      `printf hacked > ${JSON.stringify(relativePath)}`,
    );
    const reread = await context.executeProjectBash(
      scope,
      `cat ${JSON.stringify(relativePath)}`,
    );
    expect(reread.result.stdout).toBe('# Unsaved in editor\n');
  });

  it('rejects obsolete sessions', async () => {
    const { context } = await createContext();
    await expect(
      context.executeProjectBash(
        { ownerId: 7, projectSessionId: 'old-session' },
        'find . -type f',
      ),
    ).rejects.toEqual(expect.objectContaining({ code: 'project-session-changed' }));
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
    await expect(context.executeProjectBash(scope, 'cat STORY.json')).resolves.toMatchObject({
      story: {
      events: [],
      revision: 0,
      timelines: [],
      },
    });
  });
});
