import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  AgentApiKeyProviderId,
  AgentConfiguration,
  AgentModelOverride,
} from "../../../../shared/contracts/agent-configuration";
import type {
  AgentSettings,
  AppSettings,
  AppTheme,
  ProjectAgentSettings,
  UpdateAppSettingsRequest,
  UpdateProjectAgentSettingsRequest,
} from "../../../../shared/contracts/settings";
import { InterfaceSettingsPanel } from "../interface/InterfaceSettingsPanel";
import { AgentModelSettingsPanel } from "../models/AgentModelSettingsPanel";
import {
  SettingsCategoryNav,
  type SettingsCategory,
} from "./SettingsCategoryNav";

interface SettingsDialogProps {
  agentConfiguration: AgentConfiguration;
  globalAgentSettings: AgentSettings;
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveCredential: (providerId: AgentApiKeyProviderId) => void;
  onResetModelSettings: () => Promise<boolean>;
  onSetApiKey: (
    providerId: AgentApiKeyProviderId,
    apiKey: string,
  ) => Promise<boolean>;
  onUpdate: (update: UpdateAppSettingsRequest) => void;
  onUpdateProjectAgent: (update: UpdateProjectAgentSettingsRequest) => void;
  onUpdateModelOverride: (
    override: AgentModelOverride,
  ) => Promise<boolean>;
  open: boolean;
  projectAgentSettings: ProjectAgentSettings | null;
  resolvedTheme: AppTheme;
  settings: AppSettings;
}

export function SettingsDialog({
  agentConfiguration,
  globalAgentSettings,
  error,
  isSaving,
  onOpenChange,
  onRemoveCredential,
  onResetModelSettings,
  onSetApiKey,
  onUpdate,
  onUpdateProjectAgent,
  onUpdateModelOverride,
  open,
  projectAgentSettings,
  resolvedTheme,
  settings,
}: SettingsDialogProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [category, setCategory] =
    useState<SettingsCategory>("interface");
  const [credentialProvider, setCredentialProvider] =
    useState<AgentApiKeyProviderId>("anthropic");
  const [isModelOverrideDirty, setIsModelOverrideDirty] = useState(false);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="adaptive-dialog settings-dialog gap-0 p-0">
        <header className="settings-header">
          <DialogTitle className="settings-dialog-title">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="settings-dialog-description">
            {t("description")}
          </DialogDescription>
        </header>

        <div className="settings-body">
          <SettingsCategoryNav
            category={category}
            onCategoryChange={setCategory}
          />
          {category === "interface" ? (
            <InterfaceSettingsPanel
              isSaving={isSaving}
              onUpdate={onUpdate}
              resolvedTheme={resolvedTheme}
              settings={settings}
            />
          ) : (
            <AgentModelSettingsPanel
              agentConfiguration={agentConfiguration}
              globalAgentSettings={globalAgentSettings}
              credentialProvider={credentialProvider}
              isSaving={isSaving}
              onCredentialProviderChange={setCredentialProvider}
              onDirtyChange={setIsModelOverrideDirty}
              onRemoveCredential={onRemoveCredential}
              onResetModelSettings={onResetModelSettings}
              onSetApiKey={onSetApiKey}
              onUpdateModelOverride={onUpdateModelOverride}
              onUpdateProjectAgent={onUpdateProjectAgent}
              onUpdateGlobalAgent={(agent) => onUpdate({ agent })}
              projectAgentSettings={projectAgentSettings}
            />
          )}
        </div>

        <footer className="settings-footer">
          <span aria-live="polite" className={cn(error && "is-error")}>
            {error ??
              (isSaving
                ? t("saveStatus.saving")
                : category === "models"
                  ? t(
                      isModelOverrideDirty
                        ? "saveStatus.modelUnsaved"
                        : "saveStatus.modelSaved",
                    )
                  : t("saveStatus.saved"))}
          </span>
          <Button
            className="h-8 px-3 text-xs"
            onClick={() => onOpenChange(false)}
            size="sm"
            variant="secondary"
          >
            {tCommon("actions.done")}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
