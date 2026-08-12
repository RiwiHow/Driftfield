import type {
  AgentDocumentToolResult,
  AgentNovelStructureToolResult,
  AgentStructureDirectory,
  AgentStructureNode,
} from '../../shared/contracts/agent-tools';
import type {
  ProjectStoryOperation,
  ProjectStorySnapshot,
} from '../../shared/contracts/project-story';
import { ProjectContextError } from './project-context-service';

type ReferenceKind =
  | 'assignment'
  | 'beat'
  | 'document'
  | 'event'
  | 'moment'
  | 'persona'
  | 'project'
  | 'proposal'
  | 'question'
  | 'request'
  | 'revision'
  | 'thread'
  | 'timeline'
  | 'directory';

interface ReferenceEntry {
  kind: ReferenceKind;
  value: string;
}

/** Keeps persistent identities and content hashes on the Main side of one Agent request. */
export class AgentReferenceRegistry {
  private readonly counts = new Map<ReferenceKind, number>();
  private readonly refs = new Map<string, ReferenceEntry>();
  private readonly values = new Map<string, string>();

  expose(kind: ReferenceKind, value: string): string {
    const key = `${kind}\0${value}`;
    const existing = this.values.get(key);
    if (existing !== undefined) return existing;
    const next = (this.counts.get(kind) ?? 0) + 1;
    this.counts.set(kind, next);
    const ref = `${kind}:${next}`;
    this.values.set(key, ref);
    this.refs.set(ref, { kind, value });
    return ref;
  }

  resolve(ref: string, ...kinds: ReferenceKind[]): string {
    const entry = this.refs.get(ref);
    // Keep the Main-side dispatcher compatible with in-flight calls from older
    // workers. New model-facing results never publish these canonical values.
    if (entry === undefined && !/^[a-z]+:[1-9][0-9]*$/u.test(ref)) return ref;
    if (entry === undefined) {
      throw new ProjectContextError(
        'expired-request-reference',
        `Request-scoped reference was not issued in this request or has expired: ${ref}. Read the required context without reference selectors before retrying.`,
      );
    }
    if (!kinds.includes(entry.kind)) {
      throw new ProjectContextError(
        'invalid-arguments',
        `Wrong-kind request reference: ${ref}`,
      );
    }
    return entry.value;
  }

  exposeDocument(document: AgentDocumentToolResult): AgentDocumentToolResult {
    return {
      ...document,
      baseRevision: this.expose('revision', document.baseRevision),
      contentRevision: this.expose('revision', document.contentRevision),
      documentId: this.expose('document', document.documentId),
    };
  }

  exposeStructure(
    structure: AgentNovelStructureToolResult,
  ): AgentNovelStructureToolResult {
    const mapNode = (node: AgentStructureNode): AgentStructureNode => {
      if (node.type === 'document') {
        return {
          ...node,
          id: this.expose('document', node.id),
          ...(node.revision === undefined
            ? {}
            : { revision: this.expose('revision', node.revision) }),
        };
      }
      const id = this.expose('directory', node.id);
      return {
        ...node,
        children: node.children.map(mapNode),
        id,
      } satisfies AgentStructureDirectory;
    };
    const manuscript = mapNode(structure.manuscript) as AgentStructureDirectory;
    const lore = structure.lore === undefined
      ? undefined
      : mapNode(structure.lore) as AgentStructureDirectory;
    return {
      ...structure,
      ...(lore === undefined ? {} : { lore }),
      manuscript,
      project: {
        ...structure.project,
        id: this.expose('project', structure.project.id),
        revision: this.expose('revision', structure.project.revision),
      },
    };
  }

  exposeStory(story: ProjectStorySnapshot): ProjectStorySnapshot {
    return {
      ...story,
      beats: story.beats.map((beat) => ({
        ...beat,
        id: this.expose('beat', beat.id),
        parentId: beat.parentId === null ? null : this.expose('beat', beat.parentId),
        threadId: this.expose('thread', beat.threadId),
      })),
      eventLinks: story.eventLinks.map((link) => ({
        ...link,
        eventId: this.expose('event', link.eventId),
        threadBeatId: this.expose('beat', link.threadBeatId),
      })),
      eventParticipants: story.eventParticipants.map((participant) => ({
        ...participant,
        eventId: this.expose('event', participant.eventId),
        personaId: this.expose('persona', participant.personaId),
      })),
      eventSources: story.eventSources.map((source) => ({
        ...source,
        documentId: this.expose('document', source.documentId),
        documentRevision: this.expose('revision', source.documentRevision),
        eventId: this.expose('event', source.eventId),
        id: this.expose('request', source.id),
      })),
      events: story.events.map((event) => ({
        ...event,
        endMomentId: event.endMomentId === null
          ? null
          : this.expose('moment', event.endMomentId),
        id: this.expose('event', event.id),
        startMomentId: this.expose('moment', event.startMomentId),
        timelineId: this.expose('timeline', event.timelineId),
      })),
      moments: story.moments.map((moment) => ({
        ...moment,
        id: this.expose('moment', moment.id),
        timelineId: this.expose('timeline', moment.timelineId),
      })),
      personae: story.personae.map((persona) => ({
        ...persona,
        id: this.expose('persona', persona.id),
      })),
      questions: story.questions.map((question) => ({
        ...question,
        evidence: question.evidence === null
          ? null
          : {
              ...question.evidence,
              documentId: this.expose('document', question.evidence.documentId),
              documentRevision: this.expose('revision', question.evidence.documentRevision),
            },
        id: this.expose('question', question.id),
        originRequestId: this.expose('request', question.originRequestId),
      })),
      threads: story.threads.map((thread) => ({
        ...thread,
        id: this.expose('thread', thread.id),
        parentId: thread.parentId === null
          ? null
          : this.expose('thread', thread.parentId),
      })),
      timelines: story.timelines.map((timeline) => ({
        ...timeline,
        id: this.expose('timeline', timeline.id),
      })),
    };
  }

  resolveStoryOperation(operation: ProjectStoryOperation): ProjectStoryOperation {
    const resolve = (value: string, kind: ReferenceKind): string =>
      value.startsWith('@') ? value : this.resolve(value, kind);
    switch (operation.operation) {
      case 'create_persona':
      case 'create_timeline':
        return operation;
      case 'create_moment':
        return { ...operation, timelineId: resolve(operation.timelineId, 'timeline') };
      case 'create_event':
        return {
          ...operation,
          endMomentId: operation.endMomentId === null
            ? null
            : resolve(operation.endMomentId, 'moment'),
          participants: operation.participants.map((participant) => ({
            ...participant,
            personaId: resolve(participant.personaId, 'persona'),
          })),
          sources: operation.sources?.map((source) => ({
            ...source,
            documentId: resolve(source.documentId, 'document'),
            documentRevision: resolve(source.documentRevision, 'revision'),
          })),
          startMomentId: resolve(operation.startMomentId, 'moment'),
          timelineId: resolve(operation.timelineId, 'timeline'),
        };
      case 'create_thread':
        return {
          ...operation,
          parentId: operation.parentId === null
            ? null
            : resolve(operation.parentId, 'thread'),
        };
      case 'create_beat':
        return {
          ...operation,
          parentId: operation.parentId === null
            ? null
            : resolve(operation.parentId, 'beat'),
          threadId: resolve(operation.threadId, 'thread'),
        };
      case 'link_beat_event':
        return {
          ...operation,
          beatId: resolve(operation.beatId, 'beat'),
          eventId: resolve(operation.eventId, 'event'),
        };
    }
  }
}
