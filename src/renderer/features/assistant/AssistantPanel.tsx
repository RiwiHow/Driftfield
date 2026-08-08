import {
  Bot,
  ChevronDown,
  CircleStop,
  Plus,
  SendHorizontal,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';

import type { Chapter } from '@/app/types';
import { Button } from '@/components/ui/button';
import { useAgentConversation } from './use-agent-conversation';

export function AssistantPanel({ activeChapter }: { activeChapter: Chapter | null }) {
  const [prompt, setPrompt] = useState('');
  const { cancel, clear, error, isRunning, messages, send } =
    useAgentConversation(activeChapter);

  const submit = async (): Promise<void> => {
    if (await send(prompt)) setPrompt('');
  };

  return (
    <aside className="assistant-pane">
      <div className="pane-heading assistant-heading">
        <span>Agents</span>
        <Button
          aria-label="新建对话"
          disabled={isRunning}
          onClick={clear}
          size="icon"
          variant="ghost"
        >
          <Plus size={15} />
        </Button>
      </div>

      <button className="agent-selector" type="button">
        <span className="agent-avatar">
          <Sparkles aria-hidden="true" size={14} />
        </span>
        <span>
          <strong>写作伙伴</strong>
          <small>{isRunning ? '正在思考' : '受控建议模式'}</small>
        </span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>

      <div className="conversation" aria-label="Agent 对话">
        {messages.length === 0 ? <div className="message-row assistant-message">
          <span className="message-avatar">
            <Bot aria-hidden="true" size={14} />
          </span>
          <div className="message-content">
            <div className="message-author">写作伙伴</div>
            <p>
              我可以阅读当前章节，协助续写、润色或检查设定一致性。生成内容会先供你审阅。
            </p>
          </div>
        </div> : messages.map((message) => (
          <div className={`message-row ${message.role}-message`} key={message.id}>
            <span className="message-avatar">
              {message.role === 'assistant' ? (
                <Bot aria-hidden="true" size={14} />
              ) : (
                <UserRound aria-hidden="true" size={14} />
              )}
            </span>
            <div className="message-content">
              <div className="message-author">
                {message.role === 'assistant' ? '写作伙伴' : '你'}
              </div>
              <p>{message.content || (isRunning ? '正在生成…' : '')}</p>
            </div>
          </div>
        ))}

        {error !== null ? <div className="agent-placeholder">{error}</div> : null}
      </div>

      <div className="quick-prompts">
        <button onClick={() => setPrompt('续写当前章节，保持既有叙事风格。')} type="button">续写当前章节</button>
        <button onClick={() => setPrompt('增强当前章节的氛围，但不要改变已发生的情节。')} type="button">增强氛围</button>
        <button onClick={() => setPrompt('检查当前章节与已知设定是否可能存在矛盾。')} type="button">检查一致性</button>
      </div>

      <div className="composer">
        <textarea
          aria-label="发送消息给 Agent"
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="询问 Agent，或输入 / 使用工具…"
          rows={3}
          value={prompt}
        />
        <div className="composer-footer">
          <span>{activeChapter?.title ?? '无当前章节'}</span>
          <Button
            aria-label={isRunning ? '停止生成' : '发送消息'}
            disabled={isRunning ? false : !prompt.trim()}
            onClick={() => void (isRunning ? cancel() : submit())}
            size="icon"
          >
            {isRunning ? <CircleStop size={15} /> : <SendHorizontal size={15} />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
