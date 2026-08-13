import type {
  AgentDocumentContext,
  AgentDocumentToolResult,
  AgentNovelStructureContext,
  AgentNovelStructureToolResult,
  AgentStoryOperationInput,
  AgentStoryStateContext,
  AgentStructureDirectory,
  AgentStructureNode,
} from '../../shared/contracts/agent-tools';
import type {
  ProjectStoryOperation,
  ProjectStorySnapshot,
} from '../../shared/contracts/project-story';
import { ProjectContextError } from './project-context-service';

type ReferenceKind =
  | 'beat'
  | 'document'
  | 'event'
  | 'moment'
  | 'persona'
  | 'project'
  | 'question'
  | 'request'
  | 'thread'
  | 'timeline'
  | 'directory';

interface ReferenceEntry {
  kind: ReferenceKind;
  value: string;
}

/** The revisions Main served for one document during this Agent request. */
export interface AgentDocumentAnchor {
  baseRevision: string;
  contentRevision?: string;
}

const MAX_REQUEST_REFERENCE_INDEX = 99_999;

/**
 * Keeps persistent identities and content hashes on the Main side of one Agent
 * request. Revisions are anchored here instead of being echoed by the model.
 */
export class AgentReferenceRegistry {
  private readonly counts = new Map<ReferenceKind, number>();
  private readonly refs = new Map<string, ReferenceEntry>();
  private readonly values = new Map<string, string>();
  private readonly documentAnchors = new Map<string, AgentDocumentAnchor>();
  private projectRevisionAnchor: string | undefined;
  private storyRevisionAnchor: number | undefined;

  expose(kind: ReferenceKind, value: string): string {
    const key = `${kind}\0${value}`;
    const existing = this.values.get(key);
    if (existing !== undefined) return existing;
    const next = (this.counts.get(kind) ?? 0) + 1;
    if (next > MAX_REQUEST_REFERENCE_INDEX) {
      throw new ProjectContextError(
        'selection-too-large',
        `Too many request-scoped ${kind} references.`,
      );
    }
    this.counts.set(kind, next);
    const ref = `${kind}:${next}`;
    this.values.set(key, ref);
    this.refs.set(ref, { kind, value });
    return ref;
  }

  resolve(ref: string, ...kinds: ReferenceKind[]): string {
    const entry = this.refs.get(ref);
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

  /** Records what Main served so later mutations need no model-supplied revision. */
  anchorDocument(documentId: string, anchor: AgentDocumentAnchor): void {
    this.documentAnchors.set(documentId, anchor);
  }

  documentAnchor(documentId: string): AgentDocumentAnchor | undefined {
    return this.documentAnchors.get(documentId);
  }

  requireDocumentAnchor(
    documentId: string,
    documentRef: string,
  ): AgentDocumentAnchor {
    const anchor = this.documentAnchors.get(documentId);
    if (anchor === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        `Read ${documentRef} in this request before changing or citing it.`,
      );
    }
    return anchor;
  }

  requireDocumentContentAnchor(documentId: string, documentRef: string): {
    baseRevision: string;
    contentRevision: string;
  } {
    const anchor = this.requireDocumentAnchor(documentId, documentRef);
    if (anchor.contentRevision === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        `Read the contents of ${documentRef} in this request before replacing it.`,
      );
    }
    return {
      baseRevision: anchor.baseRevision,
      contentRevision: anchor.contentRevision,
    };
  }

  requireProjectRevision(): string {
    if (this.projectRevisionAnchor === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        'Read the novel structure in this request before changing project structure.',
      );
    }
    return this.projectRevisionAnchor;
  }

  requireStoryRevision(): number {
    if (this.storyRevisionAnchor === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        'Read story_state in this request before changing story records.',
      );
    }
    return this.storyRevisionAnchor;
  }

  anchorStoryRevision(revision: number): void {
    this.storyRevisionAnchor = revision;
  }

  exposeDocument(document: AgentDocumentToolResult): AgentDocumentContext {
    this.anchorDocument(document.documentId, {
      baseRevision: document.baseRevision,
      contentRevision: document.contentRevision,
    });
    const {
      baseRevision: _baseRevision,
      contentRevision: _contentRevision,
      ...context
    } = document;
    return {
      ...context,
      documentId: this.expose('document', document.documentId),
    };
  }

  exposeStructure(
    structure: AgentNovelStructureToolResult,
  ): AgentNovelStructureContext {
    this.projectRevisionAnchor = structure.project.revision;
    const mapNode = (node: AgentStructureNode): AgentStructureNode => {
      if (node.type === 'document') {
        if (node.revision !== undefined) {
          const existing = this.documentAnchors.get(node.id);
          this.anchorDocument(node.id, {
            baseRevision: node.revision,
            ...(existing?.contentRevision === undefined ||
              existing.baseRevision !== node.revision
              ? {}
              : { contentRevision: existing.contentRevision }),
          });
        }
        const { revision: _revision, ...document } = node;
        return { ...document, id: this.expose('document', node.id) };
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
        id: this.expose('project', structure.project.id),
        title: structure.project.title,
      },
    };
  }

  exposeStory(story: ProjectStorySnapshot): AgentStoryStateContext {
    this.storyRevisionAnchor = story.revision;
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
      eventSources: story.eventSources.map(
        ({ documentRevision: _documentRevision, ...source }) => ({
          ...source,
          documentId: this.expose('document', source.documentId),
          eventId: this.expose('event', source.eventId),
          id: this.expose('request', source.id),
        }),
      ),
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
              anchor: question.evidence.anchor,
              documentId: this.expose('document', question.evidence.documentId),
              sourceKind: question.evidence.sourceKind,
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

  resolveStoryOperation(
    operation: AgentStoryOperationInput,
  ): ProjectStoryOperation {
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
          sources: operation.sources?.map((source) => {
            const documentId = this.resolve(source.documentId, 'document');
            return {
              ...source,
              documentId,
              documentRevision: this.requireDocumentAnchor(
                documentId,
                source.documentId,
              ).baseRevision,
            };
          }),
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
