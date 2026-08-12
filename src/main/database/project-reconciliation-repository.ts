import { createHash, randomUUID } from 'node:crypto';

import type { ProjectDatabase } from './project-database';

export type StoryReconciliationOutcome =
  | 'applied'
  | 'no_changes'
  | 'questions_recorded';

export interface StoryReconciliationJob {
  artifactId: string;
  documentId: string;
  documentRevision: string;
  id: string;
  sourceRequestId: string;
}

interface ReconciliationJobRow {
  artifact_id: string;
  document_id: string;
  document_revision: string;
  job_id: string;
  source_request_id: string;
}

export class ProjectReconciliationRepository {
  constructor(private readonly database: ProjectDatabase) {}

  ensureAcceptedArtifact(artifactId: string): StoryReconciliationJob | null {
    const source = this.database.connection.prepare(`
      SELECT artifacts.artifact_id, artifacts.request_id,
             artifacts.target_document_id, nodes.content_revision, nodes.kind
      FROM writing_artifacts AS artifacts
      JOIN project_nodes AS nodes
        ON nodes.node_id = artifacts.target_document_id
      WHERE artifacts.artifact_id = ? AND artifacts.state = 'accepted'
        AND nodes.node_type = 'document' AND nodes.backing_status = 'present'
    `).get(artifactId) as {
      artifact_id: string;
      content_revision: string | null;
      kind: string;
      request_id: string;
      target_document_id: string;
    } | undefined;
    if (
      source === undefined ||
      source.kind === 'entry' ||
      source.content_revision === null
    ) return null;

    const now = new Date().toISOString();
    this.database.connection.prepare(`
      INSERT INTO story_reconciliation_jobs(
        job_id, artifact_id, source_request_id, document_id,
        document_revision, status, outcome, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL)
      ON CONFLICT(artifact_id) DO NOTHING
    `).run(
      randomUUID(),
      source.artifact_id,
      source.request_id,
      source.target_document_id,
      source.content_revision,
      now,
      now,
    );
    return this.getByArtifact(source.artifact_id);
  }

  recoverPending(): StoryReconciliationJob | null {
    this.database.transaction(() => {
      const now = new Date().toISOString();
      const recoverable = this.database.connection.prepare(`
        SELECT artifacts.artifact_id, artifacts.markdown,
               artifacts.proposed_document_id, nodes.content_revision
        FROM writing_artifacts AS artifacts
        JOIN conversation_messages AS messages
          ON messages.proposal_id = artifacts.proposal_id
         AND messages.proposal_status = 'saved'
        JOIN project_nodes AS nodes
          ON nodes.node_id = artifacts.proposed_document_id
         AND nodes.node_type = 'document'
         AND nodes.backing_status = 'present'
        WHERE artifacts.state = 'proposed'
          AND artifacts.proposed_document_id IS NOT NULL
          AND nodes.content_revision IS NOT NULL
      `).all() as Array<{
        artifact_id: string;
        content_revision: string;
        markdown: string;
        proposed_document_id: string;
      }>;
      const accept = this.database.connection.prepare(`
        UPDATE writing_artifacts
        SET state = 'accepted', target_document_id = ?,
            validation_code = NULL, updated_at = ?
        WHERE artifact_id = ? AND state = 'proposed'
      `);
      for (const artifact of recoverable) {
        if (markdownRevision(artifact.markdown) !== artifact.content_revision) {
          continue;
        }
        accept.run(
          artifact.proposed_document_id,
          now,
          artifact.artifact_id,
        );
      }
      const artifacts = this.database.connection.prepare(`
        SELECT artifact_id FROM writing_artifacts
        WHERE state = 'accepted'
        ORDER BY created_at, artifact_id
      `).all() as Array<{ artifact_id: string }>;
      for (const { artifact_id: artifactId } of artifacts) {
        this.ensureAcceptedArtifact(artifactId);
      }
      this.database.connection.prepare(`
        UPDATE story_reconciliation_jobs
        SET status = 'completed', outcome = 'applied',
            updated_at = ?, completed_at = ?
        WHERE status = 'pending' AND EXISTS (
          SELECT 1 FROM chronicle_event_sources AS sources
          WHERE sources.document_id = story_reconciliation_jobs.document_id
            AND sources.document_revision = story_reconciliation_jobs.document_revision
            AND sources.relation = 'depicted'
        )
      `).run(now, now);
    });
    const row = this.database.connection.prepare(`
      SELECT job_id, artifact_id, source_request_id,
             document_id, document_revision
      FROM story_reconciliation_jobs
      WHERE status = 'pending'
      ORDER BY created_at, job_id
      LIMIT 1
    `).get() as ReconciliationJobRow | undefined;
    return row === undefined ? null : mapJob(row);
  }

  complete(jobId: string, outcome: StoryReconciliationOutcome): boolean {
    const now = new Date().toISOString();
    const result = this.database.connection.prepare(`
      UPDATE story_reconciliation_jobs
      SET status = 'completed', outcome = ?, updated_at = ?, completed_at = ?
      WHERE job_id = ? AND status = 'pending'
    `).run(outcome, now, now, jobId);
    if (result.changes === 1) return true;
    const row = this.database.connection.prepare(`
      SELECT outcome FROM story_reconciliation_jobs
      WHERE job_id = ? AND status = 'completed'
    `).get(jobId) as { outcome: StoryReconciliationOutcome } | undefined;
    return row?.outcome === outcome;
  }

  private getByArtifact(artifactId: string): StoryReconciliationJob | null {
    const row = this.database.connection.prepare(`
      SELECT job_id, artifact_id, source_request_id,
             document_id, document_revision
      FROM story_reconciliation_jobs
      WHERE artifact_id = ? AND status = 'pending'
    `).get(artifactId) as ReconciliationJobRow | undefined;
    return row === undefined ? null : mapJob(row);
  }
}

const mapJob = (row: ReconciliationJobRow): StoryReconciliationJob => ({
  artifactId: row.artifact_id,
  documentId: row.document_id,
  documentRevision: row.document_revision,
  id: row.job_id,
  sourceRequestId: row.source_request_id,
});

const markdownRevision = (markdown: string): string =>
  createHash('sha256').update(markdown, 'utf8').digest('hex');
