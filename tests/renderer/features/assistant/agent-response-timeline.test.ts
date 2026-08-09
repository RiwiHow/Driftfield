import { describe, expect, it } from 'vitest';

import {
  appendConversationText,
  completeToolActivity,
  startToolActivity,
  type AgentConversationPart,
} from '../../../../src/renderer/features/assistant/use-agent-conversation';

describe('Agent response timeline', () => {
  it('keeps a Tool call at the point where it occurred between text events', () => {
    let parts: AgentConversationPart[] = [];
    parts = appendConversationText(parts, 'I will inspect the project.');
    parts = startToolActivity(parts, {
      input: '{}',
      status: 'running',
      toolCallId: 'tool-1',
      toolName: 'get_novel_structure',
    });
    parts = completeToolActivity(parts, 'tool-1', false, '{"ok":true}');
    parts = appendConversationText(parts, 'The project has two chapters.');

    expect(parts.map(({ type }) => type)).toEqual(['text', 'tool', 'text']);
    expect(parts[1]).toMatchObject({
      activity: {
        output: '{"ok":true}',
        status: 'completed',
        toolCallId: 'tool-1',
      },
      type: 'tool',
    });
  });

  it('coalesces adjacent text deltas without crossing a Tool boundary', () => {
    let parts: AgentConversationPart[] = [];
    parts = appendConversationText(parts, 'First');
    parts = appendConversationText(parts, ' sentence.');
    parts = startToolActivity(parts, {
      input: '{}',
      status: 'running',
      toolCallId: 'tool-1',
      toolName: 'get_current_document',
    });
    parts = appendConversationText(parts, 'Second sentence.');

    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ content: 'First sentence.', type: 'text' });
    expect(parts[2]).toEqual({ content: 'Second sentence.', type: 'text' });
  });
});
