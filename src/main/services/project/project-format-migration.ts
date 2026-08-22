import { randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { ProjectCatalogRepository, type NewProjectCatalogNode } from '../../database/project-catalog-repository';
import { ProjectDatabase } from '../../database/project-database';
import { ProjectLegacyRepository } from '../../database/project-legacy-repository';
import { DRIFTFIELD_PROJECT_FORMAT_VERSION, LEGACY_PROJECT_INDEX_NAME } from '../../../shared/contracts/project-layout';
import { contentRevision } from './document-utils';
import type { LoadedProjectLayout } from './layout-service';

const MAX_LEGACY_INDEX_FILES = 1_000;

export interface LegacyProjectBackup {
  backupPath: string;
  copiedRelativePaths: string[];
  warnings: string[];
}

type LegacySettings = {
  modelId: string | null;
  overrides: Array<{
    modelId: string;
    overrideJson: string;
    providerId: string;
    updatedAt: string;
  }>;
  providerId: string | null;
  thinkingLevel: string;
  useGlobal: number;
};

type LegacyConversationData = {
  activeConversationId: string | null;
  conversations: LegacyConversationRow[];
  messages: LegacyMessageRow[];
};

interface LegacyConversationRow {
  created_at: string;
  deleted_at: string | null;
  id: string;
  title: string;
  updated_at: string;
}

interface LegacyMessageRow {
  active: number;
  content: string;
  conversation_id: string;
  created_at: string;
  id: string;
  parts_json: string | null;
  proposal_id: string | null;
  proposal_json: string | null;
  proposal_status: string | null;
  role: string;
  run_status: string | null;
  sequence: number;
  terminal: string | null;
  updated_at: string;
}

const normalizeRelativePath = (value: string): string =>
  value.split(path.sep).join('/');

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

const assertRegularFile = async (filePath: string): Promise<void> => {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('Legacy project data contains an invalid file');
  }
};

const collectLegacyIndexes = async (
  projectPath: string,
  relativeDirectory: string,
  results: string[],
): Promise<void> => {
  let entries;
  try {
    entries = await readdir(path.join(projectPath, relativeDirectory), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error('Legacy project data contains a symbolic link');
    }
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectLegacyIndexes(projectPath, relativePath, results);
      continue;
    }
    if (entry.isFile() && entry.name === LEGACY_PROJECT_INDEX_NAME) {
      if (results.length >= MAX_LEGACY_INDEX_FILES) {
        throw new Error('Legacy project contains too many metadata indexes');
      }
      results.push(relativePath);
    }
  }
};

const copyIntoBackup = async (
  projectPath: string,
  backupPath: string,
  relativePath: string,
): Promise<void> => {
  const sourcePath = path.join(projectPath, relativePath);
  await assertRegularFile(sourcePath);
  const destinationPath = path.join(backupPath, 'legacy', relativePath);
  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  await copyFile(sourcePath, destinationPath);
};

export const prepareLegacyProjectBackup = async (
  projectPath: string,
): Promise<LegacyProjectBackup> => {
  const backupPath = path.join(
    projectPath,
    '.driftfield',
    'recovery',
    `migration-v3-${randomUUID()}`,
  );
  await mkdir(backupPath, { recursive: true, mode: 0o700 });
  const relativePaths = [path.join('.driftfield', 'project.sqlite')];
  for (const databaseName of ['conversations.sqlite', 'settings.sqlite']) {
    const relativePath = path.join('.driftfield', databaseName);
    try {
      await assertRegularFile(path.join(projectPath, relativePath));
      relativePaths.push(relativePath);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
  await collectLegacyIndexes(projectPath, 'manuscript', relativePaths);
  await collectLegacyIndexes(projectPath, 'lore', relativePaths);
  for (const relativePath of relativePaths) {
    await copyIntoBackup(projectPath, backupPath, relativePath);
  }
  const backup: LegacyProjectBackup = {
    backupPath,
    copiedRelativePaths: relativePaths.map(normalizeRelativePath),
    warnings: [],
  };
  await writeFile(
    path.join(backupPath, 'migration.json'),
    `${JSON.stringify({
      copiedRelativePaths: backup.copiedRelativePaths,
      createdAt: new Date().toISOString(),
      state: 'backup-complete',
      targetFormatVersion: DRIFTFIELD_PROJECT_FORMAT_VERSION,
      warnings: [],
    }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  return backup;
};

const readLegacySettings = (
  projectPath: string,
  warnings: string[],
): LegacySettings | null => {
  const databasePath = path.join(projectPath, '.driftfield', 'settings.sqlite');
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(databasePath, { allowExtension: false, readOnly: true });
    const setting = database.prepare(`
      SELECT provider_id, model_id, thinking_level, use_global
      FROM agent_settings WHERE singleton = 1
    `).get() as {
      model_id: string | null;
      provider_id: string | null;
      thinking_level: string;
      use_global: number;
    } | undefined;
    if (setting === undefined) throw new Error('missing Agent settings row');
    const overrides = database.prepare(`
      SELECT provider_id, model_id, override_json, updated_at
      FROM agent_model_overrides ORDER BY provider_id, model_id
    `).all() as Array<{
      model_id: string;
      override_json: string;
      provider_id: string;
      updated_at: string;
    }>;
    return {
      modelId: setting.model_id,
      overrides: overrides.map((row) => ({
        modelId: row.model_id,
        overrideJson: row.override_json,
        providerId: row.provider_id,
        updatedAt: row.updated_at,
      })),
      providerId: setting.provider_id,
      thinkingLevel: setting.thinking_level,
      useGlobal: setting.use_global,
    };
  } catch (error) {
    if (!isMissing(error)) warnings.push('legacy-settings-not-imported');
    return null;
  } finally {
    database?.close();
  }
};

const readLegacyConversations = (
  projectPath: string,
  warnings: string[],
): LegacyConversationData | null => {
  const databasePath = path.join(projectPath, '.driftfield', 'conversations.sqlite');
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(databasePath, { allowExtension: false, readOnly: true });
    const conversations = database.prepare(`
      SELECT id, title, created_at, updated_at, deleted_at
      FROM conversations ORDER BY created_at, id
    `).all() as unknown as LegacyConversationRow[];
    const messages = database.prepare(`
      SELECT id, conversation_id, sequence, role, content, parts_json, terminal,
             proposal_id, proposal_json, proposal_status, run_status, active,
             created_at, updated_at
      FROM conversation_messages ORDER BY conversation_id, sequence, id
    `).all() as unknown as LegacyMessageRow[];
    const state = database.prepare(`
      SELECT active_conversation_id FROM conversation_state WHERE singleton = 1
    `).get() as { active_conversation_id: string | null } | undefined;
    if (state === undefined) throw new Error('missing conversation state row');
    return {
      activeConversationId: state.active_conversation_id,
      conversations,
      messages,
    };
  } catch (error) {
    if (!isMissing(error)) warnings.push('legacy-conversations-not-imported');
    return null;
  } finally {
    database?.close();
  }
};

const documentNode = async (
  projectPath: string,
  parentId: string,
  relativePath: string,
  sortKey: number,
  entry: { id: string; kind: NewProjectCatalogNode['kind']; title: string },
): Promise<NewProjectCatalogNode> => {
  const markdown = await readFile(path.join(projectPath, relativePath));
  return {
    backingStatus: 'present',
    contentRevision: contentRevision(markdown),
    icon: null,
    id: entry.id,
    kind: entry.kind,
    numberingFormat: null,
    numberingMode: null,
    parentId,
    relativePath: normalizeRelativePath(relativePath),
    sortKey,
    title: entry.title,
    type: 'document',
  };
};

const buildCatalog = async (
  projectPath: string,
  layout: LoadedProjectLayout,
): Promise<NewProjectCatalogNode[]> => {
  const manuscript = layout.manuscript.index;
  const nodes: NewProjectCatalogNode[] = [{
    backingStatus: 'present',
    contentRevision: null,
    icon: manuscript.icon ?? null,
    id: manuscript.id,
    kind: 'manuscript',
    numberingFormat: manuscript.chapterNumbering?.format ?? null,
    numberingMode: manuscript.chapterNumbering?.mode ?? null,
    parentId: null,
    relativePath: 'manuscript',
    sortKey: 0,
    title: manuscript.title,
    type: 'directory',
  }];
  const volumes = new Map(layout.manuscript.volumes.map((volume) => [volume.directory, volume]));
  for (const [sortKey, child] of manuscript.children.entries()) {
    if (child.kind !== 'volume') {
      nodes.push(await documentNode(
        projectPath,
        manuscript.id,
        path.join('manuscript', child.file),
        sortKey,
        child,
      ));
      continue;
    }
    const volume = volumes.get(child.directory);
    if (volume === undefined) throw new Error('Legacy volume metadata is incomplete');
    nodes.push({
      backingStatus: 'present',
      contentRevision: null,
      icon: volume.index.icon ?? null,
      id: volume.index.id,
      kind: 'volume',
      numberingFormat: volume.index.chapterNumbering?.format ?? null,
      numberingMode: volume.index.chapterNumbering?.mode ?? null,
      parentId: manuscript.id,
      relativePath: normalizeRelativePath(path.join('manuscript', child.directory)),
      sortKey,
      title: volume.index.title,
      type: 'directory',
    });
    for (const [documentSortKey, entry] of volume.index.children.entries()) {
      nodes.push(await documentNode(
        projectPath,
        volume.index.id,
        path.join('manuscript', child.directory, entry.file),
        documentSortKey,
        entry,
      ));
    }
  }

  if (layout.lore === null) {
    const loreId = randomUUID();
    await mkdir(path.join(projectPath, 'lore'), { mode: 0o700 });
    nodes.push({
      backingStatus: 'present',
      contentRevision: null,
      icon: null,
      id: loreId,
      kind: 'lore',
      numberingFormat: null,
      numberingMode: null,
      parentId: null,
      relativePath: 'lore',
      sortKey: 1,
      title: 'Lore',
      type: 'directory',
    });
    return nodes;
  }

  const lore = layout.lore.index;
  nodes.push({
    backingStatus: 'present',
    contentRevision: null,
    icon: lore.icon ?? null,
    id: lore.id,
    kind: 'lore',
    numberingFormat: null,
    numberingMode: null,
    parentId: null,
    relativePath: 'lore',
    sortKey: 1,
    title: lore.title,
    type: 'directory',
  });
  const categories = new Map(layout.lore.categories.map((category) => [category.directory, category]));
  for (const [sortKey, child] of lore.children.entries()) {
    if (child.kind !== 'category') {
      nodes.push(await documentNode(
        projectPath,
        lore.id,
        path.join('lore', child.file),
        sortKey,
        child,
      ));
      continue;
    }
    const category = categories.get(child.directory);
    if (category === undefined) throw new Error('Legacy lore metadata is incomplete');
    nodes.push({
      backingStatus: 'present',
      contentRevision: null,
      icon: category.index.icon ?? null,
      id: category.index.id,
      kind: 'category',
      numberingFormat: null,
      numberingMode: null,
      parentId: lore.id,
      relativePath: normalizeRelativePath(path.join('lore', child.directory)),
      sortKey,
      title: category.index.title,
      type: 'directory',
    });
    for (const [entrySortKey, entry] of category.index.children.entries()) {
      nodes.push(await documentNode(
        projectPath,
        category.index.id,
        path.join('lore', child.directory, entry.file),
        entrySortKey,
        entry,
      ));
    }
  }
  return nodes;
};

const importSettings = (database: ProjectDatabase, settings: LegacySettings | null): void => {
  if (settings === null) return;
  new ProjectLegacyRepository(database).importSettings(settings);
};

const importConversations = (
  database: ProjectDatabase,
  data: LegacyConversationData | null,
): void => {
  if (data === null) return;
  new ProjectLegacyRepository(database).importConversations(data);
};

const retireLegacyFiles = async (
  projectPath: string,
  backup: LegacyProjectBackup,
): Promise<void> => {
  for (const relativePath of backup.copiedRelativePaths) {
    if (relativePath === '.driftfield/project.sqlite') continue;
    const sourcePath = path.join(projectPath, relativePath);
    const destinationPath = path.join(backup.backupPath, 'retired', relativePath);
    try {
      await assertRegularFile(sourcePath);
      await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
      await rename(sourcePath, destinationPath);
    } catch (error) {
      if (!isMissing(error)) backup.warnings.push(`legacy-file-not-retired:${normalizeRelativePath(relativePath)}`);
    }
  }
};

export const migrateLegacyProjectToV3 = async (
  projectPath: string,
  layout: LoadedProjectLayout,
  backup: LegacyProjectBackup,
): Promise<void> => {
  const settings = readLegacySettings(projectPath, backup.warnings);
  const conversations = readLegacyConversations(projectPath, backup.warnings);
  const nodes = await buildCatalog(projectPath, layout);
  const database = new ProjectDatabase(projectPath);
  try {
    database.transaction(() => {
      new ProjectCatalogRepository(database).replaceAll(nodes);
      importSettings(database, settings);
      importConversations(database, conversations);
      database.setProjectFormatVersion(DRIFTFIELD_PROJECT_FORMAT_VERSION);
    });
  } finally {
    database.close();
  }
  await retireLegacyFiles(projectPath, backup);
  await writeFile(
    path.join(backup.backupPath, 'migration.json'),
    `${JSON.stringify({
      completedAt: new Date().toISOString(),
      copiedRelativePaths: backup.copiedRelativePaths,
      state: 'completed',
      targetFormatVersion: DRIFTFIELD_PROJECT_FORMAT_VERSION,
      warnings: backup.warnings,
    }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
};
