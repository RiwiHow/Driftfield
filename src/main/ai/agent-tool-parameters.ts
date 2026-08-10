import { Type } from 'typebox';

import type { AgentToolContractMap } from '../../shared/contracts/agent-tools';

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

export const DOCUMENT_FILE_OPERATION_PARAMETERS = Type.Object(
  {
    baseRevision: Type.Optional(
      Type.String({
        description: 'Required for delete: persisted revision returned by get_document.',
        pattern: '^[a-f0-9]{64}$',
      }),
    ),
    documentId: Type.Optional(
      Type.String({
        description: 'Required for delete: stable document ID from get_novel_structure.',
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
      Type.String({
        description: 'Required for create: complete initial Markdown content.',
        maxLength: 512 * 1024,
      }),
    ),
    operation: stringEnum(['create', 'delete'] as const),
    parentId: Type.Optional(
      Type.String({
        description: 'Required for create: stable parent directory ID from get_novel_structure.',
        maxLength: 128,
        minLength: 1,
      }),
    ),
    projectRevision: Type.String({
      description: 'Current project revision returned by get_novel_structure.',
      pattern: '^[a-f0-9]{64}$',
    }),
    title: Type.Optional(
      Type.String({
        description: 'Required for create: display title without generated numbering.',
        maxLength: 500,
        minLength: 1,
      }),
    ),
  },
  { additionalProperties: false },
);

export const PROJECT_STRUCTURE_OPERATION_PARAMETERS = Type.Object(
  {
    baseRevision: Type.Optional(
      Type.String({
        description: 'Required for move_document: persisted revision returned by get_document.',
        pattern: '^[a-f0-9]{64}$',
      }),
    ),
    documentId: Type.Optional(
      Type.String({
        description: 'Required for move_document: stable document ID.',
        maxLength: 128,
        minLength: 1,
      }),
    ),
    operation: stringEnum(
      ['create_volume', 'create_lore_category', 'move_document'] as const,
    ),
    projectRevision: Type.String({
      description: 'Current project revision returned by get_novel_structure.',
      pattern: '^[a-f0-9]{64}$',
    }),
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

export const STORY_OPERATION_PARAMETERS = Type.Object(
  {
    change: Type.Object(
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
              'Select one operation and use its exact change shape: create_persona={operation,name,role,summary}; create_timeline={operation,title,summary,isPrimary}; create_moment={operation,timelineId,displayTime,precision,orderKey,note}; create_event={operation,timelineId,startMomentId,endMomentId,title,summary,eventStatus,causes,consequences,participants}; create_thread={operation,parentId,title,summary,threadStatus,orderKey}; create_beat={operation,threadId,parentId,kind,title,description,threadStatus,orderKey,dramaticPurpose,desiredOutcome}; link_beat_event={operation,beatId,eventId,relation}. Send empty optional prose as empty strings and nullable IDs as null. Do not include fields from another shape.',
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
    ),
    storyRevision: Type.Integer({ minimum: 0 }),
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
): AgentToolContractMap['maintain_story_records']['arguments'] => {
  const { eventStatus, threadStatus, ...change } = value.change;
  if (change.operation === 'create_event') {
    return {
      change: { ...change, status: eventStatus } as AgentToolContractMap['maintain_story_records']['arguments']['change'],
      storyRevision: value.storyRevision,
    };
  }
  if (change.operation === 'create_thread' || change.operation === 'create_beat') {
    return {
      change: { ...change, status: threadStatus } as AgentToolContractMap['maintain_story_records']['arguments']['change'],
      storyRevision: value.storyRevision,
    };
  }
  return {
    change: change as AgentToolContractMap['maintain_story_records']['arguments']['change'],
    storyRevision: value.storyRevision,
  };
};
