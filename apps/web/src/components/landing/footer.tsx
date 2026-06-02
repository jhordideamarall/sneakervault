import Link from "next/link";
import { cn } from "@sneakervault/ui";
import { CONTAINER } from "./styles";
import { Wordmark } from "./wordmark";

const COLS = [
  {
    title: "Produk",
    links: [
      { label: "Fitur", href: "#fitur" },
      { label: "Keamanan", href: "#keamanan" },
      { label: "Cara Kerja", href: "#alur" },
      { label: "Kolaborasi", href: "#kolaborasi" },
    ],
  },
  {
    title: "Modul",
    links: [
      { label: "Inventory & POS", href: "#fitur" },
      { label: "Pembelian", href: "#alur" },
      { label: "Kas & Bank", href: "#alur" },
      { label: "Akuntansi & Laporan", href: "#alur" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className={cn(CONTAINER, "grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]")}>
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-6 text-neutral-500">
            Sistem operasi untuk bisnis ritel sneaker — stok, kasir, dan akuntansi dalam
            satu alur yang teraudit.
          </p>
        </div>

        {COLS.map((col) => (
          <div key={col.title}>
            <h4 className="text-[13px] font-semibold text-neutral-900">{col.title}</h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-neutral-500 transition-colors hover:text-neutral-900">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-neutral-100">
        <div className={cn(CONTAINER, "flex flex-col items-center justify-between gap-3 py-5 sm:flex-row")}>
          <p className="text-xs text-neutral-400">
            © {new Date().getFullYear()} Vault. Seluruh hak cipta dilindungi.
          </p>
          <Link
            href="/login"
            className="text-xs font-medium text-neutral-600 transition-colors hover:text-neutral-900"
          >
            Masuk ke sistem →
          </Link>
        </div>
      </div>
    </footer>
  );
}
