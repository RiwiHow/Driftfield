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

  it('describes only the bounded tools enabled for the request', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['get_current_document'],
      role: 'coordinator',
    });
    expect(built.prompt).toContain('get_current_document:');
    expect(built.prompt).not.toContain('No application tools are available');
  });
});
