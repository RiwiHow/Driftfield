import { Type } from 'typebox';

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
