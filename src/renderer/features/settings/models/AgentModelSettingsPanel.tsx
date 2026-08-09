import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type {
  AgentApiKeyProviderId,
  AgentConfiguration,
  AgentModelOverride,
} from "../../../../shared/contracts/agent-configuration";
import type {
  AgentSettings,
  UpdateProjectAgentSettingsRequest,
} from "../../../../shared/contracts/settings";
import { AgentModelAdvancedSettings } from "../model-overrides/AgentModelAdvancedSettings";
import { CredentialSettingsSection } from "./sections/CredentialSettingsSection";
import { ProjectModelSettingsSection } from "./sections/ProjectModelSettingsSection";

interface AgentModelSettingsPanelProps {
  agentConfiguration: AgentConfiguration;
  credentialProvider: AgentApiKeyProviderId;
  isSaving: boolean;
  modelProviderId: string;
  onCredentialProviderChange: (providerId: AgentApiKeyProviderId) => void;
  onDirtyChange: (dirty: boolean) => void;
  onModelProviderChange: (providerId: string) => void;
  onRemoveCredential: (providerId: AgentApiKeyProviderId) => void;
  onResetModelSettings: () => Promise<boolean>;
  onSetApiKey: (
    providerId: AgentApiKeyProviderId,
    apiKey: string,
  ) => Promise<boolean>;
  onUpdateModelOverride: (
    override: AgentModelOverride,
  ) => Promise<boolean>;
  onUpdateProjectAgent: (update: UpdateProjectAgentSettingsRequest) => void;
  projectAgentSettings: AgentSettings | null;
}

export function AgentModelSettingsPanel({
  agentConfiguration,
  credentialProvider,
  isSaving,
  modelProviderId,
  onCredentialProviderChange,
  onDirtyChange,
  onModelProviderChange,
  onRemoveCredential,
  onResetModelSettings,
  onSetApiKey,
  onUpdateModelOverride,
  onUpdateProjectAgent,
  projectAgentSettings,
}: AgentModelSettingsPanelProps) {
  const { t } = useTranslation("settings");
  const [credentialInputVersion, setCredentialInputVersion] = useState(0);
  const agentSettings = projectAgentSettings ?? {
    defaultModel: null,
    thinkingLevel: "medium" as const,
  };
  const configuredProviders = agentConfiguration.providers.filter(
    ({ configured }) => configured,
  );
  const configuredProviderKey = configuredProviders
    .map(({ providerId }) => providerId)
    .join("\u0000");
  const selectedModel =
    agentConfiguration.models.find(
      ({ id, providerId }) =>
        id === agentSettings.defaultModel?.modelId &&
        providerId === agentSettings.defaultModel?.providerId,
    ) ?? null;

  useEffect(() => {
    const storedProvider = projectAgentSettings?.defaultModel?.providerId;
    if (storedProvider !== undefined) {
      onModelProviderChange(storedProvider);
      return;
    }
    if (
      configuredProviders.some(
        ({ providerId }) => providerId === modelProviderId,
      )
    ) {
      return;
    }
    onModelProviderChange(configuredProviders[0]?.providerId ?? "");
  }, [configuredProviderKey, projectAgentSettings?.defaultModel?.providerId]);

  const resetModelSettings = async (): Promise<void> => {
    if (!window.confirm(t("agent.resetConfirm"))) return;
    if (await onResetModelSettings()) {
      setCredentialInputVersion((current) => current + 1);
    }
  };

  return (
    <div
      aria-labelledby="settings-models-tab"
      className="settings-panel"
      id="settings-models-panel"
      role="tabpanel"
    >
      <header className="settings-panel-header">
        <h2>{t("categories.modelsTitle")}</h2>
        <p>{t("categories.modelsDescription")}</p>
      </header>

      <CredentialSettingsSection
        clearInputVersion={credentialInputVersion}
        credentialProvider={credentialProvider}
        isSaving={isSaving}
        onCredentialProviderChange={onCredentialProviderChange}
        onRemoveCredential={onRemoveCredential}
        onSetApiKey={onSetApiKey}
        providers={agentConfiguration.providers}
      />

      <ProjectModelSettingsSection
        agentSettings={agentSettings}
        configuredProviders={configuredProviders}
        isSaving={isSaving}
        modelProviderId={modelProviderId}
        models={agentConfiguration.models}
        onModelProviderChange={onModelProviderChange}
        onUpdate={onUpdateProjectAgent}
        projectAgentSettings={projectAgentSettings}
        selectedModel={selectedModel}
      />

      {agentSettings.defaultModel !== null && (
        <AgentModelAdvancedSettings
          isSaving={isSaving}
          model={selectedModel}
          onDirtyChange={onDirtyChange}
          onSave={onUpdateModelOverride}
          override={
            agentConfiguration.modelOverrides.find(
              ({ modelId, providerId }) =>
                modelId === agentSettings.defaultModel?.modelId &&
                providerId === agentSettings.defaultModel?.providerId,
            ) ?? null
          }
        />
      )}

      <section className="settings-field-row">
        <div className="settings-field-copy">
          <h3>{t("agent.resetTitle")}</h3>
          <p>{t("agent.resetDescription")}</p>
        </div>
        <div className="settings-field-control">
          <Button
            className="h-8 px-3 text-xs text-destructive hover:text-destructive"
            disabled={isSaving || projectAgentSettings === null}
            onClick={() => void resetModelSettings()}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" size={13} />
            {t("agent.resetAction")}
          </Button>
        </div>
      </section>
    </div>
  );
}
