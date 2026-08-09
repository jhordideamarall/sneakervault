"use client";

import { useMemo, useState } from "react";
import { FieldLabel, Input, Select } from "@sneakervault/ui";
import { SHOE_SIZE_OPTIONS } from "@sneakervault/shared";

type ShoeSizePickerProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
};

function normalizeSizeText(value: string): string {
  return value.trim().replace(",", ".");
}

export function ShoeSizePicker({
  id,
  label = "Size",
  value,
  onChange,
  required,
  disabled,
}: ShoeSizePickerProps) {
  const optionValues = useMemo(
    () => new Set(SHOE_SIZE_OPTIONS.map((option) => option.value)),
    [],
  );
  const [selectedMode, setSelectedMode] = useState<"preset" | "custom">(
    value && !optionValues.has(value) ? "custom" : "preset",
  );
  const mode = value && !optionValues.has(value) ? "custom" : selectedMode;

  return (
    <div>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </FieldLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
        {mode === "preset" ? (
          <Select
            id={id}
            value={optionValues.has(value) ? value : ""}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
          >
            <option value="">Pilih size</option>
            {SHOE_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            id={id}
            value={value}
            disabled={disabled}
            placeholder="Contoh 42 2/3"
            onChange={(event) => onChange(normalizeSizeText(event.target.value))}
          />
        )}
        <Select
          value={mode}
          disabled={disabled}
          onChange={(event) => {
            const nextMode = event.target.value as "preset" | "custom";
            setSelectedMode(nextMode);
            if (nextMode === "preset" && !optionValues.has(value)) onChange("");
          }}
        >
          <option value="preset">Picker</option>
          <option value="custom">Custom</option>
        </Select>
      </div>
    </div>
  );
}
