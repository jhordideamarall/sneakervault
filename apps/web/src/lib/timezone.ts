/**
 * WIB (Waktu Indonesia Barat) timezone utilities.
 *
 * Dewins.id targets Indonesia. We hardcode WIB = UTC+7 (no DST, fixed offset).
 *
 * Rules of thumb:
 * - All range filters sent to Supabase MUST include explicit "+07:00" offset,
 *   so the server/Postgres never has to guess timezone.
 * - All day/hour/month extraction from DB timestamps MUST go through the
 *   getWIB* helpers — never use `.getDate()` / `.getHours()` directly, because
 *   those depend on the runtime timezone (UTC on Vercel, WIB on local dev).
 */

export const WIB_OFFSET_HOURS = 7;
const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

/** Shift a Date forward by +7h so that its UTC getters return WIB values. */
function shiftToWIB(d: Date): Date {
  return new Date(d.getTime() + WIB_OFFSET_MS);
}

// ─── Extraction helpers (from ISO string or Date) ──────────────────────────

/** Day-of-month (1-31) in WIB. */
export function getWIBDay(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return shiftToWIB(d).getUTCDate();
}

/** Hour (0-23) in WIB. */
export function getWIBHour(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return shiftToWIB(d).getUTCHours();
}

/** Month (0-11) in WIB. */
export function getWIBMonth(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return shiftToWIB(d).getUTCMonth();
}

/** Full year in WIB. */
export function getWIBYear(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return shiftToWIB(d).getUTCFullYear();
}

// ─── Range builders (for Supabase .gte / .lt / .lte) ───────────────────────

/** "YYYY-MM-DD" → WIB midnight ISO string with explicit offset. */
export function wibStartOfDay(dateStr: string): string {
  return `${dateStr}T00:00:00.000+07:00`;
}

/** "YYYY-MM-DD" → WIB 23:59:59.999 ISO string with explicit offset. */
export function wibEndOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59.999+07:00`;
}

/** Year + month (0-11) → WIB midnight of the 1st day. */
export function wibStartOfMonth(year: number, month: number): string {
  const m = String(month + 1).padStart(2, "0");
  return `${year}-${m}-01T00:00:00.000+07:00`;
}

/** Year + month (0-11) → exclusive end (= WIB midnight of 1st day of NEXT month). */
export function wibStartOfNextMonth(year: number, month: number): string {
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  return wibStartOfMonth(nextYear, nextMonth);
}

/** Year + month (0-11) → inclusive end (last day at 23:59:59.999 WIB). */
export function wibEndOfMonth(year: number, month: number): string {
  const days = daysInWIBMonth(year, month);
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(days).padStart(2, "0");
  return `${year}-${mm}-${dd}T23:59:59.999+07:00`;
}

/** "YYYY-MM-DD" + hour 0-23 → start of that hour in WIB. */
export function wibHourStart(dateStr: string, hour: number): string {
  const h = String(hour).padStart(2, "0");
  return `${dateStr}T${h}:00:00.000+07:00`;
}

// ─── Current time helpers ──────────────────────────────────────────────────

/**
 * Returns a Date whose UTC getters (getUTCDate, getUTCMonth, etc.) return the
 * CURRENT WIB values. The underlying epoch ms is NOT the real "now"; only use
 * the UTC getters on the returned Date.
 */
export function nowWIB(): Date {
  return shiftToWIB(new Date());
}

/** Current WIB calendar date as "YYYY-MM-DD". */
export function todayWIB(): string {
  const n = nowWIB();
  const y = n.getUTCFullYear();
  const m = String(n.getUTCMonth() + 1).padStart(2, "0");
  const d = String(n.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Number of days in a WIB calendar month. Month is 0-11.
 * Safe because the last day of a month is identical in any timezone when
 * computed from pure calendar arithmetic.
 */
export function daysInWIBMonth(year: number, month: number): number {
  // Using UTC Date math to avoid host timezone surprises.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Day-of-week of the 1st of a WIB month (0=Sunday..6=Saturday).
 * Pure calendar arithmetic — not timezone sensitive.
 */
export function firstWeekdayOfWIBMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}
