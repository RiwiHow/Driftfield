import { describe, expect, it } from 'vitest';

import { AGENT_ROLES } from '../../../../src/shared/contracts/agent';
import { buildAgentSystemPrompt } from '../../../../src/main/ai/prompts/prompt-builder';

describe('Agent prompt registry', () => {
  it('requires Scribe to submit only a machine-delimited manuscript artifact', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['bash', 'submit_writing_artifact'],
      responseLanguage: 'zh-CN',
      role: 'scribe',
    });

    expect(built.prompt).toContain('call submit_writing_artifact exactly once');
    expect(built.prompt).toContain('Ordinary assistant text is never part of the artifact');
    expect(built.prompt).toContain('Use Bash to inspect the disposable /project snapshot');
    expect(built.prompt).not.toContain('current_document');
  });

  it.each(AGENT_ROLES)('applies application boundaries to %s', (role) => {
    const built = buildAgentSystemPrompt({
      availableTools: [],
      responseLanguage: 'en',
      role,
    });
    expect(built.profileId).toBe(role);
    expect(built.version).toBeGreaterThan(0);
    expect(built.prompt).toContain('Claim persistence only from');
    expect(built.prompt).toContain('earlier assistant narration is not evidence');
    expect(built.prompt).toContain('no unrestricted filesystem');
    expect(built.prompt).toContain(`Role profile: ${role}`);
  });

  it('reports trusted application proposal outcomes to the next model turn', () => {
    const built = buildAgentSystemPrompt({
      availableTools: [],
      proposalOutcomes: [{
        operation: 'create_volume',
        status: 'accepted',
        targetTitle: 'Volume Two',
      }],
      responseLanguage: 'en',
      role: 'curator',
    });
    expect(built.prompt).toContain('Trusted application proposal outcomes');
    expect(built.prompt).toContain('"status":"accepted"');
    expect(built.prompt).toContain('"targetTitle":"Volume Two"');
    expect(built.prompt).toContain('Treat accepted as applied');
  });

  it('adds cross-tool policy without duplicating registered tool descriptions', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['bash'],
      responseLanguage: 'en',
      role: 'curator',
    });
    expect(built.prompt).toContain('Use application tools only');
    expect(built.prompt).toContain('/project contains the registered novel tree');
    expect(built.prompt).toContain('hidden local .index.json files');
    expect(built.prompt).toContain('metadata may be available under /context');
    expect(built.prompt).not.toContain('/context/story.json');
    expect(built.prompt).not.toContain('/context/icons.txt');
    expect(built.prompt).toContain('Prefer one focused read over broad scans or duplicate calls');
    expect(built.prompt).toContain('Do not enumerate index files or reread resolved ancestor indexes');
    expect(built.prompt).toContain('exact paths or stable IDs');
    expect(built.prompt).toContain('Main owns revision checks');
    expect(built.prompt).not.toContain('Prefer one reconcile_accepted_document call');
    expect(built.prompt).not.toContain('propose_document_file_operation');
    expect(built.prompt).not.toContain('One Scribe delegation is available');
    expect(built.prompt).not.toContain('No application tools are available');
  });

  it('adds the atomic Curator-to-Scribe proposal policy only when available', () => {
    const built = buildAgentSystemPrompt({
      availableTools: ['propose_document_writing'],
      responseLanguage: 'en',
      role: 'curator',
    });
    expect(built.prompt).toContain('one atomic generated-document proposal');
    expect(built.prompt).toContain('requested Manuscript or Lore prose');
    expect(built.prompt).toContain('requested document language in the objective or requirements');
    expect(built.prompt).toContain('bind one precise create-or-replace target');
    expect(built.prompt).toContain('Never switch action or destination');
    expect(built.prompt).toContain('accepted terminal result confirms');
    expect(built.prompt).toContain('do not expose tool names');
    expect(built.prompt).toContain('do not question its persistence');
    expect(built.prompt).toContain('Report the validation reason concisely');
    expect(built.prompt).not.toContain('revise_writing_artifact');
    expect(built.prompt).not.toContain('concurrency revisions');
    expect(built.prompt).not.toContain('documentId null');
    expect(built.prompt).not.toContain('documents read for continuity');
    expect(built.version).toBe(52);
  });

  it('places raw user instructions at the very beginning', () => {
    const built = buildAgentSystemPrompt({
      availableTools: [],
      customInstructions: 'Keep answers concise and preserve close third person.',
      responseLanguage: 'en',
      role: 'curator',
    });

    expect(built.prompt).toMatch(
      /^Keep answers concise and preserve close third person\.\n\nApplication boundaries:/u,
    );
    expect(built.prompt).not.toContain('User-authored additional instructions:');
    expect(built.prompt).not.toContain('Content (JSON string)');
    expect(built.prompt.indexOf('Keep answers concise'))
      .toBeLessThan(built.prompt.indexOf('Application boundaries:'));
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
