import { describe, expect, it } from 'vitest';

import {
  containsPseudoToolCall,
  normalizeStopReason,
  protocolCorrection,
  responseProtocolIssue,
} from '../../../src/main/ai/agent-run-protocol';

describe('Agent run protocol', () => {
  it('recognizes output truncation and preserves known stop reasons', () => {
    expect(normalizeStopReason('length')).toBe('length');
    expect(normalizeStopReason('vendor-specific')).toBe('unknown');
    expect(responseProtocolIssue('', 'length', false, [])).toBe('length');
    expect(protocolCorrection('length')).toContain('output-token limit');
  });

  it('detects printed markup for enabled native tools only', () => {
    const enabled = ['maintain_story_records'] as const;
    expect(containsPseudoToolCall(
      'question\n<invoke name="maintain_story_records"><parameter name="changes">[]',
      [...enabled],
    )).toBe(true);
    expect(containsPseudoToolCall(
      '{"toolName":"maintain_story_records","changes":[]}',
      [...enabled],
    )).toBe(true);
    expect(containsPseudoToolCall(
      '<invoke name="unknown_tool">',
      [...enabled],
    )).toBe(false);
  });

  it('keeps an accepted-writing run incomplete until reconciliation closes', () => {
    expect(responseProtocolIssue('', 'stop', true, [])).toBe('reconciliation');
    expect(responseProtocolIssue('完成。', 'stop', false, [])).toBeNull();
    expect(protocolCorrection('reconciliation')).toContain(
      'complete_story_reconciliation',
    );
  });
});
