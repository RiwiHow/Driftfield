import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectDocument } from '../../../shared/contracts/project';

export const supportedDocumentExtensions = new Set<string>([
  '.md',
  '.markdown',
]);

export const contentRevision = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

export const readProjectDocument = async (
  projectPath: string,
  relativePath: string,
  id: string,
  name = path.basename(relativePath, path.extname(relativePath)),
): Promise<ProjectDocument> => {
  const fileBuffer = await readFile(path.resolve(projectPath, relativePath));
  return {
    id,
    markdown: fileBuffer.toString('utf8'),
    name,
    relativePath,
    revision: contentRevision(fileBuffer),
  };
};

export const isPathInside = (
  parentPath: string,
  candidatePath: string,
): boolean => {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath !== '' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath)
  );
};
