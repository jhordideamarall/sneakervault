"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";
import { FeedbackForm } from "./feedback-form";

export function FeedbackFab({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (process.env.NEXT_PUBLIC_UAT_MODE !== "true") return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-medium text-black shadow-lg hover:bg-amber-400"
        aria-label="Lapor Masalah UAT"
      >
        <MessageSquarePlus size={18} />
        Lapor Masalah
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex justify-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-neutral-950 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Lapor Masalah UAT
              </h2>
              <button onClick={() => setOpen(false)} aria-label="Tutup">
                <X size={18} className="text-white/60" />
              </button>
            </div>
            <FeedbackForm
              defaultPath={pathname}
              userId={userId}
              onDone={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
