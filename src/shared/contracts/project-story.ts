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
