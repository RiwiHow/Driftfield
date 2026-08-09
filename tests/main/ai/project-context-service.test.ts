import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import { ProjectContextService } from '../../../src/main/ai/project-context-service';
import { initializeProjectLayout } from '../../../src/main/services/project/layout-service';
import { createProjectSnapshot } from '../../../src/main/services/project/snapshot-service';
import type {
  ProjectSession,
  ProjectSessionService,
} from '../../../src/main/services/project/session-service';
import { PROJECT_INDEX_NAME } from '../../../src/shared/contracts/project-layout';

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
  await initializeProjectLayout(directory);
  await writeFile(
    path.join(directory, 'manuscript', PROJECT_INDEX_NAME),
    stringify({
      children: [{ file: 'chapter.md', id: 'chapter-1', kind: 'chapter', title: 'Arrival' }],
      id: 'manuscript-1',
      kind: 'manuscript',
      title: 'Story',
    }),
  );
  await writeFile(path.join(directory, 'manuscript', 'chapter.md'), '# Disk\n');
  const project = await createProjectSnapshot(directory);
  const session: ProjectSession = {
    directoryPath: directory,
    documentPaths: new Map(project.documents.map((document) => [document.id, document.relativePath])),
    id: 'session-1',
    lastRevision: project.revision,
    project,
    refreshTimer: null,
    restartTimer: null,
    watcher: null,
  };
  const sessions = { get: (ownerId: number) => ownerId === 7 ? session : undefined } as ProjectSessionService;
  return { context: new ProjectContextService(sessions), project, session };
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
      documentId: 'chapter-1',
      markdown: '# Unsaved\n',
      source: 'draft',
      title: 'Arrival',
    });
    expect(result.contentRevision).not.toBe(baseRevision);
  });

  it('keeps the captured draft readable after its backing file leaves the latest snapshot', async () => {
    const { context, project, session } = await createContext();
    const baseRevision = project.documents[0].revision;
    session.project = { ...project, documents: [], tree: [] };

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
      documentId: 'chapter-1',
      markdown: '# Disk\n',
      source: 'disk',
    });
    expect(structure).toMatchObject({
      format: 'driftfield',
      lore: {
        children: [],
        kind: 'lore',
        title: 'Lore',
      },
      manuscript: {
        children: [{ id: 'chapter-1', kind: 'chapter', title: 'Arrival' }],
        id: 'manuscript-1',
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
});
