import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase } from '../../../src/main/database/project-database';
import { ProjectReconciliationRepository } from '../../../src/main/database/project-reconciliation-repository';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('ProjectReconciliationRepository', () => {
  it('creates and idempotently completes a durable Manuscript job', async () => {
    const database = await createDatabase('chapter');
    insertArtifact(database, 'accepted');
    const repository = new ProjectReconciliationRepository(database);

    const job = repository.ensureAcceptedArtifact('artifact-1');

    expect(job).toMatchObject({
      artifactId: 'artifact-1',
      documentId: 'document-1',
      documentRevision: 'a'.repeat(64),
      sourceRequestId: 'request-1',
    });
    expect(repository.ensureAcceptedArtifact('artifact-1')).toEqual(job);
    expect(repository.complete(job!.id, 'no_changes')).toBe(true);
    expect(repository.complete(job!.id, 'no_changes')).toBe(true);
    expect(repository.complete(job!.id, 'applied')).toBe(false);
    expect(repository.recoverPending()).toBeNull();
    database.close();
  });

  it('does not create story reconciliation work for Lore prose', async () => {
    const database = await createDatabase('entry');
    insertArtifact(database, 'accepted');

    expect(new ProjectReconciliationRepository(database)
      .ensureAcceptedArtifact('artifact-1')).toBeNull();
    expect(new ProjectReconciliationRepository(database).recoverPending()).toBeNull();
    database.close();
  });

  it('rolls forward an accepted proposal left with a proposed artifact', async () => {
    const database = await createDatabase('chapter');
    insertArtifact(database, 'proposed', 'proposal-1');
    database.connection.prepare(`
      UPDATE project_nodes SET content_revision = ? WHERE node_id = 'document-1'
    `).run(createHash('sha256').update('# Document', 'utf8').digest('hex'));
    database.connection.prepare(`
      INSERT INTO conversations(id, title, created_at, updated_at, deleted_at)
      VALUES ('conversation-1', 'Conversation', 'now', 'now', NULL)
    `).run();
    database.connection.prepare(`
      INSERT INTO conversation_messages(
        id, conversation_id, sequence, role, content, parts_json, terminal,
        proposal_id, proposal_json, proposal_status, run_status, active,
        created_at, updated_at
      ) VALUES (
        'message-1', 'conversation-1', 0, 'assistant', '', NULL, NULL,
        'proposal-1', '{}', 'saved', 'completed', 1, 'now', 'now'
      )
    `).run();

    const job = new ProjectReconciliationRepository(database).recoverPending();

    expect(job).toMatchObject({ artifactId: 'artifact-1', documentId: 'document-1' });
    expect(database.connection.prepare(`
      SELECT state FROM writing_artifacts WHERE artifact_id = 'artifact-1'
    `).get()).toEqual({ state: 'accepted' });
    database.close();
  });

  it('does not roll forward when the saved document is not the artifact', async () => {
    const database = await createDatabase('chapter');
    insertArtifact(database, 'proposed', 'proposal-1');
    database.connection.prepare(`
      INSERT INTO conversations(id, title, created_at, updated_at, deleted_at)
      VALUES ('conversation-1', 'Conversation', 'now', 'now', NULL)
    `).run();
    database.connection.prepare(`
      INSERT INTO conversation_messages(
        id, conversation_id, sequence, role, content, parts_json, terminal,
        proposal_id, proposal_json, proposal_status, run_status, active,
        created_at, updated_at
      ) VALUES (
        'message-1', 'conversation-1', 0, 'assistant', '', NULL, NULL,
        'proposal-1', '{}', 'saved', 'completed', 1, 'now', 'now'
      )
    `).run();

    expect(new ProjectReconciliationRepository(database).recoverPending()).toBeNull();
    expect(database.connection.prepare(`
      SELECT state, target_document_id FROM writing_artifacts
      WHERE artifact_id = 'artifact-1'
    `).get()).toEqual({ state: 'proposed', target_document_id: null });
    database.close();
  });
});

const createDatabase = async (
  documentKind: 'chapter' | 'entry',
): Promise<ProjectDatabase> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-reconcile-'));
  directories.push(directory);
  const database = new ProjectDatabase(directory);
  database.initializeProjectMetadata('project-1', 3, 'Project');
  const rootKind = documentKind === 'entry' ? 'lore' : 'manuscript';
  database.connection.prepare(`
    INSERT INTO project_nodes(
      node_id, parent_node_id, node_type, kind, metadata_title, icon,
      relative_path, sort_key, numbering_mode, numbering_format,
      content_revision, backing_status, created_at, updated_at
    ) VALUES (?, NULL, 'directory', ?, 'Root', NULL, ?, 0, ?, NULL,
              NULL, 'present', 'now', 'now')
  `).run(
    'root-1',
    rootKind,
    rootKind,
    rootKind === 'manuscript' ? 'continuous' : 'none',
  );
  database.connection.prepare(`
    INSERT INTO project_nodes(
      node_id, parent_node_id, node_type, kind, metadata_title, icon,
      relative_path, sort_key, numbering_mode, numbering_format,
      content_revision, backing_status, created_at, updated_at
    ) VALUES ('document-1', 'root-1', 'document', ?, 'Document', NULL,
              ?, 0, NULL, NULL, ?, 'present', 'now', 'now')
  `).run(
    documentKind,
    `${rootKind}/document.md`,
    'a'.repeat(64),
  );
  return database;
};

const insertArtifact = (
  database: ProjectDatabase,
  state: 'accepted' | 'proposed',
  proposalId: string | null = null,
): void => {
  database.connection.prepare(`
    INSERT INTO writing_artifacts(
      artifact_id, request_id, target_document_id, state, markdown,
      validation_code, created_at, updated_at, proposal_id,
      proposed_document_id
    ) VALUES ('artifact-1', 'request-1', ?, ?, '# Document',
              NULL, 'now', 'now', ?, ?)
  `).run(
    state === 'accepted' ? 'document-1' : null,
    state,
    proposalId,
    state === 'proposed' ? 'document-1' : null,
  );
};
