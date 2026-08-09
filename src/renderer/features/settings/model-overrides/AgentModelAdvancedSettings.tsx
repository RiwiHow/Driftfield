import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type {
  AgentModelOption,
  AgentModelOverride,
} from "../../../../shared/contracts/agent-configuration";
import {
  createModelOverride,
  inferRoutingMode,
  type RoutingMode,
} from "./model-override-form";
import { CompatibilitySection } from "./sections/CompatibilitySection";
import { CustomHeadersSection } from "./sections/CustomHeadersSection";
import { OpenRouterRoutingSection } from "./sections/OpenRouterRoutingSection";
import { ThinkingLevelMapSection } from "./sections/ThinkingLevelMapSection";

interface AgentModelAdvancedSettingsProps {
  isSaving: boolean;
  model: AgentModelOption | null;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (override: AgentModelOverride) => Promise<boolean>;
  override: AgentModelOverride | null;
}

export function AgentModelAdvancedSettings({
  isSaving,
  model,
  onDirtyChange,
  onSave,
  override,
}: AgentModelAdvancedSettingsProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [draft, setDraft] = useState<AgentModelOverride | null>(null);
  const [routingMode, setRoutingMode] =
    useState<RoutingMode>("automatic");
  const persisted = useMemo(
    () =>
      model === null
        ? null
        : structuredClone(override ?? createModelOverride(model)),
    [model, override],
  );

  useEffect(() => {
    setDraft(persisted);
    setRoutingMode(inferRoutingMode(persisted?.openRouterRouting ?? null));
  }, [persisted]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(persisted),
    [draft, persisted],
  );

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  if (model === null || draft === null) return null;

  const canSave =
    isDirty &&
    (routingMode !== "exact" || draft.openRouterRouting?.only.length === 1);

  return (
    <section className="model-advanced-settings">
      <header className="model-advanced-header">
        <div>
          <h3>{t("modelConfig.title")}</h3>
          <p>{t("modelConfig.description", { model: model.name })}</p>
        </div>
        <Button
          className="h-8 px-3 text-xs"
          disabled={isSaving || !canSave}
          onClick={() => void onSave(draft)}
          size="sm"
          type="button"
          variant="outline"
        >
          {tCommon("actions.save")}
        </Button>
      </header>

      {model.providerId === "openrouter" && (
        <OpenRouterRoutingSection
          draft={draft}
          isSaving={isSaving}
          onChange={setDraft}
          onRoutingModeChange={setRoutingMode}
          routingMode={routingMode}
        />
      )}

      <ThinkingLevelMapSection
        draft={draft}
        isSaving={isSaving}
        onChange={setDraft}
      />
      <CompatibilitySection
        draft={draft}
        isSaving={isSaving}
        onChange={setDraft}
      />
      <CustomHeadersSection
        draft={draft}
        onChange={setDraft}
      />
    </section>
  );
}
