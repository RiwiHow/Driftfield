import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';
import {
  AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH,
  type AppSettings,
  type UpdateAppSettingsRequest,
} from '../../../../shared/contracts/settings';

interface AgentInstructionsSettingsPanelProps {
  isSaving: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onUpdate: (update: UpdateAppSettingsRequest) => void;
  settings: AppSettings;
}

export function AgentInstructionsSettingsPanel({
  isSaving,
  onDirtyChange,
  onUpdate,
  settings,
}: AgentInstructionsSettingsPanelProps) {
  const { t } = useTranslation('settings');
  const [value, setValue] = useState(settings.agentCustomInstructions);
  const dirty = value !== settings.agentCustomInstructions;

  useEffect(() => {
    if (!dirty) setValue(settings.agentCustomInstructions);
  }, [dirty, settings.agentCustomInstructions]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const save = (): void => {
    if (!dirty || isSaving) return;
    onUpdate({ agentCustomInstructions: value });
  };

  return (
    <div
      aria-labelledby="settings-agent-instructions-tab"
      className="settings-panel"
      id="settings-agent-instructions-panel"
      role="tabpanel"
    >
      <header className="settings-panel-header">
        <h2>{t('categories.agentInstructionsTitle')}</h2>
        <p>{t('categories.agentInstructionsDescription')}</p>
      </header>

      <section className="settings-field-row settings-field-row-stacked">
        <div className="settings-field-copy">
          <h3>{t('customInstructions.title')}</h3>
          <p>{t('customInstructions.description')}</p>
        </div>

        <div className="agent-instructions-editor">
          <Label className="sr-only" htmlFor="agent-custom-instructions">
            {t('customInstructions.label')}
          </Label>
          <textarea
            disabled={isSaving}
            id="agent-custom-instructions"
            maxLength={AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH}
            onBlur={save}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('customInstructions.placeholder')}
            value={value}
          />
          <div className="agent-instructions-meta">
            <span>{t('customInstructions.saveHint')}</span>
            <span>
              {t('customInstructions.characterCount', {
                count: value.length,
                limit: AGENT_CUSTOM_INSTRUCTIONS_MAX_LENGTH,
              })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
