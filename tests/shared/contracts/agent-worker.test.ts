import { describe, expect, it } from 'vitest';

import { isAgentWorkerCommand, isAgentWorkerMessage } from '../../../src/shared/contracts/agent-worker';

describe('Agent utility-process protocol', () => {
  it('accepts Bash tool activity and correlated results', () => {
    expect(isAgentWorkerMessage({
      input: '{"command":"find ."}', requestId: 'request-1', toolCallId: 'tool-1',
      toolName: 'bash', type: 'tool-started',
    })).toBe(true);
    expect(isAgentWorkerMessage({
      failed: false, output: '{"ok":true}', requestId: 'request-1', toolCallId: 'tool-1',
      toolName: 'bash', type: 'tool-completed',
    })).toBe(true);
  });

  it('accepts application-owned worker starts with the registered tools', () => {
    expect(isAgentWorkerCommand({
      authPath: '/app-data/auth.json', cwd: '/agent-data', customInstructions: '',
      enabledTools: ['bash'], history: [], proposalOutcomes: [], modelId: 'model',
      modelsPath: '/app-data/models.json', prompt: 'Inspect the project', providerId: 'anthropic',
      reconciliationPending: false, requestId: 'request-1', responseLanguage: 'zh-CN',
      role: 'curator', thinkingLevel: 'medium', type: 'start',
    })).toBe(true);
  });

  it('accepts only semantic proposal outcomes at the worker boundary', () => {
    const command = {
      authPath: '/app-data/auth.json', cwd: '/agent-data', customInstructions: '',
      enabledTools: ['bash'], history: [], modelId: 'model',
      modelsPath: '/app-data/models.json', prompt: 'Continue', providerId: 'anthropic',
      reconciliationPending: false, requestId: 'request-1', responseLanguage: 'en',
      role: 'curator', thinkingLevel: 'medium', type: 'start',
    } as const;
    expect(isAgentWorkerCommand({
      ...command,
      proposalOutcomes: [{ operation: 'create', status: 'accepted', targetTitle: 'Chapter One' }],
    })).toBe(true);
    expect(isAgentWorkerCommand({
      ...command,
      proposalOutcomes: [{
        operation: 'create', proposalId: 'proposal-1', status: 'accepted', targetTitle: 'Chapter One',
      }],
    })).toBe(false);
  });

  it('rejects removed tools and malformed path mutation requests', () => {
    expect(isAgentWorkerMessage({
      arguments: { directoryIds: [], documentIds: [], include: ['structure'] },
      requestId: 'request-1', toolCallId: 'tool-1', toolName: 'obsolete_context_reader',
      type: 'tool-request',
    })).toBe(false);
    expect(isAgentWorkerMessage({
      arguments: { documentPath: '../secret.md', markdown: '# x' },
      requestId: 'request-1', toolCallId: 'tool-1', toolName: 'propose_document_edit',
      type: 'tool-request',
    })).toBe(true);
  });
});
