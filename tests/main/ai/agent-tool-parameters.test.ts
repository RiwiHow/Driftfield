import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  DOCUMENT_EDIT_PARAMETERS,
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  DOCUMENT_WRITING_PARAMETERS,
  NOVEL_CONTEXT_PARAMETERS,
  normalizeStoryMaintenanceBatchArguments,
  normalizeStoryMaintenanceArguments,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  RESOLVE_STORY_QUESTION_PARAMETERS,
  STORY_MAINTENANCE_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
  STORY_QUESTION_PARAMETERS,
  STORY_RECONCILIATION_COMPLETION_PARAMETERS,
  WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
} from '../../../src/main/ai/agent-tool-parameters';
import {
  AGENT_TOOL_NAMES,
  agentToolArgumentHint,
  isAgentToolArguments,
} from '../../../src/shared/contracts/agent-tools';
import type { AgentToolName } from '../../../src/shared/contracts/agent-tools';

describe('Agent tool parameter schemas', () => {
  it('defines a bounded optional Lucide icon search', () => {
    const schema = NOVEL_CONTEXT_PARAMETERS as unknown as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.required).toEqual(['directoryIds', 'documentIds', 'include']);
    expect(properties.iconQuery).toMatchObject({
      maxLength: 120,
      minLength: 1,
      type: 'string',
    });
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
      description: expect.stringContaining('Lore root'),
      enum: [
        'create_volume',
        'create_lore_category',
        'delete_lore_category',
        'set_lore_category_icon',
        'move_document',
        'rename_document',
      ],
      type: 'string',
    });
    expect(properties.icon).toMatchObject({
      maxLength: 35,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      type: 'string',
    });
    expect(properties.icon).not.toHaveProperty('enum');
    expect(properties.directoryId.description).toContain(
      'Never send directoryId when creating',
    );
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

describe('Agent tool argument schema unification', () => {
  const modelSchemas = {
    read_novel_context: NOVEL_CONTEXT_PARAMETERS,
    submit_writing_artifact: WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
    maintain_story_records: STORY_MAINTENANCE_PARAMETERS,
    complete_story_reconciliation: STORY_RECONCILIATION_COMPLETION_PARAMETERS,
    reconcile_accepted_document: ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
    record_story_question: STORY_QUESTION_PARAMETERS,
    resolve_story_question: RESOLVE_STORY_QUESTION_PARAMETERS,
    propose_document_edit: DOCUMENT_EDIT_PARAMETERS,
    propose_document_writing: DOCUMENT_WRITING_PARAMETERS,
    propose_document_file_operation: DOCUMENT_FILE_OPERATION_PARAMETERS,
    propose_project_structure_operation: PROJECT_STRUCTURE_OPERATION_PARAMETERS,
    propose_story_operation: STORY_OPERATION_PARAMETERS,
  };

  it('ships every tool schema without Refine functions or union variants', () => {
    expect(Object.keys(modelSchemas)).toEqual([...AGENT_TOOL_NAMES]);
    for (const schema of Object.values(modelSchemas)) {
      const serialized = JSON.stringify(schema);
      expect(serialized).not.toContain('~refine');
      expect(serialized).not.toContain('anyOf');
      expect(serialized).not.toContain('"const"');
    }
  });

  it('uses the same runtime schema for the Main guard and recovery hints', () => {
    expect(isAgentToolArguments('propose_document_edit', {
      documentId: 'chapter-1',
      markdown: null,
    })).toBe(false);
    expect(agentToolArgumentHint('propose_document_edit', {
      documentId: 'chapter-1',
      markdown: null,
    })).toContain('Generated Scribe prose uses propose_document_writing');

    expect(isAgentToolArguments('propose_story_operation', {
      change: {
        description: 'Wrong generic field',
        name: 'Imperial calendar',
        note: '',
        operation: 'create_timeline',
        title: 'Imperial calendar',
      },
    })).toBe(false);
    expect(agentToolArgumentHint('propose_story_operation', {
      change: {
        description: 'Wrong generic field',
        name: 'Imperial calendar',
        note: '',
        operation: 'create_timeline',
        title: 'Imperial calendar',
      },
    })).toBe('change.description is not valid for create_timeline.');
    expect(agentToolArgumentHint('propose_story_operation', {
      change: {
        isPrimary: true,
        operation: 'create_timeline',
        summary: '',
        title: 'Imperial calendar',
      },
      unexpected: true,
    })).toBe('propose_story_operation requires exactly one change object.');

    expect(isAgentToolArguments('maintain_story_records', {
      changes: [{
        clientRef: 'hearing',
        displayTime: 'Late spring',
        note: '',
        operation: 'create_moment',
        orderKey: 2,
        precision: 'season',
        timelineId: 'timeline:1',
      }, {
        causes: '',
        consequences: '',
        endMomentId: null,
        operation: 'create_event',
        participants: [],
        startMomentId: '@hearing',
        status: undefined,
        summary: '',
        timelineId: 'timeline:1',
        title: 'The hearing',
      }],
    })).toBe(false);
    expect(agentToolArgumentHint('maintain_story_records', {
      changes: [{
        clientRef: 'hearing',
        displayTime: 'Late spring',
        note: '',
        operation: 'create_moment',
        orderKey: 2,
        precision: 'season',
        timelineId: 'timeline:1',
      }, {
        causes: '',
        consequences: '',
        endMomentId: null,
        operation: 'create_event',
        participants: [],
        startMomentId: '@hearing',
        status: undefined,
        summary: '',
        timelineId: 'timeline:1',
        title: 'The hearing',
      }],
    })).toBe('changes[1].eventStatus is required for create_event.');
  });

  it('accepts one canonical request and rejects unknown fields for every tool', () => {
    const validArguments = {
      read_novel_context: {
        directoryIds: [],
        documentIds: [],
        include: ['structure'],
      },
      submit_writing_artifact: { markdown: '# Draft' },
      maintain_story_records: {
        changes: [{
          name: 'Mara',
          operation: 'create_persona',
          role: null,
          summary: '',
        }],
      },
      complete_story_reconciliation: {
        reason: 'No canonical changes were depicted.',
        status: 'no_changes',
      },
      reconcile_accepted_document: {
        events: [{
          displayTime: 'Dawn',
          participants: [],
          precision: 'approximate',
          summary: '',
          title: 'Arrival',
        }],
        newPersonae: [],
        newThreads: [],
        threadAdvances: [],
      },
      record_story_question: {
        context: '',
        evidence: null,
        kind: 'other',
        options: [],
        question: 'Which route did Mara take?',
      },
      resolve_story_question: {
        answer: 'The northern road.',
        questionId: 'question:1',
      },
      propose_document_edit: {
        documentId: 'document:1',
        markdown: '# Revised',
      },
      propose_document_writing: {
        documentAction: 'create',
        documentDomain: 'manuscript',
        documentId: null,
        kind: 'chapter',
        metadataTitle: 'Arrival',
        objective: 'Write the arrival chapter.',
        parentId: 'directory:1',
        requirements: [],
        targetLength: null,
      },
      propose_document_file_operation: {
        documentId: 'document:1',
        operation: 'delete',
      },
      propose_project_structure_operation: {
        operation: 'create_volume',
        title: 'Volume Two',
      },
      propose_story_operation: {
        change: {
          isPrimary: true,
          operation: 'create_timeline',
          summary: '',
          title: 'Primary timeline',
        },
      },
    } as const satisfies Record<AgentToolName, unknown>;

    expect(Object.keys(validArguments)).toEqual([...AGENT_TOOL_NAMES]);
    for (const toolName of AGENT_TOOL_NAMES) {
      const valid = validArguments[toolName];
      expect(isAgentToolArguments(toolName, valid), toolName).toBe(true);
      expect(agentToolArgumentHint(toolName, valid), toolName).toBeUndefined();

      const invalid = { ...valid, unexpected: true };
      expect(isAgentToolArguments(toolName, invalid), toolName).toBe(false);
    }
  });
});
