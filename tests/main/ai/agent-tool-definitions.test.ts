import { describe, expect, it } from 'vitest';

import { AGENT_TOOL_DEFINITIONS } from '../../../src/main/ai/agent-tool-definitions';
import { AGENT_TOOL_NAMES } from '../../../src/shared/contracts/agent-tools';

describe('Agent tool definitions', () => {
  it('defines every active tool exactly once from one model-facing registry', () => {
    expect(Object.keys(AGENT_TOOL_DEFINITIONS)).toEqual([...AGENT_TOOL_NAMES]);
    for (const [name, definition] of Object.entries(AGENT_TOOL_DEFINITIONS)) {
      expect(definition.name).toBe(name);
      expect(definition.description.trim().length).toBeGreaterThan(0);
      expect(definition.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('allows parallel execution only for read-only inspection tools', () => {
    expect(Object.values(AGENT_TOOL_DEFINITIONS)
      .filter(({ executionMode }) => executionMode === 'parallel')
      .map(({ name }) => name)).toEqual(['bash']);
  });

  it('does not advertise retired writing protocol fields or tools', () => {
    const serialized = JSON.stringify(AGENT_TOOL_DEFINITIONS);
    expect(serialized).not.toContain('writingAssignmentId');
    for (const toolName of ['delegate_writing', 'revise_writing_artifact'] as const) {
      expect(serialized).not.toContain(`"name":"${toolName}"`);
    }
  });

  it('defines generated writing with Bash paths and Main-owned revisions', () => {
    const description = AGENT_TOOL_DEFINITIONS.propose_document_writing.description;
    expect(description).toContain('parentPath');
    expect(description).toContain('documentPath');
    expect(description).toContain('latest snapshot revisions');
  });
});
