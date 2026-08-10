import { randomUUID } from 'node:crypto';

import type {
  ChronicleEvent,
  ChronicleEventParticipant,
  ChronicleEventSource,
  ChronicleEventStatus,
  ChronicleMoment,
  ChronicleMomentPrecision,
  ChronicleParticipantRole,
  ChronicleSourceKind,
  ChronicleSourceRelation,
  ChronicleTimeline,
  Persona,
  ProjectStorySnapshot,
  StoryThread,
  ThreadBeat,
  ThreadBeatKind,
  ThreadEventLink,
  ThreadEventRelation,
  ThreadStatus,
} from '../../shared/contracts/project-story';
import type { ProjectDatabase } from './project-database';

export class ProjectStoryRevisionConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super('Project story revision changed');
    this.name = 'ProjectStoryRevisionConflictError';
  }
}

export interface CreatePersonaInput {
  name: string;
  role?: string | null;
  summary?: string;
}

export interface CreateChronicleTimelineInput {
  isPrimary?: boolean;
  summary?: string;
  title: string;
}

export interface CreateChronicleMomentInput {
  displayTime: string;
  note?: string;
  orderKey: number;
  precision: ChronicleMomentPrecision;
  timelineId: string;
}

export interface CreateChronicleEventInput {
  causes?: string;
  consequences?: string;
  endMomentId?: string | null;
  participants?: Array<{
    description?: string;
    personaId: string;
    role: ChronicleParticipantRole;
  }>;
  sources?: Array<{
    anchor?: string | null;
    documentId: string;
    documentRevision: string;
    relation: ChronicleSourceRelation;
    sourceKind: ChronicleSourceKind;
  }>;
  startMomentId: string;
  status: ChronicleEventStatus;
  summary?: string;
  timelineId: string;
  title: string;
}

export interface CreateThreadInput {
  orderKey: number;
  parentId?: string | null;
  status: ThreadStatus;
  summary?: string;
  title: string;
}

export interface CreateThreadBeatInput {
  description?: string;
  desiredOutcome?: string;
  dramaticPurpose?: string;
  kind: ThreadBeatKind;
  orderKey: number;
  parentId?: string | null;
  status: ThreadStatus;
  threadId: string;
  title: string;
}

export interface StoryOperationAudit {
  operationId: string;
  operationKind: string;
  originRequestId: string | null;
  payload: unknown;
}

export class ProjectStoryRepository {
  constructor(private readonly database: ProjectDatabase) {}

  getRevision(): number {
    const row = this.database.connection.prepare(`
      SELECT revision FROM project_story_state WHERE singleton = 1
    `).get() as { revision: number } | undefined;
    if (row === undefined) throw new Error('Project story state is missing');
    return row.revision;
  }

  getSnapshot(): ProjectStorySnapshot {
    return {
      beats: this.listBeats(),
      eventLinks: this.listEventLinks(),
      eventParticipants: this.listEventParticipants(),
      eventSources: this.listEventSources(),
      events: this.listEvents(),
      moments: this.listMoments(),
      personae: this.listPersonae(),
      revision: this.getRevision(),
      threads: this.listThreads(),
      timelines: this.listTimelines(),
    };
  }

  createPendingOperation(
    expectedRevision: number,
    audit: StoryOperationAudit,
  ): void {
    const actualRevision = this.getRevision();
    if (actualRevision !== expectedRevision) {
      throw new ProjectStoryRevisionConflictError(
        expectedRevision,
        actualRevision,
      );
    }
    const payloadJson = JSON.stringify({ request: audit.payload });
    if (Buffer.byteLength(payloadJson, 'utf8') > 262_144) {
      throw new Error('Project story operation is too large');
    }
    this.database.connection.prepare(`
      INSERT INTO story_operations(
        operation_id, operation_kind, payload_json, base_revision,
        applied_revision, status, origin_request_id, created_at,
        decided_at, error_code
      ) VALUES (?, ?, ?, ?, NULL, 'pending', ?, ?, NULL, NULL)
    `).run(
      audit.operationId,
      audit.operationKind,
      payloadJson,
      expectedRevision,
      audit.originRequestId,
      new Date().toISOString(),
    );
  }

  settleOperation(
    operationId: string,
    status: 'rejected' | 'conflict' | 'failed',
    errorCode: string | null = null,
  ): boolean {
    const result = this.database.connection.prepare(`
      UPDATE story_operations
      SET status = ?, decided_at = ?, error_code = ?
      WHERE operation_id = ? AND status = 'pending'
    `).run(status, new Date().toISOString(), errorCode, operationId);
    return result.changes === 1;
  }

  createPersona(expectedRevision: number, input: CreatePersonaInput, audit?: StoryOperationAudit): Persona {
    return this.mutate(expectedRevision, () => {
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database.connection.prepare(`
        INSERT INTO personae(
          persona_id, kind, name, role, summary, created_at, updated_at
        ) VALUES (?, 'character', ?, ?, ?, ?, ?)
      `).run(id, input.name, input.role ?? null, input.summary ?? '', now, now);
      return {
        createdAt: now,
        id,
        kind: 'character',
        name: input.name,
        role: input.role ?? null,
        summary: input.summary ?? '',
        updatedAt: now,
      };
    }, audit);
  }

  createTimeline(
    expectedRevision: number,
    input: CreateChronicleTimelineInput,
    audit?: StoryOperationAudit,
  ): ChronicleTimeline {
    return this.mutate(expectedRevision, () => {
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database.connection.prepare(`
        INSERT INTO chronicle_timelines(
          timeline_id, title, summary, is_primary, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.title,
        input.summary ?? '',
        input.isPrimary === true ? 1 : 0,
        now,
        now,
      );
      return {
        createdAt: now,
        id,
        isPrimary: input.isPrimary === true,
        summary: input.summary ?? '',
        title: input.title,
        updatedAt: now,
      };
    }, audit);
  }

  createMoment(
    expectedRevision: number,
    input: CreateChronicleMomentInput,
    audit?: StoryOperationAudit,
  ): ChronicleMoment {
    return this.mutate(expectedRevision, () => {
      const id = randomUUID();
      this.database.connection.prepare(`
        INSERT INTO chronicle_moments(
          moment_id, timeline_id, display_time, precision, order_key, note
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.timelineId,
        input.displayTime,
        input.precision,
        input.orderKey,
        input.note ?? '',
      );
      return {
        displayTime: input.displayTime,
        id,
        note: input.note ?? '',
        orderKey: input.orderKey,
        precision: input.precision,
        timelineId: input.timelineId,
      };
    }, audit);
  }

  createEvent(
    expectedRevision: number,
    input: CreateChronicleEventInput,
    audit?: StoryOperationAudit,
  ): ChronicleEvent {
    return this.mutate(expectedRevision, () => {
      this.assertEventMomentOrder(input);
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database.connection.prepare(`
        INSERT INTO chronicle_events(
          event_id, timeline_id, start_moment_id, end_moment_id, title,
          summary, status, causes, consequences, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.timelineId,
        input.startMomentId,
        input.endMomentId ?? null,
        input.title,
        input.summary ?? '',
        input.status,
        input.causes ?? '',
        input.consequences ?? '',
        now,
        now,
      );
      const participantStatement = this.database.connection.prepare(`
        INSERT INTO chronicle_event_personae(
          event_id, persona_id, role, description
        ) VALUES (?, ?, ?, ?)
      `);
      for (const participant of input.participants ?? []) {
        participantStatement.run(
          id,
          participant.personaId,
          participant.role,
          participant.description ?? '',
        );
      }
      const sourceStatement = this.database.connection.prepare(`
        INSERT INTO chronicle_event_sources(
          source_id, event_id, source_kind, document_id,
          document_revision, relation, anchor
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const source of input.sources ?? []) {
        sourceStatement.run(
          randomUUID(),
          id,
          source.sourceKind,
          source.documentId,
          source.documentRevision,
          source.relation,
          source.anchor ?? null,
        );
      }
      return {
        causes: input.causes ?? '',
        consequences: input.consequences ?? '',
        createdAt: now,
        endMomentId: input.endMomentId ?? null,
        id,
        startMomentId: input.startMomentId,
        status: input.status,
        summary: input.summary ?? '',
        timelineId: input.timelineId,
        title: input.title,
        updatedAt: now,
      };
    }, audit);
  }

  createThread(expectedRevision: number, input: CreateThreadInput, audit?: StoryOperationAudit): StoryThread {
    return this.mutate(expectedRevision, () => {
      const id = randomUUID();
      const now = new Date().toISOString();
      this.database.connection.prepare(`
        INSERT INTO threads(
          thread_id, parent_thread_id, title, summary, status,
          order_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.parentId ?? null,
        input.title,
        input.summary ?? '',
        input.status,
        input.orderKey,
        now,
        now,
      );
      return {
        createdAt: now,
        id,
        orderKey: input.orderKey,
        parentId: input.parentId ?? null,
        status: input.status,
        summary: input.summary ?? '',
        title: input.title,
        updatedAt: now,
      };
    }, audit);
  }

  createBeat(expectedRevision: number, input: CreateThreadBeatInput, audit?: StoryOperationAudit): ThreadBeat {
    return this.mutate(expectedRevision, () => {
      const id = randomUUID();
      this.database.connection.prepare(`
        INSERT INTO thread_beats(
          beat_id, thread_id, parent_beat_id, kind, title, description,
          status, order_key, dramatic_purpose, desired_outcome
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.threadId,
        input.parentId ?? null,
        input.kind,
        input.title,
        input.description ?? '',
        input.status,
        input.orderKey,
        input.dramaticPurpose ?? '',
        input.desiredOutcome ?? '',
      );
      return {
        description: input.description ?? '',
        desiredOutcome: input.desiredOutcome ?? '',
        dramaticPurpose: input.dramaticPurpose ?? '',
        id,
        kind: input.kind,
        orderKey: input.orderKey,
        parentId: input.parentId ?? null,
        status: input.status,
        threadId: input.threadId,
        title: input.title,
      };
    }, audit);
  }

  linkBeatToEvent(
    expectedRevision: number,
    beatId: string,
    eventId: string,
    relation: ThreadEventRelation,
    audit?: StoryOperationAudit,
  ): ThreadEventLink {
    return this.mutate(expectedRevision, () => {
      this.database.connection.prepare(`
        INSERT INTO thread_event_links(beat_id, event_id, relation)
        VALUES (?, ?, ?)
      `).run(beatId, eventId, relation);
      return { eventId, relation, threadBeatId: beatId };
    }, audit);
  }

  private mutate<T>(
    expectedRevision: number,
    operation: () => T,
    audit?: StoryOperationAudit,
  ): T {
    return this.database.transaction(() => {
      const actualRevision = this.getRevision();
      if (actualRevision !== expectedRevision) {
        throw new ProjectStoryRevisionConflictError(
          expectedRevision,
          actualRevision,
        );
      }
      const result = operation();
      const update = this.database.connection.prepare(`
        UPDATE project_story_state SET revision = revision + 1
        WHERE singleton = 1 AND revision = ?
      `).run(expectedRevision);
      if (update.changes !== 1) {
        throw new Error('Project story state is missing');
      }
      if (audit !== undefined) {
        const payloadJson = JSON.stringify({ request: audit.payload, result });
        if (Buffer.byteLength(payloadJson, 'utf8') > 262_144) {
          throw new Error('Project story operation is too large');
        }
        const auditUpdate = this.database.connection.prepare(`
          UPDATE story_operations
          SET payload_json = ?, applied_revision = ?, status = 'applied',
              decided_at = ?, error_code = NULL
          WHERE operation_id = ? AND status = 'pending'
            AND base_revision = ? AND operation_kind = ?
        `).run(
          payloadJson,
          expectedRevision + 1,
          new Date().toISOString(),
          audit.operationId,
          expectedRevision,
          audit.operationKind,
        );
        if (auditUpdate.changes !== 1) {
          throw new Error('Pending project story operation is missing');
        }
      }
      return result;
    });
  }

  private assertEventMomentOrder(input: CreateChronicleEventInput): void {
    const ids = [input.startMomentId, input.endMomentId].filter(
      (id): id is string => id !== null && id !== undefined,
    );
    const rows = ids.map((id) =>
      this.database.connection.prepare(`
        SELECT timeline_id, order_key FROM chronicle_moments WHERE moment_id = ?
      `).get(id) as { order_key: number; timeline_id: string } | undefined,
    );
    if (
      rows.some((row) => row === undefined || row.timeline_id !== input.timelineId)
    ) {
      throw new Error('Chronicle event moment is outside its timeline');
    }
    if (
      rows.length === 2 &&
      rows[0] !== undefined &&
      rows[1] !== undefined &&
      rows[1].order_key < rows[0].order_key
    ) {
      throw new Error('Chronicle event ends before it starts');
    }
  }

  private listPersonae(): Persona[] {
    const rows = this.database.connection.prepare(`
      SELECT persona_id, kind, name, role, summary, created_at, updated_at
      FROM personae ORDER BY name, persona_id
    `).all() as Array<{
      created_at: string;
      kind: 'character';
      name: string;
      persona_id: string;
      role: string | null;
      summary: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      createdAt: row.created_at,
      id: row.persona_id,
      kind: row.kind,
      name: row.name,
      role: row.role,
      summary: row.summary,
      updatedAt: row.updated_at,
    }));
  }

  private listTimelines(): ChronicleTimeline[] {
    const rows = this.database.connection.prepare(`
      SELECT timeline_id, title, summary, is_primary, created_at, updated_at
      FROM chronicle_timelines ORDER BY is_primary DESC, created_at, timeline_id
    `).all() as Array<{
      created_at: string;
      is_primary: number;
      summary: string;
      timeline_id: string;
      title: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      createdAt: row.created_at,
      id: row.timeline_id,
      isPrimary: row.is_primary === 1,
      summary: row.summary,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  }

  private listMoments(): ChronicleMoment[] {
    const rows = this.database.connection.prepare(`
      SELECT moment_id, timeline_id, display_time, precision, order_key, note
      FROM chronicle_moments ORDER BY timeline_id, order_key
    `).all() as Array<{
      display_time: string;
      moment_id: string;
      note: string;
      order_key: number;
      precision: ChronicleMomentPrecision;
      timeline_id: string;
    }>;
    return rows.map((row) => ({
      displayTime: row.display_time,
      id: row.moment_id,
      note: row.note,
      orderKey: row.order_key,
      precision: row.precision,
      timelineId: row.timeline_id,
    }));
  }

  private listEvents(): ChronicleEvent[] {
    const rows = this.database.connection.prepare(`
      SELECT events.event_id, events.timeline_id, events.start_moment_id,
             events.end_moment_id, events.title, events.summary, events.status,
             events.causes, events.consequences, events.created_at,
             events.updated_at
      FROM chronicle_events AS events
      JOIN chronicle_moments AS moments
        ON moments.moment_id = events.start_moment_id
      ORDER BY events.timeline_id, moments.order_key, events.event_id
    `).all() as Array<{
      causes: string;
      consequences: string;
      created_at: string;
      end_moment_id: string | null;
      event_id: string;
      start_moment_id: string;
      status: ChronicleEventStatus;
      summary: string;
      timeline_id: string;
      title: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      causes: row.causes,
      consequences: row.consequences,
      createdAt: row.created_at,
      endMomentId: row.end_moment_id,
      id: row.event_id,
      startMomentId: row.start_moment_id,
      status: row.status,
      summary: row.summary,
      timelineId: row.timeline_id,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  }

  private listEventParticipants(): ChronicleEventParticipant[] {
    const rows = this.database.connection.prepare(`
      SELECT event_id, persona_id, role, description
      FROM chronicle_event_personae ORDER BY event_id, persona_id, role
    `).all() as Array<{
      description: string;
      event_id: string;
      persona_id: string;
      role: ChronicleParticipantRole;
    }>;
    return rows.map((row) => ({
      description: row.description,
      eventId: row.event_id,
      personaId: row.persona_id,
      role: row.role,
    }));
  }

  private listEventSources(): ChronicleEventSource[] {
    const rows = this.database.connection.prepare(`
      SELECT source_id, event_id, source_kind, document_id,
             document_revision, relation, anchor
      FROM chronicle_event_sources ORDER BY event_id, source_id
    `).all() as Array<{
      anchor: string | null;
      document_id: string;
      document_revision: string;
      event_id: string;
      relation: ChronicleSourceRelation;
      source_id: string;
      source_kind: ChronicleSourceKind;
    }>;
    return rows.map((row) => ({
      anchor: row.anchor,
      documentId: row.document_id,
      documentRevision: row.document_revision,
      eventId: row.event_id,
      id: row.source_id,
      relation: row.relation,
      sourceKind: row.source_kind,
    }));
  }

  private listThreads(): StoryThread[] {
    const rows = this.database.connection.prepare(`
      SELECT thread_id, parent_thread_id, title, summary, status,
             order_key, created_at, updated_at
      FROM threads ORDER BY order_key, thread_id
    `).all() as Array<{
      created_at: string;
      order_key: number;
      parent_thread_id: string | null;
      status: ThreadStatus;
      summary: string;
      thread_id: string;
      title: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      createdAt: row.created_at,
      id: row.thread_id,
      orderKey: row.order_key,
      parentId: row.parent_thread_id,
      status: row.status,
      summary: row.summary,
      title: row.title,
      updatedAt: row.updated_at,
    }));
  }

  private listBeats(): ThreadBeat[] {
    const rows = this.database.connection.prepare(`
      SELECT beat_id, thread_id, parent_beat_id, kind, title, description,
             status, order_key, dramatic_purpose, desired_outcome
      FROM thread_beats ORDER BY thread_id, order_key, beat_id
    `).all() as Array<{
      beat_id: string;
      description: string;
      desired_outcome: string;
      dramatic_purpose: string;
      kind: ThreadBeatKind;
      order_key: number;
      parent_beat_id: string | null;
      status: ThreadStatus;
      thread_id: string;
      title: string;
    }>;
    return rows.map((row) => ({
      description: row.description,
      desiredOutcome: row.desired_outcome,
      dramaticPurpose: row.dramatic_purpose,
      id: row.beat_id,
      kind: row.kind,
      orderKey: row.order_key,
      parentId: row.parent_beat_id,
      status: row.status,
      threadId: row.thread_id,
      title: row.title,
    }));
  }

  private listEventLinks(): ThreadEventLink[] {
    const rows = this.database.connection.prepare(`
      SELECT beat_id, event_id, relation
      FROM thread_event_links ORDER BY beat_id, event_id, relation
    `).all() as Array<{
      beat_id: string;
      event_id: string;
      relation: ThreadEventRelation;
    }>;
    return rows.map((row) => ({
      eventId: row.event_id,
      relation: row.relation,
      threadBeatId: row.beat_id,
    }));
  }
}
