import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import type {
  ProjectStoryOperation,
  ProjectStorySnapshot,
} from '../../../shared/contracts/project-story';
import { ProjectDatabase } from '../../database/project-database';
import {
  ProjectStoryRepository,
  type StoryOperationAudit,
} from '../../database/project-story-repository';
import type { ProjectSession } from './session-service';
import { contentRevision, isPathInside } from './document-utils';

export class ProjectStoryService {
  getSnapshot(session: ProjectSession): ProjectStorySnapshot {
    return this.withRepository(session, (repository) => repository.getSnapshot());
  }

  createProposal(
    session: ProjectSession,
    expectedRevision: number,
    operation: ProjectStoryOperation,
    audit: StoryOperationAudit,
  ): void {
    this.assertOperationSources(session, operation);
    this.withRepository(session, (repository) =>
      repository.createPendingOperation(expectedRevision, audit),
    );
  }

  settleProposal(
    session: ProjectSession,
    operationId: string,
    status: 'rejected' | 'conflict' | 'failed',
    errorCode: string | null = null,
  ): boolean {
    return this.withRepository(session, (repository) =>
      repository.settleOperation(operationId, status, errorCode),
    );
  }

  applyOperation(
    session: ProjectSession,
    expectedRevision: number,
    operation: ProjectStoryOperation,
    audit?: StoryOperationAudit,
  ): ProjectStorySnapshot {
    this.assertOperationSources(session, operation);
    return this.withRepository(session, (repository) => {
      switch (operation.operation) {
        case 'create_persona':
          repository.createPersona(expectedRevision, operation, audit);
          break;
        case 'create_timeline':
          repository.createTimeline(expectedRevision, operation, audit);
          break;
        case 'create_moment':
          repository.createMoment(expectedRevision, operation, audit);
          break;
        case 'create_event':
          repository.createEvent(expectedRevision, operation, audit);
          break;
        case 'create_thread':
          repository.createThread(expectedRevision, operation, audit);
          break;
        case 'create_beat':
          repository.createBeat(expectedRevision, operation, audit);
          break;
        case 'link_beat_event':
          repository.linkBeatToEvent(
            expectedRevision,
            operation.beatId,
            operation.eventId,
            operation.relation,
            audit,
          );
          break;
      }
      return repository.getSnapshot();
    });
  }

  maintainOperation(
    session: ProjectSession,
    expectedRevision: number,
    operation: ProjectStoryOperation,
    requestId: string,
  ): { operationId: string; snapshot: ProjectStorySnapshot } {
    const operationId = randomUUID();
    const snapshot = this.applyOperation(session, expectedRevision, operation, {
      mode: 'direct',
      operationId,
      operationKind: operation.operation,
      originRequestId: requestId,
      payload: operation,
    });
    return { operationId, snapshot };
  }

  private withRepository<T>(
    session: ProjectSession,
    operation: (repository: ProjectStoryRepository) => T,
  ): T {
    const database = new ProjectDatabase(session.directoryPath);
    try {
      return operation(new ProjectStoryRepository(database));
    } finally {
      database.close();
    }
  }

  private assertOperationSources(
    session: ProjectSession,
    operation: ProjectStoryOperation,
  ): void {
    if (operation.operation !== 'create_event' || operation.sources === undefined) {
      return;
    }
    const projectDirectory = realpathSync(session.directoryPath);
    for (const source of operation.sources) {
      if (source.sourceKind !== 'manuscript') {
        throw new Error('Unsupported Chronicle source kind');
      }
      const relativePath = session.documentPaths.get(source.documentId);
      if (relativePath === undefined) throw new Error('Unknown Chronicle source');
      const candidate = path.resolve(projectDirectory, relativePath);
      if (!isPathInside(projectDirectory, candidate)) {
        throw new Error('Chronicle source is outside the project');
      }
      const stats = lstatSync(candidate);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error('Chronicle source is not a regular file');
      }
      const canonicalDocument = realpathSync(candidate);
      if (!isPathInside(projectDirectory, canonicalDocument)) {
        throw new Error('Chronicle source is outside the project');
      }
      if (contentRevision(readFileSync(canonicalDocument)) !== source.documentRevision) {
        throw new Error('Chronicle source revision changed');
      }
    }
  }
}
