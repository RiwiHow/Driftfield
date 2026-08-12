import { randomUUID } from 'node:crypto';

import type {
  ChapterNumberingMode,
  ManuscriptDocumentKind,
  ProjectIconId,
} from '../../shared/contracts/project-layout';
import type { ProjectDatabase } from './project-database';

export type ProjectCatalogDirectoryKind =
  | 'manuscript'
  | 'lore'
  | 'volume'
  | 'category';
export type ProjectCatalogDocumentKind = ManuscriptDocumentKind | 'entry';
export type ProjectCatalogNodeKind =
  | ProjectCatalogDirectoryKind
  | ProjectCatalogDocumentKind;

export interface ProjectCatalogNode {
  backingStatus: 'missing' | 'present';
  contentRevision: string | null;
  icon: ProjectIconId | null;
  id: string;
  kind: ProjectCatalogNodeKind;
  numberingFormat: string | null;
  numberingMode: ChapterNumberingMode | null;
  parentId: string | null;
  relativePath: string;
  sortKey: number;
  title: string;
  type: 'directory' | 'document';
}

export interface NewProjectCatalogNode extends ProjectCatalogNode {}

const rowToNode = (row: {
  backing_status: 'missing' | 'present';
  content_revision: string | null;
  icon: ProjectIconId | null;
  kind: ProjectCatalogNodeKind;
  metadata_title: string;
  node_id: string;
  node_type: 'directory' | 'document';
  numbering_format: string | null;
  numbering_mode: ChapterNumberingMode | null;
  parent_node_id: string | null;
  relative_path: string;
  sort_key: number;
}): ProjectCatalogNode => ({
  backingStatus: row.backing_status,
  contentRevision: row.content_revision,
  icon: row.icon,
  id: row.node_id,
  kind: row.kind,
  numberingFormat: row.numbering_format,
  numberingMode: row.numbering_mode,
  parentId: row.parent_node_id,
  relativePath: row.relative_path,
  sortKey: row.sort_key,
  title: row.metadata_title,
  type: row.node_type,
});

export class ProjectCatalogRepository {
  constructor(private readonly database: ProjectDatabase) {}

  getRevision(): number {
    const row = this.database.connection.prepare(`
      SELECT revision FROM project_catalog_state WHERE singleton = 1
    `).get() as { revision: number };
    return row.revision;
  }

  list(): ProjectCatalogNode[] {
    const rows = this.database.connection.prepare(`
      SELECT node_id, parent_node_id, node_type, kind, metadata_title, icon,
             relative_path, sort_key, numbering_mode, numbering_format,
             content_revision, backing_status
      FROM project_nodes
      ORDER BY CASE WHEN parent_node_id IS NULL THEN 0 ELSE 1 END,
               parent_node_id, sort_key, node_id
    `).all() as Parameters<typeof rowToNode>[0][];
    return rows.map(rowToNode);
  }

  get(nodeId: string): ProjectCatalogNode | null {
    const row = this.database.connection.prepare(`
      SELECT node_id, parent_node_id, node_type, kind, metadata_title, icon,
             relative_path, sort_key, numbering_mode, numbering_format,
             content_revision, backing_status
      FROM project_nodes WHERE node_id = ?
    `).get(nodeId) as Parameters<typeof rowToNode>[0] | undefined;
    return row === undefined ? null : rowToNode(row);
  }

  initializeDefault(): void {
    if (this.list().length !== 0) {
      throw new Error('Project catalog is already initialized');
    }
    const manuscriptId = randomUUID();
    const loreId = randomUUID();
    this.replaceAll([
      {
        backingStatus: 'present',
        contentRevision: null,
        icon: null,
        id: manuscriptId,
        kind: 'manuscript',
        numberingFormat: '{number}. {title}',
        numberingMode: 'continuous',
        parentId: null,
        relativePath: 'manuscript',
        sortKey: 0,
        title: 'Manuscript',
        type: 'directory',
      },
      {
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
      },
      ...([
        ['Personae', 'users'],
        ['Locations', 'map'],
        ['World', 'earth'],
      ] as const).map(([title, icon], sortKey) => ({
        backingStatus: 'present' as const,
        contentRevision: null,
        icon,
        id: randomUUID(),
        kind: 'category' as const,
        numberingFormat: null,
        numberingMode: null,
        parentId: loreId,
        relativePath: `lore/${title}`,
        sortKey,
        title,
        type: 'directory' as const,
      })),
    ]);
  }

  replaceAll(nodes: NewProjectCatalogNode[]): void {
    const insert = this.database.connection.prepare(`
      INSERT INTO project_nodes(
        node_id, parent_node_id, node_type, kind, metadata_title, icon,
        relative_path, sort_key, numbering_mode, numbering_format,
        content_revision, backing_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.connection.exec('DELETE FROM project_nodes');
      const pending = [...nodes];
      const inserted = new Set<string>();
      while (pending.length > 0) {
        const index = pending.findIndex(
          ({ parentId }) => parentId === null || inserted.has(parentId),
        );
        if (index < 0) throw new Error('Project catalog contains an invalid hierarchy');
        const [node] = pending.splice(index, 1);
        insert.run(
          node.id,
          node.parentId,
          node.type,
          node.kind,
          node.title,
          node.icon,
          node.relativePath,
          node.sortKey,
          node.numberingMode,
          node.numberingFormat,
          node.contentRevision,
          node.backingStatus,
          now,
          now,
        );
        inserted.add(node.id);
      }
      this.database.connection.prepare(`
        UPDATE project_catalog_state SET revision = revision + 1 WHERE singleton = 1
      `).run();
    });
  }

  create(node: NewProjectCatalogNode): void {
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.connection.prepare(`
        INSERT INTO project_nodes(
          node_id, parent_node_id, node_type, kind, metadata_title, icon,
          relative_path, sort_key, numbering_mode, numbering_format,
          content_revision, backing_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        node.id,
        node.parentId,
        node.type,
        node.kind,
        node.title,
        node.icon,
        node.relativePath,
        node.sortKey,
        node.numberingMode,
        node.numberingFormat,
        node.contentRevision,
        node.backingStatus,
        now,
        now,
      );
      this.bumpRevision();
    });
  }

  delete(nodeId: string): void {
    this.database.transaction(() => {
      const result = this.database.connection.prepare(`
        DELETE FROM project_nodes WHERE node_id = ?
      `).run(nodeId);
      if (result.changes !== 1) throw new Error('Project catalog node was not found');
      this.bumpRevision();
    });
  }

  updateDocumentLocation(
    nodeId: string,
    parentId: string,
    relativePath: string,
    sortKey: number,
  ): void {
    this.database.transaction(() => {
      const result = this.database.connection.prepare(`
        UPDATE project_nodes
        SET parent_node_id = ?, relative_path = ?, sort_key = ?, updated_at = ?
        WHERE node_id = ? AND node_type = 'document'
      `).run(parentId, relativePath, sortKey, new Date().toISOString(), nodeId);
      if (result.changes !== 1) throw new Error('Project document was not found');
      this.bumpRevision();
    });
  }

  updateTitle(nodeId: string, title: string): void {
    this.database.transaction(() => {
      const result = this.database.connection.prepare(`
        UPDATE project_nodes SET metadata_title = ?, updated_at = ? WHERE node_id = ?
      `).run(title, new Date().toISOString(), nodeId);
      if (result.changes !== 1) throw new Error('Project catalog node was not found');
      this.bumpRevision();
    });
  }

  updateDocumentRevision(
    nodeId: string,
    contentRevision: string,
    backingStatus: 'missing' | 'present' = 'present',
  ): void {
    this.database.transaction(() => {
      const result = this.database.connection.prepare(`
        UPDATE project_nodes
        SET content_revision = ?, backing_status = ?, updated_at = ?
        WHERE node_id = ? AND node_type = 'document'
      `).run(contentRevision, backingStatus, new Date().toISOString(), nodeId);
      if (result.changes !== 1) throw new Error('Project document was not found');
      this.bumpRevision();
    });
  }

  private bumpRevision(): void {
    this.database.connection.prepare(`
      UPDATE project_catalog_state SET revision = revision + 1 WHERE singleton = 1
    `).run();
  }
}
