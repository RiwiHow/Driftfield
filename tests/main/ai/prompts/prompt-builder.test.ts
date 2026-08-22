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
    expect(built.prompt).toContain('native application tools');
    expect(built.prompt).toContain('Request-scoped refs are leases issued in this run');
    expect(built.prompt).toContain('expired-request-reference');
    expect(built.prompt).toContain('batch already-known needs');
    expect(built.prompt).toContain('current_document is the immutable request-start draft');
    expect(built.prompt).not.toContain('Prefer one reconcile_accepted_document call');
    expect(built.prompt).not.toContain('propose_document_file_operation');
    expect(built.prompt).not.toContain('One Scribe delegation is available');
    expect(built.prompt).not.toContain('get_current_document:');
    expect(built.prompt).not.toContain('get_novel_structure:');
    expect(built.prompt).not.toContain('get_document:');
    expect(built.prompt).not.toContain('read_novel_context:');
    expect(built.prompt).not.toContain('No application tools are available');
  });

  it('adds the atomic Curator-to-Scribe proposal policy only when available', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['propose_document_writing'],
      responseLanguage: 'en',
      role: 'curator',
    });
    expect(built.prompt).toContain('atomic Scribe-backed document proposal');
    expect(built.prompt).toContain('requested Manuscript or Lore prose');
    expect(built.prompt).toContain('immutable create-or-replace target plan');
    expect(built.prompt).toContain('does not expose a reusable assignment reference');
    expect(built.prompt).toContain('Never substitute replace after a failed create');
    expect(built.prompt).toContain('authoritative application confirmation');
    expect(built.prompt).toContain('never ask the user to verify it in the interface or accept it again');
    expect(built.prompt).toContain('omitted Markdown is deliberately hidden');
    expect(built.prompt).toContain('never merely to confirm persistence');
    expect(built.prompt).toContain('Do not hide all operational narration');
    expect(built.prompt).toContain('do not expose native tool names');
    expect(built.prompt).toContain('Never say that accepted content may be missing');
    expect(built.prompt).toContain('report the reason concisely');
    expect(built.prompt).not.toContain('revise_writing_artifact');
    expect(built.prompt).toContain('Never supply, echo, or invent concurrency revisions');
    expect(built.prompt).not.toContain('documentId null');
    expect(built.prompt).not.toContain('documents read for continuity');
    expect(built.version).toBe(38);
  });

  it('appends bounded user instructions without letting them replace policy', () => {
    const built = buildAgentSystemPrompt({
      availableTools: [],
      customInstructions: 'Keep answers concise and preserve close third person.',
      responseLanguage: 'en',
      role: 'curator',
    });

    expect(built.prompt).toContain('User-authored additional instructions:');
    expect(built.prompt).toContain('Content (JSON string): "Keep answers concise');
    expect(built.prompt).toContain('only when it does not conflict with application boundaries');
    expect(built.prompt.indexOf('Application boundaries:')).toBeLessThan(
      built.prompt.indexOf('User-authored additional instructions:'),
    );
    expect(built.prompt).toMatch(/Content \(JSON string\):[^]*Final language policy/u);
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
