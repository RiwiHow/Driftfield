import { randomUUID } from 'node:crypto';

import { ProjectStore } from '../../database/project-store';

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
    const store = new ProjectStore(this.projectPath);
    try {
      this.prepare(store, operationId, input);
      let databaseApplied = false;
      let filesystemStarted = false;
      try {
        filesystemStarted = true;
        await input.applyFilesystem();
        this.updateState(store, operationId, 'filesystem_applied', null);
        const result = input.applyDatabase();
        databaseApplied = true;
        this.updateState(store, operationId, 'completed', null);
        return result;
      } catch (error) {
        if (databaseApplied) {
          try {
            this.updateState(
              store,
              operationId,
              'failed_recoverable',
              'completion-record-failed',
            );
          } catch {
            // The existing filesystem_applied row still blocks normal reopening.
          }
        } else if (filesystemStarted) {
          try {
            await input.rollbackFilesystem();
            this.updateState(store, operationId, 'failed_terminal', 'rolled-back');
          } catch (rollbackError) {
            if ((rollbackError as NodeJS.ErrnoException).code === 'ENOENT') {
              this.updateState(
                store,
                operationId,
                'failed_terminal',
                'filesystem-not-applied',
              );
            } else {
              this.updateState(
                store,
                operationId,
                'failed_recoverable',
                'rollback-failed',
              );
            }
          }
        } else {
          this.updateState(store, operationId, 'failed_terminal', 'filesystem-failed');
        }
        throw error;
      }
    } finally {
      store.close();
    }
  }

  static assertNoUnfinishedOperations(projectPath: string): void {
    const store = new ProjectStore(projectPath);
    try {
      const operationIds = store.write(
        ({ operations }) => operations.markInterruptedAsRecoverable(),
      );
      if (operationIds.length > 0) throw new ProjectRecoveryRequiredError(operationIds);
    } finally {
      store.close();
    }
  }

  private prepare(
    store: ProjectStore,
    operationId: string,
    input: {
      baseProjectRevision: number;
      files: ProjectMutationFilePlan[];
      operationKind: string;
      payload: unknown;
    },
  ): void {
    store.write(({ operations }) => operations.prepare({ operationId, ...input }));
  }

  private updateState(
    store: ProjectStore,
    operationId: string,
    state: 'completed' | 'failed_recoverable' | 'failed_terminal' | 'filesystem_applied',
    errorCode: string | null,
  ): void {
    store.write(({ operations }) => operations.updateState(
      operationId,
      state,
      errorCode,
    ));
  }
}
