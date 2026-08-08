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
import { useTranslation } from 'react-i18next';

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

export function AssistantPanel({
  activeChapter,
  configuration,
  configurationError,
  configurationLoading,
  onOpenSettings,
  settings,
}: AssistantPanelProps) {
  const { t } = useTranslation('assistant');
  const [prompt, setPrompt] = useState('');
  const { cancel, clear, error, isActive, messages, phase, send } =
    useAgentConversation(activeChapter);
  const selectedModel = configuration.models.find(
    ({ id, providerId }) =>
      id === settings.defaultModel?.modelId &&
      providerId === settings.defaultModel?.providerId,
  );
  const isConfigured = selectedModel !== undefined;
  const activePhaseLabel = (
    currentPhase: AgentConversationPhase,
  ): string | undefined => {
    if (currentPhase === 'cancelling') return t('status.cancelling');
    if (currentPhase === 'starting') return t('status.starting');
    if (currentPhase === 'streaming') return t('status.streaming');
    return undefined;
  };

  const submit = async (): Promise<void> => {
    if (!isConfigured) return;
    if (await send(prompt)) setPrompt('');
  };

  const modelStatus = configurationLoading
    ? t('status.loadingConfiguration')
    : configurationError !== null
      ? t('status.configurationFailed')
    : isConfigured
      ? `${selectedModel.providerId} · ${t(`thinking.${settings.thinkingLevel}`)}`
      : settings.defaultModel === null
        ? t('status.notConfigured')
        : t('status.modelUnavailable');

  return (
    <aside className="assistant-pane">
      <div className="pane-heading assistant-heading">
        <span>{t('title')}</span>
        <Button
          aria-label={t('actions.newConversation')}
          disabled={isActive}
          onClick={clear}
          size="icon"
          variant="ghost"
        >
          <Plus size={15} />
        </Button>
      </div>

      <button
        aria-label={t('actions.openSettings')}
        className="agent-selector"
        onClick={onOpenSettings}
        type="button"
      >
        <span className="agent-avatar">
          <Sparkles aria-hidden="true" size={14} />
        </span>
        <span>
          <strong>{selectedModel?.name ?? t('author.assistant')}</strong>
          <small>{activePhaseLabel(phase) ?? modelStatus}</small>
        </span>
        <Settings2 aria-hidden="true" size={14} />
      </button>

      <div aria-label={t('title')} className="conversation">
        {messages.length === 0 ? (
          isConfigured ? (
            <div className="message-row assistant-message">
              <span className="message-avatar">
                <Bot aria-hidden="true" size={14} />
              </span>
              <div className="message-content">
                <div className="message-author">{t('author.assistant')}</div>
                <p>{t('empty.welcome')}</p>
              </div>
            </div>
          ) : (
            <div className="agent-setup-empty">
              <Cpu aria-hidden="true" size={18} />
              <strong>
                {configurationLoading
                  ? t('empty.loading')
                  : configurationError ?? t('empty.setup')}
              </strong>
              <p>
                {configurationLoading
                  ? t('empty.loadingBody')
                  : t('empty.body')}
              </p>
              {!configurationLoading && (
                <Button onClick={onOpenSettings} size="sm" variant="outline">
                  {t('empty.setupAction')}
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
                  {message.role === 'assistant'
                    ? t('author.assistant')
                    : t('author.user')}
                </div>
                <p>
                  {message.terminal !== undefined
                    ? t(`terminal.${message.terminal}`)
                    : message.content ||
                    (message.role === 'assistant' && isActive
                      ? activePhaseLabel(phase)
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
              {t('actions.checkSettings')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="quick-prompts">
        <button
          disabled={!isConfigured || isActive}
          onClick={() => setPrompt(t('quick.continuePrompt'))}
          type="button"
        >
          {t('quick.continue')}
        </button>
        <button
          disabled={!isConfigured || isActive}
          onClick={() =>
            setPrompt(t('quick.atmospherePrompt'))
          }
          type="button"
        >
          {t('quick.atmosphere')}
        </button>
        <button
          disabled={!isConfigured || isActive}
          onClick={() =>
            setPrompt(t('quick.continuityPrompt'))
          }
          type="button"
        >
          {t('quick.continuity')}
        </button>
      </div>

      <div className="composer" data-disabled={!isConfigured || undefined}>
        <textarea
          aria-label={t('actions.send')}
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
              ? t('composer.placeholder')
              : configurationLoading
                ? t('status.loadingConfiguration')
                : t('composer.setupPlaceholder')
          }
          rows={3}
          value={prompt}
        />
        <div className="composer-footer">
          <span>{activeChapter?.title ?? t('composer.noChapter')}</span>
          <Button
            aria-label={
              isActive ? t('actions.stop') : t('actions.send')
            }
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
