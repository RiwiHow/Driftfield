import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase } from '../../../src/main/database/project-database';
import {
  ProjectStoryRepository,
  ProjectStoryRevisionConflictError,
} from '../../../src/main/database/project-story-repository';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('ProjectStoryRepository', () => {
  it('stores Personae, Chronicle, and Threads with stable links and revisions', async () => {
    const { database, repository } = await createRepository();

    const protagonist = repository.createPersona(0, {
      name: 'Lin',
      role: 'Protagonist',
      summary: 'An unwilling heir.',
    });
    const timeline = repository.createTimeline(1, {
      isPrimary: true,
      title: 'Primary Chronicle',
    });
    const morning = repository.createMoment(2, {
      displayTime: 'Imperial Year 132, first winter morning',
      orderKey: 1000,
      precision: 'day',
      timelineId: timeline.id,
    });
    const evening = repository.createMoment(3, {
      displayTime: 'Imperial Year 132, first winter evening',
      orderKey: 2000,
      precision: 'exact',
      timelineId: timeline.id,
    });
    const event = repository.createEvent(4, {
      consequences: 'The succession crisis begins.',
      endMomentId: evening.id,
      participants: [
        {
          description: 'Makes the decisive choice.',
          personaId: protagonist.id,
          role: 'actor',
        },
      ],
      sources: [
        {
          documentId: 'chapter-8',
          documentRevision: 'sha256-revision',
          relation: 'depicted',
          sourceKind: 'manuscript',
        },
      ],
      startMomentId: morning.id,
      status: 'established',
      summary: 'Lin kills the king before the court assembles.',
      timelineId: timeline.id,
      title: 'The king is killed',
    });
    const thread = repository.createThread(5, {
      orderKey: 1000,
      status: 'active',
      title: 'The succession crisis',
    });
    const beat = repository.createBeat(6, {
      description: 'The protagonist loses the option of remaining neutral.',
      dramaticPurpose: 'End the first act.',
      kind: 'turning_point',
      orderKey: 1000,
      status: 'active',
      threadId: thread.id,
      title: 'Forced into rebellion',
    });
    repository.linkBeatToEvent(7, beat.id, event.id, 'realizes');

    expect(repository.getSnapshot()).toMatchObject({
      beats: [{ id: beat.id, threadId: thread.id }],
      eventLinks: [
        { eventId: event.id, relation: 'realizes', threadBeatId: beat.id },
      ],
      eventParticipants: [
        { eventId: event.id, personaId: protagonist.id, role: 'actor' },
      ],
      eventSources: [
        {
          documentId: 'chapter-8',
          eventId: event.id,
          relation: 'depicted',
        },
      ],
      events: [{ id: event.id, startMomentId: morning.id }],
      moments: [{ id: morning.id }, { id: evening.id }],
      personae: [{ id: protagonist.id, name: 'Lin' }],
      revision: 8,
      threads: [{ id: thread.id }],
      timelines: [{ id: timeline.id, isPrimary: true }],
    });
    database.close();
  });

  it('rejects stale writes without changing canonical state', async () => {
    const { database, repository } = await createRepository();
    repository.createPersona(0, { name: 'Lin' });

    expect(() => repository.createPersona(0, { name: 'Mara' })).toThrow(
      ProjectStoryRevisionConflictError,
    );
    expect(repository.getSnapshot()).toMatchObject({
      personae: [{ name: 'Lin' }],
      revision: 1,
    });
    database.close();
  });

  it('records direct maintenance in the applied operation ledger atomically', async () => {
    const { database, repository } = await createRepository();
    const change = {
      name: 'Lin',
      operation: 'create_persona' as const,
      role: 'Protagonist',
      summary: '',
    };

    repository.createPersona(0, change, {
      mode: 'direct',
      operationId: 'operation-1',
      operationKind: change.operation,
      originRequestId: 'request-1',
      payload: change,
    });

    expect(database.connection.prepare(`
      SELECT operation_id, operation_kind, base_revision, applied_revision,
             status, origin_request_id, decided_at, payload_json
      FROM story_operations
    `).get()).toMatchObject({
      applied_revision: 1,
      base_revision: 0,
      decided_at: expect.any(String),
      operation_id: 'operation-1',
      operation_kind: 'create_persona',
      origin_request_id: 'request-1',
      status: 'applied',
    });
    expect(repository.getSnapshot()).toMatchObject({
      personae: [{ name: 'Lin' }],
      revision: 1,
    });

    expect(() => repository.createPersona(1, { name: 'Mara' }, {
      mode: 'direct',
      operationId: 'operation-1',
      operationKind: 'create_persona',
      originRequestId: 'request-1',
      payload: { name: 'Mara', operation: 'create_persona' },
    })).toThrow();
    expect(repository.getSnapshot()).toMatchObject({
      personae: [{ name: 'Lin' }],
      revision: 1,
    });
    database.close();
  });

  it('rolls back an event and its revision when a linked participant is invalid', async () => {
    const { database, repository } = await createRepository();
    const timeline = repository.createTimeline(0, {
      isPrimary: true,
      title: 'Primary Chronicle',
    });
    const moment = repository.createMoment(1, {
      displayTime: 'The first day',
      orderKey: 1000,
      precision: 'day',
      timelineId: timeline.id,
    });

    expect(() =>
      repository.createEvent(2, {
        participants: [
          { personaId: 'missing-persona', role: 'actor' },
        ],
        startMomentId: moment.id,
        status: 'planned',
        timelineId: timeline.id,
        title: 'Impossible event',
      }),
    ).toThrow();
    expect(repository.getSnapshot()).toMatchObject({ events: [], revision: 2 });
    database.close();
  });

  it('rejects an event whose end precedes its start', async () => {
    const { database, repository } = await createRepository();
    const timeline = repository.createTimeline(0, {
      isPrimary: true,
      title: 'Primary Chronicle',
    });
    const earlier = repository.createMoment(1, {
      displayTime: 'Earlier',
      orderKey: 1000,
      precision: 'unknown',
      timelineId: timeline.id,
    });
    const later = repository.createMoment(2, {
      displayTime: 'Later',
      orderKey: 2000,
      precision: 'unknown',
      timelineId: timeline.id,
    });

    expect(() =>
      repository.createEvent(3, {
        endMomentId: earlier.id,
        startMomentId: later.id,
        status: 'planned',
        timelineId: timeline.id,
        title: 'Reversed event',
      }),
    ).toThrow('Chronicle event ends before it starts');
    expect(repository.getRevision()).toBe(3);
    database.close();
  });

  it('records, deduplicates, and resolves questions without changing canon revision', async () => {
    const { database, repository } = await createRepository();
    const input = {
      context: 'Lin is already a known character.',
      evidence: null,
      kind: 'possible_alias' as const,
      options: ['Alias of Lin', 'A different character'],
      originRequestId: 'request-1',
      question: 'Is Little Lin an alias of Lin?',
    };

    const first = repository.createQuestion(input);
    const duplicate = repository.createQuestion({ ...input, originRequestId: 'request-2' });
    expect(duplicate.id).toBe(first.id);
    expect(repository.getSnapshot()).toMatchObject({
      questions: [{ id: first.id, status: 'open' }],
      revision: 0,
    });

    repository.resolveQuestion(first.id, 'It is an alias of Lin.');
    expect(repository.getSnapshot()).toMatchObject({
      questions: [{ answer: 'It is an alias of Lin.', status: 'resolved' }],
      revision: 0,
    });
    database.close();
  });
});

const createRepository = async (): Promise<{
  database: ProjectDatabase;
  repository: ProjectStoryRepository;
}> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-story-'));
  directories.push(directory);
  const database = new ProjectDatabase(directory);
  database.initializeProjectMetadata('project-1', 1, 'Project One');
  return { database, repository: new ProjectStoryRepository(database) };
};
