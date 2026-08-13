import { describe, expect, it } from 'vitest';

import {
  closesStoryReconciliation,
  containsPseudoToolCall,
  normalizeStopReason,
  protocolCorrection,
  responseProtocolIssue,
} from '../../../src/main/ai/agent-run-protocol';

describe('Agent run protocol', () => {
  it('recognizes output truncation and preserves known stop reasons', () => {
    expect(normalizeStopReason('length')).toBe('length');
    expect(normalizeStopReason('vendor-specific')).toBe('unknown');
    expect(responseProtocolIssue('', 'length', false, false, [])).toBe('length');
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
    expect(responseProtocolIssue('', 'stop', true, false, [])).toBe('reconciliation');
    expect(responseProtocolIssue('完成。', 'stop', false, false, [])).toBeNull();
    expect(protocolCorrection('reconciliation')).toContain(
      'complete_story_reconciliation',
    );
  });

  it('recognizes both focused and explicit reconciliation completion', () => {
    expect(closesStoryReconciliation('reconcile_accepted_document', {
      data: {
        appliedCount: 3,
        reconciliationStatus: 'complete',
        revision: 1,
        status: 'applied',
      },
      ok: true,
      toolName: 'reconcile_accepted_document',
    })).toBe(true);
    expect(closesStoryReconciliation('complete_story_reconciliation', {
      data: { status: 'complete' },
      ok: true,
      toolName: 'complete_story_reconciliation',
    })).toBe(true);
    expect(closesStoryReconciliation('complete_story_reconciliation', {
      error: { code: 'invalid-arguments' },
      ok: false,
      toolName: 'complete_story_reconciliation',
    })).toBe(false);
  });

  it('keeps an unclaimed Scribe artifact incomplete until it reaches review', () => {
    expect(responseProtocolIssue('', 'stop', false, true, []))
      .toBe('writing-artifact');
    expect(protocolCorrection('writing-artifact')).toContain('assignmentId');
  });
});
