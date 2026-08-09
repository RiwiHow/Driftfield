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
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { APP_THEMES } from '../../../shared/contracts/settings';
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

const themeOptionMetadata = {
  'github-light': {
    descriptionKey: 'githubLight',
    label: 'GitHub Light',
  },
  'one-dark': {
    descriptionKey: 'oneDark',
    label: 'One Dark',
  },
  'tokyo-night': {
    descriptionKey: 'tokyoNight',
    label: 'Tokyo Night',
  },
} as const satisfies Record<AppTheme, {
  descriptionKey: 'githubLight' | 'oneDark' | 'tokyoNight';
  label: string;
}>;

const themeOptions = APP_THEMES.map((theme) => ({
  ...themeOptionMetadata[theme],
  theme,
}));

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
      <DialogContent className="settings-dialog gap-0 p-0 sm:max-w-[660px]">
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
            <div className="shrink-0">
              <Label className="sr-only" htmlFor="application-language">
                {t('language.label')}
              </Label>
              <Select
                disabled={isSaving}
                onValueChange={(language) =>
                  onUpdate({
                    language: language as AppSettings['language'],
                  })
                }
                value={settings.language}
              >
                <SelectTrigger
                  className="w-[230px]"
                  id="application-language"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_LANGUAGE_OPTIONS.map((language) => (
                    <SelectItem key={language.id} value={language.id}>
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label className="sr-only" htmlFor="credential-provider">
                {t('agent.providerTitle')}
              </Label>
              <Select
                disabled={isSaving}
                onValueChange={(provider) =>
                  setCredentialProvider(provider as AgentApiKeyProviderId)
                }
                value={credentialProvider}
              >
                <SelectTrigger
                  className="w-full"
                  id="credential-provider"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_API_KEY_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label className="sr-only" htmlFor="agent-api-key">
                {t('agent.keyPlaceholder')}
              </Label>
              <Input
                autoComplete="off"
                className="h-8 text-xs"
                disabled={isSaving}
                id="agent-api-key"
                placeholder={t('agent.keyPlaceholder')}
                ref={apiKeyRef}
                type="password"
              />
              <Button
                className="h-8 px-3 text-xs"
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
                    <Button
                      className="h-auto p-0 text-[9px] text-destructive hover:bg-transparent hover:text-destructive/80"
                      disabled={isSaving}
                      onClick={() => onRemoveCredential(providerId)}
                      size="sm"
                      variant="ghost"
                    >
                      {tCommon('actions.remove')}
                    </Button>
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
            <div className="shrink-0">
              <Label className="sr-only" htmlFor="default-agent-model">
                {t('agent.modelLabel')}
              </Label>
              <Select
                disabled={isSaving || agentConfiguration.models.length === 0}
                onValueChange={(modelKey) => {
                  const model = agentConfiguration.models.find(
                    ({ id, providerId }) =>
                      `${providerId}\u0000${id}` === modelKey,
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
                <SelectTrigger
                  className="w-[230px]"
                  id="default-agent-model"
                  size="sm"
                >
                  <SelectValue placeholder={t('agent.selectModel')} />
                </SelectTrigger>
                <SelectContent>
                  {agentConfiguration.models.map((model) => (
                    <SelectItem
                      key={`${model.providerId}/${model.id}`}
                      value={`${model.providerId}\u0000${model.id}`}
                    >
                      {model.name} · {model.providerId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <BrainCircuit aria-hidden="true" size={17} />
              <div>
                <h3>{t('agent.thinkingTitle')}</h3>
                <p>{t('agent.thinkingDescription')}</p>
              </div>
            </div>
            <div className="shrink-0">
              <Label className="sr-only" htmlFor="agent-thinking-level">
                {t('agent.thinkingLabel')}
              </Label>
              <Select
                disabled={
                  isSaving ||
                  settings.agent.defaultModel === null ||
                  agentConfiguration.models.find(
                    ({ id, providerId }) =>
                      id === settings.agent.defaultModel?.modelId &&
                      providerId === settings.agent.defaultModel?.providerId,
                  )?.reasoning === false
                }
                onValueChange={(thinkingLevel) =>
                  onUpdate({
                    agent: {
                      ...settings.agent,
                      thinkingLevel:
                        thinkingLevel as AppSettings['agent']['thinkingLevel'],
                    },
                  })
                }
                value={settings.agent.thinkingLevel}
              >
                <SelectTrigger
                  className="w-[230px]"
                  id="agent-thinking-level"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const).map(
                    (level) => (
                      <SelectItem key={level} value={level}>
                        {tAssistant(`thinking.${level}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
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
                  <Label
                    className={cn(
                      'relative block min-w-0 cursor-pointer rounded-lg',
                      isSaving && 'pointer-events-none opacity-50',
                    )}
                    key={option.theme}
                  >
                    <input
                      checked={isSelected}
                      className="peer sr-only"
                      disabled={isSaving}
                      name="application-theme"
                      onChange={() => onUpdate({ theme: option.theme })}
                      type="radio"
                      value={option.theme}
                    />
                    <Card
                      className="gap-2 rounded-lg py-2 shadow-none transition-[border-color,box-shadow,background-color] hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 peer-checked:border-primary/70 peer-checked:ring-1 peer-checked:ring-primary/25"
                    >
                      <CardContent className="relative space-y-2 px-2">
                        <span
                          aria-hidden="true"
                          className="theme-swatch"
                          data-theme={option.theme}
                        >
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5 pr-5">
                          <strong className="text-[10px] font-semibold">
                            {option.label}
                          </strong>
                          <small className="truncate text-[9px] font-normal text-muted-foreground">
                            {t(`appearance.themes.${option.descriptionKey}`)}
                          </small>
                        </span>
                        {isSelected && (
                          <Check
                            aria-hidden="true"
                            className="absolute right-2 bottom-0.5 text-primary"
                            size={15}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </Label>
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

            <div className="shrink-0">
              <Label className="sr-only" htmlFor="editor-font-size">
                {t('fontSize.label')}
              </Label>
              <Select
                disabled={isSaving}
                onValueChange={(fontSize) =>
                  onUpdate({ editorFontSize: Number(fontSize) })
                }
                value={String(settings.editorFontSize)}
              >
                <SelectTrigger
                  className="w-24"
                  id="editor-font-size"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editorFontSizes.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} px
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                className="close-behavior-options inline-flex shrink-0 rounded-lg border bg-secondary p-0.5"
                role="group"
              >
                <Button
                  aria-pressed={settings.closeWindowBehavior === 'quit'}
                  disabled={isSaving}
                  onClick={() => onUpdate({ closeWindowBehavior: 'quit' })}
                  size="sm"
                  variant={
                    settings.closeWindowBehavior === 'quit'
                      ? 'secondary'
                      : 'ghost'
                  }
                >
                  <Power aria-hidden="true" size={13} />
                  {t('closeBehavior.quit')}
                </Button>
                <Button
                  aria-pressed={settings.closeWindowBehavior === 'minimize'}
                  disabled={isSaving}
                  onClick={() => onUpdate({ closeWindowBehavior: 'minimize' })}
                  size="sm"
                  variant={
                    settings.closeWindowBehavior === 'minimize'
                      ? 'secondary'
                      : 'ghost'
                  }
                >
                  <Minimize2 aria-hidden="true" size={13} />
                  {t('closeBehavior.minimize')}
                </Button>
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
            className="h-8 px-3 text-xs"
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
