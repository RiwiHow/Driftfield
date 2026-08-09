import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENT_API_KEY_PROVIDERS,
  AGENT_THINKING_LEVEL_KEYS,
  type AgentModelOption,
  type AgentProviderStatus,
} from "../../../../../shared/contracts/agent-configuration";
import type {
  AgentSettings,
  UpdateProjectAgentSettingsRequest,
} from "../../../../../shared/contracts/settings";
import { supportedThinkingLevel } from "../model-selection";

interface ProjectModelSettingsSectionProps {
  agentSettings: AgentSettings;
  configuredProviders: AgentProviderStatus[];
  isSaving: boolean;
  modelProviderId: string;
  models: AgentModelOption[];
  onModelProviderChange: (providerId: string) => void;
  onUpdate: (update: UpdateProjectAgentSettingsRequest) => void;
  projectAgentSettings: AgentSettings | null;
  selectedModel: AgentModelOption | null;
}

export function ProjectModelSettingsSection({
  agentSettings,
  configuredProviders,
  isSaving,
  modelProviderId,
  models,
  onModelProviderChange,
  onUpdate,
  projectAgentSettings,
  selectedModel,
}: ProjectModelSettingsSectionProps) {
  const { t } = useTranslation("settings");
  const { t: tAssistant } = useTranslation("assistant");
  const providerModels = models.filter(
    ({ providerId }) => providerId === modelProviderId,
  );
  const selectedModelId =
    agentSettings.defaultModel?.providerId === modelProviderId
      ? agentSettings.defaultModel.modelId
      : "";

  return (
    <>
      <section className="settings-field-row settings-field-row-stacked">
        <div className="settings-field-copy">
          <h3>{t("agent.modelTitle")}</h3>
          <p>{t("agent.modelDescription")}</p>
        </div>
        <div className="settings-field-control model-selection-controls">
          <Label className="sr-only" htmlFor="project-model-provider">
            {t("agent.providerLabel")}
          </Label>
          <Select
            disabled={
              isSaving ||
              projectAgentSettings === null ||
              configuredProviders.length === 0
            }
            onValueChange={(providerId) => {
              onModelProviderChange(providerId);
              if (agentSettings.defaultModel?.providerId !== providerId) {
                onUpdate({ ...agentSettings, defaultModel: null });
              }
            }}
            value={modelProviderId}
          >
            <SelectTrigger
              className="w-full"
              id="project-model-provider"
              size="sm"
            >
              <SelectValue placeholder={t("agent.selectProvider")} />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              {configuredProviders.map(({ providerId }) => (
                <SelectItem key={providerId} value={providerId}>
                  {AGENT_API_KEY_PROVIDERS.find(({ id }) => id === providerId)
                    ?.label ?? providerId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label className="sr-only" htmlFor="default-agent-model">
            {t("agent.modelLabel")}
          </Label>
          <Select
            disabled={
              isSaving ||
              projectAgentSettings === null ||
              modelProviderId.length === 0 ||
              providerModels.length === 0
            }
            onValueChange={(modelId) => {
              const model = providerModels.find(({ id }) => id === modelId);
              onUpdate({
                ...agentSettings,
                defaultModel:
                  model === undefined
                    ? null
                    : { modelId: model.id, providerId: model.providerId },
                thinkingLevel:
                  model === undefined
                    ? agentSettings.thinkingLevel
                    : supportedThinkingLevel(model, agentSettings.thinkingLevel),
              });
            }}
            value={selectedModelId}
          >
            <SelectTrigger
              className="w-full"
              id="default-agent-model"
              size="sm"
            >
              <SelectValue
                placeholder={
                  providerModels.length === 0
                    ? t("agent.noModels")
                    : t("agent.selectModel")
                }
              />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              {providerModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
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
          <Label className="sr-only" htmlFor="agent-thinking-level">
            {t("agent.thinkingLabel")}
          </Label>
          <Select
            disabled={
              isSaving ||
              projectAgentSettings === null ||
              agentSettings.defaultModel === null ||
              selectedModel?.reasoning === false
            }
            onValueChange={(thinkingLevel) =>
              onUpdate({
                ...agentSettings,
                thinkingLevel:
                  thinkingLevel as AgentSettings["thinkingLevel"],
              })
            }
            value={agentSettings.thinkingLevel}
          >
            <SelectTrigger
              className="w-full"
              id="agent-thinking-level"
              size="sm"
            >
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
