"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";

export function MonthFilter({ 
  availableMonths, 
  currentValue 
}: { 
  availableMonths: { label: string; value: string }[];
  currentValue?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("month", e.target.value);
    } else {
      params.delete("month");
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="relative inline-flex items-center">
      <Calendar size={14} className="absolute left-3 text-white/30 pointer-events-none" />
      <select
        value={currentValue || ""}
        onChange={handleChange}
        className="appearance-none bg-white/[0.04] border border-white/[0.08] rounded-xl pl-9 pr-10 py-2.5 text-sm text-white/80 focus:outline-none focus:border-white/20 transition-all hover:bg-white/[0.06] cursor-pointer"
      >
        <option value="" className="bg-[#1c1c1e]">Semua Waktu</option>
        {availableMonths.map((m) => (
          <option key={m.value} value={m.value} className="bg-[#1c1c1e]">
            {m.label}
          </option>
        ))}
      </select>
      <div className="absolute right-3 pointer-events-none border-t-2 border-r-2 border-white/20 w-1.5 h-1.5 rotate-[135deg] top-[42%]" />
    </div>
  );
}
