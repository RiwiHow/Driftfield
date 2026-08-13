import { Type } from 'typebox';

import type {
  AgentStoryChangeInput,
  AgentStoryQuestionEvidenceInput,
  AgentToolContractMap,
} from '../../shared/contracts/agent-tools';
import {
  ACCEPTED_DOCUMENT_REFERENCE,
  AGENT_NOVEL_CONTEXT_SECTIONS,
} from '../../shared/contracts/agent-tools';
import { PROJECT_ICON_IDS } from '../../shared/contracts/project-layout';

const stringEnum = <Values extends readonly string[]>(
  values: Values,
  options?: { description?: string },
) =>
  Type.Unsafe<Values[number]>({
    type: 'string',
    enum: [...values],
    ...(options?.description === undefined
      ? {}
      : { description: options.description }),
  });

const requestRefPattern = (kind: string): string =>
  `^${kind}:[1-9][0-9]{0,4}$`;

const requestOrClientRefPattern = (kind: string): string =>
  `^(?:${kind}:[1-9][0-9]{0,4}|@[A-Za-z][A-Za-z0-9_-]{0,31})$`;

const requestRefPatternForKinds = (...kinds: string[]): string =>
  `^(?:${kinds.join('|')}):[1-9][0-9]{0,4}$`;

const requestOrClientRefPatternForKinds = (...kinds: string[]): string =>
  `^(?:(?:${kinds.join('|')}):[1-9][0-9]{0,4}|@[A-Za-z][A-Za-z0-9_-]{0,31})$`;

export const NOVEL_CONTEXT_PARAMETERS = Type.Object(
  {
    directoryIds: Type.Array(
      Type.String({ pattern: requestRefPattern('directory') }),
      {
        description:
          'Request-scoped directory refs whose immediate document children should be read. Nested directories are not expanded. Use an empty array when none are needed.',
        maxItems: 4,
        uniqueItems: true,
      },
    ),
    documentIds: Type.Array(
      Type.String({ pattern: requestRefPattern('document') }),
      {
        description:
          'Request-scoped refs of persisted manuscript or lore documents to read. Use an empty array when none are needed.',
        maxItems: 4,
        uniqueItems: true,
      },
    ),
    include: Type.Array(
      stringEnum(AGENT_NOVEL_CONTEXT_SECTIONS),
      {
        description:
          'Additional context sections to read. current_document is the immutable request-start editor draft, or null when no document was open. Do not retry a null current_document. accepted_reconciliation is available only after an accepted Scribe-backed manuscript proposal and returns the exact accepted persisted document with request-scoped refs instead of stable IDs.',
        maxItems: AGENT_NOVEL_CONTEXT_SECTIONS.length,
        uniqueItems: true,
      },
    ),
  },
  {
    additionalProperties: false,
    description:
      'Request at least one include section, document ref, or directory ref. Explicit and directory-expanded documents are deduplicated and limited to four total results. Results remain path-free and bounded.',
  },
);

export const DOCUMENT_WRITING_PARAMETERS = Type.Object(
  {
    documentAction: stringEnum(['create', 'replace'] as const, {
      description:
        'Choose create for a new chapter or Lore entry. Choose replace only when the user explicitly wants to replace an existing document.',
    }),
    documentDomain: stringEnum(['manuscript', 'lore'] as const),
    documentId: Type.Unsafe<string | null>({
      description:
        'For replace, the exact request-scoped document ref. For create, null. Do not put a continuity-reference chapter here.',
      pattern: requestRefPattern('document'),
      type: ['string', 'null'],
    }),
    kind: Type.Unsafe<
      'chapter' | 'prologue' | 'interlude' | 'epilogue' | 'appendix' | 'entry' | null
    >({
      description: 'For create, the new document kind. For replace, null.',
      enum: ['chapter', 'prologue', 'interlude', 'epilogue', 'appendix', 'entry', null],
      type: ['string', 'null'],
    }),
    metadataTitle: Type.Unsafe<string | null>({
      description:
        'For create, the raw title without generated numbering. For replace, null.',
      maxLength: 500,
      type: ['string', 'null'],
    }),
    objective: Type.String({ maxLength: 4_000, minLength: 1 }),
    parentId: Type.Unsafe<string | null>({
      description:
        'For create, the request-scoped destination directory ref. For replace, null.',
      pattern: requestRefPattern('directory'),
      type: ['string', 'null'],
    }),
    requirements: Type.Array(
      Type.String({ maxLength: 1_000, minLength: 1 }),
      { maxItems: 20 },
    ),
    targetLength: Type.Unsafe<number | null>({
      maximum: 200_000,
      minimum: 1,
      type: ['integer', 'null'],
    }),
  },
  {
    additionalProperties: false,
    description:
      'Bind writing and its reviewed mutation before Scribe runs. create requires parentId, metadataTitle, and kind with documentId null. replace requires documentId with the creation fields null. Main anchors every revision from the context it served in this request.',
  },
);

export const WRITING_ARTIFACT_SUBMISSION_PARAMETERS = Type.Object(
  {
    markdown: Type.String({
      description:
        'The complete requested Manuscript or Lore Markdown and nothing else. Exclude planning, commentary, status text, and persistence claims.',
      maxLength: 512 * 1024,
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export const DOCUMENT_EDIT_PARAMETERS = Type.Object(
  {
    documentId: Type.String({ pattern: requestRefPattern('document') }),
    markdown: Type.String({
      description:
        'Complete replacement Markdown for this direct edit.',
      maxLength: 512 * 1024,
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export const DOCUMENT_FILE_OPERATION_PARAMETERS = Type.Object(
  {
    documentId: Type.Optional(
      Type.String({
        description: 'Required for delete: request-scoped document ref from read_novel_context.structure.',
        pattern: requestRefPattern('document'),
      }),
    ),
    kind: Type.Optional(
      stringEnum(
        [
          'chapter',
          'prologue',
          'interlude',
          'epilogue',
          'appendix',
          'entry',
        ] as const,
        { description: 'Required for create; entry is valid only under lore.' },
      ),
    ),
    markdown: Type.Optional(
      Type.String({
        description:
          'Required for create: complete initial Markdown.',
        maxLength: 512 * 1024,
        minLength: 1,
      }),
    ),
    operation: stringEnum(['create', 'delete'] as const),
    parentId: Type.Optional(
      Type.String({
        description: 'Required for create: request-scoped parent directory ref from read_novel_context.structure.',
        pattern: requestRefPattern('directory'),
      }),
    ),
    metadataTitle: Type.Optional(
      Type.String({
        description:
          'Required for create: raw document metadata title. Never copy displayTitle; generated numbering is applied separately by Main.',
        maxLength: 500,
        minLength: 1,
      }),
    ),
  },
  { additionalProperties: false },
);

export const PROJECT_STRUCTURE_OPERATION_PARAMETERS = Type.Object(
  {
    documentId: Type.Optional(
      Type.String({
        description: 'Required for move_document and rename_document: request-scoped document ref.',
        pattern: requestRefPattern('document'),
      }),
    ),
    directoryId: Type.Optional(
      Type.String({
        description: 'Required for delete_lore_category: request-scoped empty category ref.',
        pattern: requestRefPattern('directory'),
      }),
    ),
    icon: Type.Optional(
      stringEnum(PROJECT_ICON_IDS, {
        description: 'Required for create_lore_category.',
      }),
    ),
    operation: stringEnum(
      [
        'create_volume',
        'create_lore_category',
        'delete_lore_category',
        'move_document',
        'rename_document',
      ] as const,
    ),
    metadataTitle: Type.Optional(
      Type.String({
        description:
          'Required for rename_document: new raw metadata title without generated numbering. Renaming does not change the physical filename.',
        maxLength: 500,
        minLength: 1,
      }),
    ),
    targetParentId: Type.Optional(
      Type.String({
        description: 'Required for move_document: request-scoped destination directory ref.',
        pattern: requestRefPattern('directory'),
      }),
    ),
    title: Type.Optional(
      Type.String({
        description: 'Required when creating a volume or lore category.',
        maxLength: 500,
        minLength: 1,
      }),
    ),
  },
  { additionalProperties: false },
);

const STORY_CHANGE_PARAMETERS = Type.Object(
      {
        beatId: Type.Optional(Type.String({ pattern: requestRefPattern('beat') })),
        causes: Type.Optional(Type.String({ maxLength: 20_000 })),
        consequences: Type.Optional(Type.String({ maxLength: 20_000 })),
        description: Type.Optional(Type.String({ maxLength: 30_000 })),
        desiredOutcome: Type.Optional(Type.String({ maxLength: 10_000 })),
        displayTime: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
        dramaticPurpose: Type.Optional(Type.String({ maxLength: 10_000 })),
        endMomentId: Type.Optional(Type.Unsafe<string | null>({
          pattern: requestRefPattern('moment'),
          type: ['string', 'null'],
        })),
        eventId: Type.Optional(Type.String({ pattern: requestRefPattern('event') })),
        isPrimary: Type.Optional(Type.Boolean()),
        kind: Type.Optional(stringEnum(
          ['beat', 'setup', 'turning_point', 'climax', 'resolution'] as const,
        )),
        name: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
        note: Type.Optional(Type.String({ maxLength: 10_000 })),
        operation: stringEnum(
          [
            'create_persona',
            'create_timeline',
            'create_moment',
            'create_event',
            'create_thread',
            'create_beat',
            'link_beat_event',
          ] as const,
          {
            description:
              'Select one operation and use its exact change shape: create_persona={operation,name,role,summary}; create_timeline={operation,title,summary,isPrimary}; create_moment={operation,timelineId,displayTime,precision,orderKey,note}; create_event={operation,timelineId,startMomentId,endMomentId,title,summary,eventStatus,participants,sources?,causes?,consequences?}; create_thread={operation,parentId,title,summary,threadStatus,orderKey}; create_beat={operation,threadId,parentId,kind,title,description,threadStatus,orderKey,dramaticPurpose?,desiredOutcome?}; link_beat_event={operation,beatId,eventId,relation}. Omit optional prose when it is not evidenced; Main stores it as empty text. Send nullable IDs as null. Do not include fields from another shape.',
          },
        ),
        orderKey: Type.Optional(Type.Integer()),
        parentId: Type.Optional(Type.Unsafe<string | null>({
          pattern: requestRefPatternForKinds('thread', 'beat'),
          type: ['string', 'null'],
        })),
        participants: Type.Optional(Type.Array(Type.Object(
          {
            description: Type.String({ maxLength: 10_000 }),
            personaId: Type.String({ pattern: requestRefPattern('persona') }),
            role: stringEnum(['actor', 'target', 'witness', 'affected'] as const),
          },
          { additionalProperties: false },
        ), { maxItems: 100 })),
        precision: Type.Optional(stringEnum(
          ['exact', 'day', 'month', 'season', 'approximate', 'unknown'] as const,
        )),
        relation: Type.Optional(stringEnum(
          ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves'] as const,
        )),
        role: Type.Optional(Type.Unsafe<string | null>({
          maxLength: 500,
          type: ['string', 'null'],
        })),
        startMomentId: Type.Optional(Type.String({ pattern: requestRefPattern('moment') })),
        sources: Type.Optional(Type.Array(Type.Object(
          {
            anchor: Type.Unsafe<string | null>({
              maxLength: 10_000,
              type: ['string', 'null'],
            }),
            documentId: Type.String({
              description:
                'Request-scoped ref of a document read in this request. Main binds the revision it served.',
              pattern: requestRefPattern('document'),
            }),
            relation: stringEnum(['depicted', 'mentioned', 'inferred'] as const),
            sourceKind: stringEnum(['manuscript'] as const),
          },
          { additionalProperties: false },
        ), { maxItems: 100 })),
        eventStatus: Type.Optional(stringEnum(
          ['planned', 'established'] as const,
          { description: 'Required only for create_event.' },
        )),
        threadStatus: Type.Optional(stringEnum(
          ['planned', 'active', 'resolved', 'abandoned'] as const,
          { description: 'Required only for create_thread and create_beat.' },
        )),
        summary: Type.Optional(Type.String({ maxLength: 30_000 })),
        threadId: Type.Optional(Type.String({ pattern: requestRefPattern('thread') })),
        timelineId: Type.Optional(Type.String({ pattern: requestRefPattern('timeline') })),
        title: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
      },
      { additionalProperties: false },
);

export const STORY_OPERATION_PARAMETERS = Type.Object(
  { change: STORY_CHANGE_PARAMETERS },
  { additionalProperties: false },
);

const maintenanceReferenceDescription = (kind: string): string =>
  `Request-scoped ${kind} ref, or @clientRef for a compatible entity created earlier in this same changeset.`;

const STORY_MAINTENANCE_CHANGE_PARAMETERS = Type.Object(
  {
    ...STORY_CHANGE_PARAMETERS.properties,
    beatId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('beat'),
      pattern: requestOrClientRefPattern('beat'),
    })),
    clientRef: Type.Optional(Type.String({
      description:
        'Optional local name for an entity created by this change. Later changes in this same array may reference it as @clientRef. Valid only on create operations; Main owns persistent identity.',
      maxLength: 32,
      pattern: '^[A-Za-z][A-Za-z0-9_-]{0,31}$',
    })),
    endMomentId: Type.Optional(Type.Unsafe<string | null>({
      description:
        `${maintenanceReferenceDescription('moment')} Use null when the event has no end moment.`,
      pattern: requestOrClientRefPattern('moment'),
      type: ['string', 'null'],
    })),
    eventId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('event'),
      pattern: requestOrClientRefPattern('event'),
    })),
    operation: stringEnum(
      [
        'create_persona',
        'create_timeline',
        'create_moment',
        'create_event',
        'create_thread',
        'create_beat',
        'link_beat_event',
      ] as const,
      {
        description:
          'Select one exact change shape. Create operations may add clientRef. Later changes may use @clientRef in ID fields, so dependent creates and links belong in this same ordered changeset rather than separate calls or rereads.',
      },
    ),
    parentId: Type.Optional(Type.Unsafe<string | null>({
      description:
        `${maintenanceReferenceDescription('parent thread or beat')} Use null for a root entity.`,
      pattern: requestOrClientRefPatternForKinds('thread', 'beat'),
      type: ['string', 'null'],
    })),
    participants: Type.Optional(Type.Array(Type.Object(
      {
        description: Type.String({ maxLength: 10_000 }),
        personaId: Type.String({
          description: maintenanceReferenceDescription('persona'),
          pattern: requestOrClientRefPattern('persona'),
        }),
        role: stringEnum(['actor', 'target', 'witness', 'affected'] as const),
      },
      { additionalProperties: false },
    ), { maxItems: 100 })),
    startMomentId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('moment'),
      pattern: requestOrClientRefPattern('moment'),
    })),
    threadId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('thread'),
      pattern: requestOrClientRefPattern('thread'),
    })),
    timelineId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('timeline'),
      pattern: requestOrClientRefPattern('timeline'),
    })),
  },
  { additionalProperties: false },
);

export const STORY_MAINTENANCE_PARAMETERS = Type.Object(
  {
    changes: Type.Array(STORY_MAINTENANCE_CHANGE_PARAMETERS, {
      description:
        'Ordered atomic changes. Declare clientRef on a create change and use @clientRef only in later changes that depend on it.',
      maxItems: 24,
      minItems: 1,
    }),
  },
  { additionalProperties: false },
);

export const STORY_RECONCILIATION_COMPLETION_PARAMETERS = Type.Object(
  {
    reason: Type.String({ maxLength: 2_000, minLength: 1 }),
    status: stringEnum(
      ['applied', 'no_changes', 'questions_recorded'] as const,
      {
        description:
          'Use applied after Maintain changed story records, questions_recorded after recording one or more author questions, or no_changes after checking the accepted document and current story state and finding no canonical change.',
      },
    ),
  },
  { additionalProperties: false },
);

export const ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS = Type.Object(
  {
    events: Type.Array(Type.Object(
      {
        displayTime: Type.String({ maxLength: 500, minLength: 1 }),
        participants: Type.Array(Type.Object(
          {
            description: Type.String({ maxLength: 10_000 }),
            personaRef: Type.String({
              pattern: requestOrClientRefPattern('persona'),
            }),
            role: stringEnum(['actor', 'target', 'witness', 'affected'] as const),
          },
          { additionalProperties: false },
        ), { maxItems: 100 }),
        precision: stringEnum(
          ['exact', 'day', 'month', 'season', 'approximate', 'unknown'] as const,
        ),
        summary: Type.String({ maxLength: 30_000 }),
        title: Type.String({ maxLength: 500, minLength: 1 }),
      },
      { additionalProperties: false },
    ), {
      description:
        'Exactly one Chronicle event depicted by the accepted document. Main creates its moment, source binding, order, IDs, and revision atomically.',
      maxItems: 1,
      minItems: 1,
    }),
    newPersonae: Type.Array(Type.Object(
      {
        clientRef: Type.String({
          description:
            'Local ref for this new Persona. Event participants may refer to it as @clientRef in this same call.',
          maxLength: 32,
          minLength: 1,
          pattern: '^[A-Za-z][A-Za-z0-9_-]{0,31}$',
        }),
        name: Type.String({ maxLength: 500, minLength: 1 }),
        role: Type.Unsafe<string | null>({
          maxLength: 500,
          type: ['string', 'null'],
        }),
        summary: Type.String({ maxLength: 20_000 }),
      },
      { additionalProperties: false },
    ), {
      description:
        'Clearly established new Personae needed by this accepted document. Do not create a question merely because a depicted character is intentionally unnamed; use a faithful descriptive name only when it is useful as a stable story label.',
      maxItems: 6,
    }),
    newThreads: Type.Array(Type.Object(
      {
        beat: Type.Object(
          {
            description: Type.String({ maxLength: 30_000 }),
            desiredOutcome: Type.Optional(Type.String({ maxLength: 10_000 })),
            dramaticPurpose: Type.Optional(Type.String({ maxLength: 10_000 })),
            kind: stringEnum(
              ['beat', 'setup', 'turning_point', 'climax', 'resolution'] as const,
            ),
            relation: stringEnum(
              ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves'] as const,
            ),
            title: Type.String({ maxLength: 500, minLength: 1 }),
          },
          { additionalProperties: false },
        ),
        summary: Type.String({ maxLength: 20_000 }),
        threadStatus: stringEnum(
          ['planned', 'active', 'resolved', 'abandoned'] as const,
        ),
        title: Type.String({ maxLength: 500, minLength: 1 }),
      },
      { additionalProperties: false },
    ), {
      description:
        'New sustained Threads clearly established by the accepted prose, each with its first beat linked to the accepted event. Leave empty for a scene-level hook that has not yet become a continuing plot line.',
      maxItems: 2,
    }),
    primaryTimeline: Type.Optional(Type.Object(
      {
        summary: Type.String({ maxLength: 20_000 }),
        title: Type.String({ maxLength: 500, minLength: 1 }),
      },
      {
        additionalProperties: false,
        description:
          'Optional semantic title and summary used only when accepted_reconciliation reports no primary timeline. If omitted, Main creates a neutral primary timeline automatically.',
      },
    )),
    threadAdvances: Type.Array(Type.Object(
      {
        description: Type.String({ maxLength: 30_000 }),
        desiredOutcome: Type.Optional(Type.String({ maxLength: 10_000 })),
        dramaticPurpose: Type.Optional(Type.String({ maxLength: 10_000 })),
        kind: stringEnum(
          ['beat', 'setup', 'turning_point', 'climax', 'resolution'] as const,
        ),
        relation: stringEnum(
          ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves'] as const,
        ),
        threadRef: Type.String({ pattern: requestRefPattern('thread') }),
        title: Type.String({ maxLength: 500, minLength: 1 }),
      },
      { additionalProperties: false },
    ), {
      description:
        'Existing Threads advanced by this accepted-document event, using refs from accepted_reconciliation context. Main creates and links beats atomically.',
      maxItems: 4,
    }),
  },
  { additionalProperties: false },
);

export const STORY_QUESTION_PARAMETERS = Type.Object(
  {
    context: Type.String({ maxLength: 10_000 }),
    evidence: Type.Unsafe<AgentStoryQuestionEvidenceInput | null>({
      additionalProperties: false,
      description:
        'The exact supporting quotation plus the document it came from, or null when no single passage applies. Main binds the revision it served for that document.',
      properties: {
        anchor: { maxLength: 10_000, minLength: 1, type: 'string' },
        documentId: {
          description:
            `A request-scoped document ref read in this request, or ${ACCEPTED_DOCUMENT_REFERENCE} after reading accepted_reconciliation.`,
          pattern:
            `^(?:document:[1-9][0-9]{0,4}|${ACCEPTED_DOCUMENT_REFERENCE})$`,
          type: 'string',
        },
      },
      required: ['anchor', 'documentId'],
      type: ['object', 'null'],
    }),
    kind: stringEnum([
      'possible_alias',
      'uncertain_time',
      'unclear_relationship',
      'contradiction',
      'other',
    ] as const),
    options: Type.Array(Type.String({ maxLength: 500, minLength: 1 }), {
      maxItems: 6,
    }),
    question: Type.String({ maxLength: 2_000, minLength: 1 }),
  },
  { additionalProperties: false },
);

export const RESOLVE_STORY_QUESTION_PARAMETERS = Type.Object(
  {
    answer: Type.String({ maxLength: 2_000, minLength: 1 }),
    questionId: Type.String({ pattern: requestRefPattern('question') }),
  },
  { additionalProperties: false },
);

type StoryChangeWireInput = Record<string, unknown> & {
  eventStatus?: unknown;
  operation?: unknown;
  threadStatus?: unknown;
};

/**
 * Maps one model-facing change onto its canonical shape: the wire keeps
 * operation-specific status names, and unevidenced prose defaults to empty.
 */
const normalizeStoryChange = (
  change: StoryChangeWireInput,
): AgentStoryChangeInput => {
  const { eventStatus, threadStatus, ...normalized } = change;
  if (normalized.operation === 'create_event') {
    return {
      ...normalized,
      causes: normalized.causes ?? '',
      consequences: normalized.consequences ?? '',
      status: eventStatus,
    } as AgentStoryChangeInput;
  }
  if (normalized.operation === 'create_thread') {
    return { ...normalized, status: threadStatus } as AgentStoryChangeInput;
  }
  if (normalized.operation === 'create_beat') {
    return {
      ...normalized,
      desiredOutcome: normalized.desiredOutcome ?? '',
      dramaticPurpose: normalized.dramaticPurpose ?? '',
      status: threadStatus,
    } as AgentStoryChangeInput;
  }
  return normalized as AgentStoryChangeInput;
};

export const normalizeStoryMaintenanceArguments = (
  value: { change: StoryChangeWireInput },
): AgentToolContractMap['propose_story_operation']['arguments'] => ({
  change: normalizeStoryChange(
    value.change,
  ) as AgentToolContractMap['propose_story_operation']['arguments']['change'],
});

export const normalizeStoryMaintenanceBatchArguments = (
  value: { changes: StoryChangeWireInput[] },
): AgentToolContractMap['maintain_story_records']['arguments'] => ({
  changes: value.changes.map(normalizeStoryChange),
});
