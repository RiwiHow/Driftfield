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

  it('reports trusted application proposal outcomes to the next model turn', () => {
    const built = buildAgentSystemPrompt({
      availableTools: [],
      proposalOutcomes: [{
        operation: 'create_volume',
        proposalId: 'proposal-1',
        status: 'accepted',
      }],
      role: 'curator',
    });
    expect(built.prompt).toContain('Trusted application proposal outcomes');
    expect(built.prompt).toContain('"status":"accepted"');
    expect(built.prompt).toContain('do not continue claiming');
  });

  it('adds cross-tool policy without duplicating registered tool descriptions', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['read_novel_context'],
      role: 'curator',
    });
    expect(built.prompt).toContain('native tool calling');
    expect(built.prompt).toContain('request all already-known required sections');
    expect(built.prompt).toContain('stable document identities');
    expect(built.prompt).toContain('create or delete a document');
    expect(built.prompt).toContain('continue the same Agent run');
    expect(built.prompt).toContain('outside the user’s requested scope');
    expect(built.prompt).toContain('reconcile the exact accepted persisted prose');
    expect(built.prompt).toContain(
      'explicitly check Personae, Chronicle, Threads, and open questions in turn',
    );
    expect(built.prompt).toContain('automatically apply only clearly evidenced');
    expect(built.prompt).toContain(
      'First check whether the accepted prose advances, turns, reveals, resolves, or abandons an existing Thread',
    );
    expect(built.prompt).toContain(
      'A chapter, scene, or isolated Chronicle event is not by itself a Thread',
    );
    expect(built.prompt).toContain(
      'Do not invent dramatic purpose or desired outcome to force coverage',
    );
    expect(built.prompt).toContain('structured story question');
    expect(built.prompt).not.toContain('A writing delegation is a bounded child task');
    expect(built.prompt).not.toContain('get_current_document:');
    expect(built.prompt).not.toContain('get_novel_structure:');
    expect(built.prompt).not.toContain('get_document:');
    expect(built.prompt).not.toContain('read_novel_context:');
    expect(built.prompt).not.toContain('No application tools are available');
  });

  it('adds the Curator-to-Scribe handoff policy only when delegation is available', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['delegate_writing'],
      role: 'curator',
    });
    expect(built.prompt).toContain('A writing delegation is a bounded child task');
    expect(built.prompt).toContain('review the returned Markdown');
    expect(built.prompt).toContain('Never create a placeholder');
    expect(built.prompt).toContain('one replacement proposal');
  });
});
