import { randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import type {
  AgentStoryMaintenanceChange,
} from '../../../shared/contracts/agent-tools';
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

type StoryEntityKind =
  | 'beat'
  | 'event'
  | 'moment'
  | 'persona'
  | 'thread'
  | 'timeline';

interface ResolvedStoryReference {
  id: string;
  kind: StoryEntityKind;
}

interface StoryMaintenanceChangeResult {
  clientRef: string | null;
  entityId: string | null;
  operation: ProjectStoryOperation['operation'];
  operationId: string;
}

export class StoryMaintenanceReferenceError extends Error {}

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
    changes: AgentStoryMaintenanceChange[],
    requestId: string,
  ): {
    changes: StoryMaintenanceChangeResult[];
    operationIds: string[];
    snapshot: ProjectStorySnapshot;
  } {
    if (changes.length === 0 || changes.length > 24) {
      throw new Error('Invalid story maintenance batch');
    }
    const entries = changes.map((change) => ({ change, operationId: randomUUID() }));
    const results: StoryMaintenanceChangeResult[] = [];
    const snapshot = this.withRepository(session, (repository) =>
      repository.transaction(() => {
        const references = new Map<string, ResolvedStoryReference>();
        const existingEntities = indexStoryEntities(repository.getSnapshot());
        entries.forEach((entry, index) => {
          const operation = resolveMaintenanceOperation(
            entry.change,
            references,
            existingEntities,
            index,
          );
          this.assertOperationSources(session, operation);
          const audit = {
            mode: 'direct' as const,
            operationId: entry.operationId,
            operationKind: operation.operation,
            originRequestId: requestId,
            payload: operation,
          };
          const entityId = this.applyWithRepository(
            repository,
            expectedRevision + index,
            operation,
            audit,
          );
          const clientRef = 'clientRef' in entry.change
            ? entry.change.clientRef ?? null
            : null;
          if (clientRef !== null) {
            const kind = createdEntityKind(operation);
            if (kind === null || entityId === null) {
              throw new StoryMaintenanceReferenceError(
                `changes[${index}].clientRef is only valid on create operations.`,
              );
            }
            if (references.has(clientRef)) {
              throw new StoryMaintenanceReferenceError(
                `Duplicate story maintenance clientRef: ${clientRef}.`,
              );
            }
            references.set(clientRef, { id: entityId, kind });
            existingEntities.set(entityId, { id: entityId, kind });
          }
          results.push({
            clientRef,
            entityId,
            operation: operation.operation,
            operationId: entry.operationId,
          });
        });
        repository.collapseAppliedOperations(
          entries.map(({ operationId }) => operationId),
          expectedRevision,
          expectedRevision + entries.length,
        );
        return repository.getSnapshot();
      }),
    );
    return {
      changes: results,
      operationIds: entries.map(({ operationId }) => operationId),
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
  ): string | null {
    switch (operation.operation) {
      case 'create_persona':
        return repository.createPersona(expectedRevision, operation, audit).id;
      case 'create_timeline':
        return repository.createTimeline(expectedRevision, operation, audit).id;
      case 'create_moment':
        return repository.createMoment(expectedRevision, operation, audit).id;
      case 'create_event':
        return repository.createEvent(expectedRevision, operation, audit).id;
      case 'create_thread':
        return repository.createThread(expectedRevision, operation, audit).id;
      case 'create_beat':
        return repository.createBeat(expectedRevision, operation, audit).id;
      case 'link_beat_event':
        repository.linkBeatToEvent(
          expectedRevision,
          operation.beatId,
          operation.eventId,
          operation.relation,
          audit,
        );
        return null;
    }
  }
}

const resolveMaintenanceOperation = (
  change: AgentStoryMaintenanceChange,
  references: Map<string, ResolvedStoryReference>,
  existingEntities: Map<string, ResolvedStoryReference>,
  index: number,
): ProjectStoryOperation => {
  const { clientRef: _clientRef, ...operation } = change as
    AgentStoryMaintenanceChange & { clientRef?: string };
  const resolve = (
    value: string,
    kinds: StoryEntityKind[],
    field: string,
  ): string => resolveStoryReference(
    value,
    kinds,
    references,
    existingEntities,
    index,
    field,
  );
  switch (operation.operation) {
    case 'create_persona':
    case 'create_timeline':
      return operation;
    case 'create_moment':
      return {
        ...operation,
        timelineId: resolve(operation.timelineId, ['timeline'], 'timelineId'),
      };
    case 'create_event':
      return {
        ...operation,
        endMomentId: operation.endMomentId === null
          ? null
          : resolve(operation.endMomentId, ['moment'], 'endMomentId'),
        participants: operation.participants.map((participant, participantIndex) => ({
          ...participant,
          personaId: resolve(
            participant.personaId,
            ['persona'],
            `participants[${participantIndex}].personaId`,
          ),
        })),
        startMomentId: resolve(operation.startMomentId, ['moment'], 'startMomentId'),
        timelineId: resolve(operation.timelineId, ['timeline'], 'timelineId'),
      };
    case 'create_thread':
      return {
        ...operation,
        parentId: operation.parentId === null
          ? null
          : resolve(operation.parentId, ['thread'], 'parentId'),
      };
    case 'create_beat':
      return {
        ...operation,
        parentId: operation.parentId === null
          ? null
          : resolve(operation.parentId, ['beat'], 'parentId'),
        threadId: resolve(operation.threadId, ['thread'], 'threadId'),
      };
    case 'link_beat_event':
      return {
        ...operation,
        beatId: resolve(operation.beatId, ['beat'], 'beatId'),
        eventId: resolve(operation.eventId, ['event'], 'eventId'),
      };
  }
};

const resolveStoryReference = (
  value: string,
  expectedKinds: StoryEntityKind[],
  references: Map<string, ResolvedStoryReference>,
  existingEntities: Map<string, ResolvedStoryReference>,
  index: number,
  field: string,
): string => {
  const symbolic = value.startsWith('@');
  const clientRef = symbolic ? value.slice(1) : null;
  const resolved = symbolic
    ? references.get(clientRef!)
    : existingEntities.get(value);
  if (resolved === undefined) {
    throw new StoryMaintenanceReferenceError(
      symbolic
        ? `changes[${index}].${field} references unknown or later clientRef @${clientRef}.`
        : `changes[${index}].${field} references a missing story entity.`,
    );
  }
  if (!expectedKinds.includes(resolved.kind)) {
    throw new StoryMaintenanceReferenceError(
      `changes[${index}].${field} expects ${expectedKinds.join(' or ')}, but ${symbolic ? `@${clientRef}` : 'the supplied entity'} refers to ${resolved.kind}.`,
    );
  }
  return resolved.id;
};

const indexStoryEntities = (
  snapshot: ProjectStorySnapshot,
): Map<string, ResolvedStoryReference> => {
  const entities = new Map<string, ResolvedStoryReference>();
  const add = (kind: StoryEntityKind, records: Array<{ id: string }>): void => {
    records.forEach(({ id }) => entities.set(id, { id, kind }));
  };
  add('beat', snapshot.beats);
  add('event', snapshot.events);
  add('moment', snapshot.moments);
  add('persona', snapshot.personae);
  add('thread', snapshot.threads);
  add('timeline', snapshot.timelines);
  return entities;
};

const createdEntityKind = (
  operation: ProjectStoryOperation,
): StoryEntityKind | null => {
  switch (operation.operation) {
    case 'create_persona': return 'persona';
    case 'create_timeline': return 'timeline';
    case 'create_moment': return 'moment';
    case 'create_event': return 'event';
    case 'create_thread': return 'thread';
    case 'create_beat': return 'beat';
    case 'link_beat_event': return null;
  }
};
