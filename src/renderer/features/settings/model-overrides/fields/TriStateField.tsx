import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TriState } from "../model-override-form";

interface TriStateFieldProps {
  disabled: boolean;
  label: string;
  onChange: (value: TriState) => void;
  value: TriState;
}

export function TriStateField({
  disabled,
  label,
  onChange,
  value,
}: TriStateFieldProps) {
  const { t } = useTranslation("settings");

  return (
    <>
      <Label>{label}</Label>
      <Select
        disabled={disabled}
        onValueChange={(nextValue) => onChange(nextValue as TriState)}
        value={value}
      >
        <SelectTrigger className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="settings-select-content">
          {(["default", "enabled", "disabled"] as const).map((state) => (
            <SelectItem key={state} value={state}>
              {t(`modelConfig.states.${state}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
