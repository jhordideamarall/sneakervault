import {
  Boxes,
  ClipboardList,
  ShoppingCart,
  RotateCcw,
  Wallet,
  BookOpen,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { cn } from "@sneakervault/ui";
import { CONTAINER } from "./styles";
import { SectionLabel } from "./section-label";
import { Reveal } from "./reveal";

const STEPS = [
  { icon: Boxes, label: "Stok Gudang" },
  { icon: ClipboardList, label: "Pembelian" },
  { icon: ShoppingCart, label: "POS / Online" },
  { icon: RotateCcw, label: "Retur" },
  { icon: Wallet, label: "Kas & Bank" },
  { icon: BookOpen, label: "Akuntansi" },
  { icon: BarChart3, label: "Laporan" },
];

export function Ecosystem() {
  return (
    <section id="alur" className="scroll-mt-20 border-t border-neutral-200/70 py-20 md:py-28">
      <div className={CONTAINER}>
        <Reveal className="max-w-2xl">
          <SectionLabel>Cara Kerja</SectionLabel>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
            Satu transaksi, otomatis mengalir ke semua.
          </h2>
          <p className="mt-4 text-pretty text-neutral-600">
            Beli barang → stok naik & jurnal terbentuk. Jual → stok turun, HPP keluar, laba
            muncul. Tak ada lagi input ulang seperti Accurate yang terpisah dari gudang.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-stretch">
            {STEPS.map((s, idx) => (
              <div key={s.label} className="flex items-center gap-3 md:flex-1">
                <div className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 transition-colors hover:border-[#E5484D]/40">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-950 text-white">
                    <s.icon className="size-4" strokeWidth={1.8} />
                  </span>
                  <span className="text-sm font-medium text-neutral-900">{s.label}</span>
                </div>
                {idx < STEPS.length - 1 ? (
                  <ArrowRight
                    className={cn(
                      "size-4 shrink-0 text-neutral-300",
                      "mx-auto rotate-90 md:rotate-0",
                    )}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
