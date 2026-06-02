import { MessageSquare, BellRing, Circle } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { CONTAINER, MONO } from "./styles";
import { SectionLabel } from "./section-label";
import { Reveal } from "./reveal";

const CHAT = [
  { from: "them", who: "Rafi · Gudang", text: "Samba size 42 sisa 1, perlu re-stock?" },
  { from: "me", who: "Owner", text: "Iya, buat PO ke supplier hari ini ya." },
  { from: "them", who: "Dewi · Finance", text: "PO-00231 sudah aku approve ✓" },
];

export function Messaging() {
  return (
    <section id="kolaborasi" className="scroll-mt-20 border-t border-neutral-200/70 py-20 md:py-28">
      <div className={cn(CONTAINER, "grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center")}>
        {/* Chat mock */}
        <Reveal className="order-2 lg:order-1">
          <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-[#E5484D]" />
                <span className="text-[13px] font-medium text-neutral-900">Pesan Internal</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
                <Circle className="size-2 fill-emerald-500 text-emerald-500" /> 3 online
              </span>
            </div>
            <div className="space-y-3 px-5 py-5">
              {CHAT.map((m, i) => (
                <div
                  key={i}
                  className={cn("flex flex-col", m.from === "me" ? "items-end" : "items-start")}
                >
                  <span className={cn(MONO, "mb-1 text-[10px] uppercase tracking-wider text-neutral-400")}>
                    {m.who}
                  </span>
                  <span
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug",
                      m.from === "me"
                        ? "rounded-br-sm bg-neutral-950 text-white"
                        : "rounded-bl-sm bg-neutral-100 text-neutral-800",
                    )}
                  >
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-neutral-100 px-5 py-3">
              <div className="h-9 flex-1 rounded-lg border border-neutral-200 bg-neutral-50" />
              <span className="grid size-9 place-items-center rounded-lg bg-[#E5484D] text-white">
                <MessageSquare className="size-4" />
              </span>
            </div>
          </div>
        </Reveal>

        {/* Copy */}
        <Reveal delay={0.08} className="order-1 lg:order-2">
          <SectionLabel>Kolaborasi</SectionLabel>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
            Tim ngobrol di tempat kerjanya — bukan di grup WA.
          </h2>
          <p className="mt-4 max-w-md text-pretty leading-7 text-neutral-600">
            Pesan internal antar divisi langsung di dalam sistem, lengkap dengan presence
            real-time dan notifikasi. Keputusan menempel pada transaksinya, bukan hilang di
            chat luar.
          </p>
          <ul className="mt-7 space-y-3 text-sm text-neutral-700">
            <li className="flex items-center gap-2.5">
              <Circle className="size-2 fill-[#E5484D] text-[#E5484D]" /> Presence — lihat siapa sedang online
            </li>
            <li className="flex items-center gap-2.5">
              <BellRing className="size-4 text-[#E5484D]" /> Notifikasi untuk approval & transaksi penting
            </li>
            <li className="flex items-center gap-2.5">
              <MessageSquare className="size-4 text-[#E5484D]" /> Riwayat percakapan tersimpan & teraudit
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
