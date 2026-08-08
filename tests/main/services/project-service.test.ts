import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  contentRevision,
  createProjectSnapshot,
  isPathInside,
  saveProjectDocument,
} from '../../../src/main/services/project-service';

const temporaryDirectories: string[] = [];

const createTemporaryProject = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-test-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('project path containment', () => {
  it('rejects siblings and accepts descendants', () => {
    expect(isPathInside('/project', '/project/chapter.md')).toBe(true);
    expect(isPathInside('/project', '/project-other/chapter.md')).toBe(false);
    expect(isPathInside('/project', '/project')).toBe(false);
  });
});

describe('project documents', () => {
  it('scans Markdown with a content revision and ignores MDX', async () => {
    const directory = await createTemporaryProject();
    await writeFile(path.join(directory, 'chapter.md'), '# Chapter\n');
    await writeFile(path.join(directory, 'unsafe.mdx'), '<Component />\n');

    const snapshot = await createProjectSnapshot(directory);

    expect(snapshot.documents).toHaveLength(1);
    expect(snapshot.documents[0]).toMatchObject({
      id: 'chapter.md',
      revision: contentRevision('# Chapter\n'),
    });
  });

  it('returns a conflict instead of overwriting an external edit', async () => {
    const directory = await createTemporaryProject();
    const documentPath = path.join(directory, 'chapter.md');
    await writeFile(documentPath, 'original');
    const [document] = (await createProjectSnapshot(directory)).documents;
    await writeFile(documentPath, 'external edit');

    const result = await saveProjectDocument(directory, {
      documentId: document.id,
      expectedRevision: document.revision,
      markdown: 'renderer edit',
    });

    expect(result.status).toBe('conflict');
    expect(await readFile(documentPath, 'utf8')).toBe('external edit');
  });

  it('allows an explicit reviewed overwrite', async () => {
    const directory = await createTemporaryProject();
    const documentPath = path.join(directory, 'chapter.md');
    await writeFile(documentPath, 'external edit');

    const result = await saveProjectDocument(directory, {
      documentId: 'chapter.md',
      expectedRevision: contentRevision('external edit'),
      markdown: 'reviewed renderer edit',
      overwrite: true,
    });

    expect(result).toEqual({
      revision: contentRevision('reviewed renderer edit'),
      status: 'saved',
    });
    expect(await readFile(documentPath, 'utf8')).toBe('reviewed renderer edit');
  });
});
