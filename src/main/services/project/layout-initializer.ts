import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';

import {
  DRIFTFIELD_PROJECT_FORMAT_VERSION,
  PROJECT_INDEX_NAME,
  PROJECT_ROOT_DIRECTORIES,
  type LoreCategoryIndex,
  type LoreIndex,
  type ManuscriptIndex,
} from '../../../shared/contracts/project-layout';
import { ConversationDatabase } from '../../database/conversation-database';
import { ProjectDatabase } from '../../database/project-database';
import { SettingsDatabase } from '../../database/settings-database';

const INITIAL_LORE_CATEGORIES = [
  { directory: 'Personae', icon: 'users', title: 'Personae' },
  { directory: 'Locations', icon: 'map', title: 'Locations' },
  { directory: 'World', icon: 'earth', title: 'World' },
] as const;

export const initializeProjectLayoutFiles = async (
  directoryPath: string,
): Promise<string> => {
  const projectPath = await realpath(directoryPath);
  const existingNames = await readdir(projectPath);
  if (existingNames.length > 0) {
    throw new Error('Only an empty folder can become a new Driftfield project');
  }

  const stagingPath = path.join(
    projectPath,
    `.driftfield-init-${randomUUID()}`,
  );
  const manuscriptPath = path.join(
    stagingPath,
    PROJECT_ROOT_DIRECTORIES.manuscript,
  );
  const lorePath = path.join(stagingPath, PROJECT_ROOT_DIRECTORIES.lore);
  const projectId = randomUUID();
  const projectTitle = path.basename(projectPath) || 'Untitled Novel';
  const manuscript: ManuscriptIndex = {
    chapterNumbering: { format: '{number}. {title}', mode: 'continuous' },
    children: [],
    id: randomUUID(),
    kind: 'manuscript',
    title: 'Manuscript',
  };
  const lore: LoreIndex = {
    children: INITIAL_LORE_CATEGORIES.map(({ directory }) => ({
      directory,
      kind: 'category',
    })),
    id: randomUUID(),
    kind: 'lore',
    title: 'Lore',
  };
  const loreCategories: Array<{
    directory: string;
    index: LoreCategoryIndex;
  }> = INITIAL_LORE_CATEGORIES.map(({ directory, icon, title }) => ({
    directory,
    index: {
      children: [],
      icon,
      id: randomUUID(),
      kind: 'category',
      title,
    },
  }));

  await Promise.all([
    mkdir(manuscriptPath, { recursive: true }),
    mkdir(lorePath, { recursive: true }),
    ...loreCategories.map(({ directory }) =>
      mkdir(path.join(lorePath, directory), { recursive: true }),
    ),
  ]);
  try {
    await Promise.all([
      writeFile(
        path.join(manuscriptPath, PROJECT_INDEX_NAME),
        stringify(manuscript),
        { encoding: 'utf8', mode: 0o600 },
      ),
      writeFile(path.join(lorePath, PROJECT_INDEX_NAME), stringify(lore), {
        encoding: 'utf8',
        mode: 0o600,
      }),
      ...loreCategories.map(({ directory, index }) =>
        writeFile(
          path.join(lorePath, directory, PROJECT_INDEX_NAME),
          stringify(index),
          { encoding: 'utf8', mode: 0o600 },
        ),
      ),
    ]);
    const database = new ProjectDatabase(stagingPath);
    try {
      database.initializeProjectMetadata(
        projectId,
        DRIFTFIELD_PROJECT_FORMAT_VERSION,
        projectTitle,
      );
    } finally {
      database.close();
    }
    new ConversationDatabase(stagingPath).close();
    new SettingsDatabase(stagingPath).close();
    await rename(
      path.join(stagingPath, PROJECT_ROOT_DIRECTORIES.manuscript),
      path.join(projectPath, PROJECT_ROOT_DIRECTORIES.manuscript),
    );
    await rename(
      path.join(stagingPath, PROJECT_ROOT_DIRECTORIES.lore),
      path.join(projectPath, PROJECT_ROOT_DIRECTORIES.lore),
    );
    await rename(
      path.join(stagingPath, '.driftfield'),
      path.join(projectPath, '.driftfield'),
    );
  } finally {
    await rm(stagingPath, { force: true, recursive: true });
  }
  return projectPath;
};
