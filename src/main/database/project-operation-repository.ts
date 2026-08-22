import type { ProjectDatabase } from './project-database';

export interface ProjectOperationFileRecord {
  newRelativePath?: string;
  newRevision?: string;
  oldRelativePath?: string;
  oldRevision?: string;
  recoveryRelativePath?: string;
  stagingRelativePath?: string;
  trashRelativePath?: string;
}

export type ProjectOperationState =
  | 'completed'
  | 'failed_recoverable'
  | 'failed_terminal'
  | 'filesystem_applied';

export class ProjectOperationRepository {
  constructor(private readonly database: ProjectDatabase) {}

  markInterruptedAsRecoverable(): string[] {
    const rows = this.database.connection.prepare(`
      SELECT operation_id FROM project_operations
      WHERE state IN ('prepared', 'filesystem_applied', 'failed_recoverable')
      ORDER BY created_at, operation_id
    `).all() as Array<{ operation_id: string }>;
    if (rows.length === 0) return [];
    this.database.connection.prepare(`
      UPDATE project_operations
      SET state = 'failed_recoverable',
          error_code = COALESCE(error_code, 'restart-during-mutation'),
          updated_at = ?
      WHERE state IN ('prepared', 'filesystem_applied')
    `).run(new Date().toISOString());
    return rows.map(({ operation_id: operationId }) => operationId);
  }

  prepare(input: {
    baseProjectRevision: number;
    files: ProjectOperationFileRecord[];
    operationId: string;
    operationKind: string;
    payload: unknown;
  }): void {
    const serialized = JSON.stringify(input.payload);
    if (Buffer.byteLength(serialized, 'utf8') > 512 * 1024) {
      throw new Error('Project mutation payload is too large');
    }
    const now = new Date().toISOString();
    this.database.connection.prepare(`
      INSERT INTO project_operations(
        operation_id, operation_kind, state, base_project_revision,
        payload_json, error_code, created_at, updated_at
      ) VALUES (?, ?, 'prepared', ?, ?, NULL, ?, ?)
    `).run(
      input.operationId,
      input.operationKind,
      input.baseProjectRevision,
      serialized,
      now,
      now,
    );
    const insertFile = this.database.connection.prepare(`
      INSERT INTO project_operation_files(
        operation_id, ordinal, old_relative_path, new_relative_path,
        old_revision, new_revision, staging_relative_path,
        recovery_relative_path, trash_relative_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [ordinal, file] of input.files.entries()) {
      insertFile.run(
        input.operationId,
        ordinal,
        file.oldRelativePath ?? null,
        file.newRelativePath ?? null,
        file.oldRevision ?? null,
        file.newRevision ?? null,
        file.stagingRelativePath ?? null,
        file.recoveryRelativePath ?? null,
        file.trashRelativePath ?? null,
      );
    }
  }

  updateState(
    operationId: string,
    state: ProjectOperationState,
    errorCode: string | null,
  ): void {
    const result = this.database.connection.prepare(`
      UPDATE project_operations SET state = ?, error_code = ?, updated_at = ?
      WHERE operation_id = ?
    `).run(state, errorCode, new Date().toISOString(), operationId);
    if (result.changes !== 1) throw new Error('Project mutation operation was lost');
  }
}
