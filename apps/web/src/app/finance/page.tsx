import Link from "next/link";
import { getStockValue, getProfitReport } from "@/lib/queries";
import {
  wibStartOfMonth,
  wibStartOfNextMonth,
  nowWIB,
} from "@/lib/timezone";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Boxes,
  Receipt,
  BookOpen,
  FileBarChart,
  Landmark,
  ShoppingCart,
  Clock,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { formatRupiah as fmtRupiah, formatRupiahShort as fmtRupiahShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const now = nowWIB();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthStart = wibStartOfMonth(year, month);
  const monthEnd = wibStartOfNextMonth(year, month);

  const [stockValue, mtdReport] = await Promise.all([
    getStockValue(),
    getProfitReport(monthStart, monthEnd),
  ]);

  const margin =
    mtdReport.revenue > 0 ? (mtdReport.profit / mtdReport.revenue) * 100 : 0;
  const stockMargin =
    stockValue.cost > 0
      ? ((stockValue.retail - stockValue.cost) / stockValue.cost) * 100
      : 0;

  const monthName = now.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

  return (
    <div className="space-y-10">
      {/* ─── Header ────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/60">
          <Sparkles size={11} /> Financial Command Center
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Keuangan & Akuntansi
        </h1>
        <p className="mt-1.5 text-sm text-white/50">
          Ringkasan finansial periode {monthName} · snapshot real-time per SKU
          dengan HPP averaging &amp; dual-price.
        </p>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue Bulan Ini"
          value={fmtRupiah(mtdReport.revenue)}
          sublabel={`${mtdReport.items} unit terjual`}
          icon={<TrendingUp size={16} />}
          tone="default"
        />
        <KpiCard
          label="Profit Bulan Ini"
          value={fmtRupiah(mtdReport.profit)}
          sublabel={`Margin ${margin.toFixed(1)}%`}
          icon={mtdReport.profit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          tone={mtdReport.profit >= 0 ? "success" : "danger"}
        />
        <KpiCard
          label="Nilai Stok (HPP)"
          value={fmtRupiahShort(stockValue.cost)}
          sublabel={`${stockValue.items.toLocaleString("id-ID")} pcs`}
          icon={<Boxes size={16} />}
          tone="default"
        />
        <KpiCard
          label="Potensi Jual (Retail)"
          value={fmtRupiahShort(stockValue.retail)}
          sublabel={`+${stockMargin.toFixed(1)}% markup`}
          icon={<Wallet size={16} />}
          tone="info"
        />
      </section>

      {/* ─── Modul Tersedia ────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Modul Tersedia</h2>
          <p className="text-xs text-white/40">
            Klik untuk masuk ke halaman lengkap
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ModuleCard
            href="/overview"
            title="Overview Finansial"
            description="Revenue vs profit, distribusi stok, top 5 produk, penjualan mingguan"
            icon={<FileBarChart size={18} />}
            status="live"
          />
          <ModuleCard
            href="/reports"
            title="Laporan Periodik"
            description="Laporan per bulan, export PDF/Excel, filter tanggal custom"
            icon={<Receipt size={18} />}
            status="live"
          />
          <ModuleCard
            href="/sold"
            title="Riwayat Penjualan"
            description="Semua transaksi terjual dengan HPP snapshot, profit per item, filter platform"
            icon={<ShoppingCart size={18} />}
            status="live"
          />
          <ModuleCard
            href="/inventory"
            title="Inventori + HPP"
            description="Stok + HPP per SKU dengan average costing, harga online &amp; offline"
            icon={<Boxes size={18} />}
            status="live"
          />
          <ModuleCard
            href="/suppliers"
            title="Supplier Master"
            description="Daftar pemasok, kontak, histori pembelian"
            icon={<Landmark size={18} />}
            status="live"
          />
          <ModuleCard
            href="/activity-log"
            title="Activity Log"
            description="Audit trail semua perubahan finansial — immutable, tidak bisa diubah"
            icon={<Clock size={18} />}
            status="live"
          />
        </div>
      </section>

      {/* ─── Roadmap — Coming Soon ─────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">
            Roadmap Akuntansi Lengkap
          </h2>
          <p className="text-xs text-white/40">
            Sesuai kebutuhan meeting 2 (per tim finance)
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <p className="mb-5 text-sm leading-relaxed text-white/60">
            Tim finance butuh sistem akuntansi lengkap menggantikan Accurate:{" "}
            pembelian → HPP → Kas Bank → penjualan → buku besar → neraca/laba
            rugi/perubahan ekuitas. Pajak tetap pakai jasa eksternal (di luar
            scope). Berikut modul yang akan ditambahkan per phase:
          </p>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <RoadmapItem
              phase="Phase 2"
              title="Pembelian Barang (Daftar Pembelian)"
              description="Finance buat PO → shopkeeper cocokkan fisik → auto-generate inbound batch (tidak perlu scan ulang)."
            />
            <RoadmapItem
              phase="Phase 2"
              title="Faktur Pembelian &amp; Vendor Payment"
              description="Link PO → invoice vendor → pembayaran. Support credit / tempo / DP."
            />
            <RoadmapItem
              phase="Phase 3"
              title="Sales Invoice + Marketplace Fee"
              description="Detail biaya admin, diskon voucher, affiliate, GMV. Breakdown per platform (Shopee, TikTok, WA)."
            />
            <RoadmapItem
              phase="Phase 3"
              title="Kas Bank + Mutasi BCA"
              description="Rekening, running balance harian, import mutasi BCA, reconciliation dengan invoice."
            />
            <RoadmapItem
              phase="Phase 3"
              title="Import Laporan Marketplace"
              description="Upload Excel dari Shopee/TikTok Seller Center → auto-parse → sales_invoices + fee split."
            />
            <RoadmapItem
              phase="Phase 4"
              title="Chart of Accounts + Auto-Journal"
              description="Struktur akun sesuai SAK-EMKM/ETAP. Auto posting dari PO, invoice, pembayaran."
            />
            <RoadmapItem
              phase="Phase 4"
              title="Buku Besar (General Ledger)"
              description="Totalan per akun, mutasi, saldo awal-akhir. Filter periode, export PDF."
            />
            <RoadmapItem
              phase="Phase 4"
              title="Laporan Keuangan"
              description="Neraca, laba rugi, perubahan ekuitas — siap serahkan ke jasa pajak."
            />
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-xs text-amber-200/80">
            <BookOpen size={14} className="flex-shrink-0" />
            <span>
              Detail di{" "}
              <code className="rounded bg-amber-500/[0.1] px-1.5 py-0.5 font-mono">
                docs/meeting2-execution-plan.md
              </code>{" "}
              · estimasi total: 8 minggu dari Phase 1.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function KpiCard({
  label,
  value,
  sublabel,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ReactNode;
  tone: "default" | "success" | "danger" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-400"
      : tone === "danger"
        ? "text-red-400"
        : tone === "info"
          ? "text-sky-400"
          : "text-white";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          {label}
        </p>
        <span className={toneClass}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-white/40">{sublabel}</p>
    </div>
  );
}

function ModuleCard({
  href,
  title,
  description,
  icon,
  status,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: "live" | "soon";
}) {
  const isLive = status === "live";
  const content = (
    <div
      className={`group relative h-full rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all ${
        isLive
          ? "hover:border-white/[0.14] hover:bg-white/[0.04]"
          : "opacity-60"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/70">
          {icon}
        </div>
        {isLive && (
          <ArrowUpRight
            size={15}
            className="text-white/30 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/70"
          />
        )}
        {!isLive && (
          <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-2 py-0.5 text-[10px] font-medium text-amber-300">
            Segera
          </span>
        )}
      </div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-white/50">
        {description}
      </p>
    </div>
  );

  if (!isLive) return content;
  return <Link href={href}>{content}</Link>;
}

function RoadmapItem({
  phase,
  title,
  description,
}: {
  phase: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.04] bg-black/20 px-4 py-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-300">
          {phase}
        </span>
        <h4 className="text-[13px] font-semibold text-white/90">{title}</h4>
      </div>
      <p className="text-[11px] leading-relaxed text-white/50">
        {description}
      </p>
    </div>
  );
}
