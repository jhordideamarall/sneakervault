"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  nowWIB,
  wibStartOfDay,
  wibEndOfDay,
  wibStartOfMonth,
  wibStartOfNextMonth,
} from "./timezone";

type DateFilter = {
  date: string | null; // YYYY-MM-DD or null (= whole month)
  month: number; // 0-11, interpreted in WIB
  year: number;
};

type DateFilterContextType = {
  filter: DateFilter;
  setDate: (date: string | null) => void;
  setMonth: (month: number, year: number) => void;
  prevMonth: () => void;
  nextMonth: () => void;
  /** WIB-aware ISO string range for queries (inclusive start). */
  from: string;
  /**
   * WIB-aware ISO string range for queries.
   * - For single-date filter: end-of-day inclusive (use with .lte).
   * - For month filter: start of NEXT month, exclusive (use with .lt).
   */
  to: string;
  /** True if the current filter is a single day. */
  isSingleDay: boolean;
};

const DateFilterContext = createContext<DateFilterContextType | null>(null);

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize from URL params. Parse strings manually so we don't rely on the
  // browser timezone interpreting a naive date.
  const initialFilter = (): DateFilter => {
    const dateParam = searchParams.get("date");
    const monthParam = searchParams.get("month");

    if (dateParam) {
      const [y, m] = dateParam.split("-").map(Number);
      return { date: dateParam, month: (m ?? 1) - 1, year: y ?? new Date().getFullYear() };
    }
    if (monthParam) {
      const [y, m] = monthParam.split("-").map(Number);
      return { date: null, month: (m ?? 1) - 1, year: y ?? new Date().getFullYear() };
    }
    const now = nowWIB();
    return { date: null, month: now.getUTCMonth(), year: now.getUTCFullYear() };
  };

  const [filter, setFilter] = useState<DateFilter>(initialFilter);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const navigate = useCallback((f: DateFilter) => {
    const params = new URLSearchParams();
    if (f.date) {
      params.set("date", f.date);
    } else {
      params.set("month", `${f.year}-${String(f.month + 1).padStart(2, "0")}`);
    }
    router.replace(`${pathnameRef.current}?${params.toString()}`, { scroll: false });
  }, [router]);

  const setDate = useCallback((date: string | null) => {
    const current = filterRef.current;
    const next: DateFilter = { ...current, date };
    setFilter(next);
    navigate(next);
  }, [navigate]);

  const setMonth = useCallback((month: number, year: number) => {
    const next: DateFilter = { date: null, month, year };
    setFilter(next);
    navigate(next);
  }, [navigate]);

  const prevMonth = useCallback(() => {
    const current = filterRef.current;
    const m = current.month === 0 ? 11 : current.month - 1;
    const y = current.month === 0 ? current.year - 1 : current.year;
    setMonth(m, y);
  }, [setMonth]);

  const nextMonth = useCallback(() => {
    const current = filterRef.current;
    const m = current.month === 11 ? 0 : current.month + 1;
    const y = current.month === 11 ? current.year + 1 : current.year;
    setMonth(m, y);
  }, [setMonth]);

  // Compute WIB-aware range.
  // For single day → [wibStartOfDay, wibEndOfDay] inclusive.
  // For month → [wibStartOfMonth, wibStartOfNextMonth) exclusive end.
  const isSingleDay = Boolean(filter.date);
  const from = filter.date
    ? wibStartOfDay(filter.date)
    : wibStartOfMonth(filter.year, filter.month);
  const to = filter.date
    ? wibEndOfDay(filter.date)
    : wibStartOfNextMonth(filter.year, filter.month);

  return (
    <DateFilterContext.Provider value={{ filter, setDate, setMonth, prevMonth, nextMonth, from, to, isSingleDay }}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const ctx = useContext(DateFilterContext);
  if (!ctx) throw new Error("useDateFilter must be used within DateFilterProvider");
  return ctx;
}
