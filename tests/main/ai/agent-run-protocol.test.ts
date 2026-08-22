import { describe, expect, it } from 'vitest';

import {
  closesStoryReconciliation,
  containsStalledActionNarration,
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

  it('detects responses that stop while narrating an unexecuted action', () => {
    expect(containsStalledActionNarration(
      '目录已经确认。让我现在提交角色卡创作提案。',
    )).toBe(true);
    expect(containsStalledActionNarration(
      '让我先读取第一章。\n让我再用正确的路径查找。',
    )).toBe(true);
    expect(containsStalledActionNarration(
      'The target is resolved. Let me submit the writing proposal now.',
    )).toBe(true);
    expect(containsStalledActionNarration(
      '角色卡提案已经准备好，等待你的审阅。',
    )).toBe(false);
    expect(containsStalledActionNarration(
      '如果需要，我可以继续补充她与白塔的关系。',
    )).toBe(false);
    expect(responseProtocolIssue(
      '我现在提交角色卡。',
      'stop',
      false,
      ['propose_document_writing'],
    )).toBe('stalled-action');
    expect(protocolCorrection('stalled-action')).toContain(
      'stopped while narrating an action',
    );
    expect(responseProtocolIssue(
      '让我先读取已接受的正文。',
      'stop',
      true,
      [],
    )).toBe('reconciliation');
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
});
