import { describe, expect, it } from 'vitest';

import {
  appendConversationText,
  branchConversationFromUserEdit,
  completeToolActivity,
  replaceAssistantMessage,
  startToolActivity,
  type AgentConversationPart,
  type ConversationMessage,
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

  it('branches from an edited user message and discards the old continuation', () => {
    const messages: ConversationMessage[] = [
      { content: 'First prompt', id: 'user-1', role: 'user' },
      {
        content: 'Old answer',
        id: 'assistant-1',
        parts: [{ content: 'Old answer', type: 'text' }],
        role: 'assistant',
      },
      { content: 'Follow-up', id: 'user-2', role: 'user' },
    ];

    expect(
      branchConversationFromUserEdit(
        messages,
        'user-1',
        'Revised prompt',
        'assistant-2',
      ),
    ).toEqual([
      { content: 'Revised prompt', id: 'user-1', role: 'user' },
      { content: '', id: 'assistant-2', role: 'assistant' },
    ]);
  });

  it('keeps edited model content as assistant Markdown after retained tools', () => {
    const messages: ConversationMessage[] = [
      {
        content: 'Old answer',
        id: 'assistant-1',
        parts: [
          { content: 'Before tool', type: 'text' },
          {
            activity: {
              input: '{}',
              status: 'completed',
              toolCallId: 'tool-1',
              toolName: 'get_current_document',
            },
            type: 'tool',
          },
        ],
        role: 'assistant',
      },
    ];

    expect(
      replaceAssistantMessage(messages, 'assistant-1', 'Edited **answer**'),
    ).toEqual([
      {
        content: 'Edited **answer**',
        id: 'assistant-1',
        parts: [
          {
            activity: {
              input: '{}',
              status: 'completed',
              toolCallId: 'tool-1',
              toolName: 'get_current_document',
            },
            type: 'tool',
          },
          { content: 'Edited **answer**', type: 'text' },
        ],
        role: 'assistant',
        terminal: undefined,
      },
    ]);
  });
});
