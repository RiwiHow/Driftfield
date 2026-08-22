import type { ProjectDatabase } from './project-database';

export type WritingArtifactState =
  | 'accepted'
  | 'invalid'
  | 'proposed'
  | 'rejected'
  | 'validated';

export class ProjectWritingArtifactRepository {
  constructor(private readonly database: ProjectDatabase) {}

  upsertPending(input: {
    artifactId: string;
    markdown: string;
    requestId: string;
    targetDocumentId: string | null;
    validationCode: string | null;
  }): void {
    const now = new Date().toISOString();
    this.database.connection.prepare(`
      INSERT INTO writing_artifacts(
        artifact_id, request_id, target_document_id, state, markdown,
        validation_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(artifact_id) DO UPDATE SET
        state = excluded.state,
        markdown = excluded.markdown,
        validation_code = excluded.validation_code,
        updated_at = excluded.updated_at
    `).run(
      input.artifactId,
      input.requestId,
      input.targetDocumentId,
      input.validationCode === null ? 'validated' : 'invalid',
      input.markdown,
      input.validationCode,
      now,
      now,
    );
  }

  update(input: {
    artifactId: string;
    markdown: string;
    proposalId: string | null;
    proposedDocumentId: string | null;
    requestId: string;
    state: Exclude<WritingArtifactState, 'invalid'>;
    targetDocumentId: string | null;
  }): void {
    this.database.connection.prepare(`
      UPDATE writing_artifacts
      SET state = ?, markdown = ?, target_document_id = ?,
          proposal_id = COALESCE(?, proposal_id),
          proposed_document_id = COALESCE(?, proposed_document_id),
          validation_code = NULL, updated_at = ?
      WHERE artifact_id = ? AND request_id = ?
    `).run(
      input.state,
      input.markdown,
      input.targetDocumentId,
      input.proposalId,
      input.proposedDocumentId,
      new Date().toISOString(),
      input.artifactId,
      input.requestId,
    );
  }

  accept(input: {
    artifactId: string;
    markdown: string;
    requestId: string;
    targetDocumentId: string | null;
  }): void {
    const result = this.database.connection.prepare(`
      UPDATE writing_artifacts
      SET state = 'accepted', markdown = ?, target_document_id = ?,
          validation_code = NULL, updated_at = ?
      WHERE artifact_id = ? AND request_id = ?
    `).run(
      input.markdown,
      input.targetDocumentId,
      new Date().toISOString(),
      input.artifactId,
      input.requestId,
    );
    if (result.changes !== 1) throw new Error('Accepted writing artifact is missing');
  }
}
