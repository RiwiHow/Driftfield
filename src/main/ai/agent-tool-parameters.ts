import { Type } from 'typebox';

import type { AgentToolContractMap } from '../../shared/contracts/agent-tools';
import { AGENT_NOVEL_CONTEXT_SECTIONS } from '../../shared/contracts/agent-tools';
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

export const NOVEL_CONTEXT_PARAMETERS = Type.Object(
  {
    directoryIds: Type.Array(
      Type.String({ maxLength: 128, minLength: 1 }),
      {
        description:
          'Stable directory IDs whose immediate document children should be read. Nested directories are not expanded. Use an empty array when none are needed.',
        maxItems: 4,
        uniqueItems: true,
      },
    ),
    documentIds: Type.Array(
      Type.String({ maxLength: 128, minLength: 1 }),
      {
        description:
          'Stable IDs of persisted manuscript or lore documents to read. Use an empty array when none are needed.',
        maxItems: 4,
        uniqueItems: true,
      },
    ),
    include: Type.Array(
      stringEnum(AGENT_NOVEL_CONTEXT_SECTIONS),
      {
        description:
          'Additional context sections to read. current_document is the immutable request-start editor draft. accepted_reconciliation is available only after an accepted Scribe-backed manuscript proposal and returns the exact accepted persisted document with request-scoped refs instead of stable IDs.',
        maxItems: AGENT_NOVEL_CONTEXT_SECTIONS.length,
        uniqueItems: true,
      },
    ),
  },
  {
    additionalProperties: false,
    description:
      'Request at least one include section, document ID, or directory ID. Explicit and directory-expanded documents are deduplicated and limited to four total results. Results remain path-free and bounded.',
  },
);

export const WRITING_ASSIGNMENT_PARAMETERS = Type.Object(
  {
    objective: Type.String({ maxLength: 4_000, minLength: 1 }),
    requirements: Type.Array(
      Type.String({ maxLength: 1_000, minLength: 1 }),
      { maxItems: 20 },
    ),
    targetDocumentId: Type.Unsafe<string | null>({
      description:
        'For an existing document, use its stable document ID from read_novel_context.structure. For a new document that does not exist yet, use null. Never use a directory ID, title, path, or placeholder ID.',
      maxLength: 128,
      type: ['string', 'null'],
    }),
    targetLength: Type.Unsafe<number | null>({
      description:
        'Requested approximate draft length when the user supplied one; otherwise use null.',
      maximum: 200_000,
      minimum: 1,
      type: ['integer', 'null'],
    }),
  },
  { additionalProperties: false },
);

export const WRITING_ARTIFACT_SUBMISSION_PARAMETERS = Type.Object(
  {
    markdown: Type.String({
      description:
        'The complete requested manuscript Markdown and nothing else. Exclude planning, commentary, status text, and persistence claims.',
      maxLength: 512 * 1024,
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export const WRITING_ARTIFACT_REVISION_PARAMETERS = Type.Object(
  {
    replacements: Type.Array(
      Type.Object(
        {
          expectedOccurrences: Type.Integer({ maximum: 100, minimum: 1 }),
          find: Type.String({ maxLength: 8_000, minLength: 1 }),
          replace: Type.String({ maxLength: 8_000 }),
        },
        { additionalProperties: false },
      ),
      {
        description:
          'Ordered exact replacements in the current Scribe artifact. Each find string must occur exactly expectedOccurrences times at its step or the entire revision is rejected.',
        maxItems: 12,
        minItems: 1,
      },
    ),
    writingAssignmentId: Type.String({ maxLength: 128, minLength: 1 }),
  },
  { additionalProperties: false },
);

export const DOCUMENT_EDIT_PARAMETERS = Type.Object(
  {
    baseContentRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    baseRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    documentId: Type.String({ maxLength: 128, minLength: 1 }),
    markdown: Type.Unsafe<string | null>({
      description:
        'Complete replacement Markdown for a direct edit, or null when reusing a reviewed Scribe result through writingAssignmentId.',
      maxLength: 512 * 1024,
      type: ['string', 'null'],
    }),
    writingAssignmentId: Type.Unsafe<string | null>({
      description:
        'The assignmentId returned by delegate_writing, or null when markdown is supplied directly. Exactly one of markdown and writingAssignmentId must be non-null.',
      maxLength: 128,
      type: ['string', 'null'],
    }),
  },
  { additionalProperties: false },
);

export const DOCUMENT_FILE_OPERATION_PARAMETERS = Type.Object(
  {
    baseRevision: Type.Optional(
      Type.String({
        description: 'Required for delete: persisted revision returned by read_novel_context.',
        pattern: '^[a-f0-9]{64}$',
      }),
    ),
    documentId: Type.Optional(
      Type.String({
        description: 'Required for delete: stable document ID from read_novel_context.structure.',
        maxLength: 128,
        minLength: 1,
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
      Type.Unsafe<string | null>({
        description:
          'Required for create: complete initial Markdown, or null when reusing a reviewed Scribe result through writingAssignmentId.',
        maxLength: 512 * 1024,
        type: ['string', 'null'],
      }),
    ),
    operation: stringEnum(['create', 'delete'] as const),
    parentId: Type.Optional(
      Type.String({
        description: 'Required for create: stable parent directory ID from read_novel_context.structure.',
        maxLength: 128,
        minLength: 1,
      }),
    ),
    projectRevision: Type.String({
      description: 'Current project revision returned by read_novel_context.structure.',
      pattern: '^[a-f0-9]{64}$',
    }),
    metadataTitle: Type.Optional(
      Type.String({
        description:
          'Required for create: raw document metadata title. Never copy displayTitle; generated numbering is applied separately by Main.',
        maxLength: 500,
        minLength: 1,
      }),
    ),
    writingAssignmentId: Type.Optional(
      Type.Unsafe<string | null>({
        description:
          'Required for create: the assignmentId returned by delegate_writing, or null when markdown is supplied directly. Exactly one of markdown and writingAssignmentId must be non-null.',
        maxLength: 128,
        type: ['string', 'null'],
      }),
    ),
  },
  { additionalProperties: false },
);

export const PROJECT_STRUCTURE_OPERATION_PARAMETERS = Type.Object(
  {
    baseRevision: Type.Optional(
      Type.String({
        description: 'Required for move_document: persisted revision returned by read_novel_context.',
        pattern: '^[a-f0-9]{64}$',
      }),
    ),
    documentId: Type.Optional(
      Type.String({
        description: 'Required for move_document and rename_document: stable document ID.',
        maxLength: 128,
        minLength: 1,
      }),
    ),
    directoryId: Type.Optional(
      Type.String({
        description: 'Required for delete_lore_category: stable empty category ID.',
        maxLength: 128,
        minLength: 1,
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
    projectRevision: Type.String({
      description: 'Current project revision returned by read_novel_context.structure.',
      pattern: '^[a-f0-9]{64}$',
    }),
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
        description: 'Required for move_document: stable destination directory ID.',
        maxLength: 128,
        minLength: 1,
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
        beatId: Type.Optional(Type.String({ maxLength: 128, minLength: 1 })),
        causes: Type.Optional(Type.String({ maxLength: 20_000 })),
        consequences: Type.Optional(Type.String({ maxLength: 20_000 })),
        description: Type.Optional(Type.String({ maxLength: 30_000 })),
        desiredOutcome: Type.Optional(Type.String({ maxLength: 10_000 })),
        displayTime: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
        dramaticPurpose: Type.Optional(Type.String({ maxLength: 10_000 })),
        endMomentId: Type.Optional(Type.Unsafe<string | null>({
          maxLength: 128,
          type: ['string', 'null'],
        })),
        eventId: Type.Optional(Type.String({ maxLength: 128, minLength: 1 })),
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
          maxLength: 128,
          type: ['string', 'null'],
        })),
        participants: Type.Optional(Type.Array(Type.Object(
          {
            description: Type.String({ maxLength: 10_000 }),
            personaId: Type.String({ maxLength: 128, minLength: 1 }),
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
        startMomentId: Type.Optional(Type.String({ maxLength: 128, minLength: 1 })),
        sources: Type.Optional(Type.Array(Type.Object(
          {
            anchor: Type.Unsafe<string | null>({
              maxLength: 10_000,
              type: ['string', 'null'],
            }),
            documentId: Type.String({ maxLength: 128, minLength: 1 }),
            documentRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
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
        threadId: Type.Optional(Type.String({ maxLength: 128, minLength: 1 })),
        timelineId: Type.Optional(Type.String({ maxLength: 128, minLength: 1 })),
        title: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
      },
      { additionalProperties: false },
);

export const STORY_OPERATION_PARAMETERS = Type.Object(
  {
    change: STORY_CHANGE_PARAMETERS,
    storyRevision: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const maintenanceReferenceDescription = (kind: string): string =>
  `Stable ${kind} ID, or @clientRef for a compatible entity created earlier in this same changeset.`;

const STORY_MAINTENANCE_CHANGE_PARAMETERS = Type.Object(
  {
    ...STORY_CHANGE_PARAMETERS.properties,
    beatId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('beat'),
      maxLength: 128,
      minLength: 1,
    })),
    clientRef: Type.Optional(Type.String({
      description:
        'Optional local name for an entity created by this change. Later changes in this same array may reference it as @clientRef. Valid only on create operations; Main still generates the stable ID.',
      maxLength: 64,
      pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
    })),
    endMomentId: Type.Optional(Type.Unsafe<string | null>({
      description:
        `${maintenanceReferenceDescription('moment')} Use null when the event has no end moment.`,
      maxLength: 128,
      type: ['string', 'null'],
    })),
    eventId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('event'),
      maxLength: 128,
      minLength: 1,
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
      maxLength: 128,
      type: ['string', 'null'],
    })),
    participants: Type.Optional(Type.Array(Type.Object(
      {
        description: Type.String({ maxLength: 10_000 }),
        personaId: Type.String({
          description: maintenanceReferenceDescription('persona'),
          maxLength: 128,
          minLength: 1,
        }),
        role: stringEnum(['actor', 'target', 'witness', 'affected'] as const),
      },
      { additionalProperties: false },
    ), { maxItems: 100 })),
    startMomentId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('moment'),
      maxLength: 128,
      minLength: 1,
    })),
    threadId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('thread'),
      maxLength: 128,
      minLength: 1,
    })),
    timelineId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('timeline'),
      maxLength: 128,
      minLength: 1,
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
    storyRevision: Type.Integer({ minimum: 0 }),
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
            personaRef: Type.String({ maxLength: 64, minLength: 1 }),
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
        threadRef: Type.String({ maxLength: 64, minLength: 1 }),
        title: Type.String({ maxLength: 500, minLength: 1 }),
      },
      { additionalProperties: false },
    ), {
      description:
        'Existing Threads advanced by this accepted-document event, using refs from accepted_reconciliation context. Main creates and links beats atomically.',
      maxItems: 11,
    }),
  },
  { additionalProperties: false },
);

export const STORY_QUESTION_PARAMETERS = Type.Object(
  {
    context: Type.String({ maxLength: 10_000 }),
    evidence: Type.Unsafe<{
      anchor: string;
      documentId: string;
      documentRevision: string;
      sourceKind: 'manuscript';
    } | { anchor: string; sourceRef: 'document:accepted' } | null>({
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            anchor: { maxLength: 10_000, minLength: 1, type: 'string' },
            documentId: { maxLength: 128, minLength: 1, type: 'string' },
            documentRevision: { pattern: '^[a-f0-9]{64}$', type: 'string' },
            sourceKind: { enum: ['manuscript'], type: 'string' },
          },
          required: ['anchor', 'documentId', 'documentRevision', 'sourceKind'],
          type: 'object',
        },
        {
          additionalProperties: false,
          properties: {
            anchor: { maxLength: 10_000, minLength: 1, type: 'string' },
            sourceRef: { enum: ['document:accepted'], type: 'string' },
          },
          required: ['anchor', 'sourceRef'],
          type: 'object',
        },
        { type: 'null' },
      ],
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
    questionId: Type.String({ maxLength: 128, minLength: 1 }),
  },
  { additionalProperties: false },
);

export const normalizeStoryMaintenanceArguments = (
  value: {
    change: Record<string, unknown> & {
      eventStatus?: unknown;
      operation?: unknown;
      threadStatus?: unknown;
    };
    storyRevision: number;
  },
): AgentToolContractMap['propose_story_operation']['arguments'] => {
  const { eventStatus, threadStatus, ...change } = value.change;
  if (change.operation === 'create_event') {
    return {
      change: {
        ...change,
        causes: change.causes ?? '',
        consequences: change.consequences ?? '',
        status: eventStatus,
      } as AgentToolContractMap['propose_story_operation']['arguments']['change'],
      storyRevision: value.storyRevision,
    };
  }
  if (change.operation === 'create_thread') {
    return {
      change: { ...change, status: threadStatus } as AgentToolContractMap['propose_story_operation']['arguments']['change'],
      storyRevision: value.storyRevision,
    };
  }
  if (change.operation === 'create_beat') {
    return {
      change: {
        ...change,
        desiredOutcome: change.desiredOutcome ?? '',
        dramaticPurpose: change.dramaticPurpose ?? '',
        status: threadStatus,
      } as AgentToolContractMap['propose_story_operation']['arguments']['change'],
      storyRevision: value.storyRevision,
    };
  }
  return {
    change: change as AgentToolContractMap['propose_story_operation']['arguments']['change'],
    storyRevision: value.storyRevision,
  };
};

export const normalizeStoryMaintenanceBatchArguments = (
  value: {
    changes: Array<{
      eventStatus?: unknown;
      operation?: unknown;
      threadStatus?: unknown;
      [key: string]: unknown;
    }>;
    storyRevision: number;
  },
): AgentToolContractMap['maintain_story_records']['arguments'] => ({
  changes: value.changes.map((change) => {
    const { eventStatus, threadStatus, ...normalized } = change;
    if (normalized.operation === 'create_event') {
      return {
        ...normalized,
        causes: normalized.causes ?? '',
        consequences: normalized.consequences ?? '',
        status: eventStatus,
      } as
        AgentToolContractMap['maintain_story_records']['arguments']['changes'][number];
    }
    if (normalized.operation === 'create_thread') {
      return { ...normalized, status: threadStatus } as
        AgentToolContractMap['maintain_story_records']['arguments']['changes'][number];
    }
    if (normalized.operation === 'create_beat') {
      return {
        ...normalized,
        desiredOutcome: normalized.desiredOutcome ?? '',
        dramaticPurpose: normalized.dramaticPurpose ?? '',
        status: threadStatus,
      } as AgentToolContractMap['maintain_story_records']['arguments']['changes'][number];
    }
    return normalized as
      AgentToolContractMap['maintain_story_records']['arguments']['changes'][number];
  }),
  storyRevision: value.storyRevision,
});
