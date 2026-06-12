/**
 * Centralized display formatting — currency, numbers, dates.
 *
 * One source of truth so every screen renders Rupiah and dates identically.
 * Dates are pinned to WIB (`Asia/Jakarta`) and locale `id-ID` so values do NOT
 * shift by a day when the runtime timezone is UTC (e.g. Vercel) — the app is
 * single-timezone (Indonesia). Use these instead of inline `toLocaleString`.
 */

const TZ = "Asia/Jakarta";
const LOCALE = "id-ID";

type DateInput = string | number | Date | null | undefined;

function toDate(v: DateInput): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── Currency ──────────────────────────────────────────────────────────────
/** `Rp 1.234.567` (rounded to whole rupiah). */
export function formatRupiah(n: number | null | undefined): string {
  const v = Number(n);
  return `Rp ${Math.round(Number.isFinite(v) ? v : 0).toLocaleString(LOCALE)}`;
}

/** Accounting style: negatives wrapped in parentheses — `(Rp 1.234)`. */
export function formatRupiahAccounting(n: number | null | undefined): string {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  const body = `Rp ${Math.round(Math.abs(safe)).toLocaleString(LOCALE)}`;
  return safe < 0 ? `(${body})` : body;
}

/** Compact: `1,2 M` / `1,2 jt` / `12 rb` — for tight dashboard stats. */
export function formatRupiahShort(n: number | null | undefined): string {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toLocaleString(LOCALE, { maximumFractionDigits: 0 })} rb`;
  return formatRupiah(safe);
}

/** Plain number with id-ID grouping — units/qty. */
export function formatNumber(n: number | null | undefined): string {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString(LOCALE);
}

// ── Dates (WIB) ───────────────────────────────────────────────────────────
/** `12 Jun 2026`. Empty string for null/invalid. */
export function formatDate(v: DateInput): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone: TZ });
}

/** `12 Jun` (no year) — compact table cells. */
export function formatDateShort(v: DateInput): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleDateString(LOCALE, { day: "2-digit", month: "short", timeZone: TZ });
}

/** `12 Juni 2026` — report headers. */
export function formatDateLong(v: DateInput): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

/** `Juni 2026` — period labels. */
export function formatMonth(v: DateInput): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleDateString(LOCALE, { month: "long", year: "numeric", timeZone: TZ });
}

/** `12 Jun 2026, 14:30` — receipts, timestamps. */
export function formatDateTime(v: DateInput): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleString(LOCALE, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: TZ,
  });
}

/** `14:30` — activity log / sidebar. */
export function formatTimeOnly(v: DateInput): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
