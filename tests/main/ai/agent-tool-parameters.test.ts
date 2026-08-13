import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  DOCUMENT_EDIT_PARAMETERS,
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  DOCUMENT_WRITING_PARAMETERS,
  normalizeStoryMaintenanceBatchArguments,
  normalizeStoryMaintenanceArguments,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  STORY_MAINTENANCE_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
  STORY_QUESTION_PARAMETERS,
  WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
} from '../../../src/main/ai/agent-tool-parameters';

describe('Agent tool parameter schemas', () => {
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

  it('requires direct Markdown and request-scoped refs for document edits', () => {
    const schema = DOCUMENT_EDIT_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.required).toEqual(['documentId', 'markdown']);
    expect(properties.documentId).toMatchObject({
      pattern: '^document:[1-9][0-9]{0,4}$',
      type: 'string',
    });
    expect(properties.markdown).toMatchObject({ type: 'string' });
  });

  it('defines one provider-compatible pre-bound generated-document proposal', () => {
    const schema = DOCUMENT_WRITING_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.type).toBe('object');
    expect(schema.required).toEqual([
      'documentAction',
      'documentDomain',
      'documentId',
      'kind',
      'metadataTitle',
      'objective',
      'parentId',
      'requirements',
      'targetLength',
    ]);
    expect(properties.documentAction.description).toContain('new chapter');
    expect(properties.documentId.description).toContain('continuity-reference');
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('Revision');
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
    expect(schema.required).toEqual(['operation']);
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
    expect(properties.markdown).toMatchObject({ type: 'string' });
    expect(properties.metadataTitle.description).toContain('raw document metadata title');
    expect(properties.parentId).toMatchObject({
      pattern: '^directory:[1-9][0-9]{0,4}$',
    });
    expect(JSON.stringify(schema)).not.toContain('anyOf');
    expect(JSON.stringify(schema)).not.toContain('const');
    expect(JSON.stringify(schema)).not.toContain('Revision');
  });

  it('uses a provider-compatible root object for project structure operations', () => {
    const schema = PROJECT_STRUCTURE_OPERATION_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['operation']);
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
    expect(JSON.stringify(schema)).not.toContain('Revision');
  });

  it('uses a provider-compatible root object for story operations', () => {
    const schema = STORY_OPERATION_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const change = properties.change as Record<string, unknown>;
    const changeProperties = change.properties as Record<string, Record<string, unknown>>;
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['change']);
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
    expect(JSON.stringify(changeProperties.sources))
      .not.toContain('documentRevision');
    expect(changeProperties.timelineId).toMatchObject({
      pattern: '^timeline:[1-9][0-9]{0,4}$',
    });
    expect(changeProperties.startMomentId).toMatchObject({
      pattern: '^moment:[1-9][0-9]{0,4}$',
    });
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
      pattern: '^[A-Za-z][A-Za-z0-9_-]{0,31}$',
      type: 'string',
    });
    expect(changeProperties.startMomentId.description).toContain('@clientRef');
    expect(changeProperties.startMomentId).toMatchObject({
      pattern:
        '^(?:moment:[1-9][0-9]{0,4}|@[A-Za-z][A-Za-z0-9_-]{0,31})$',
    });
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
    expect(properties.newPersonae).toMatchObject({ maxItems: 6 });
    expect(properties.newThreads).toMatchObject({ maxItems: 2 });
    expect(advances).toMatchObject({ maxItems: 4 });
    expect(JSON.stringify(eventProperties.participants)).toContain('personaRef');
    expect(JSON.stringify(eventProperties.participants)).toContain('persona:[1-9]');
    expect(JSON.stringify(properties.newPersonae)).toContain('clientRef');
    expect(JSON.stringify(properties.primaryTimeline)).toContain('Main creates');
    expect(JSON.stringify(advances)).toContain('threadRef');
    expect(JSON.stringify(advances)).toContain('^thread:[1-9]');
    expect(JSON.stringify(schema)).not.toContain('storyRevision');
    expect(JSON.stringify(schema)).not.toContain('documentId');
    expect(JSON.stringify(schema)).not.toContain('orderKey');
  });

  it('takes one provider-compatible evidence shape without a revision', () => {
    const schema = STORY_QUESTION_PARAMETERS as unknown as {
      properties: { evidence: Record<string, unknown> };
    };
    const evidence = schema.properties.evidence;

    expect(evidence.type).toEqual(['object', 'null']);
    expect(evidence.required).toEqual(['anchor', 'documentId']);
    expect(evidence).not.toHaveProperty('anyOf');
    expect(
      (evidence.properties as Record<string, Record<string, unknown>>).documentId,
    ).toMatchObject({
      pattern: '^(?:document:[1-9][0-9]{0,4}|document:accepted)$',
    });
    expect(JSON.stringify(evidence)).not.toContain('documentRevision');
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
    })).toEqual({
      changes: [
        {
          clientRef: 'arrival',
          displayTime: 'Late spring',
          note: '',
          operation: 'create_moment',
          orderKey: 1,
          precision: 'season',
          timelineId: 'timeline-1',
        },
        {
          causes: '',
          consequences: '',
          endMomentId: null,
          operation: 'create_event',
          participants: [],
          startMomentId: '@arrival',
          status: 'established',
          summary: '',
          timelineId: 'timeline-1',
          title: 'Arrival',
        },
      ],
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
    }).change).toMatchObject({ desiredOutcome: '', dramaticPurpose: '' });
  });
});
