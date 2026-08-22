import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_DOCUMENT_RECONCILIATION_PARAMETERS,
  DOCUMENT_EDIT_PARAMETERS,
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  DOCUMENT_WRITING_PARAMETERS,
  PROJECT_BASH_PARAMETERS,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  RESOLVE_STORY_QUESTION_PARAMETERS,
  STORY_MAINTENANCE_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
  STORY_QUESTION_PARAMETERS,
  STORY_RECONCILIATION_COMPLETION_PARAMETERS,
  WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
} from '../../../src/main/ai/agent-tool-parameters';
import { AGENT_TOOL_NAMES, isAgentToolArguments, type AgentToolName } from '../../../src/shared/contracts/agent-tools';

describe('path-based Agent tool schemas', () => {
  it('accepts project paths and rejects protocol-shaped pseudo-paths', () => {
    expect(isAgentToolArguments('propose_document_edit', {
      documentPath: 'lore/World/Politics.md', markdown: '# Politics',
    })).toBe(true);
    expect(isAgentToolArguments('propose_document_edit', {
      documentPath: 'document:2', markdown: '# Politics',
    })).toBe(false);
    expect(isAgentToolArguments('propose_project_structure_operation', {
      directoryPath: 'lore/World', icon: 'flag', operation: 'set_lore_category_icon',
    })).toBe(true);
  });

  it('accepts stable story IDs and project-path citations', () => {
    expect(isAgentToolArguments('maintain_story_records', { changes: [{
      causes: '', consequences: '', endMomentId: null, status: 'established',
      operation: 'create_event', participants: [{ description: '', personaId: 'persona_uuid-1', role: 'actor' }],
      sources: [{ anchor: 'Text', documentPath: 'manuscript/chapter.md', relation: 'depicted', sourceKind: 'manuscript' }],
      startMomentId: 'moment_uuid-1', summary: '', timelineId: 'timeline_uuid-1', title: 'Event',
    }] })).toBe(true);
    expect(isAgentToolArguments('record_story_question', {
      context: 'Accepted chapter',
      evidence: {
        anchor: 'The bell rang.',
        documentPath: '/context/accepted.md',
      },
      kind: 'other',
      options: [],
      question: 'Which bell?',
    })).toBe(true);
  });

  it('ships one schema for every registered tool', () => {
    const schemas = {
      bash: PROJECT_BASH_PARAMETERS,
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
    } satisfies Record<AgentToolName, object>;
    expect(Object.keys(schemas)).toEqual([...AGENT_TOOL_NAMES]);
  });
});
