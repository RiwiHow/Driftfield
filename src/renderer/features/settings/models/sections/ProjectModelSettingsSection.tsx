import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AGENT_API_KEY_PROVIDERS,
  AGENT_THINKING_LEVEL_KEYS,
  type AgentModelOption,
  type AgentProviderStatus,
} from "../../../../../shared/contracts/agent-configuration";
import type {
  AgentSettings,
  ProjectAgentSettings,
  UpdateProjectAgentSettingsRequest,
} from "../../../../../shared/contracts/settings";
import { supportedThinkingLevel } from "../model-selection";

interface ProjectModelSettingsSectionProps {
  configuredProviders: AgentProviderStatus[];
  globalAgentSettings: AgentSettings;
  isSaving: boolean;
  models: AgentModelOption[];
  onUpdate: (update: UpdateProjectAgentSettingsRequest) => void;
  onUpdateGlobal: (update: AgentSettings) => void;
  projectAgentSettings: ProjectAgentSettings | null;
}

interface ModelFieldsProps {
  description: string;
  disabled: boolean;
  idPrefix: string;
  models: AgentModelOption[];
  configuredProviders: AgentProviderStatus[];
  onUpdate: (update: AgentSettings) => void;
  settings: AgentSettings;
  title: string;
}

function ModelFields({
  configuredProviders,
  description,
  disabled,
  idPrefix,
  models,
  onUpdate,
  settings,
  title,
}: ModelFieldsProps) {
  const { t } = useTranslation("settings");
  const { t: tAssistant } = useTranslation("assistant");
  const configuredProviderKey = configuredProviders
    .map(({ providerId }) => providerId)
    .join("\u0000");
  const [providerId, setProviderId] = useState(
    settings.defaultModel?.providerId ?? configuredProviders[0]?.providerId ?? "",
  );

  useEffect(() => {
    if (settings.defaultModel !== null) {
      setProviderId(settings.defaultModel.providerId);
    } else if (!configuredProviders.some((provider) => provider.providerId === providerId)) {
      setProviderId(configuredProviders[0]?.providerId ?? "");
    }
  }, [configuredProviderKey, settings.defaultModel?.providerId]);

  const providerModels = models.filter((model) => model.providerId === providerId);
  const selectedModel = models.find(
    (model) =>
      model.id === settings.defaultModel?.modelId &&
      model.providerId === settings.defaultModel?.providerId,
  ) ?? null;
  const selectedModelId = settings.defaultModel?.providerId === providerId
    ? settings.defaultModel.modelId
    : "";

  return (
    <>
      <section className="settings-field-row settings-field-row-stacked">
        <div className="settings-field-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="settings-field-control model-selection-controls">
          <Label className="sr-only" htmlFor={`${idPrefix}-provider`}>
            {t("agent.providerLabel")}
          </Label>
          <Select
            disabled={disabled || configuredProviders.length === 0}
            onValueChange={(nextProviderId) => {
              setProviderId(nextProviderId);
              if (settings.defaultModel?.providerId !== nextProviderId) {
                onUpdate({ ...settings, defaultModel: null });
              }
            }}
            value={providerId}
          >
            <SelectTrigger className="w-full" id={`${idPrefix}-provider`} size="sm">
              <SelectValue placeholder={t("agent.selectProvider")} />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              {configuredProviders.map(({ providerId: optionProviderId }) => (
                <SelectItem key={optionProviderId} value={optionProviderId}>
                  {AGENT_API_KEY_PROVIDERS.find(({ id }) => id === optionProviderId)
                    ?.label ?? optionProviderId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="sr-only" htmlFor={`${idPrefix}-model`}>
            {t("agent.modelLabel")}
          </Label>
          <Select
            disabled={disabled || providerId.length === 0 || providerModels.length === 0}
            onValueChange={(modelId) => {
              const model = providerModels.find(({ id }) => id === modelId);
              onUpdate({
                ...settings,
                defaultModel: model === undefined
                  ? null
                  : { modelId: model.id, providerId: model.providerId },
                thinkingLevel: model === undefined
                  ? settings.thinkingLevel
                  : supportedThinkingLevel(model, settings.thinkingLevel),
              });
            }}
            value={selectedModelId}
          >
            <SelectTrigger className="w-full" id={`${idPrefix}-model`} size="sm">
              <SelectValue placeholder={providerModels.length === 0
                ? t("agent.noModels")
                : t("agent.selectModel")} />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              {providerModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="settings-field-row">
        <div className="settings-field-copy">
          <h3>{t("agent.thinkingTitle")}</h3>
          <p>{t("agent.thinkingDescription")}</p>
        </div>
        <div className="settings-field-control">
          <Label className="sr-only" htmlFor={`${idPrefix}-thinking`}>
            {t("agent.thinkingLabel")}
          </Label>
          <Select
            disabled={disabled || settings.defaultModel === null || selectedModel?.reasoning === false}
            onValueChange={(thinkingLevel) => onUpdate({
              ...settings,
              thinkingLevel: thinkingLevel as AgentSettings["thinkingLevel"],
            })}
            value={settings.thinkingLevel}
          >
            <SelectTrigger className="w-full" id={`${idPrefix}-thinking`} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              {AGENT_THINKING_LEVEL_KEYS.filter(
                (level) => selectedModel?.thinkingLevelMap[level] !== null,
              ).map((level) => (
                <SelectItem key={level} value={level}>
                  {tAssistant(`thinking.${level}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
    </>
  );
}

export function ProjectModelSettingsSection({
  configuredProviders,
  globalAgentSettings,
  isSaving,
  models,
  onUpdate,
  onUpdateGlobal,
  projectAgentSettings,
}: ProjectModelSettingsSectionProps) {
  const { t } = useTranslation("settings");
  const projectSettings = projectAgentSettings ?? {
    ...globalAgentSettings,
    useGlobal: true,
  };

  return (
    <>
      <ModelFields
        configuredProviders={configuredProviders}
        description={t("agent.globalDescription")}
        disabled={isSaving}
        idPrefix="global-agent-model"
        models={models}
        onUpdate={onUpdateGlobal}
        settings={globalAgentSettings}
        title={t("agent.globalTitle")}
      />

      <section className="settings-field-row model-scope-setting">
        <div className="settings-field-copy">
          <h3>{t("agent.projectOverrideTitle")}</h3>
          <p>{t("agent.projectOverrideDescription")}</p>
        </div>
        <div className="settings-field-control">
          <Switch
            aria-label={t("agent.projectOverrideLabel")}
            checked={!projectSettings.useGlobal}
            disabled={isSaving || projectAgentSettings === null}
            onCheckedChange={(enabled) => onUpdate({
              ...(enabled && projectSettings.defaultModel === null
                ? globalAgentSettings
                : projectSettings),
              useGlobal: !enabled,
            })}
          />
        </div>
      </section>

      {!projectSettings.useGlobal && (
        <ModelFields
          configuredProviders={configuredProviders}
          description={t("agent.projectDescription")}
          disabled={isSaving || projectAgentSettings === null}
          idPrefix="project-agent-model"
          models={models}
          onUpdate={(settings) => onUpdate({ ...settings, useGlobal: false })}
          settings={projectSettings}
          title={t("agent.projectTitle")}
        />
      )}
    </>
  );
}
