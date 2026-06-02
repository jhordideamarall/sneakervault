import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const baseClass =
  "block w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-sm text-white/90 placeholder:text-white/30 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200";

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(baseClass, className)} />;
}

// id-ID formatting uses "." as the thousands separator and "," as the decimal
// separator. Parse deterministically by locale instead of guessing each
// separator's role from group length — that heuristic collapses values like
// "1.0000" back to 1 and blocks typing past 4 digits.
function parseFormattedNumber(value: string, maximumFractionDigits = 0): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const negative = trimmed.startsWith("-");

  // Integer input (e.g. Rupiah): keep digits only, ignore every separator.
  if (maximumFractionDigits <= 0) {
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return 0;
    const parsed = Number(digits);
    return negative ? -parsed : parsed;
  }

  // Decimal input: drop thousands separators ("."), keep "," as the decimal mark.
  const cleaned = trimmed.replace(/[^\d,]/g, "");
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(",");
  let normalized: string;
  if (lastComma === -1) {
    normalized = cleaned.replace(/,/g, "");
  } else {
    const intPart = cleaned.slice(0, lastComma).replace(/,/g, "");
    const fracPart = cleaned
      .slice(lastComma + 1)
      .replace(/,/g, "")
      .slice(0, maximumFractionDigits);
    normalized = `${intPart}.${fracPart}`;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function formatNumberValue(value: number | string | undefined, maximumFractionDigits: number) {
  if (value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : parseFormattedNumber(value, maximumFractionDigits);
  if (!Number.isFinite(numeric) || numeric === 0) return value === 0 ? "0" : "";
  return numeric.toLocaleString("id-ID", { maximumFractionDigits });
}

export type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange"
> & {
  value: number | string | undefined;
  onValueChange: (value: number) => void;
  maximumFractionDigits?: number;
  align?: "left" | "right";
};

export function NumberInput({
  className,
  value,
  onValueChange,
  maximumFractionDigits = 0,
  align = "right",
  ...rest
}: NumberInputProps) {
  return (
    <input
      {...rest}
      type="text"
      inputMode={maximumFractionDigits > 0 ? "decimal" : "numeric"}
      value={formatNumberValue(value, maximumFractionDigits)}
      onChange={(event) => onValueChange(parseFormattedNumber(event.target.value, maximumFractionDigits))}
      className={cn(
        baseClass,
        "no-number-spinner tabular-nums",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    />
  );
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(baseClass, "min-h-[80px]", className)} />;
}

export function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-sm font-medium text-white/60"
    >
      {children}
      {required && <span className="ml-0.5 text-[#e94560]">*</span>}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#e94560]">{message}</p>;
}
