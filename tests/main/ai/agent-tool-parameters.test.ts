import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
} from '../../../src/main/ai/agent-tool-parameters';

describe('Agent tool parameter schemas', () => {
  it('uses a provider-compatible root object for document file operations', () => {
    const schema = DOCUMENT_FILE_OPERATION_PARAMETERS as unknown as Record<
      string,
      unknown
    >;
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(schema.type).toBe('object');
    expect(schema).not.toHaveProperty('anyOf');
    expect(schema.required).toEqual(['operation', 'projectRevision']);
    expect(properties.operation).toMatchObject({
      enum: ['create', 'delete'],
      type: 'string',
    });
    expect(properties.kind).toMatchObject({
      enum: [
        'chapter',
        'prologue',
        'interlude',
        'epilogue',
        'appendix',
        'entry',
      ],
      type: 'string',
    });
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('const');
  });

  it('uses a provider-compatible root object for project structure operations', () => {
    const schema = PROJECT_STRUCTURE_OPERATION_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['operation', 'projectRevision']);
    expect(properties.operation).toMatchObject({
      enum: ['create_volume', 'create_lore_category', 'move_document'],
      type: 'string',
    });
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('const');
  });

  it('uses a provider-compatible root object for story operations', () => {
    const schema = STORY_OPERATION_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const change = properties.change as Record<string, unknown>;
    const changeProperties = change.properties as Record<string, Record<string, unknown>>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['change', 'storyRevision']);
    expect(changeProperties.operation).toMatchObject({
      enum: [
        'create_persona',
        'create_timeline',
        'create_moment',
        'create_event',
        'create_thread',
        'create_beat',
        'link_beat_event',
      ],
      type: 'string',
    });
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('const');
  });
});
