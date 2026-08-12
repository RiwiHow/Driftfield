import { randomUUID } from 'node:crypto';

import { ProjectDatabase } from '../../database/project-database';

export interface ProjectMutationFilePlan {
  newRelativePath?: string;
  newRevision?: string;
  oldRelativePath?: string;
  oldRevision?: string;
  recoveryRelativePath?: string;
  stagingRelativePath?: string;
  trashRelativePath?: string;
}

export class ProjectRecoveryRequiredError extends Error {
  constructor(readonly operationIds: string[]) {
    super('Driftfield project has an unfinished recoverable file operation');
    this.name = 'ProjectRecoveryRequiredError';
  }
}

export class ProjectMutationCoordinator {
  constructor(private readonly projectPath: string) {}

  async execute<T>(input: {
    applyDatabase: () => T;
    applyFilesystem: () => Promise<void>;
    baseProjectRevision: number;
    files: ProjectMutationFilePlan[];
    operationKind: string;
    payload: unknown;
    rollbackFilesystem: () => Promise<void>;
  }): Promise<T> {
    const operationId = randomUUID();
    this.prepare(
      operationId,
      input.operationKind,
      input.baseProjectRevision,
      input.payload,
      input.files,
    );
    let databaseApplied = false;
    let filesystemStarted = false;
    try {
      filesystemStarted = true;
      await input.applyFilesystem();
      this.updateState(operationId, 'filesystem_applied', null);
      const result = input.applyDatabase();
      databaseApplied = true;
      this.updateState(operationId, 'completed', null);
      return result;
    } catch (error) {
      if (databaseApplied) {
        try {
          this.updateState(operationId, 'failed_recoverable', 'completion-record-failed');
        } catch {
          // The existing filesystem_applied row still blocks normal reopening.
        }
      } else if (filesystemStarted) {
        try {
          await input.rollbackFilesystem();
          this.updateState(operationId, 'failed_terminal', 'rolled-back');
        } catch (rollbackError) {
          if ((rollbackError as NodeJS.ErrnoException).code === 'ENOENT') {
            this.updateState(operationId, 'failed_terminal', 'filesystem-not-applied');
          } else {
            this.updateState(operationId, 'failed_recoverable', 'rollback-failed');
          }
        }
      } else {
        this.updateState(operationId, 'failed_terminal', 'filesystem-failed');
      }
      throw error;
    }
  }

  static assertNoUnfinishedOperations(projectPath: string): void {
    const database = new ProjectDatabase(projectPath);
    try {
      const rows = database.connection.prepare(`
        SELECT operation_id FROM project_operations
        WHERE state IN ('prepared', 'filesystem_applied', 'failed_recoverable')
        ORDER BY created_at, operation_id
      `).all() as Array<{ operation_id: string }>;
      if (rows.length === 0) return;
      database.connection.prepare(`
        UPDATE project_operations
        SET state = 'failed_recoverable',
            error_code = COALESCE(error_code, 'restart-during-mutation'),
            updated_at = ?
        WHERE state IN ('prepared', 'filesystem_applied')
      `).run(new Date().toISOString());
      throw new ProjectRecoveryRequiredError(rows.map(({ operation_id }) => operation_id));
    } finally {
      database.close();
    }
  }

  private prepare(
    operationId: string,
    operationKind: string,
    baseProjectRevision: number,
    payload: unknown,
    files: ProjectMutationFilePlan[],
  ): void {
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > 512 * 1024) {
      throw new Error('Project mutation payload is too large');
    }
    const database = new ProjectDatabase(this.projectPath);
    try {
      const now = new Date().toISOString();
      database.transaction(() => {
        database.connection.prepare(`
          INSERT INTO project_operations(
            operation_id, operation_kind, state, base_project_revision,
            payload_json, error_code, created_at, updated_at
          ) VALUES (?, ?, 'prepared', ?, ?, NULL, ?, ?)
        `).run(operationId, operationKind, baseProjectRevision, serialized, now, now);
        const insertFile = database.connection.prepare(`
          INSERT INTO project_operation_files(
            operation_id, ordinal, old_relative_path, new_relative_path,
            old_revision, new_revision, staging_relative_path,
            recovery_relative_path, trash_relative_path
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const [ordinal, file] of files.entries()) {
          insertFile.run(
            operationId,
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
      });
    } finally {
      database.close();
    }
  }

  private updateState(
    operationId: string,
    state: 'completed' | 'failed_recoverable' | 'failed_terminal' | 'filesystem_applied',
    errorCode: string | null,
  ): void {
    const database = new ProjectDatabase(this.projectPath);
    try {
      const result = database.connection.prepare(`
        UPDATE project_operations SET state = ?, error_code = ?, updated_at = ?
        WHERE operation_id = ?
      `).run(state, errorCode, new Date().toISOString(), operationId);
      if (result.changes !== 1) throw new Error('Project mutation operation was lost');
    } finally {
      database.close();
    }
  }
}
