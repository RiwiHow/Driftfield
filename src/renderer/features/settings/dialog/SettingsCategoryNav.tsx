import { Cpu, MonitorCog } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export type SettingsCategory = "interface" | "models";

interface SettingsCategoryNavProps {
  category: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

export function SettingsCategoryNav({
  category,
  onCategoryChange,
}: SettingsCategoryNavProps) {
  const { t } = useTranslation("settings");

  return (
    <nav
      aria-label={t("categories.label")}
      className="settings-category-nav"
      role="tablist"
    >
      <button
        aria-controls="settings-interface-panel"
        aria-selected={category === "interface"}
        className={cn(
          "settings-category-button",
          category === "interface" && "is-active",
        )}
        id="settings-interface-tab"
        onClick={() => onCategoryChange("interface")}
        role="tab"
        type="button"
      >
        <MonitorCog aria-hidden="true" size={17} />
        <span>
          <strong>{t("categories.interfaceTitle")}</strong>
          <small>{t("categories.interfaceDescription")}</small>
        </span>
      </button>
      <button
        aria-controls="settings-models-panel"
        aria-selected={category === "models"}
        className={cn(
          "settings-category-button",
          category === "models" && "is-active",
        )}
        id="settings-models-tab"
        onClick={() => onCategoryChange("models")}
        role="tab"
        type="button"
      >
        <Cpu aria-hidden="true" size={17} />
        <span>
          <strong>{t("categories.modelsTitle")}</strong>
          <small>{t("categories.modelsDescription")}</small>
        </span>
      </button>
    </nav>
  );
}
