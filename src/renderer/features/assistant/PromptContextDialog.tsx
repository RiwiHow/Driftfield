import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  AgentPromptPreview,
  AgentPromptPreviewProfile,
} from '../../../shared/contracts/agent-prompt-preview';

interface PromptContextDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  prompt: string;
}

export function PromptContextDialog({
  onOpenChange,
  open,
  prompt,
}: PromptContextDialogProps) {
  const { t } = useTranslation('assistant');
  const [preview, setPreview] = useState<AgentPromptPreview | null>(null);
  const [error, setError] = useState(false);
  const [profile, setProfile] = useState<'curator' | 'scribe'>('curator');

  useEffect(() => {
    if (!open) return;
    let current = true;
    setPreview(null);
    setError(false);
    void window.driftfield.getAgentPromptPreview({ prompt }).then(
      (result) => {
        if (current) setPreview(result);
      },
      () => {
        if (current) setError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [open, prompt]);

  const selected = preview?.[profile];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="prompt-context-dialog">
        <DialogTitle>{t('promptContext.title')}</DialogTitle>
        <DialogDescription>{t('promptContext.description')}</DialogDescription>

        <div className="prompt-context-tabs" role="tablist">
          {(['curator', 'scribe'] as const).map((role) => (
            <Button
              aria-selected={profile === role}
              key={role}
              onClick={() => setProfile(role)}
              role="tab"
              size="sm"
              variant={profile === role ? 'secondary' : 'ghost'}
            >
              {t(`promptContext.profiles.${role}`)}
            </Button>
          ))}
        </div>

        {error ? (
          <p className="prompt-context-state is-error" role="alert">
            {t('promptContext.error')}
          </p>
        ) : selected === undefined || preview === null ? (
          <p className="prompt-context-state">{t('promptContext.loading')}</p>
        ) : (
          <PromptProfile
            messages={profile === 'curator' ? preview.messages : undefined}
            profile={selected}
            role={profile}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PromptProfile({
  messages,
  profile,
  role,
}: {
  messages?: AgentPromptPreview['messages'];
  profile: AgentPromptPreviewProfile;
  role: 'curator' | 'scribe';
}) {
  const { t } = useTranslation('assistant');
  return (
    <div className="prompt-context-content">
      <div className="prompt-context-meta">
        <span>
          {t('promptContext.profileVersion', { version: profile.version })}
        </span>
        <span>
          {t('promptContext.toolCount', { count: profile.enabledTools.length })}
        </span>
      </div>

      <section className="prompt-context-section">
        <h3>{t('promptContext.systemPrompt')}</h3>
        <pre>{profile.systemPrompt}</pre>
      </section>

      <section className="prompt-context-section">
        <h3>{t('promptContext.enabledTools')}</h3>
        <p className="prompt-context-tools">
          {profile.enabledTools.join('\n')}
        </p>
      </section>

      {messages !== undefined ? (
        <section className="prompt-context-section">
          <h3>
            {t('promptContext.messages', { count: messages.length })}
          </h3>
          {messages.length === 0 ? (
            <p className="prompt-context-empty">
              {t('promptContext.noMessages')}
            </p>
          ) : (
            <div className="prompt-context-messages">
              {messages.map((message, index) => (
                <article key={`${message.role}-${index}`}>
                  <strong>{t(`promptContext.roles.${message.role}`)}</strong>
                  <pre>{message.content}</pre>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className="prompt-context-note">
          {t('promptContext.scribeNote')}
        </p>
      )}

      {role === 'curator' ? (
        <p className="prompt-context-note">
          {t('promptContext.contextNote')}
        </p>
      ) : null}
    </div>
  );
}
