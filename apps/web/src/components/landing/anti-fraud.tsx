import { Ban, BadgeCheck, Lock } from "lucide-react";
import { cn } from "@sneakervault/ui";
import { CONTAINER, MONO } from "./styles";
import { SectionLabel } from "./section-label";
import { Reveal } from "./reveal";

const PILLARS = [
  {
    icon: Ban,
    title: "Hapus diganti void",
    desc: "Data tak benar-benar dihapus. Statusnya dibatalkan, riwayat & alasannya tetap tersimpan.",
  },
  {
    icon: BadgeCheck,
    title: "Approval berlapis",
    desc: "Pengeluaran & penyesuaian stok butuh persetujuan owner/finance sebelum berlaku.",
  },
  {
    icon: Lock,
    title: "Tutup buku terkunci",
    desc: "Periode yang sudah ditutup tak bisa diubah diam-diam. Koreksi hanya lewat jurnal penyesuaian.",
  },
];

const TRAIL = [
  { t: "09:14", who: "Sari", act: "edit harga jual INV-2391", tag: "EDIT" },
  { t: "10:02", who: "Rafi", act: "adjustment stok opname +3", tag: "APPROVED" },
  { t: "11:37", who: "Dewi", act: "void faktur INV-2388", tag: "VOID" },
  { t: "17:00", who: "Owner", act: "lock periode Mei 2026", tag: "LOCK" },
];

export function AntiFraud() {
  return (
    <section id="keamanan" className="scroll-mt-20 bg-neutral-950 py-20 text-white md:py-28">
      <div className={cn(CONTAINER, "grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center")}>
        <Reveal>
          <SectionLabel className="text-neutral-400">Keamanan</SectionLabel>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Tidak ada perubahan{" "}
            <span className="text-[#E5484D]">tanpa jejak.</span>
          </h2>
          <p className="mt-4 max-w-md text-pretty leading-7 text-neutral-400">
            Sistem dirancang agar tim tak bisa memanipulasi angka diam-diam. Setiap aksi
            sensitif tercatat, butuh persetujuan, dan tak bisa dihapus begitu saja.
          </p>

          <div className="mt-9 space-y-5">
            {PILLARS.map((p) => (
              <div key={p.title} className="flex gap-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-[#E5484D]">
                  <p.icon className="size-5" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-white">{p.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-neutral-400">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <span className="text-[13px] font-medium text-white/90">Audit Trail</span>
              <span className={cn(MONO, "text-[11px] uppercase tracking-widest text-neutral-500")}>
                Immutable
              </span>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {TRAIL.map((r) => (
                <div key={r.t} className="flex items-center gap-4 px-5 py-3.5">
                  <span className={cn(MONO, "text-[12px] text-neutral-500")}>{r.t}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-white/85">
                      <span className="font-medium text-white">{r.who}</span> {r.act}
                    </p>
                  </div>
                  <span
                    className={cn(
                      MONO,
                      "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider",
                      r.tag === "VOID" || r.tag === "LOCK"
                        ? "bg-[#E5484D]/15 text-[#E5484D]"
                        : "bg-white/10 text-white/60",
                    )}
                  >
                    {r.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
