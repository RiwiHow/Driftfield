import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type {
  AgentApiKeyProviderId,
  AgentConfiguration,
  AgentModelOverride,
} from "../../../../shared/contracts/agent-configuration";
import type {
  AgentSettings,
  ProjectAgentSettings,
  UpdateProjectAgentSettingsRequest,
} from "../../../../shared/contracts/settings";
import { AgentModelAdvancedSettings } from "../model-overrides/AgentModelAdvancedSettings";
import { CredentialSettingsSection } from "./sections/CredentialSettingsSection";
import { ProjectModelSettingsSection } from "./sections/ProjectModelSettingsSection";

interface AgentModelSettingsPanelProps {
  agentConfiguration: AgentConfiguration;
  globalAgentSettings: AgentSettings;
  credentialProvider: AgentApiKeyProviderId;
  isSaving: boolean;
  onCredentialProviderChange: (providerId: AgentApiKeyProviderId) => void;
  onDirtyChange: (dirty: boolean) => void;
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
  onUpdateGlobalAgent: (update: AgentSettings) => void;
  projectAgentSettings: ProjectAgentSettings | null;
}

export function AgentModelSettingsPanel({
  agentConfiguration,
  globalAgentSettings,
  credentialProvider,
  isSaving,
  onCredentialProviderChange,
  onDirtyChange,
  onRemoveCredential,
  onResetModelSettings,
  onSetApiKey,
  onUpdateModelOverride,
  onUpdateProjectAgent,
  onUpdateGlobalAgent,
  projectAgentSettings,
}: AgentModelSettingsPanelProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { t: tErrors } = useTranslation("errors");
  const [credentialInputVersion, setCredentialInputVersion] = useState(0);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const configuredProviders = agentConfiguration.providers.filter(
    ({ configured }) => configured,
  );
  const selectedGlobalModel =
    agentConfiguration.models.find(
      ({ id, providerId }) =>
        id === globalAgentSettings.defaultModel?.modelId &&
        providerId === globalAgentSettings.defaultModel?.providerId,
    ) ?? null;

  const resetModelSettings = async (): Promise<void> => {
    if (isResetting) return;
    setIsResetting(true);
    setResetError(false);
    if (await onResetModelSettings()) {
      setCredentialInputVersion((current) => current + 1);
      setIsResetDialogOpen(false);
    } else {
      setResetError(true);
    }
    setIsResetting(false);
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
        configuredProviders={configuredProviders}
        globalAgentSettings={globalAgentSettings}
        globalAdvancedSettings={
          globalAgentSettings.defaultModel === null ? null : (
            <AgentModelAdvancedSettings
              isSaving={isSaving}
              model={selectedGlobalModel}
              onDirtyChange={onDirtyChange}
              onSave={onUpdateModelOverride}
              override={
                agentConfiguration.modelOverrides.find(
                  ({ modelId, providerId }) =>
                    modelId === globalAgentSettings.defaultModel?.modelId &&
                    providerId === globalAgentSettings.defaultModel?.providerId,
                ) ?? null
              }
            />
          )
        }
        isSaving={isSaving}
        models={agentConfiguration.models}
        onUpdate={onUpdateProjectAgent}
        onUpdateGlobal={onUpdateGlobalAgent}
        projectAgentSettings={projectAgentSettings}
      />

      <section className="settings-field-row">
        <div className="settings-field-copy">
          <h3>{t("agent.resetTitle")}</h3>
          <p>{t("agent.resetDescription")}</p>
        </div>
        <div className="settings-field-control">
          <Button
            className="h-8 px-3 text-xs text-destructive hover:text-destructive"
            onClick={() => {
              setResetError(false);
              setIsResetDialogOpen(true);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden="true" size={13} />
            {t("agent.resetAction")}
          </Button>
        </div>
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          if (!isResetting) {
            setResetError(false);
            setIsResetDialogOpen(open);
          }
        }}
        open={isResetDialogOpen}
      >
        <AlertDialogContent className="max-w-[360px]">
          <AlertDialogTitle>{t("agent.resetTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("agent.resetConfirm")}
          </AlertDialogDescription>
          {resetError && (
            <p className="text-[10px] text-destructive" role="alert">
              {tErrors("agent.resetFailed")}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button disabled={isResetting} size="sm" variant="ghost">
                {tCommon("actions.cancel")}
              </Button>
            </AlertDialogCancel>
            <Button
              disabled={isResetting}
              onClick={() => void resetModelSettings()}
              size="sm"
              variant="destructive"
            >
              {isResetting
                ? t("saveStatus.saving")
                : t("agent.resetAction")}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
