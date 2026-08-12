import { describe, expect, it } from 'vitest';

import { AGENT_ROLES } from '../../../../src/shared/contracts/agent';
import { buildAgentSystemPrompt } from '../../../../src/main/ai/prompts/prompt-builder';

describe('Agent prompt registry', () => {
  it('requires Scribe to submit only a machine-delimited manuscript artifact', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['read_novel_context', 'submit_writing_artifact'],
      responseLanguage: 'zh-CN',
      role: 'scribe',
    });

    expect(built.prompt).toContain('call submit_writing_artifact exactly once');
    expect(built.prompt).toContain('Ordinary assistant text is never part of the artifact');
  });

  it.each(AGENT_ROLES)('applies application boundaries to %s', (role) => {
    const built = buildAgentSystemPrompt({
      availableTools: [],
      responseLanguage: 'en',
      role,
    });
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
      responseLanguage: 'en',
      role: 'curator',
    });
    expect(built.prompt).toContain('Trusted application proposal outcomes');
    expect(built.prompt).toContain('"status":"accepted"');
    expect(built.prompt).not.toContain('proposal-1');
    expect(built.prompt).toContain('do not continue claiming');
  });

  it('adds cross-tool policy without duplicating registered tool descriptions', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['read_novel_context'],
      responseLanguage: 'en',
      role: 'curator',
    });
    expect(built.prompt).toContain('native tool calling');
    expect(built.prompt).toContain('request all already-known required sections');
    expect(built.prompt).toContain('directoryIds only to read a directory’s immediate document children');
    expect(built.prompt).toContain('request-scoped document refs');
    expect(built.prompt).toContain('create or delete a document');
    expect(built.prompt).toContain('metadataTitle from formatted displayTitle');
    expect(built.prompt).toContain('rename a document metadata title');
    expect(built.prompt).toContain('continue the same Agent run');
    expect(built.prompt).toContain('outside the user’s requested scope');
    expect(built.prompt).toContain('read accepted_reconciliation context');
    expect(built.prompt).toContain('Prefer reconcile_accepted_document');
    expect(built.prompt).toContain(
      'explicitly check Personae, Chronicle, Threads, and open questions in turn',
    );
    expect(built.prompt).toContain('Use ordinary Maintain only for clear shapes');
    expect(built.prompt).toContain('call complete_story_reconciliation');
    expect(built.prompt).toContain('complete ordered dependency graph');
    expect(built.prompt).toContain('reference it as @clientRef');
    expect(built.prompt).toContain('persistent identities remain Main-owned');
    expect(built.prompt).not.toContain('Do not narrate tool planning');
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
    expect(built.prompt).not.toContain('A writing delegation is the single bounded Scribe child task');
    expect(built.prompt).not.toContain('get_current_document:');
    expect(built.prompt).not.toContain('get_novel_structure:');
    expect(built.prompt).not.toContain('get_document:');
    expect(built.prompt).not.toContain('read_novel_context:');
    expect(built.prompt).not.toContain('No application tools are available');
  });

  it('adds the Curator-to-Scribe handoff policy only when delegation is available', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['delegate_writing'],
      responseLanguage: 'en',
      role: 'curator',
    });
    expect(built.prompt).toContain('A writing delegation is the single bounded Scribe child task');
    expect(built.prompt).toContain('Review the returned Markdown');
    expect(built.prompt).toContain('targetDocumentId set to null');
    expect(built.prompt).toContain('writingAssignmentId set to the same returned assignmentId');
    expect(built.prompt).toContain('Never reproduce Scribe Markdown');
    expect(built.prompt).toContain('one replacement proposal');
    expect(built.prompt).toContain('never call or retry delegate_writing a second time');
    expect(built.prompt).toContain('Use revise_writing_artifact only for directly verified typos');
    expect(built.prompt).toContain('never for continuity, gender, tone, or phrasing judgments');
    expect(built.prompt).toContain('if an exact revision is rejected, do not retry it');
  });

  it('uses the interface locale for conversation but not manuscript language', () => {
    const curator = buildAgentSystemPrompt({
      availableTools: [],
      responseLanguage: 'zh-CN',
      role: 'curator',
    });
    const scribe = buildAgentSystemPrompt({
      availableTools: ['submit_writing_artifact'],
      responseLanguage: 'zh-CN',
      role: 'scribe',
    });

    expect(curator.prompt).toContain('最终语言规则（必须遵守）');
    expect(curator.prompt).toContain('包括工具调用前后的说明');
    expect(curator.prompt).toContain('不得用英文叙述计划');
    expect(curator.prompt).toMatch(/最终语言规则（必须遵守）[^]*工具数据。$/u);
    expect(scribe.prompt).toContain('interface language does not determine manuscript language');
    expect(scribe.prompt).not.toContain('最终语言规则（必须遵守）');
  });
});
