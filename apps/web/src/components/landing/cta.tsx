import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";

export function CTA() {
  return (
    <section className="px-6 py-20 md:py-28">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-neutral-950 px-6 py-16 text-center md:py-20">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-64 w-[680px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(229,72,77,0.22),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        </div>

        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Siap pindah dari Accurate ke satu sistem yang nyatu dengan stok?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty leading-7 text-neutral-400">
            Stok, kasir, pembelian, akuntansi, dan laporan pajak — terhubung, teraudit,
            dan real-time.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#E5484D] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#d83b40]"
            >
              Masuk ke sistem
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#fitur"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Pelajari fitur
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
