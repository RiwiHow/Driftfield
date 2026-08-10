import { describe, expect, it } from 'vitest';

import { AGENT_ROLES } from '../../../../src/shared/contracts/agent';
import { buildAgentSystemPrompt } from '../../../../src/main/ai/prompts/prompt-builder';

describe('Agent prompt registry', () => {
  it.each(AGENT_ROLES)('applies application boundaries to %s', (role) => {
    const built = buildAgentSystemPrompt({ availableTools: [], role });
    expect(built.profileId).toBe(role);
    expect(built.version).toBeGreaterThan(0);
    expect(built.prompt).toContain('Never claim that content');
    expect(built.prompt).toContain('no shell');
    expect(built.prompt).toContain(`Role profile: ${role}`);
  });

  it('adds cross-tool policy without duplicating registered tool descriptions', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['get_current_document'],
      role: 'coordinator',
    });
    expect(built.prompt).toContain('native tool calling');
    expect(built.prompt).toContain('stable document identities');
    expect(built.prompt).toContain('create or delete a document');
    expect(built.prompt).not.toContain('get_current_document:');
    expect(built.prompt).not.toContain('get_novel_structure:');
    expect(built.prompt).not.toContain('get_document:');
    expect(built.prompt).not.toContain('No application tools are available');
  });
});
