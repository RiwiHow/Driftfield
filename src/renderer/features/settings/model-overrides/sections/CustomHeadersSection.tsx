import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentModelOverride } from "../../../../../shared/contracts/agent-configuration";

interface CustomHeadersSectionProps {
  draft: AgentModelOverride;
  onChange: (draft: AgentModelOverride) => void;
}

export function CustomHeadersSection({
  draft,
  onChange,
}: CustomHeadersSectionProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <details className="model-config-disclosure">
      <summary>{t("modelConfig.headers.title")}</summary>
      <p>{t("modelConfig.headers.description")}</p>
      <div className="model-header-list">
        {draft.headers.map((header, index) => (
          <div className="model-header-row" key={index}>
            <Input
              className="h-8 text-xs"
              onChange={(event) =>
                onChange({
                  ...draft,
                  headers: draft.headers.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                })
              }
              placeholder={t("modelConfig.headers.name")}
              value={header.name}
            />
            <Input
              className="h-8 text-xs"
              onChange={(event) =>
                onChange({
                  ...draft,
                  headers: draft.headers.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, value: event.target.value }
                      : item,
                  ),
                })
              }
              placeholder={t("modelConfig.headers.value")}
              value={header.value}
            />
            <Button
              aria-label={tCommon("actions.remove")}
              onClick={() =>
                onChange({
                  ...draft,
                  headers: draft.headers.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" size={14} />
            </Button>
          </div>
        ))}
        <Button
          className="w-fit text-xs"
          disabled={draft.headers.length >= 16}
          onClick={() =>
            onChange({
              ...draft,
              headers: [...draft.headers, { name: "", value: "" }],
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" size={13} />
          {t("modelConfig.headers.add")}
        </Button>
      </div>
    </details>
  );
}
