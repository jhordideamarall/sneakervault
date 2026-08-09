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
import { formatRupiah as fmtRupiah } from "@/lib/format";

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
          Ringkasan periode {monthName}: penjualan, laba, nilai modal stok, dan
          potensi nilai jual berdasarkan data terbaru.
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
          value={fmtRupiah(stockValue.cost)}
          sublabel={`${stockValue.items.toLocaleString("id-ID")} pcs`}
          icon={<Boxes size={16} />}
          tone="default"
          valueClassName="text-xl"
        />
        <KpiCard
          label="Potensi Jual (Retail)"
          value={fmtRupiah(stockValue.retail)}
          sublabel={`+${stockMargin.toFixed(1)}% markup`}
          icon={<Wallet size={16} />}
          tone="info"
          valueClassName="text-xl"
        />
      </section>

      <div className="-mt-6 rounded-lg border border-sky-500/15 bg-sky-500/[0.04] px-4 py-3 text-xs leading-relaxed text-sky-100/70">
        Nilai stok di atas dihitung langsung dari stok fisik × HPP rata-rata.
        Saldo Persediaan di Neraca mengikuti jurnal. Jika keduanya berbeda,
        periksa atau impor Saldo Awal CoA melalui{" "}
        <Link href="/settings/data-sync" className="font-semibold text-sky-300 hover:text-sky-200">
          Sinkronisasi Data
        </Link>.
      </div>

      {/* ─── Modul Tersedia ────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Modul Tersedia</h2>
          <p className="text-xs text-white/60">
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
            description="Stok dan nilai modal per SKU dengan HPP rata-rata, harga online, dan harga toko"
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
            description="Riwayat semua perubahan finansial beserta user dan waktu kejadiannya"
            icon={<Clock size={18} />}
            status="live"
          />
        </div>
      </section>

      {/* ─── Accounting flow — everything below is live ───────── */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">
            Alur Akuntansi Aktif
          </h2>
          <p className="text-xs text-white/60">
            Semua tahap di bawah sudah dapat digunakan
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <p className="mb-5 text-sm leading-relaxed text-white/60">
            Urutan kerja harian: buat transaksi sumber, cek kas atau bank, tinjau
            jurnal otomatis, lalu periksa laporan. Klik tahap untuk membuka
            halaman operasionalnya.
          </p>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <ActiveFlowItem
              step="1"
              href="/pembelian/purchase-order"
              title="Pembelian Barang (Daftar Pembelian)"
              description="Finance membuat pembelian, menyetujui pembayaran, lalu gudang menerima barang."
            />
            <ActiveFlowItem
              step="2"
              href="/penjualan/invoice"
              title="Invoice &amp; Penerimaan Customer"
              description="Terbitkan invoice, kurangi stok, dan catat pembayaran customer."
            />
            <ActiveFlowItem
              step="3"
              href="/kas-bank/akun"
              title="Kas, Bank &amp; Rekonsiliasi"
              description="Pantau saldo, uang masuk, uang keluar, transfer, dan rekonsiliasi bank."
            />
            <ActiveFlowItem
              step="4"
              href="/buku-besar/journal"
              title="Jurnal &amp; Buku Besar"
              description="Periksa debit-kredit otomatis dan riwayat transaksi per akun."
            />
            <ActiveFlowItem
              step="5"
              href="/buku-besar/payroll"
              title="Payroll &amp; Hutang Gaji"
              description="Proses karyawan terpilih, unduh slip per orang, lalu bayar hutang gaji."
            />
            <ActiveFlowItem
              step="6"
              href="/laporan-keuangan/neraca"
              title="Laporan Keuangan"
              description="Periksa neraca, laba rugi, arus kas, dan perubahan ekuitas sebelum tutup buku."
            />
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-4 py-3 text-xs text-sky-100/80">
            <BookOpen size={14} className="flex-shrink-0" />
            <span>
              Untuk urutan dari data awal sampai transaksi harian, buka{" "}
              <Link className="font-semibold text-sky-300 hover:text-sky-200" href="/panduan">
                Panduan Pemakaian
              </Link>.
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
  valueClassName,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: React.ReactNode;
  tone: "default" | "success" | "danger" | "info";
  valueClassName?: string;
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
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">
          {label}
        </p>
        <span className={toneClass}>{icon}</span>
      </div>
      <p className={`mt-2 whitespace-nowrap font-semibold tabular-nums tracking-tight ${valueClassName ?? "text-2xl"} ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-white/60">{sublabel}</p>
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

function ActiveFlowItem({
  step,
  href,
  title,
  description,
}: {
  step: string;
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group rounded-lg border border-white/[0.04] bg-black/20 px-4 py-3 transition-colors hover:border-sky-400/20 hover:bg-sky-500/[0.04]">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full border border-sky-500/20 bg-sky-500/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-300">
          Langkah {step}
        </span>
        <h3 className="text-[13px] font-semibold text-white/90">{title}</h3>
      </div>
      <p className="text-[11px] leading-relaxed text-white/50">
        {description}
      </p>
    </Link>
  );
}
