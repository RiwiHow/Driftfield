export type PersonaKind = 'character';

export interface Persona {
  createdAt: string;
  id: string;
  kind: PersonaKind;
  name: string;
  role: string | null;
  summary: string;
  updatedAt: string;
}

export type ChronicleMomentPrecision =
  | 'exact'
  | 'day'
  | 'month'
  | 'season'
  | 'approximate'
  | 'unknown';

export interface ChronicleTimeline {
  createdAt: string;
  id: string;
  isPrimary: boolean;
  summary: string;
  title: string;
  updatedAt: string;
}

export interface ChronicleMoment {
  displayTime: string;
  id: string;
  note: string;
  orderKey: number;
  precision: ChronicleMomentPrecision;
  timelineId: string;
}

export type ChronicleEventStatus = 'planned' | 'established';

export interface ChronicleEvent {
  causes: string;
  consequences: string;
  createdAt: string;
  endMomentId: string | null;
  id: string;
  startMomentId: string;
  status: ChronicleEventStatus;
  summary: string;
  timelineId: string;
  title: string;
  updatedAt: string;
}

export type ChronicleParticipantRole =
  | 'actor'
  | 'target'
  | 'witness'
  | 'affected';

export interface ChronicleEventParticipant {
  description: string;
  eventId: string;
  personaId: string;
  role: ChronicleParticipantRole;
}

export type ChronicleSourceKind = 'manuscript' | 'lore';
export type ChronicleSourceRelation = 'depicted' | 'mentioned' | 'inferred';

export interface ChronicleEventSource {
  anchor: string | null;
  documentId: string;
  documentRevision: string;
  eventId: string;
  id: string;
  relation: ChronicleSourceRelation;
  sourceKind: ChronicleSourceKind;
}

export type ThreadStatus = 'planned' | 'active' | 'resolved' | 'abandoned';

export interface StoryThread {
  createdAt: string;
  id: string;
  orderKey: number;
  parentId: string | null;
  status: ThreadStatus;
  summary: string;
  title: string;
  updatedAt: string;
}

export type ThreadBeatKind =
  | 'beat'
  | 'setup'
  | 'turning_point'
  | 'climax'
  | 'resolution';

export interface ThreadBeat {
  description: string;
  desiredOutcome: string;
  dramaticPurpose: string;
  id: string;
  kind: ThreadBeatKind;
  orderKey: number;
  parentId: string | null;
  status: ThreadStatus;
  threadId: string;
  title: string;
}

export type ThreadEventRelation =
  | 'plans'
  | 'realizes'
  | 'reveals'
  | 'foreshadows'
  | 'resolves';

export interface ThreadEventLink {
  eventId: string;
  relation: ThreadEventRelation;
  threadBeatId: string;
}

export interface ProjectStoryState {
  revision: number;
}

export interface ProjectStorySnapshot extends ProjectStoryState {
  beats: ThreadBeat[];
  eventLinks: ThreadEventLink[];
  eventParticipants: ChronicleEventParticipant[];
  eventSources: ChronicleEventSource[];
  events: ChronicleEvent[];
  moments: ChronicleMoment[];
  personae: Persona[];
  threads: StoryThread[];
  timelines: ChronicleTimeline[];
}

export type ProjectStoryOperation =
  | {
      name: string;
      operation: 'create_persona';
      role: string | null;
      summary: string;
    }
  | {
      isPrimary: boolean;
      operation: 'create_timeline';
      summary: string;
      title: string;
    }
  | {
      displayTime: string;
      note: string;
      operation: 'create_moment';
      orderKey: number;
      precision: ChronicleMomentPrecision;
      timelineId: string;
    }
  | {
      causes: string;
      consequences: string;
      endMomentId: string | null;
      operation: 'create_event';
      participants: Array<{
        description: string;
        personaId: string;
        role: ChronicleParticipantRole;
      }>;
      startMomentId: string;
      status: ChronicleEventStatus;
      summary: string;
      timelineId: string;
      title: string;
    }
  | {
      operation: 'create_thread';
      orderKey: number;
      parentId: string | null;
      status: ThreadStatus;
      summary: string;
      title: string;
    }
  | {
      description: string;
      desiredOutcome: string;
      dramaticPurpose: string;
      kind: ThreadBeatKind;
      operation: 'create_beat';
      orderKey: number;
      parentId: string | null;
      status: ThreadStatus;
      threadId: string;
      title: string;
    }
  | {
      beatId: string;
      eventId: string;
      operation: 'link_beat_event';
      relation: ThreadEventRelation;
    };

export const PROJECT_STORY_OPERATION_NAMES = [
  'create_persona',
  'create_timeline',
  'create_moment',
  'create_event',
  'create_thread',
  'create_beat',
  'link_beat_event',
] as const;

export const isProjectStoryOperation = (
  value: unknown,
): value is ProjectStoryOperation => {
  if (!isRecord(value) || typeof value.operation !== 'string') return false;
  const keys = Object.keys(value);
  if (value.operation === 'create_persona') {
    return keys.length === 4 && isText(value.name, 500, false) &&
      (value.role === null || isText(value.role, 500, true)) &&
      isText(value.summary, 20_000, true);
  }
  if (value.operation === 'create_timeline') {
    return keys.length === 4 && typeof value.isPrimary === 'boolean' &&
      isText(value.title, 500, false) && isText(value.summary, 20_000, true);
  }
  if (value.operation === 'create_moment') {
    return keys.length === 6 && isId(value.timelineId) &&
      isText(value.displayTime, 500, false) &&
      typeof value.precision === 'string' &&
      ['exact', 'day', 'month', 'season', 'approximate', 'unknown']
        .includes(value.precision) &&
      Number.isSafeInteger(value.orderKey) &&
      isText(value.note, 10_000, true);
  }
  if (value.operation === 'create_event') {
    return keys.length === 10 && isId(value.timelineId) &&
      isId(value.startMomentId) &&
      (value.endMomentId === null || isId(value.endMomentId)) &&
      isText(value.title, 500, false) && isText(value.summary, 30_000, true) &&
      (value.status === 'planned' || value.status === 'established') &&
      isText(value.causes, 20_000, true) &&
      isText(value.consequences, 20_000, true) &&
      Array.isArray(value.participants) && value.participants.length <= 100 &&
      value.participants.every(isParticipant);
  }
  if (value.operation === 'create_thread') {
    return keys.length === 6 &&
      (value.parentId === null || isId(value.parentId)) &&
      isText(value.title, 500, false) && isText(value.summary, 20_000, true) &&
      isThreadStatus(value.status) && Number.isSafeInteger(value.orderKey);
  }
  if (value.operation === 'create_beat') {
    return keys.length === 10 && isId(value.threadId) &&
      (value.parentId === null || isId(value.parentId)) &&
      typeof value.kind === 'string' &&
      ['beat', 'setup', 'turning_point', 'climax', 'resolution']
        .includes(value.kind) &&
      isText(value.title, 500, false) &&
      isText(value.description, 30_000, true) &&
      isThreadStatus(value.status) && Number.isSafeInteger(value.orderKey) &&
      isText(value.dramaticPurpose, 10_000, true) &&
      isText(value.desiredOutcome, 10_000, true);
  }
  return value.operation === 'link_beat_event' && keys.length === 4 &&
    isId(value.beatId) && isId(value.eventId) &&
    typeof value.relation === 'string' &&
    ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves']
      .includes(value.relation);
};

export const isProjectStorySnapshot = (
  value: unknown,
): value is ProjectStorySnapshot => {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 10 ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0
  ) return false;
  const arrays = [
    value.beats,
    value.eventLinks,
    value.eventParticipants,
    value.eventSources,
    value.events,
    value.moments,
    value.personae,
    value.threads,
    value.timelines,
  ];
  if (arrays.some((items) => !Array.isArray(items) || items.length > 10_000)) {
    return false;
  }
  return (
    (value.personae as unknown[]).every(isPersona) &&
    (value.timelines as unknown[]).every(isTimeline) &&
    (value.moments as unknown[]).every(isMoment) &&
    (value.events as unknown[]).every(isEvent) &&
    (value.eventParticipants as unknown[]).every(isEventParticipant) &&
    (value.eventSources as unknown[]).every(isEventSource) &&
    (value.threads as unknown[]).every(isThread) &&
    (value.beats as unknown[]).every(isBeat) &&
    (value.eventLinks as unknown[]).every(isEventLink)
  );
};

const isPersona = (value: unknown): boolean =>
  isRecord(value) && isId(value.id) && value.kind === 'character' &&
  isText(value.name, 500, false) &&
  (value.role === null || isText(value.role, 500, true)) &&
  isText(value.summary, 20_000, true) &&
  typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';

const isTimeline = (value: unknown): boolean =>
  isRecord(value) && isId(value.id) && isText(value.title, 500, false) &&
  isText(value.summary, 20_000, true) && typeof value.isPrimary === 'boolean' &&
  typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';

const isMoment = (value: unknown): boolean =>
  isRecord(value) && isId(value.id) && isId(value.timelineId) &&
  isText(value.displayTime, 500, false) &&
  typeof value.precision === 'string' &&
  ['exact', 'day', 'month', 'season', 'approximate', 'unknown']
    .includes(value.precision) &&
  Number.isSafeInteger(value.orderKey) && isText(value.note, 10_000, true);

const isEvent = (value: unknown): boolean =>
  isRecord(value) && isId(value.id) && isId(value.timelineId) &&
  isId(value.startMomentId) &&
  (value.endMomentId === null || isId(value.endMomentId)) &&
  isText(value.title, 500, false) && isText(value.summary, 30_000, true) &&
  (value.status === 'planned' || value.status === 'established') &&
  isText(value.causes, 20_000, true) &&
  isText(value.consequences, 20_000, true) &&
  typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';

const isEventParticipant = (value: unknown): boolean =>
  isRecord(value) && isId(value.eventId) && isId(value.personaId) &&
  typeof value.role === 'string' &&
  ['actor', 'target', 'witness', 'affected'].includes(value.role) &&
  isText(value.description, 10_000, true);

const isEventSource = (value: unknown): boolean =>
  isRecord(value) && isId(value.id) && isId(value.eventId) &&
  (value.sourceKind === 'manuscript' || value.sourceKind === 'lore') &&
  isId(value.documentId) && isText(value.documentRevision, 128, false) &&
  typeof value.relation === 'string' &&
  ['depicted', 'mentioned', 'inferred'].includes(value.relation) &&
  (value.anchor === null || isText(value.anchor, 10_000, true));

const isThread = (value: unknown): boolean =>
  isRecord(value) && isId(value.id) &&
  (value.parentId === null || isId(value.parentId)) &&
  isText(value.title, 500, false) && isText(value.summary, 20_000, true) &&
  isThreadStatus(value.status) && Number.isSafeInteger(value.orderKey) &&
  typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';

const isBeat = (value: unknown): boolean =>
  isRecord(value) && isId(value.id) && isId(value.threadId) &&
  (value.parentId === null || isId(value.parentId)) &&
  typeof value.kind === 'string' &&
  ['beat', 'setup', 'turning_point', 'climax', 'resolution']
    .includes(value.kind) &&
  isText(value.title, 500, false) && isText(value.description, 30_000, true) &&
  isThreadStatus(value.status) && Number.isSafeInteger(value.orderKey) &&
  isText(value.dramaticPurpose, 10_000, true) &&
  isText(value.desiredOutcome, 10_000, true);

const isEventLink = (value: unknown): boolean =>
  isRecord(value) && isId(value.threadBeatId) && isId(value.eventId) &&
  typeof value.relation === 'string' &&
  ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves']
    .includes(value.relation);

const isParticipant = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 3 &&
  isId(value.personaId) &&
  typeof value.role === 'string' &&
  ['actor', 'target', 'witness', 'affected'].includes(value.role) &&
  isText(value.description, 10_000, true);

const isThreadStatus = (value: unknown): value is ThreadStatus =>
  typeof value === 'string' &&
  ['planned', 'active', 'resolved', 'abandoned'].includes(value);

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const isText = (
  value: unknown,
  maximumLength: number,
  allowEmpty: boolean,
): value is string =>
  typeof value === 'string' && value.length <= maximumLength &&
  (allowEmpty || value.trim().length > 0) &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
