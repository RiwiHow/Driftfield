import { Type } from 'typebox';
import { Check } from 'typebox/value';

import type {
  AgentAcceptedDocumentReconciliationArguments,
  AgentStoryChangeInput,
  AgentStoryQuestionEvidenceInput,
  AgentToolContractMap,
  AgentToolName,
} from './agent-tools';
import { isProjectIconId } from './project-layout';
import { isProjectStoryOperation } from './project-story';

export const ACCEPTED_DOCUMENT_PATH = 'ACCEPTED.md';

export const PROJECT_BASH_PARAMETERS = Type.Object(
  {
    command: Type.String({
      description:
        'A Bash command for inspecting the disposable /project snapshot. Prefer find, rg, cat, sed, head, tail, jq, and wc. The shell has no network, host filesystem, JavaScript, Python, credentials, or persistence.',
      maxLength: 4_000,
      minLength: 1,
    }),
  },
  {
    additionalProperties: false,
    description:
      'Inspect the current novel through an isolated in-memory Bash filesystem. Every call starts from a fresh authoritative snapshot and discards all virtual writes afterward.',
  },
);

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

const projectPathPattern = '^(?:manuscript|lore)(?:/(?!\\.{1,2}(?:/|$))[^/\\r\\n]+)*$';
const storyIdPattern = '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
const storyOrClientIdPattern = '^(?:[A-Za-z0-9][A-Za-z0-9._-]{0,127}|@[A-Za-z][A-Za-z0-9_-]{0,31})$';

export const DOCUMENT_WRITING_PARAMETERS = Type.Object(
  {
    documentAction: stringEnum(['create', 'replace'] as const, {
      description:
        'Choose create for a new chapter or Lore entry. Choose replace only when the user explicitly wants to replace an existing document.',
    }),
    documentDomain: stringEnum(['manuscript', 'lore'] as const),
    documentPath: Type.Unsafe<string | null>({
      description:
        'For replace, the exact project-relative Markdown path shown by Bash. For create, null.',
      pattern: projectPathPattern,
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
    parentPath: Type.Unsafe<string | null>({
      description:
        'For create, the exact project-relative destination directory shown by Bash. For replace, null.',
      pattern: projectPathPattern,
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
      'Bind writing and its reviewed mutation before Scribe runs. create requires parentPath, metadataTitle, and kind with documentPath null. replace requires documentPath with the creation fields null. Main anchors revisions from the latest Bash snapshot in this request.',
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
    documentPath: Type.String({ pattern: projectPathPattern }),
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
    documentPath: Type.Optional(
      Type.String({
        description: 'Required for delete: exact project-relative Markdown path shown by Bash.',
        pattern: projectPathPattern,
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
    parentPath: Type.Optional(
      Type.String({
        description: 'Required for create: exact project-relative parent directory shown by Bash.',
        pattern: projectPathPattern,
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
    documentPath: Type.Optional(
      Type.String({
        description: 'Required for move_document and rename_document: exact project-relative Markdown path shown by Bash.',
        pattern: projectPathPattern,
      }),
    ),
    directoryPath: Type.Optional(
      Type.String({
        description:
          'Required for delete_lore_category and set_lore_category_icon: exact project-relative Lore category path shown by Bash.',
        pattern: projectPathPattern,
      }),
    ),
    icon: Type.Optional(
      Type.String({
        description:
          'Required for create_lore_category and set_lore_category_icon. Use an exact kebab-case Lucide name found in ICONS.txt.',
        maxLength: 35,
        pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      }),
    ),
    operation: stringEnum(
      [
        'create_volume',
        'create_lore_category',
        'delete_lore_category',
        'set_lore_category_icon',
        'move_document',
        'rename_document',
      ] as const,
      {
        description:
          'create_volume implicitly targets the Manuscript root; create_lore_category implicitly targets the Lore root. Neither create operation accepts a parent or directory ID.',
      },
    ),
    metadataTitle: Type.Optional(
      Type.String({
        description:
          'Required for rename_document: new raw metadata title without generated numbering. Renaming does not change the physical filename.',
        maxLength: 500,
        minLength: 1,
      }),
    ),
    targetParentPath: Type.Optional(
      Type.String({
        description: 'Required for move_document: exact project-relative destination directory shown by Bash.',
        pattern: projectPathPattern,
      }),
    ),
    title: Type.Optional(
      Type.String({
        description:
          'Required when creating a volume or Lore category. Creation targets the corresponding root implicitly.',
        maxLength: 500,
        minLength: 1,
      }),
    ),
  },
  { additionalProperties: false },
);

const STORY_CHANGE_PARAMETERS = Type.Object(
      {
        beatId: Type.Optional(Type.String({ pattern: storyIdPattern })),
        causes: Type.Optional(Type.String({ maxLength: 20_000 })),
        consequences: Type.Optional(Type.String({ maxLength: 20_000 })),
        description: Type.Optional(Type.String({ maxLength: 30_000 })),
        desiredOutcome: Type.Optional(Type.String({ maxLength: 10_000 })),
        displayTime: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
        dramaticPurpose: Type.Optional(Type.String({ maxLength: 10_000 })),
        endMomentId: Type.Optional(Type.Unsafe<string | null>({
          pattern: storyIdPattern,
          type: ['string', 'null'],
        })),
        eventId: Type.Optional(Type.String({ pattern: storyIdPattern })),
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
          pattern: storyIdPattern,
          type: ['string', 'null'],
        })),
        participants: Type.Optional(Type.Array(Type.Object(
          {
            description: Type.String({ maxLength: 10_000 }),
            personaId: Type.String({ pattern: storyIdPattern }),
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
        startMomentId: Type.Optional(Type.String({ pattern: storyIdPattern })),
        sources: Type.Optional(Type.Array(Type.Object(
          {
            anchor: Type.Unsafe<string | null>({
              maxLength: 10_000,
              type: ['string', 'null'],
            }),
            documentPath: Type.String({
              description:
                'Project-relative manuscript path shown by Bash. Main binds the revision from that snapshot.',
              pattern: projectPathPattern,
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
        threadId: Type.Optional(Type.String({ pattern: storyIdPattern })),
        timelineId: Type.Optional(Type.String({ pattern: storyIdPattern })),
        title: Type.Optional(Type.String({ maxLength: 500, minLength: 1 })),
      },
      { additionalProperties: false },
);

export const STORY_OPERATION_PARAMETERS = Type.Object(
  { change: STORY_CHANGE_PARAMETERS },
  { additionalProperties: false },
);

const maintenanceReferenceDescription = (kind: string): string =>
  `Stable ${kind} ID from STORY.json, or @clientRef for a compatible entity created earlier in this same changeset.`;

const STORY_MAINTENANCE_CHANGE_PARAMETERS = Type.Object(
  {
    ...STORY_CHANGE_PARAMETERS.properties,
    beatId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('beat'),
      pattern: storyOrClientIdPattern,
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
      pattern: storyOrClientIdPattern,
      type: ['string', 'null'],
    })),
    eventId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('event'),
      pattern: storyOrClientIdPattern,
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
      pattern: storyOrClientIdPattern,
      type: ['string', 'null'],
    })),
    participants: Type.Optional(Type.Array(Type.Object(
      {
        description: Type.String({ maxLength: 10_000 }),
        personaId: Type.String({
          description: maintenanceReferenceDescription('persona'),
          pattern: storyOrClientIdPattern,
        }),
        role: stringEnum(['actor', 'target', 'witness', 'affected'] as const),
      },
      { additionalProperties: false },
    ), { maxItems: 100 })),
    startMomentId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('moment'),
      pattern: storyOrClientIdPattern,
    })),
    threadId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('thread'),
      pattern: storyOrClientIdPattern,
    })),
    timelineId: Type.Optional(Type.String({
      description: maintenanceReferenceDescription('timeline'),
      pattern: storyOrClientIdPattern,
    })),
  },
  { additionalProperties: false },
);

const normalizedStoryChangeSchema = <
  Properties extends typeof STORY_CHANGE_PARAMETERS.properties,
>(properties: Properties) => {
  const {
    eventStatus: _eventStatus,
    threadStatus: _threadStatus,
    ...normalizedProperties
  } = properties;
  return Type.Object(
    {
      ...normalizedProperties,
      status: Type.Optional(stringEnum(
        ['planned', 'established', 'active', 'resolved', 'abandoned'] as const,
      )),
    },
    { additionalProperties: false },
  );
};

/**
 * The worker renames the provider-facing eventStatus/threadStatus fields to the
 * canonical status field before IPC. Derive the Main-side base schemas from the
 * exported provider schemas so every other field constraint stays identical.
 */
const NORMALIZED_STORY_CHANGE_PARAMETERS = normalizedStoryChangeSchema(
  STORY_CHANGE_PARAMETERS.properties,
);

const NORMALIZED_STORY_MAINTENANCE_CHANGE_PARAMETERS = normalizedStoryChangeSchema(
  STORY_MAINTENANCE_CHANGE_PARAMETERS.properties,
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
            personaId: Type.String({
              pattern: storyOrClientIdPattern,
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
          'Optional semantic title and summary used only when STORY.json has no primary timeline. If omitted, Main creates a neutral primary timeline automatically.',
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
        threadId: Type.String({ pattern: storyIdPattern }),
        title: Type.String({ maxLength: 500, minLength: 1 }),
      },
      { additionalProperties: false },
    ), {
      description:
        'Existing Threads advanced by this accepted-document event, using stable IDs from STORY.json. Main creates and links beats atomically.',
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
        documentPath: {
          description:
            `A project-relative manuscript path shown by Bash, or ${ACCEPTED_DOCUMENT_PATH} for the accepted manuscript.`,
          pattern: `^(?:(?:manuscript|lore)(?:/[^/\\r\\n]+)*|${ACCEPTED_DOCUMENT_PATH})$`,
          type: 'string',
        },
      },
      required: ['anchor', 'documentPath'],
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
    questionId: Type.String({ pattern: storyIdPattern }),
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

const guarded = <Schema extends object>(
  schema: Schema,
  issue: (value: unknown) => string | undefined,
): Schema =>
  Type.Refine(
    schema as never,
    (value) => issue(value) === undefined,
    (value) => issue(value) ?? '',
  ) as Schema;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

const isBoundedText = (
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): value is string =>
  typeof value === 'string' &&
  value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0) &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const isValidMetadataTitle = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 500 &&
  !/[\u0000-\u001f\u007f]/u.test(value);

const isStableStoryId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);

const isProjectPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(?:manuscript|lore)(?:\/[^/\r\n]+)*$/u.test(value) &&
  !value.split('/').includes('..');

const isStoryClientRef = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,31}$/u.test(value);

const isStoryClientReferenceUse = (value: unknown): value is string =>
  typeof value === 'string' && /^@[A-Za-z][A-Za-z0-9_-]{0,31}$/u.test(value);

const isNonEmptyMarkdown = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  new TextEncoder().encode(value).byteLength <= 512 * 1024;

const containsUnsafeTextControl = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
  }
  if (Array.isArray(value)) return value.some(containsUnsafeTextControl);
  return isRecord(value) && Object.values(value).some(containsUnsafeTextControl);
};

const PLACEHOLDER_REVISION = 'a'.repeat(64);

/** Validates one model-supplied story operation, refs and citations included. */
export const isAgentStoryOperation = (
  value: unknown,
  allowClientReferences: boolean,
): boolean => {
  let canonical = value;
  if (
    isRecord(value) &&
    value.operation === 'create_event' &&
    Array.isArray(value.sources)
  ) {
    canonical = {
      ...value,
      sources: value.sources.map((source) => {
        if (!isRecord(source) || !isProjectPath(source.documentPath)) return source;
        const { documentPath: _documentPath, ...canonicalSource } = source;
        return {
          ...canonicalSource,
          documentId: 'placeholder',
          documentRevision: PLACEHOLDER_REVISION,
        };
      }),
    };
  }
  if (!isProjectStoryOperation(canonical)) return false;
  const operation = value as AgentStoryChangeInput;
  const isRef = (reference: unknown, _kind: string): boolean =>
    isStableStoryId(reference) ||
    (allowClientReferences && isStoryClientReferenceUse(reference));
  if (
    operation.operation === 'create_persona' ||
    operation.operation === 'create_timeline'
  ) return true;
  if (operation.operation === 'create_moment') {
    return isRef(operation.timelineId, 'timeline');
  }
  if (operation.operation === 'create_event') {
    return (
      isRef(operation.timelineId, 'timeline') &&
      isRef(operation.startMomentId, 'moment') &&
      (operation.endMomentId === null || isRef(operation.endMomentId, 'moment')) &&
      operation.participants.every((participant) =>
        isRef(participant.personaId, 'persona')) &&
      (operation.sources === undefined ||
        operation.sources.every((source) =>
          source.sourceKind === 'manuscript' &&
          isProjectPath(source.documentPath)))
    );
  }
  if (operation.operation === 'create_thread') {
    return operation.parentId === null || isRef(operation.parentId, 'thread');
  }
  if (operation.operation === 'create_beat') {
    return (
      isRef(operation.threadId, 'thread') &&
      (operation.parentId === null || isRef(operation.parentId, 'beat'))
    );
  }
  return isRef(operation.beatId, 'beat') && isRef(operation.eventId, 'event');
};

const isStoryMaintenanceChange = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const { clientRef, ...operation } = value;
  if (!isAgentStoryOperation(operation, true)) return false;
  if (clientRef === undefined) return true;
  return operation.operation !== 'link_beat_event' && isStoryClientRef(clientRef);
};

const STORY_OPERATION_FIELDS: Record<string, {
  optional?: string[];
  required: string[];
}> = {
  create_beat: {
    optional: ['dramaticPurpose', 'desiredOutcome'],
    required: [
      'operation',
      'threadId',
      'parentId',
      'kind',
      'title',
      'description',
      'status',
      'orderKey',
    ],
  },
  create_event: {
    optional: ['causes', 'consequences', 'sources'],
    required: [
      'operation',
      'timelineId',
      'startMomentId',
      'endMomentId',
      'title',
      'summary',
      'status',
      'participants',
    ],
  },
  create_moment: {
    required: [
      'operation',
      'timelineId',
      'displayTime',
      'precision',
      'orderKey',
      'note',
    ],
  },
  create_persona: { required: ['operation', 'name', 'role', 'summary'] },
  create_thread: {
    required: [
      'operation',
      'parentId',
      'title',
      'summary',
      'status',
      'orderKey',
    ],
  },
  create_timeline: { required: ['operation', 'title', 'summary', 'isPrimary'] },
  link_beat_event: { required: ['operation', 'beatId', 'eventId', 'relation'] },
};

const isStoryId = (value: unknown): boolean =>
  isStableStoryId(value) || isStoryClientReferenceUse(value);

const isStoryThreadStatus = (value: unknown): boolean =>
  typeof value === 'string' &&
  ['planned', 'active', 'resolved', 'abandoned'].includes(value);

const isBoundedStoryText = (
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): boolean =>
  typeof value === 'string' &&
  value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0) &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const storyParticipantsError = (
  value: unknown,
  path: string,
): string | undefined => {
  if (!Array.isArray(value) || value.length > 100) {
    return `${path} must be an array of at most 100 participants.`;
  }
  for (const [index, participant] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (
      typeof participant !== 'object' ||
      participant === null ||
      Array.isArray(participant)
    ) {
      return `${itemPath} must be an object.`;
    }
    const item = participant as Record<string, unknown>;
    const keys = Object.keys(item);
    if (
      keys.length !== 3 ||
      keys.some((key) => !['description', 'personaId', 'role'].includes(key))
    ) {
      return `${itemPath} requires exactly description, personaId, and role.`;
    }
    if (!isStoryId(item.personaId)) {
      return `${itemPath}.personaId must be a stable ID from STORY.json or compatible earlier @clientRef.`;
    }
    if (!['actor', 'target', 'witness', 'affected'].includes(item.role as string)) {
      return `${itemPath}.role is invalid.`;
    }
    if (!isBoundedStoryText(item.description, 10_000, true)) {
      return `${itemPath}.description must be a string of at most 10000 characters.`;
    }
  }
  return undefined;
};

const storySourcesError = (
  value: unknown,
  path: string,
): string | undefined => {
  if (!Array.isArray(value) || value.length > 100) {
    return `${path} must be an array of at most 100 manuscript sources.`;
  }
  for (const [index, source] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return `${itemPath} must be an object.`;
    }
    const item = source as Record<string, unknown>;
    const keys = Object.keys(item);
    if (
      keys.length !== 4 ||
      keys.some((key) =>
        !['anchor', 'documentPath', 'relation', 'sourceKind'].includes(key))
    ) {
      return `${itemPath} requires exactly anchor, documentPath, relation, and sourceKind.`;
    }
    if (item.anchor !== null && !isBoundedStoryText(item.anchor, 10_000, true)) {
      return `${itemPath}.anchor must be null or a string of at most 10000 characters.`;
    }
    if (!isProjectPath(item.documentPath)) return `${itemPath}.documentPath is invalid.`;
    if (!['depicted', 'mentioned', 'inferred'].includes(item.relation as string)) {
      return `${itemPath}.relation is invalid.`;
    }
    if (item.sourceKind !== 'manuscript') {
      return `${itemPath}.sourceKind must be manuscript.`;
    }
  }
  return undefined;
};

const storyWirePath = (path: string, operation: string, field: string): string =>
  field !== 'status'
    ? `${path}.${field}`
    : operation === 'create_event'
      ? `${path}.eventStatus`
      : `${path}.threadStatus`;

const storyOperationValueError = (
  change: Record<string, unknown>,
  path: string,
  operation: string,
): string => {
  const text = (field: string, max: number, allowEmpty: boolean): string | undefined =>
    isBoundedStoryText(change[field], max, allowEmpty)
      ? undefined
      : `${path}.${field} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${max} characters.`;
  const id = (field: string, nullable = false): string | undefined =>
    (nullable && change[field] === null) || isStoryId(change[field])
      ? undefined
      : `${path}.${field} must be ${nullable ? 'null or ' : ''}a stable ID from STORY.json or compatible earlier @clientRef.`;
  const integer = (field: string): string | undefined =>
    Number.isSafeInteger(change[field])
      ? undefined
      : `${path}.${field} must be an integer.`;
  let checks: Array<string | undefined>;
  switch (operation) {
    case 'create_persona':
      checks = [
        text('name', 500, false),
        change.role === null ? undefined : text('role', 500, true),
        text('summary', 20_000, true),
      ];
      break;
    case 'create_timeline':
      checks = [
        text('title', 500, false),
        text('summary', 20_000, true),
        typeof change.isPrimary === 'boolean'
          ? undefined
          : `${path}.isPrimary must be a boolean.`,
      ];
      break;
    case 'create_moment':
      checks = [
        id('timelineId'),
        text('displayTime', 500, false),
        ['exact', 'day', 'month', 'season', 'approximate', 'unknown']
          .includes(change.precision as string)
          ? undefined
          : `${path}.precision is invalid.`,
        integer('orderKey'),
        text('note', 10_000, true),
      ];
      break;
    case 'create_event':
      checks = [
        id('timelineId'),
        id('startMomentId'),
        id('endMomentId', true),
        text('title', 500, false),
        text('summary', 30_000, true),
        change.status === 'planned' || change.status === 'established'
          ? undefined
          : `${path}.eventStatus must be planned or established.`,
        text('causes', 20_000, true),
        text('consequences', 20_000, true),
        storyParticipantsError(change.participants, `${path}.participants`),
        change.sources === undefined
          ? undefined
          : storySourcesError(change.sources, `${path}.sources`),
      ];
      break;
    case 'create_thread':
      checks = [
        id('parentId', true),
        text('title', 500, false),
        text('summary', 20_000, true),
        isStoryThreadStatus(change.status)
          ? undefined
          : `${path}.threadStatus must be planned, active, resolved, or abandoned.`,
        integer('orderKey'),
      ];
      break;
    case 'create_beat':
      checks = [
        id('threadId'),
        id('parentId', true),
        ['beat', 'setup', 'turning_point', 'climax', 'resolution']
          .includes(change.kind as string)
          ? undefined
          : `${path}.kind is invalid.`,
        text('title', 500, false),
        text('description', 30_000, true),
        isStoryThreadStatus(change.status)
          ? undefined
          : `${path}.threadStatus must be planned, active, resolved, or abandoned.`,
        integer('orderKey'),
        text('dramaticPurpose', 10_000, true),
        text('desiredOutcome', 10_000, true),
      ];
      break;
    default:
      checks = [
        id('beatId'),
        id('eventId'),
        ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves']
          .includes(change.relation as string)
          ? undefined
          : `${path}.relation is invalid.`,
      ];
  }
  return checks.find((error) => error !== undefined) ??
    `${path} contains invalid nested values for ${operation}.`;
};

const storyOperationArgumentError = (
  value: unknown,
  path: string,
  allowClientRef: boolean,
): string | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `${path} must be an object.`;
  }
  const change = value as Record<string, unknown>;
  const operation = change.operation;
  if (typeof operation !== 'string' || STORY_OPERATION_FIELDS[operation] === undefined) {
    return `${path}.operation must be a supported story operation.`;
  }
  const clientRef = change.clientRef;
  if (clientRef !== undefined) {
    if (!allowClientRef || operation === 'link_beat_event') {
      return `${path}.clientRef is valid only on Maintain create operations.`;
    }
    if (typeof clientRef !== 'string' || !isStoryClientRef(clientRef)) {
      return `${path}.clientRef must start with a letter and contain at most 32 letters, digits, underscores, or hyphens.`;
    }
  }
  const { optional = [], required } = STORY_OPERATION_FIELDS[operation];
  const allowed = new Set([
    ...required,
    ...optional,
    ...(allowClientRef ? ['clientRef'] : []),
  ]);
  const unexpected = Object.keys(change).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    return `${path}.${unexpected} is not valid for ${operation}.`;
  }
  const missing = required.find((key) => change[key] === undefined);
  if (missing !== undefined) {
    return `${storyWirePath(path, operation, missing)} is required for ${operation}.`;
  }
  const { clientRef: _clientRef, ...operationFields } = change;
  if (isAgentStoryOperation(operationFields, allowClientRef)) return undefined;
  return storyOperationValueError(operationFields, path, operation);
};

const issueProjectBash = (value: unknown): string | undefined => {
  if (!Check(PROJECT_BASH_PARAMETERS, value)) return '';
  const command = (value as { command: string }).command;
  return command.trim().length > 0 && !containsUnsafeTextControl(command)
    ? undefined
    : '';
};

const issueWritingArtifact = (value: unknown): string | undefined => {
  if (Check(WRITING_ARTIFACT_SUBMISSION_PARAMETERS, value) &&
    isNonEmptyMarkdown((value as { markdown: unknown }).markdown)) return undefined;
  return '';
};

const issueDocumentEdit = (value: unknown): string | undefined => {
  if (Check(DOCUMENT_EDIT_PARAMETERS, value) &&
    isNonEmptyMarkdown((value as { markdown: unknown }).markdown)) return undefined;
  return 'propose_document_edit requires exactly documentPath and markdown. Use the exact project-relative path shown by Bash.';
};

const issueDocumentWriting = (value: unknown): string | undefined => {
  if (Check(DOCUMENT_WRITING_PARAMETERS, value)) {
    const args = value as Record<string, unknown>;
    const proseIsValid = isBoundedText(args.objective, 4_000, false) &&
      (args.requirements as unknown[]).every((requirement) =>
        isBoundedText(requirement, 1_000, false));
    const targetIsValid = args.documentAction === 'create'
      ? args.documentPath === null && isValidMetadataTitle(args.metadataTitle) &&
        args.parentPath !== null && args.kind !== null
      : args.documentPath !== null && args.kind === null &&
        args.metadataTitle === null && args.parentPath === null;
    if (proseIsValid && targetIsValid) return undefined;
  }
  return 'propose_document_writing requires exactly 9 fields: documentAction, documentDomain, objective, requirements, targetLength, documentPath, parentPath, metadataTitle, and kind. For create, set documentPath null and provide parentPath/metadataTitle/kind. For replace, provide documentPath and set parentPath/metadataTitle/kind null.';
};

const issueDocumentFileOperation = (value: unknown): string | undefined => {
  if (!Check(DOCUMENT_FILE_OPERATION_PARAMETERS, value)) return '';
  const args = value as Record<string, unknown>;
  if (args.operation === 'create') {
    if (hasExactKeys(args, ['operation', 'parentPath', 'metadataTitle', 'kind', 'markdown']) &&
      isValidMetadataTitle(args.metadataTitle) &&
      isNonEmptyMarkdown(args.markdown)) return undefined;
    return 'Document creation requires exactly operation, parentPath, metadataTitle, kind, and markdown.';
  }
  return hasExactKeys(args, ['operation', 'documentPath']) ? undefined : '';
};

const issueProjectStructureOperation = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return 'propose_project_structure_operation requires one operation object.';
  }
  const args = value;
  const operationKeys = {
    create_volume: ['operation', 'title'],
    create_lore_category: ['operation', 'title', 'icon'],
    delete_lore_category: ['operation', 'directoryPath'],
    set_lore_category_icon: ['operation', 'directoryPath', 'icon'],
    move_document: ['operation', 'documentPath', 'targetParentPath'],
    rename_document: ['operation', 'documentPath', 'metadataTitle'],
  } as const;
  const expectedKeys = operationKeys[
    args.operation as keyof typeof operationKeys
  ];
  if (expectedKeys === undefined) {
    return 'operation must be create_volume, create_lore_category, delete_lore_category, set_lore_category_icon, move_document, or rename_document.';
  }
  const expectedDescription = expectedKeys.join(', ');
  const unexpected = Object.keys(args).filter((key) =>
    !(expectedKeys as readonly string[]).includes(key));
  if (unexpected.length > 0) {
    const createTargetHint = args.operation === 'create_lore_category'
      ? ' The Lore root is implicit; do not pass directoryPath or parentPath.'
      : args.operation === 'create_volume'
        ? ' The Manuscript root is implicit; do not pass directoryPath or parentPath.'
        : '';
    return `${String(args.operation)} accepts exactly ${expectedDescription}. Remove unsupported ${unexpected.join(', ')}.${createTargetHint}`;
  }
  const missing = expectedKeys.filter((key) => !(key in args));
  if (missing.length > 0) {
    return `${String(args.operation)} requires exactly ${expectedDescription}. Missing ${missing.join(', ')}.`;
  }
  if (!Check(PROJECT_STRUCTURE_OPERATION_PARAMETERS, value)) {
    return `${String(args.operation)} contains an invalid field value; use exact Bash paths and bounded text.`;
  }
  const titleIsValid = args.title === undefined || isValidMetadataTitle(args.title);
  const iconIsValid = ![
    'create_lore_category',
    'set_lore_category_icon',
  ].includes(args.operation as string) ||
    isProjectIconId(args.icon);
  if (!titleIsValid) return `${String(args.operation)} title must be non-empty.`;
  if (!iconIsValid) {
    return `${String(args.operation)} icon must be an exact name from ICONS.txt.`;
  }
  return undefined;
};

const issueStoryOperation = (value: unknown): string | undefined => {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    return storyOperationArgumentError(
      isRecord(value) ? value.change : undefined,
      'change',
      false,
    ) ?? 'propose_story_operation requires exactly one change object.';
  }
  return storyOperationArgumentError(value.change, 'change', false);
};

const issueStoryMaintenance = (value: unknown): string | undefined => {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    return 'changes must be an array of 1 to 24 operations.';
  }
  const changes = value.changes;
  if (!Array.isArray(changes)) {
    return 'changes must be an array of 1 to 24 operations.';
  }
  if (
    changes.length >= 1 &&
    changes.length <= 24 &&
    changes.every(isStoryMaintenanceChange)
  ) return undefined;
  for (const [index, change] of changes.entries()) {
    const error = storyOperationArgumentError(change, `changes[${index}]`, true);
    if (error !== undefined) return error;
  }
  return 'changes must be an array of 1 to 24 operations.';
};

const issueReconciliationCompletion = (value: unknown): string | undefined => {
  if (Check(STORY_RECONCILIATION_COMPLETION_PARAMETERS, value) &&
    isBoundedText((value as { reason: unknown }).reason, 2_000, false)) return undefined;
  return 'complete_story_reconciliation requires exactly status and reason. Inspect ACCEPTED.md and STORY.json with Bash after acceptance first. Use applied only after a successful reconciliation mutation, questions_recorded only after recording a question, or no_changes only when neither occurred.';
};

const issueAcceptedReconciliation = (value: unknown): string | undefined => {
  const hint = 'reconcile_accepted_document requires events, newPersonae, newThreads, and threadAdvances, plus optional primaryTimeline only when STORY.json has none. Existing participants and Threads use stable IDs from STORY.json; new Personae use @clientRef in the same call.';
  if (!Check(ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS, value)) return hint;
  const args = value as AgentAcceptedDocumentReconciliationArguments;
  const requiredText = [
    ...args.events.flatMap((event) => [event.displayTime, event.title]),
    ...args.newPersonae.map((persona) => persona.name),
    ...args.newThreads.flatMap((thread) => [thread.title, thread.beat.title]),
    ...(args.primaryTimeline === undefined ? [] : [args.primaryTimeline.title]),
    ...args.threadAdvances.map((advance) => advance.title),
  ];
  const clientRefs = args.newPersonae.map((persona) => persona.clientRef);
  return requiredText.every((text) => text.trim().length > 0) &&
      new Set(clientRefs).size === clientRefs.length &&
      !containsUnsafeTextControl(value)
    ? undefined
    : hint;
};

const issueStoryQuestion = (value: unknown): string | undefined => {
  if (Check(STORY_QUESTION_PARAMETERS, value)) {
    const args = value as Record<string, unknown>;
    const evidence = args.evidence as Record<string, unknown> | null;
    if (isBoundedText(args.question, 2_000, false) &&
      isBoundedText(args.context, 10_000, true) &&
      (args.options as unknown[]).every((option) =>
        isBoundedText(option, 500, false)) &&
      (evidence === null || isBoundedText(evidence.anchor, 10_000, false))) {
      return undefined;
    }
  }
  return '';
};

const issueResolveStoryQuestion = (value: unknown): string | undefined => {
  if (Check(RESOLVE_STORY_QUESTION_PARAMETERS, value) &&
    isBoundedText((value as { answer: unknown }).answer, 2_000, false)) return undefined;
  return '';
};

const AGENT_TOOL_ARGUMENT_ISSUES = {
  bash: issueProjectBash,
  submit_writing_artifact: issueWritingArtifact,
  maintain_story_records: issueStoryMaintenance,
  complete_story_reconciliation: issueReconciliationCompletion,
  reconcile_accepted_document: issueAcceptedReconciliation,
  record_story_question: issueStoryQuestion,
  resolve_story_question: issueResolveStoryQuestion,
  propose_document_edit: issueDocumentEdit,
  propose_document_writing: issueDocumentWriting,
  propose_document_file_operation: issueDocumentFileOperation,
  propose_project_structure_operation: issueProjectStructureOperation,
  propose_story_operation: issueStoryOperation,
} as const satisfies Record<AgentToolName, (value: unknown) => string | undefined>;

const AGENT_TOOL_RUNTIME_SCHEMAS = {
  bash: guarded(
    PROJECT_BASH_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.bash,
  ),
  submit_writing_artifact: guarded(
    WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.submit_writing_artifact,
  ),
  maintain_story_records: guarded(
    Type.Object({
      changes: Type.Array(NORMALIZED_STORY_MAINTENANCE_CHANGE_PARAMETERS, {
        maxItems: 24,
        minItems: 1,
      }),
    }, { additionalProperties: false }),
    AGENT_TOOL_ARGUMENT_ISSUES.maintain_story_records,
  ),
  complete_story_reconciliation: guarded(
    STORY_RECONCILIATION_COMPLETION_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.complete_story_reconciliation,
  ),
  reconcile_accepted_document: guarded(
    ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.reconcile_accepted_document,
  ),
  record_story_question: guarded(
    STORY_QUESTION_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.record_story_question,
  ),
  resolve_story_question: guarded(
    RESOLVE_STORY_QUESTION_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.resolve_story_question,
  ),
  propose_document_edit: guarded(
    DOCUMENT_EDIT_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.propose_document_edit,
  ),
  propose_document_writing: guarded(
    DOCUMENT_WRITING_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.propose_document_writing,
  ),
  propose_document_file_operation: guarded(
    DOCUMENT_FILE_OPERATION_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.propose_document_file_operation,
  ),
  propose_project_structure_operation: guarded(
    PROJECT_STRUCTURE_OPERATION_PARAMETERS,
    AGENT_TOOL_ARGUMENT_ISSUES.propose_project_structure_operation,
  ),
  propose_story_operation: guarded(
    Type.Object(
      { change: NORMALIZED_STORY_CHANGE_PARAMETERS },
      { additionalProperties: false },
    ),
    AGENT_TOOL_ARGUMENT_ISSUES.propose_story_operation,
  ),
} as const satisfies Record<AgentToolName, object>;

export const isAgentToolArguments = <Name extends AgentToolName>(
  toolName: Name,
  value: unknown,
): value is AgentToolContractMap[Name]['arguments'] =>
  Check(AGENT_TOOL_RUNTIME_SCHEMAS[toolName], value);

export const agentToolArgumentHint = (
  toolName: AgentToolName,
  args: unknown,
): string | undefined => {
  if (Check(AGENT_TOOL_RUNTIME_SCHEMAS[toolName], args)) return undefined;
  const hint = AGENT_TOOL_ARGUMENT_ISSUES[toolName](args);
  return hint === '' ? undefined : hint;
};
