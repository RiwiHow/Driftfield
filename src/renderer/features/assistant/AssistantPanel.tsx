import {
  Bot,
  CircleStop,
  Cpu,
  Plus,
  SendHorizontal,
  Settings2,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';

import type { Chapter } from '@/app/types';
import { Button } from '@/components/ui/button';
import type { AgentConfiguration } from '../../../shared/contracts/agent-configuration';
import type { AgentSettings } from '../../../shared/contracts/settings';
import type { AgentConversationPhase } from './agent-conversation-state';
import { useAgentConversation } from './use-agent-conversation';

interface AssistantPanelProps {
  activeChapter: Chapter | null;
  configuration: AgentConfiguration;
  configurationError: string | null;
  configurationLoading: boolean;
  onOpenSettings: () => void;
  settings: AgentSettings;
}

const thinkingLabels: Record<AgentSettings['thinkingLevel'], string> = {
  high: '深度',
  low: '快速',
  max: '最大',
  medium: '均衡',
  minimal: '最低',
  off: '关闭推理',
  xhigh: '极高',
};

const activePhaseLabels: Partial<Record<AgentConversationPhase, string>> = {
  cancelling: '正在取消…',
  starting: '正在启动…',
  streaming: '正在生成…',
};

export function AssistantPanel({
  activeChapter,
  configuration,
  configurationError,
  configurationLoading,
  onOpenSettings,
  settings,
}: AssistantPanelProps) {
  const [prompt, setPrompt] = useState('');
  const { cancel, clear, error, isActive, messages, phase, send } =
    useAgentConversation(activeChapter);
  const selectedModel = configuration.models.find(
    ({ id, providerId }) =>
      id === settings.defaultModel?.modelId &&
      providerId === settings.defaultModel?.providerId,
  );
  const isConfigured = selectedModel !== undefined;

  const submit = async (): Promise<void> => {
    if (!isConfigured) return;
    if (await send(prompt)) setPrompt('');
  };

  const modelStatus = configurationLoading
    ? '正在读取模型配置…'
    : configurationError !== null
      ? '模型配置读取失败'
    : isConfigured
      ? `${selectedModel.providerId} · ${thinkingLabels[settings.thinkingLevel]}`
      : settings.defaultModel === null
        ? '尚未配置模型'
        : '所选模型当前不可用';

  return (
    <aside className="assistant-pane">
      <div className="pane-heading assistant-heading">
        <span>Agents</span>
        <Button
          aria-label="新建对话"
          disabled={isActive}
          onClick={clear}
          size="icon"
          variant="ghost"
        >
          <Plus size={15} />
        </Button>
      </div>

      <button
        aria-label="打开 Agent 设置"
        className="agent-selector"
        onClick={onOpenSettings}
        type="button"
      >
        <span className="agent-avatar">
          <Sparkles aria-hidden="true" size={14} />
        </span>
        <span>
          <strong>{selectedModel?.name ?? '写作伙伴'}</strong>
          <small>{activePhaseLabels[phase] ?? modelStatus}</small>
        </span>
        <Settings2 aria-hidden="true" size={14} />
      </button>

      <div aria-label="Agent 对话" className="conversation">
        {messages.length === 0 ? (
          isConfigured ? (
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
          ) : (
            <div className="agent-setup-empty">
              <Cpu aria-hidden="true" size={18} />
              <strong>
                {configurationLoading
                  ? '正在读取模型配置'
                  : configurationError ?? '连接一个模型后开始写作'}
              </strong>
              <p>
                {configurationLoading
                  ? '请稍候。'
                  : '添加服务商凭据并选择默认模型，Agent 才能处理请求。'}
              </p>
              {!configurationLoading && (
                <Button onClick={onOpenSettings} size="sm" variant="outline">
                  打开模型设置
                </Button>
              )}
            </div>
          )
        ) : (
          messages.map((message) => (
            <div
              className={`message-row ${message.role}-message`}
              key={message.id}
            >
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
                <p>
                  {message.content ||
                    (message.role === 'assistant' && isActive
                      ? activePhaseLabels[phase]
                      : '')}
                </p>
              </div>
            </div>
          ))
        )}

        {error !== null ? (
          <div className="agent-placeholder agent-error">
            <span>{error}</span>
            <button onClick={onOpenSettings} type="button">
              检查设置
            </button>
          </div>
        ) : null}
      </div>

      <div className="quick-prompts">
        <button
          disabled={!isConfigured || isActive}
          onClick={() => setPrompt('续写当前章节，保持既有叙事风格。')}
          type="button"
        >
          续写当前章节
        </button>
        <button
          disabled={!isConfigured || isActive}
          onClick={() =>
            setPrompt('增强当前章节的氛围，但不要改变已发生的情节。')
          }
          type="button"
        >
          增强氛围
        </button>
        <button
          disabled={!isConfigured || isActive}
          onClick={() =>
            setPrompt('检查当前章节与已知设定是否可能存在矛盾。')
          }
          type="button"
        >
          检查一致性
        </button>
      </div>

      <div className="composer" data-disabled={!isConfigured || undefined}>
        <textarea
          aria-label="发送消息给 Agent"
          disabled={!isConfigured || isActive}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            isConfigured
              ? '询问 Agent…'
              : configurationLoading
                ? '正在读取模型配置…'
                : '请先配置默认模型'
          }
          rows={3}
          value={prompt}
        />
        <div className="composer-footer">
          <span>{activeChapter?.title ?? '无当前章节'}</span>
          <Button
            aria-label={isActive ? '停止生成' : '发送消息'}
            disabled={isActive ? phase === 'cancelling' : !isConfigured || !prompt.trim()}
            onClick={() => void (isActive ? cancel() : submit())}
            size="icon"
          >
            {isActive ? <CircleStop size={15} /> : <SendHorizontal size={15} />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
