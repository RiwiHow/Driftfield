import { Check, Minimize2, Power } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  AppSettings,
  AppTheme,
  UpdateAppSettingsRequest,
} from "../../../../shared/contracts/settings";
import { APP_THEMES } from "../../../../shared/contracts/settings";
import { APP_LANGUAGE_OPTIONS } from "../../../../shared/i18n/languages";

interface InterfaceSettingsPanelProps {
  isSaving: boolean;
  onUpdate: (update: UpdateAppSettingsRequest) => void;
  resolvedTheme: AppTheme;
  settings: AppSettings;
}

const themeOptionMetadata = {
  "github-dark": {
    descriptionKey: "githubDark",
    label: "GitHub Dark",
  },
  "github-light": {
    descriptionKey: "githubLight",
    label: "GitHub Light",
  },
} as const satisfies Record<
  AppTheme,
  {
    descriptionKey: "githubDark" | "githubLight";
    label: string;
  }
>;

const themeOptions = APP_THEMES.map((theme) => ({
  ...themeOptionMetadata[theme],
  theme,
}));

const editorFontSizes = [14, 15, 16, 17, 18, 20, 22, 24];

export function InterfaceSettingsPanel({
  isSaving,
  onUpdate,
  resolvedTheme,
  settings,
}: InterfaceSettingsPanelProps) {
  const { t } = useTranslation("settings");
  const canChooseCloseBehavior = window.driftfield.platform !== "darwin";

  return (
    <div
      aria-labelledby="settings-interface-tab"
      className="settings-panel"
      id="settings-interface-panel"
      role="tabpanel"
    >
      <header className="settings-panel-header">
        <h2>{t("categories.interfaceTitle")}</h2>
        <p>{t("categories.interfaceDescription")}</p>
      </header>

      <section className="settings-field-row">
        <div className="settings-field-copy">
          <h3>{t("language.title")}</h3>
          <p>{t("language.description")}</p>
        </div>
        <div className="settings-field-control">
          <Label className="sr-only" htmlFor="application-language">
            {t("language.label")}
          </Label>
          <Select
            disabled={isSaving}
            onValueChange={(language) =>
              onUpdate({ language: language as AppSettings["language"] })
            }
            value={settings.language}
          >
            <SelectTrigger
              className="w-full"
              id="application-language"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              {APP_LANGUAGE_OPTIONS.map((language) => (
                <SelectItem key={language.id} value={language.id}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="settings-field-row settings-field-row-stacked">
        <div className="settings-field-copy">
          <h3>{t("appearance.title")}</h3>
          <p>{t("appearance.description")}</p>
        </div>

        <div className="theme-system-option">
          <div>
            <Label htmlFor="follow-system-theme">
              {t("appearance.followSystem")}
            </Label>
            <p>{t("appearance.followSystemDescription")}</p>
          </div>
          <Switch
            aria-label={t("appearance.followSystem")}
            checked={settings.theme === "system"}
            disabled={isSaving}
            id="follow-system-theme"
            onCheckedChange={(checked) =>
              onUpdate({ theme: checked ? "system" : resolvedTheme })
            }
          />
        </div>

        <div className="theme-options">
          {themeOptions.map((option) => {
            const followsSystem = settings.theme === "system";
            const isSelected = resolvedTheme === option.theme;

            return (
              <Label
                className={cn(
                  "theme-option relative block min-w-0 cursor-pointer",
                  (isSaving || followsSystem) &&
                    "pointer-events-none opacity-50",
                )}
                key={option.theme}
              >
                <input
                  checked={isSelected}
                  className="peer sr-only"
                  disabled={isSaving || followsSystem}
                  name="application-theme"
                  onChange={() => onUpdate({ theme: option.theme })}
                  type="radio"
                  value={option.theme}
                />
                <span className="theme-option-content">
                  <span
                    aria-hidden="true"
                    className="theme-swatch"
                    data-theme={option.theme}
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 pr-5">
                    <strong>{option.label}</strong>
                    <small>
                      {t(`appearance.themes.${option.descriptionKey}`)}
                    </small>
                  </span>
                  {isSelected && (
                    <Check
                      aria-hidden="true"
                      className="theme-option-check"
                      size={15}
                    />
                  )}
                </span>
              </Label>
            );
          })}
        </div>
      </section>

      <section className="settings-field-row">
        <div className="settings-field-copy">
          <h3>{t("fontSize.title")}</h3>
          <p>{t("fontSize.description")}</p>
        </div>

        <div className="settings-field-control settings-field-control-narrow">
          <Label className="sr-only" htmlFor="editor-font-size">
            {t("fontSize.label")}
          </Label>
          <Select
            disabled={isSaving}
            onValueChange={(fontSize) =>
              onUpdate({ editorFontSize: Number(fontSize) })
            }
            value={String(settings.editorFontSize)}
          >
            <SelectTrigger className="w-24" id="editor-font-size" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              {editorFontSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} px
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {canChooseCloseBehavior && (
        <section className="settings-field-row">
          <div className="settings-field-copy">
            <h3>{t("closeBehavior.title")}</h3>
            <p>{t("closeBehavior.description")}</p>
          </div>

          <div
            aria-label={t("closeBehavior.label")}
            className="close-behavior-options inline-flex shrink-0 rounded-lg border bg-secondary p-0.5"
            role="group"
          >
            <Button
              aria-pressed={settings.closeWindowBehavior === "quit"}
              disabled={isSaving}
              onClick={() => onUpdate({ closeWindowBehavior: "quit" })}
              size="sm"
              variant={
                settings.closeWindowBehavior === "quit" ? "secondary" : "ghost"
              }
            >
              <Power aria-hidden="true" size={13} />
              {t("closeBehavior.quit")}
            </Button>
            <Button
              aria-pressed={settings.closeWindowBehavior === "minimize"}
              disabled={isSaving}
              onClick={() => onUpdate({ closeWindowBehavior: "minimize" })}
              size="sm"
              variant={
                settings.closeWindowBehavior === "minimize"
                  ? "secondary"
                  : "ghost"
              }
            >
              <Minimize2 aria-hidden="true" size={13} />
              {t("closeBehavior.minimize")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
