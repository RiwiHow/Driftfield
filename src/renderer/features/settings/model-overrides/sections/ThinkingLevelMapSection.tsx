import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENT_THINKING_LEVEL_KEYS,
  type AgentModelOverride,
} from "../../../../../shared/contracts/agent-configuration";
import {
  changeThinkingMapMode,
  type ThinkingMapMode,
} from "../model-override-form";

interface ThinkingLevelMapSectionProps {
  draft: AgentModelOverride;
  isSaving: boolean;
  onChange: (draft: AgentModelOverride) => void;
}

export function ThinkingLevelMapSection({
  draft,
  isSaving,
  onChange,
}: ThinkingLevelMapSectionProps) {
  const { t } = useTranslation("settings");
  const { t: tAssistant } = useTranslation("assistant");

  return (
    <details className="model-config-disclosure" open>
      <summary>{t("modelConfig.thinkingMap.title")}</summary>
      <p>{t("modelConfig.thinkingMap.description")}</p>
      <div className="thinking-map-grid">
        {AGENT_THINKING_LEVEL_KEYS.map((level) => {
          const mapped = draft.thinkingLevelMap[level];
          const mode: ThinkingMapMode =
            mapped === undefined
              ? "default"
              : mapped === null
                ? "unsupported"
                : "custom";
          return (
            <div className="thinking-map-row" key={level}>
              <Label>{tAssistant(`thinking.${level}`)}</Label>
              <Select
                disabled={isSaving}
                onValueChange={(value) =>
                  onChange(
                    changeThinkingMapMode(
                      draft,
                      level,
                      value as ThinkingMapMode,
                    ),
                  )
                }
                value={mode}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="settings-select-content">
                  {(["default", "unsupported", "custom"] as const).map(
                    (option) => (
                      <SelectItem key={option} value={option}>
                        {t(`modelConfig.thinkingMap.${option}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs"
                disabled={isSaving || mode !== "custom"}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    thinkingLevelMap: {
                      ...draft.thinkingLevelMap,
                      [level]: event.target.value,
                    },
                  })
                }
                placeholder={level}
                value={typeof mapped === "string" ? mapped : ""}
              />
            </div>
          );
        })}
      </div>
    </details>
  );
}
