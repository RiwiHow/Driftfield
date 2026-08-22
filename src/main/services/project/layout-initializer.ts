import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';

import {
  DRIFTFIELD_PROJECT_FORMAT_VERSION,
  PROJECT_ROOT_DIRECTORIES,
} from '../../../shared/contracts/project-layout';
import type { AppLanguage } from '../../../shared/i18n/languages';
import {
  ProjectCatalogRepository,
  type InitialLoreCategory,
} from '../../database/project-catalog-repository';
import { ProjectDatabase } from '../../database/project-database';

const INITIAL_LORE_CATEGORIES = {
  en: [
    { icon: 'users', title: 'Personae' },
    { icon: 'map', title: 'Locations' },
    { icon: 'earth', title: 'World' },
  ],
  'zh-CN': [
    { icon: 'users', title: '人物' },
    { icon: 'map', title: '地点' },
    { icon: 'earth', title: '世界' },
  ],
} as const satisfies Record<
  AppLanguage,
  readonly InitialLoreCategory[]
>;

export const initializeProjectLayoutFiles = async (
  directoryPath: string,
  language: AppLanguage = 'en',
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
  const initialLoreCategories = INITIAL_LORE_CATEGORIES[language];

  await Promise.all([
    mkdir(manuscriptPath, { recursive: true, mode: 0o700 }),
    mkdir(lorePath, { recursive: true, mode: 0o700 }),
    ...initialLoreCategories.map(({ title }) =>
      mkdir(path.join(lorePath, title), { recursive: true, mode: 0o700 }),
    ),
  ]);
  try {
    const database = new ProjectDatabase(stagingPath);
    try {
      database.initializeProjectMetadata(
        projectId,
        DRIFTFIELD_PROJECT_FORMAT_VERSION,
        projectTitle,
      );
      new ProjectCatalogRepository(database).initializeDefault(
        initialLoreCategories,
      );
    } finally {
      database.close();
    }
    await Promise.all(
      ['recovery', 'staging', 'trash'].map((directory) =>
        mkdir(path.join(stagingPath, '.driftfield', directory), {
          mode: 0o700,
        }),
      ),
    );
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
