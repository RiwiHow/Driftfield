import { createHash } from 'node:crypto';
import path from 'node:path';

export const supportedDocumentExtensions = new Set<string>([
  '.md',
  '.markdown',
]);

export const contentRevision = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

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
