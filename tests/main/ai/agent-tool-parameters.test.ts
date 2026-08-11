import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  DOCUMENT_EDIT_PARAMETERS,
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  normalizeStoryMaintenanceBatchArguments,
  normalizeStoryMaintenanceArguments,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  STORY_MAINTENANCE_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
  STORY_QUESTION_PARAMETERS,
  WRITING_ARTIFACT_REVISION_PARAMETERS,
  WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
  WRITING_ASSIGNMENT_PARAMETERS,
} from '../../../src/main/ai/agent-tool-parameters';

describe('Agent tool parameter schemas', () => {
  it('defines bounded exact Scribe artifact replacements', () => {
    const schema = WRITING_ARTIFACT_REVISION_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.required).toEqual(['replacements', 'writingAssignmentId']);
    expect(properties.replacements).toMatchObject({ maxItems: 12, minItems: 1 });
    expect(JSON.stringify(properties.replacements)).toContain('expectedOccurrences');
    expect(JSON.stringify(properties.replacements)).toContain('entire revision is rejected');
  });

  it('defines a bounded terminal Scribe artifact submission', () => {
    const schema = WRITING_ARTIFACT_SUBMISSION_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.required).toEqual(['markdown']);
    expect(properties.markdown).toMatchObject({
      description: expect.stringContaining('Exclude planning, commentary'),
      maxLength: 512 * 1024,
      minLength: 1,
      type: 'string',
    });
  });

  it('supports direct Markdown or a Scribe assignment for document edits', () => {
    const schema = DOCUMENT_EDIT_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.required).toEqual([
      'baseContentRevision',
      'baseRevision',
      'documentId',
      'markdown',
      'writingAssignmentId',
    ]);
    expect(properties.markdown).toMatchObject({ type: ['string', 'null'] });
    expect(properties.writingAssignmentId).toMatchObject({
      description: expect.stringContaining('assignmentId returned by delegate_writing'),
      type: ['string', 'null'],
    });
  });

  it('explains nullable new-document writing targets to providers', () => {
    const schema = WRITING_ASSIGNMENT_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.required).toEqual([
      'objective',
      'requirements',
      'targetDocumentId',
      'targetLength',
    ]);
    expect(properties.targetDocumentId).toMatchObject({
      description: expect.stringContaining('For a new document that does not exist yet, use null'),
      type: ['string', 'null'],
    });
    expect(properties.targetLength).toMatchObject({
      description: expect.stringContaining('otherwise use null'),
      type: ['integer', 'null'],
    });
  });

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
    expect(properties.markdown).toMatchObject({ type: ['string', 'null'] });
    expect(properties.metadataTitle.description).toContain('raw document metadata title');
    expect(properties.writingAssignmentId).toMatchObject({ type: ['string', 'null'] });
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('const');
  });

  it('uses a provider-compatible root object for project structure operations', () => {
    const schema = PROJECT_STRUCTURE_OPERATION_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['operation', 'projectRevision']);
    expect(properties.operation).toMatchObject({
      enum: [
        'create_volume',
        'create_lore_category',
        'delete_lore_category',
        'move_document',
        'rename_document',
      ],
      type: 'string',
    });
    expect(properties.icon).toMatchObject({
      enum: expect.arrayContaining(['earth', 'map', 'users']),
      type: 'string',
    });
    expect(properties.metadataTitle.description).toContain('rename_document');
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
    expect(changeProperties.sources).toMatchObject({ type: 'array' });
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('const');
  });

  it('advertises ordered local references for atomic story maintenance', () => {
    const schema = STORY_MAINTENANCE_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const changes = properties.changes;
    const change = changes.items as Record<string, unknown>;
    const changeProperties = change.properties as Record<string, Record<string, unknown>>;

    expect(changes.description).toContain('clientRef');
    expect(changeProperties.clientRef).toMatchObject({
      pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
      type: 'string',
    });
    expect(changeProperties.startMomentId.description).toContain('@clientRef');
    expect(changeProperties.participants).toMatchObject({ type: 'array' });
    expect(changeProperties.operation.description).toContain('one exact change shape');
  });

  it('defines UUID-free accepted-document reconciliation inputs', () => {
    const schema = ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS as unknown as
      Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const event = properties.events.items as Record<string, unknown>;
    const eventProperties = event.properties as Record<string, unknown>;
    const advances = properties.threadAdvances;

    expect(properties.events).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(advances).toMatchObject({ maxItems: 11 });
    expect(JSON.stringify(eventProperties.participants)).toContain('personaRef');
    expect(JSON.stringify(advances)).toContain('threadRef');
    expect(JSON.stringify(schema)).not.toContain('storyRevision');
    expect(JSON.stringify(schema)).not.toContain('documentId');
    expect(JSON.stringify(schema)).not.toContain('orderKey');
  });

  it('allows accepted-document question evidence without its ID or revision', () => {
    const schema = STORY_QUESTION_PARAMETERS as unknown as {
      properties: { evidence: { anyOf: unknown[] } };
    };

    expect(JSON.stringify(schema.properties.evidence.anyOf)).toContain(
      'document:accepted',
    );
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

    expect(normalizeStoryMaintenanceBatchArguments({
      changes: [{
        clientRef: 'arrival',
        displayTime: 'Late spring',
        note: '',
        operation: 'create_moment',
        orderKey: 1,
        precision: 'season',
        timelineId: 'timeline-1',
      }, {
        causes: '',
        consequences: '',
        endMomentId: null,
        eventStatus: 'established',
        operation: 'create_event',
        participants: [],
        startMomentId: '@arrival',
        summary: '',
        timelineId: 'timeline-1',
        title: 'Arrival',
      }],
      storyRevision: 2,
    })).toMatchObject({
      changes: [
        { clientRef: 'arrival', operation: 'create_moment' },
        { operation: 'create_event', startMomentId: '@arrival', status: 'established' },
      ],
      storyRevision: 2,
    });
  });

  it('defaults optional event and beat prose instead of requiring invented text', () => {
    expect(normalizeStoryMaintenanceArguments({
      change: {
        endMomentId: null,
        eventStatus: 'established',
        operation: 'create_event',
        participants: [],
        startMomentId: 'moment-1',
        summary: 'A clue appears.',
        timelineId: 'timeline-1',
        title: 'Clue',
      },
      storyRevision: 1,
    }).change).toMatchObject({ causes: '', consequences: '' });

    expect(normalizeStoryMaintenanceArguments({
      change: {
        description: 'The investigation turns.',
        kind: 'turning_point',
        operation: 'create_beat',
        orderKey: 2,
        parentId: null,
        threadId: 'thread-1',
        threadStatus: 'active',
        title: 'Turn back',
      },
      storyRevision: 1,
    }).change).toMatchObject({ desiredOutcome: '', dramaticPurpose: '' });
  });
});
