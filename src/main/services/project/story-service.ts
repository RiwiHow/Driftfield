import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import type {
  ProjectStoryOperation,
  ProjectStorySnapshot,
  StoryQuestionEvidence,
  StoryQuestionKind,
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

  recordQuestion(
    session: ProjectSession,
    requestId: string,
    input: {
      context: string;
      evidence: StoryQuestionEvidence | null;
      kind: StoryQuestionKind;
      options: string[];
      question: string;
    },
  ) {
    if (input.evidence !== null) this.assertEvidence(session, input.evidence);
    return this.withRepository(session, (repository) => repository.createQuestion({
      ...input,
      originRequestId: requestId,
    }));
  }

  resolveQuestion(session: ProjectSession, questionId: string, answer: string) {
    return this.withRepository(session, (repository) =>
      repository.resolveQuestion(questionId, answer),
    );
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
      this.applyWithRepository(repository, expectedRevision, operation, audit);
      return repository.getSnapshot();
    });
  }

  applyProposalBatch(
    session: ProjectSession,
    expectedRevision: number,
    entries: Array<{
      audit: StoryOperationAudit;
      operation: ProjectStoryOperation;
    }>,
  ): ProjectStorySnapshot {
    if (entries.length === 0 || entries.length > 24) {
      throw new Error('Invalid story proposal batch');
    }
    for (const entry of entries) {
      this.assertOperationSources(session, entry.operation);
    }
    return this.withRepository(session, (repository) =>
      repository.transaction(() => {
        entries.forEach((entry, index) => {
          const revision = expectedRevision + index;
          if (index > 0) {
            repository.rebasePendingOperation(
              entry.audit.operationId,
              expectedRevision,
              revision,
            );
          }
          this.applyWithRepository(
            repository,
            revision,
            entry.operation,
            entry.audit,
          );
        });
        return repository.getSnapshot();
      }),
    );
  }

  maintainOperations(
    session: ProjectSession,
    expectedRevision: number,
    operations: ProjectStoryOperation[],
    requestId: string,
  ): { operationIds: string[]; snapshot: ProjectStorySnapshot } {
    if (operations.length === 0 || operations.length > 24) {
      throw new Error('Invalid story maintenance batch');
    }
    for (const operation of operations) this.assertOperationSources(session, operation);
    const entries = operations.map((operation) => ({
      audit: {
        mode: 'direct' as const,
        operationId: randomUUID(),
        operationKind: operation.operation,
        originRequestId: requestId,
        payload: operation,
      },
      operation,
    }));
    const snapshot = this.withRepository(session, (repository) =>
      repository.transaction(() => {
        entries.forEach((entry, index) => {
          this.applyWithRepository(
            repository,
            expectedRevision + index,
            entry.operation,
            entry.audit,
          );
        });
        repository.collapseAppliedOperations(
          entries.map(({ audit }) => audit.operationId),
          expectedRevision,
          expectedRevision + entries.length,
        );
        return repository.getSnapshot();
      }),
    );
    return {
      operationIds: entries.map(({ audit }) => audit.operationId),
      snapshot,
    };
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
      this.assertEvidence(session, {
        anchor: source.anchor ?? source.documentId,
        documentId: source.documentId,
        documentRevision: source.documentRevision,
        sourceKind: source.sourceKind,
      }, projectDirectory, 'Chronicle source');
    }
  }

  private assertEvidence(
    session: ProjectSession,
    evidence: StoryQuestionEvidence,
    canonicalProject?: string,
    label = 'Story evidence',
  ): void {
      if (evidence.sourceKind !== 'manuscript') {
        throw new Error('Unsupported story evidence kind');
      }
      const projectDirectory = canonicalProject ?? realpathSync(session.directoryPath);
      const relativePath = session.documentPaths.get(evidence.documentId);
      if (relativePath === undefined) throw new Error(`Unknown ${label.toLowerCase()}`);
      const candidate = path.resolve(projectDirectory, relativePath);
      if (!isPathInside(projectDirectory, candidate)) {
        throw new Error(`${label} is outside the project`);
      }
      const stats = lstatSync(candidate);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`${label} is not a regular file`);
      }
      const canonicalDocument = realpathSync(candidate);
      if (!isPathInside(projectDirectory, canonicalDocument)) {
        throw new Error(`${label} is outside the project`);
      }
      if (contentRevision(readFileSync(canonicalDocument)) !== evidence.documentRevision) {
        throw new Error(`${label} revision changed`);
      }
  }

  private applyWithRepository(
    repository: ProjectStoryRepository,
    expectedRevision: number,
    operation: ProjectStoryOperation,
    audit?: StoryOperationAudit,
  ): void {
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
  }
}
