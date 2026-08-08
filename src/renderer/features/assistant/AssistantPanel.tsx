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

import { Button } from '@/components/ui/button';

export function AssistantPanel() {
  const [prompt, setPrompt] = useState('');

  return (
    <aside className="assistant-pane">
      <div className="pane-heading assistant-heading">
        <span>Agents</span>
        <Button aria-label="新建对话" size="icon" variant="ghost">
          <Plus size={15} />
        </Button>
      </div>

      <button className="agent-selector" type="button">
        <span className="agent-avatar">
          <Sparkles aria-hidden="true" size={14} />
        </span>
        <span>
          <strong>写作伙伴</strong>
          <small>尚未连接模型</small>
        </span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>

      <div className="conversation" aria-label="Agent 对话">
        <div className="message-row assistant-message">
          <span className="message-avatar">
            <Bot aria-hidden="true" size={14} />
          </span>
          <div className="message-content">
            <div className="message-author">写作伙伴</div>
            <p>
              我可以阅读当前章节，协助续写、润色或检查设定一致性。生成内容会先供你审阅。
            </p>
          </div>
        </div>

        <div className="message-row user-message">
          <span className="message-avatar">
            <UserRound aria-hidden="true" size={14} />
          </span>
          <div className="message-content">
            <div className="message-author">你</div>
            <p>让信标的出现更有悬念，但不要直接解释它的来源。</p>
          </div>
        </div>

        <div className="agent-placeholder">
          <CircleStop aria-hidden="true" size={15} />
          <span>配置 Pi SDK 后即可开始对话</span>
        </div>
      </div>

      <div className="quick-prompts">
        <button type="button">续写选中内容</button>
        <button type="button">增强氛围</button>
        <button type="button">检查一致性</button>
      </div>

      <div className="composer">
        <textarea
          aria-label="发送消息给 Agent"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="询问 Agent，或输入 / 使用工具…"
          rows={3}
          value={prompt}
        />
        <div className="composer-footer">
          <span>当前章节</span>
          <Button
            aria-label="发送消息"
            disabled={!prompt.trim()}
            size="icon"
          >
            <SendHorizontal size={15} />
          </Button>
        </div>
      </div>
    </aside>
  );
}
