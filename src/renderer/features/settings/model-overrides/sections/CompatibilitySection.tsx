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
  AGENT_THINKING_FORMATS,
  type AgentModelOverride,
} from "../../../../../shared/contracts/agent-configuration";
import { TriStateField } from "../fields/TriStateField";
import { fromTriState, toTriState } from "../model-override-form";

interface CompatibilitySectionProps {
  draft: AgentModelOverride;
  isSaving: boolean;
  onChange: (draft: AgentModelOverride) => void;
}

export function CompatibilitySection({
  draft,
  isSaving,
  onChange,
}: CompatibilitySectionProps) {
  const { t } = useTranslation("settings");

  return (
    <details className="model-config-disclosure">
      <summary>{t("modelConfig.compatibility.title")}</summary>
      <p>{t("modelConfig.compatibility.description")}</p>
      <div className="model-config-grid">
        {(
          [
            "supportsDeveloperRole",
            "supportsReasoningEffort",
            "supportsUsageInStreaming",
          ] as const
        ).map((key) => (
          <TriStateField
            disabled={isSaving}
            key={key}
            label={t(`modelConfig.compatibility.${key}`)}
            onChange={(value) =>
              onChange({
                ...draft,
                compatibility: {
                  ...draft.compatibility,
                  [key]: fromTriState(value),
                },
              })
            }
            value={toTriState(draft.compatibility[key])}
          />
        ))}
        <Label>{t("modelConfig.compatibility.thinkingFormat")}</Label>
        <Select
          disabled={isSaving}
          onValueChange={(value) =>
            onChange({
              ...draft,
              compatibility: {
                ...draft.compatibility,
                thinkingFormat:
                  value === "default"
                    ? null
                    : (value as AgentModelOverride["compatibility"]["thinkingFormat"]),
              },
            })
          }
          value={draft.compatibility.thinkingFormat ?? "default"}
        >
          <SelectTrigger className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="settings-select-content">
            <SelectItem value="default">
              {t("modelConfig.states.default")}
            </SelectItem>
            {AGENT_THINKING_FORMATS.map((format) => (
              <SelectItem key={format} value={format}>
                {format}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label>{t("modelConfig.compatibility.maxTokensField")}</Label>
        <Select
          disabled={isSaving}
          onValueChange={(value) =>
            onChange({
              ...draft,
              compatibility: {
                ...draft.compatibility,
                maxTokensField:
                  value === "default"
                    ? null
                    : (value as "max_tokens" | "max_completion_tokens"),
              },
            })
          }
          value={draft.compatibility.maxTokensField ?? "default"}
        >
          <SelectTrigger className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="settings-select-content">
            <SelectItem value="default">
              {t("modelConfig.states.default")}
            </SelectItem>
            <SelectItem value="max_tokens">max_tokens</SelectItem>
            <SelectItem value="max_completion_tokens">
              max_completion_tokens
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </details>
  );
}
