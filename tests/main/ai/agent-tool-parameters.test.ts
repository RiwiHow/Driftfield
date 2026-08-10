import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  normalizeStoryMaintenanceArguments,
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
    expect(changeProperties).not.toHaveProperty('status');
    expect(changeProperties.eventStatus).toMatchObject({
      enum: ['planned', 'established'],
      type: 'string',
    });
    expect(changeProperties.threadStatus).toMatchObject({
      enum: ['planned', 'active', 'resolved', 'abandoned'],
      type: 'string',
    });
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('const');
  });

  it('normalizes operation-specific wire statuses to canonical story operations', () => {
    expect(normalizeStoryMaintenanceArguments({
      change: {
        description: '',
        desiredOutcome: '',
        dramaticPurpose: '',
        kind: 'setup',
        operation: 'create_beat',
        orderKey: 1,
        parentId: null,
        threadId: 'thread-1',
        threadStatus: 'active',
        title: 'Opening encounter',
      },
      storyRevision: 6,
    })).toEqual({
      change: {
        description: '',
        desiredOutcome: '',
        dramaticPurpose: '',
        kind: 'setup',
        operation: 'create_beat',
        orderKey: 1,
        parentId: null,
        status: 'active',
        threadId: 'thread-1',
        title: 'Opening encounter',
      },
      storyRevision: 6,
    });

    expect(normalizeStoryMaintenanceArguments({
      change: {
        causes: '',
        consequences: '',
        endMomentId: null,
        eventStatus: 'established',
        operation: 'create_event',
        participants: [],
        startMomentId: 'moment-1',
        summary: '',
        timelineId: 'timeline-1',
        title: 'Arrival',
      },
      storyRevision: 2,
    }).change).toMatchObject({
      operation: 'create_event',
      status: 'established',
    });
  });
});
