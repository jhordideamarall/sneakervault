import {
  ShieldCheck,
  Receipt,
  Boxes,
  MessageSquare,
  Users,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@sneakervault/ui";
import { CONTAINER } from "./styles";
import { SectionLabel } from "./section-label";
import { Reveal } from "./reveal";

type Feature = {
  icon: typeof ShieldCheck;
  title: string;
  desc: string;
  span: string;
  featured?: boolean;
};

const FEATURES: Feature[] = [
  {
    icon: ShieldCheck,
    title: "Audit trail anti-fraud",
    desc: "Setiap input, edit, hapus, dan approval terekam lengkap dengan pelaku & waktu. Hapus diganti void agar jejak tak pernah hilang.",
    span: "md:col-span-4",
    featured: true,
  },
  {
    icon: Receipt,
    title: "Akuntansi otomatis",
    desc: "Tiap transaksi langsung jadi jurnal berimbang. HPP, laba, Neraca & Laba Rugi real-time.",
    span: "md:col-span-2",
  },
  {
    icon: Boxes,
    title: "Stok real-time",
    desc: "Per size, SKU, dan barcode. Kartu stok mencatat tiap pergerakan — defect & hold terpisah.",
    span: "md:col-span-2",
  },
  {
    icon: MessageSquare,
    title: "Pesan tim internal",
    desc: "Chat antar divisi dengan presence real-time & notifikasi — tanpa pindah aplikasi.",
    span: "md:col-span-2",
  },
  {
    icon: Users,
    title: "Akses per peran",
    desc: "Owner, gudang, kasir, admin online, finance — tiap orang lihat yang perlu saja.",
    span: "md:col-span-2",
  },
  {
    icon: FileSpreadsheet,
    title: "Ekspor Excel & PDF",
    desc: "Semua laporan siap untuk accountant dan pajak. Periode terkunci tak berubah.",
    span: "md:col-span-3",
  },
];

export function Features() {
  return (
    <section id="fitur" className="scroll-mt-20 border-t border-neutral-200/70 py-20 md:py-28">
      <div className={CONTAINER}>
        <Reveal className="max-w-2xl">
          <SectionLabel>Fitur</SectionLabel>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
            Semua yang dibutuhkan toko sneaker, dalam satu alur terhubung.
          </h2>
          <p className="mt-4 text-pretty text-neutral-600">
            Dari barang masuk sampai laporan pajak — tanpa input ulang, tanpa stok yang
            terpisah dari pembukuan.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6">
          {FEATURES.map((f, idx) => (
            <Reveal key={f.title} delay={idx * 0.05} className={f.span}>
              <article
                className={cn(
                  "group h-full rounded-2xl border bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.22)]",
                  f.featured
                    ? "border-[#E5484D]/25 bg-gradient-to-br from-[#E5484D]/[0.04] to-white"
                    : "border-neutral-200 hover:border-neutral-300",
                )}
              >
                <div
                  className={cn(
                    "grid size-10 place-items-center rounded-xl border transition-colors",
                    f.featured
                      ? "border-[#E5484D]/20 bg-[#E5484D]/10 text-[#E5484D]"
                      : "border-neutral-200 bg-neutral-50 text-neutral-700 group-hover:text-[#E5484D]",
                  )}
                >
                  <f.icon className="size-5" strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 text-[15px] font-semibold text-neutral-950">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{f.desc}</p>

                {f.featured ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {["Siapa", "Kapan", "Apa berubah", "Void & approval"].map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-600"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
