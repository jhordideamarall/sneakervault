"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type DateFilter = {
  date: string | null; // YYYY-MM-DD or null (= whole month)
  month: number; // 0-11
  year: number;
};

type DateFilterContextType = {
  filter: DateFilter;
  setDate: (date: string | null) => void;
  setMonth: (month: number, year: number) => void;
  prevMonth: () => void;
  nextMonth: () => void;
  /** ISO string range for queries */
  from: string;
  to: string;
};

const DateFilterContext = createContext<DateFilterContextType | null>(null);

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const router = useRouter();
  const pathname = usePathname();

  const [filter, setFilter] = useState<DateFilter>({
    date: null,
    month: now.getMonth(),
    year: now.getFullYear(),
  });

  const applyToUrl = useCallback((f: DateFilter) => {
    const params = new URLSearchParams();
    if (f.date) {
      params.set("date", f.date);
    } else {
      params.set("month", `${f.year}-${String(f.month + 1).padStart(2, "0")}`);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  const setDate = useCallback((date: string | null) => {
    const next = { ...filter, date };
    setFilter(next);
    applyToUrl(next);
  }, [filter, applyToUrl]);

  const setMonth = useCallback((month: number, year: number) => {
    const next = { date: null, month, year };
    setFilter(next);
    applyToUrl(next);
  }, [applyToUrl]);

  const prevMonth = useCallback(() => {
    const m = filter.month === 0 ? 11 : filter.month - 1;
    const y = filter.month === 0 ? filter.year - 1 : filter.year;
    setMonth(m, y);
  }, [filter, setMonth]);

  const nextMonth = useCallback(() => {
    const m = filter.month === 11 ? 0 : filter.month + 1;
    const y = filter.month === 11 ? filter.year + 1 : filter.year;
    setMonth(m, y);
  }, [filter, setMonth]);

  // Compute from/to range
  const from = filter.date
    ? `${filter.date}T00:00:00`
    : new Date(filter.year, filter.month, 1).toISOString();
  const to = filter.date
    ? `${filter.date}T23:59:59`
    : new Date(filter.year, filter.month + 1, 0, 23, 59, 59).toISOString();

  return (
    <DateFilterContext.Provider value={{ filter, setDate, setMonth, prevMonth, nextMonth, from, to }}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const ctx = useContext(DateFilterContext);
  if (!ctx) throw new Error("useDateFilter must be used within DateFilterProvider");
  return ctx;
}
