import {
  BrainCircuit,
  Check,
  Cpu,
  KeyRound,
  Languages,
  Minimize2,
  MonitorCog,
  Power,
  SquareMousePointer,
  Type,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  AGENT_API_KEY_PROVIDERS,
  type AgentApiKeyProviderId,
  type AgentConfiguration,
} from '../../../shared/contracts/agent-configuration';
import type {
  AppSettings,
  AppTheme,
  UpdateAppSettingsRequest,
} from '../../../shared/contracts/settings';
import { APP_LANGUAGE_OPTIONS } from '../../../shared/i18n/languages';

interface SettingsDialogProps {
  agentConfiguration: AgentConfiguration;
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveCredential: (providerId: AgentApiKeyProviderId) => void;
  onSetApiKey: (
    providerId: AgentApiKeyProviderId,
    apiKey: string,
  ) => Promise<boolean>;
  onUpdate: (update: UpdateAppSettingsRequest) => void;
  open: boolean;
  settings: AppSettings;
}

const themeOptions: Array<{
  descriptionKey: 'githubLight' | 'oneDark' | 'tokyoNight';
  label: string;
  theme: AppTheme;
}> = [
  {
    descriptionKey: 'githubLight',
    label: 'GitHub Light',
    theme: 'github-light',
  },
  {
    descriptionKey: 'tokyoNight',
    label: 'Tokyo Night',
    theme: 'tokyo-night',
  },
  {
    descriptionKey: 'oneDark',
    label: 'One Dark',
    theme: 'one-dark',
  },
];

const editorFontSizes = [14, 15, 16, 17, 18, 20, 22, 24];

export function SettingsDialog({
  agentConfiguration,
  error,
  isSaving,
  onOpenChange,
  onRemoveCredential,
  onSetApiKey,
  onUpdate,
  open,
  settings,
}: SettingsDialogProps) {
  const { t } = useTranslation('settings');
  const { t: tAssistant } = useTranslation('assistant');
  const { t: tCommon } = useTranslation('common');
  const canChooseCloseBehavior = window.driftfield.platform !== 'darwin';
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [credentialProvider, setCredentialProvider] =
    useState<AgentApiKeyProviderId>('anthropic');
  const selectedModelKey = settings.agent.defaultModel === null
    ? ''
    : `${settings.agent.defaultModel.providerId}\u0000${settings.agent.defaultModel.modelId}`;

  const saveApiKey = async (): Promise<void> => {
    const apiKey = apiKeyRef.current?.value.trim() ?? '';
    if (apiKey.length === 0) return;
    if (await onSetApiKey(credentialProvider, apiKey)) {
      if (apiKeyRef.current !== null) apiKeyRef.current.value = '';
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="settings-dialog">
        <header className="settings-header">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </header>

        <div className="settings-sections">
          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <Languages aria-hidden="true" size={17} />
              <div>
                <h3>{t('language.title')}</h3>
                <p>{t('language.description')}</p>
              </div>
            </div>
            <label className="agent-setting-field">
              <span className="sr-only">{t('language.label')}</span>
              <select
                disabled={isSaving}
                onChange={(event) =>
                  onUpdate({
                    language: event.target.value as AppSettings['language'],
                  })
                }
                value={settings.language}
              >
                {APP_LANGUAGE_OPTIONS.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <KeyRound aria-hidden="true" size={17} />
              <div>
                <h3>{t('agent.providerTitle')}</h3>
                <p>{t('agent.credentialDescription')}</p>
              </div>
            </div>

            <div className="agent-credential-form">
              <select
                disabled={isSaving}
                onChange={(event) =>
                  setCredentialProvider(
                    event.target.value as AgentApiKeyProviderId,
                  )
                }
                value={credentialProvider}
              >
                {AGENT_API_KEY_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
              <input
                autoComplete="off"
                disabled={isSaving}
                placeholder={t('agent.keyPlaceholder')}
                ref={apiKeyRef}
                type="password"
              />
              <Button
                disabled={isSaving}
                onClick={() => void saveApiKey()}
                size="sm"
                type="button"
                variant="outline"
              >
                {tCommon('actions.save')}
              </Button>
            </div>

            <div className="agent-provider-statuses">
              {agentConfiguration.providers
                .filter(({ configured }) => configured)
                .map(({ providerId }) => (
                  <span key={providerId}>
                    {AGENT_API_KEY_PROVIDERS.find(({ id }) => id === providerId)
                      ?.label ?? providerId}
                    <button
                      disabled={isSaving}
                      onClick={() => onRemoveCredential(providerId)}
                      type="button"
                    >
                      {tCommon('actions.remove')}
                    </button>
                  </span>
                ))}
              {!agentConfiguration.providers.some(({ configured }) => configured) && (
                <small>{t('agent.noProvider')}</small>
              )}
            </div>
          </section>

          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <Cpu aria-hidden="true" size={17} />
              <div>
                <h3>{t('agent.modelTitle')}</h3>
                <p>{t('agent.modelDescription')}</p>
              </div>
            </div>
            <label className="agent-setting-field">
              <span className="sr-only">{t('agent.modelLabel')}</span>
              <select
                disabled={isSaving || agentConfiguration.models.length === 0}
                onChange={(event) => {
                  const model = agentConfiguration.models.find(
                    ({ id, providerId }) =>
                      `${providerId}\u0000${id}` === event.target.value,
                  );
                  onUpdate({
                    agent: {
                      ...settings.agent,
                      defaultModel: model === undefined
                        ? null
                        : { modelId: model.id, providerId: model.providerId },
                      thinkingLevel: model?.reasoning === false
                        ? 'off'
                        : settings.agent.thinkingLevel,
                    },
                  });
                }}
                value={selectedModelKey}
              >
                <option value="">{t('agent.selectModel')}</option>
                {agentConfiguration.models.map((model) => (
                  <option
                    key={`${model.providerId}/${model.id}`}
                    value={`${model.providerId}\u0000${model.id}`}
                  >
                    {model.name} · {model.providerId}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <BrainCircuit aria-hidden="true" size={17} />
              <div>
                <h3>{t('agent.thinkingTitle')}</h3>
                <p>{t('agent.thinkingDescription')}</p>
              </div>
            </div>
            <label className="agent-setting-field">
              <span className="sr-only">{t('agent.thinkingLabel')}</span>
              <select
                disabled={
                  isSaving ||
                  settings.agent.defaultModel === null ||
                  agentConfiguration.models.find(
                    ({ id, providerId }) =>
                      id === settings.agent.defaultModel?.modelId &&
                      providerId === settings.agent.defaultModel?.providerId,
                  )?.reasoning === false
                }
                onChange={(event) =>
                  onUpdate({
                    agent: {
                      ...settings.agent,
                      thinkingLevel: event.target.value as AppSettings['agent']['thinkingLevel'],
                    },
                  })
                }
                value={settings.agent.thinkingLevel}
              >
                <option value="off">{tAssistant('thinking.off')}</option>
                <option value="minimal">{tAssistant('thinking.minimal')}</option>
                <option value="low">{tAssistant('thinking.low')}</option>
                <option value="medium">{tAssistant('thinking.medium')}</option>
                <option value="high">{tAssistant('thinking.high')}</option>
                <option value="xhigh">{tAssistant('thinking.xhigh')}</option>
                <option value="max">{tAssistant('thinking.max')}</option>
              </select>
            </label>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <MonitorCog aria-hidden="true" size={17} />
              <div>
                <h3>{t('appearance.title')}</h3>
                <p>{t('appearance.description')}</p>
              </div>
            </div>

            <div className="theme-options">
              {themeOptions.map((option) => {
                const isSelected = settings.theme === option.theme;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={cn(
                      'theme-option',
                      isSelected && 'is-selected',
                    )}
                    disabled={isSaving}
                    key={option.theme}
                    onClick={() => onUpdate({ theme: option.theme })}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="theme-swatch"
                      data-preview-theme={option.theme}
                    >
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="theme-option-copy">
                      <strong>{option.label}</strong>
                      <small>
                        {t(`appearance.themes.${option.descriptionKey}`)}
                      </small>
                    </span>
                    {isSelected && <Check aria-hidden="true" size={15} />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <Type aria-hidden="true" size={17} />
              <div>
                <h3>{t('fontSize.title')}</h3>
                <p>{t('fontSize.description')}</p>
              </div>
            </div>

            <label className="font-size-field">
              <span className="sr-only">{t('fontSize.label')}</span>
              <select
                disabled={isSaving}
                onChange={(event) =>
                  onUpdate({ editorFontSize: Number(event.target.value) })
                }
                value={settings.editorFontSize}
              >
                {editorFontSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
          </section>

          {canChooseCloseBehavior && (
            <section className="settings-section settings-row-section">
              <div className="settings-section-heading">
                <SquareMousePointer aria-hidden="true" size={16} />
                <div>
                  <h3>{t('closeBehavior.title')}</h3>
                  <p>{t('closeBehavior.description')}</p>
                </div>
              </div>

              <div
                aria-label={t('closeBehavior.label')}
                className="close-behavior-options"
                role="group"
              >
                <button
                  aria-pressed={settings.closeWindowBehavior === 'quit'}
                  className={cn(
                    settings.closeWindowBehavior === 'quit' && 'is-selected',
                  )}
                  disabled={isSaving}
                  onClick={() => onUpdate({ closeWindowBehavior: 'quit' })}
                  type="button"
                >
                  <Power aria-hidden="true" size={13} />
                  {t('closeBehavior.quit')}
                </button>
                <button
                  aria-pressed={settings.closeWindowBehavior === 'minimize'}
                  className={cn(
                    settings.closeWindowBehavior === 'minimize' &&
                      'is-selected',
                  )}
                  disabled={isSaving}
                  onClick={() => onUpdate({ closeWindowBehavior: 'minimize' })}
                  type="button"
                >
                  <Minimize2 aria-hidden="true" size={13} />
                  {t('closeBehavior.minimize')}
                </button>
              </div>
            </section>
          )}
        </div>

        <footer className="settings-footer">
          <span aria-live="polite" className={cn(error && 'is-error')}>
            {error ??
              (isSaving ? t('saveStatus.saving') : t('saveStatus.saved'))}
          </span>
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            variant="secondary"
          >
            {tCommon('actions.done')}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
