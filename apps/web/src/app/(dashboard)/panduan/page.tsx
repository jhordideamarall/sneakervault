import {
  Rocket,
  Database,
  Landmark,
  Truck,
  Users,
  Package,
  ShoppingCart,
  Calculator,
  RotateCcw,
  ClipboardList,
  Upload,
  Download,
  Wallet,
  BookOpen,
  FileBarChart,
  ShieldCheck,
  Lightbulb,
  QrCode,
  ScanLine,
  Boxes,
  Receipt,
  Banknote,
  PackageMinus,
  FileText,
  ArrowLeftRight,
  Eye,
  Bell,
  Settings,
  Tags,
  Printer,
} from "lucide-react";

type Step = { title: string; desc: string };

function Section({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/70">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-white/45">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Steps({ steps, start = 1 }: { steps: Step[]; start?: number }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-bold text-white/70">
            {start + i}
          </span>
          <div>
            <p className="text-sm font-medium text-white/85">{s.title}</p>
            <p className="text-[13px] leading-relaxed text-white/50">{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Sub({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
        <span className="text-white/45">{icon}</span>
        {title}
      </p>
      <div className="text-[13px] leading-relaxed text-white/55">{children}</div>
    </div>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const cls =
    tone === "warn"
      ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-200/80"
      : "border-sky-500/20 bg-sky-500/[0.06] text-sky-200/80";
  return <div className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${cls}`}>{children}</div>;
}

const TOC: { href: string; label: string }[] = [
  { href: "#mulai", label: "0 · Urutan Wajib" },
  { href: "#role", label: "1 · Role & Akses" },
  { href: "#master", label: "2 · Master Data" },
  { href: "#gudang", label: "3 · Gudang" },
  { href: "#pembelian", label: "4 · Pembelian" },
  { href: "#penjualan", label: "5 · Penjualan" },
  { href: "#marketplace", label: "6 · Marketplace" },
  { href: "#kasbank", label: "7 · Kas & Bank" },
  { href: "#bukubesar", label: "8 · Buku Besar" },
  { href: "#laporan", label: "9 · Laporan" },
  { href: "#audit", label: "10 · Audit & Pengaturan" },
  { href: "#lintas", label: "11 · Fitur Lintas" },
];

export default function PanduanPage() {
  return (
    <div className="space-y-6 pb-16">
      {/* Hero */}
      <div className="rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.08] via-white/[0.02] to-sky-500/[0.06] p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.08] text-emerald-300">
            <Rocket size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Panduan Pemakaian Lengkap</h1>
            <p className="mt-0.5 text-sm text-white/55">
              Semua modul, alur kerja, dan fitur SneakerVault (Dewins.id) — dari setup awal sampai laporan keuangan otomatis.
            </p>
          </div>
        </div>
      </div>

      {/* TOC */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/35">Daftar Isi</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {TOC.map((t) => (
            <a
              key={t.href}
              href={t.href}
              className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[13px] text-white/60 transition-colors hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white/90"
            >
              {t.label}
            </a>
          ))}
        </div>
      </div>

      {/* 0. Urutan wajib */}
      <Section
        id="mulai"
        icon={<Database size={20} />}
        title="0 · Mulai dari Mana (Urutan Wajib)"
        subtitle="Modul saling terhubung. Database baru kosong — isi master data dulu, baru transaksi bisa jalan."
      >
        <Note tone="warn">
          Kalau langsung buat PO / penjualan saat data kosong akan terasa buntu (dropdown vendor/produk kosong).
          Lakukan 4 langkah ini sekali di awal. Khusus PO, kamu juga bisa <b>tulis barang baru manual</b> (lihat §4).
        </Note>
        <div className="mt-4">
          <Steps
            steps={[
              { title: "Akun Bank & Kas", desc: "Kas & Bank → Akun Bank. Tambah minimal 1 kas tunai + 1 rekening bank. Dipakai semua pembayaran." },
              { title: "Supplier (Vendor)", desc: "Master Data → Supplier. Vendor tempat kulakan barang. Dipakai di Pembelian." },
              { title: "Customer", desc: "Master Data → Customer. Boleh diisi sekarang atau dibuat sambil jalan (POS/Invoice bisa tambah on-the-fly)." },
              { title: "Produk / Stok awal", desc: "Gudang → Barang Masuk (scan), atau Pengaturan → Sinkronisasi Data (import Excel massal), atau lewat PO + Penerimaan. Produk lahir dari sini." },
              { title: "Mulai transaksi", desc: "Setelah itu Pembelian, Penjualan, Gudang, dan Keuangan jalan normal — jurnal & laporan terbentuk otomatis." },
            ]}
          />
        </div>
      </Section>

      {/* 1. Role */}
      <Section
        id="role"
        icon={<ShieldCheck size={20} />}
        title="1 · Role & Hak Akses"
        subtitle="5 role. Tiap user hanya melihat menu sesuai fungsinya."
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-white/[0.03] text-white/40">
              <tr>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Akses Utama</th>
              </tr>
            </thead>
            <tbody className="text-white/65">
              {[
                ["Owner", "Semua modul + Pengaturan + Panduan + chip “Lihat sebagai” role lain"],
                ["Admin Gudang", "Inventori, Barang Masuk, Generate Barcode, Stock Opname, Packing, Retur, Supplier"],
                ["Admin Online", "Order Masuk, Invoice, Import/Export Marketplace, Customer, Terjual, Retur"],
                ["Shopkeeper (Kasir)", "POS Kasir, Order Masuk, Inventori (cek stok), Packing"],
                ["Finance", "Buku Besar, Kas & Bank, Pembelian, Settlement, Laporan Keuangan, Overview"],
              ].map(([r, a]) => (
                <tr key={r} className="border-t border-white/[0.04]">
                  <td className="px-4 py-2.5 font-medium text-white/85">{r}</td>
                  <td className="px-4 py-2.5">{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Sub icon={<Eye size={15} />} title="Chip “Lihat sebagai” (Owner)">
            Bar di atas konten: owner klik role (Admin Gudang/Online/Shopkeeper/Finance) untuk melihat tampilan
            persis role itu tanpa logout. Klik <b>Reset (Owner)</b> untuk kembali penuh.
          </Sub>
          <Sub icon={<Bell size={15} />} title="Signal titik di menu">
            Titik <span className="text-red-400">merah</span> = perlu tindakan (retur, order baru, PO approve, req hapus),
            titik <span className="text-amber-400">amber</span> = perlu dipantau (stok rendah, opname, AR/AP, settlement, rekonsiliasi).
            Live (update otomatis).
          </Sub>
        </div>
      </Section>

      {/* 2. Master data */}
      <Section id="master" icon={<Boxes size={20} />} title="2 · Master Data" subtitle="Fondasi semua transaksi.">
        <div className="grid gap-3 lg:grid-cols-3">
          <Sub icon={<Landmark size={15} />} title="Akun Bank & Kas">
            Kas & Bank → Akun Bank. Jenis: <b>Kas Tunai, Bank, E-Wallet, Saldo Marketplace</b>. Isi saldo awal bila ada;
            saldo update otomatis tiap penerimaan/pengeluaran.
          </Sub>
          <Sub icon={<Truck size={15} />} title="Supplier">
            Master Data → Supplier. Nama, kontak, dll. Dipakai di Purchase Order, Faktur Pembelian, Bayar Vendor.
          </Sub>
          <Sub icon={<Users size={15} />} title="Customer">
            Master Data → Customer (channel WA/Shopee/Tiktok/Offline/Website). Bisa juga dibuat langsung saat POS/Invoice.
            POS boleh tanpa customer (Walk-in).
          </Sub>
        </div>
      </Section>

      {/* 3. Gudang */}
      <Section id="gudang" icon={<Package size={20} />} title="3 · Gudang" subtitle="Stok masuk, label, packing, retur, opname.">
        <div className="grid gap-3 md:grid-cols-2">
          <Sub icon={<QrCode size={15} />} title="Barang Masuk (Inbound)">
            Scan barcode barang yang datang → stok bertambah. Sumber utama lahirnya produk. Bisa scan kamera atau scanner hardware.
          </Sub>
          <Sub icon={<Package size={15} />} title="Inventori">
            Daftar produk + stok + harga. <b>1 SKU = 1 HPP</b> (weighted-average semua size dalam model sama; update otomatis tiap
            penerimaan harga beda). Kondisi: Normal / Defect / Lama Tidak Laku. Fitur: cari, Tambah Produk (+ upload foto),
            Import/Export Excel. HPP hanya terlihat Owner/Finance.
          </Sub>
          <Sub icon={<Tags size={15} />} title="Generate Barcode">
            Gudang → Generate Barcode. Isi brand/model/size/tanggal/qty → sistem buat kode unik + render <b>barcode</b> dan
            tombol <Printer size={12} className="inline" /> <b>Cetak label</b> (ukuran 50×25mm, siap tempel di produk).
            Pakai ini untuk produk yang belum punya barcode.
          </Sub>
          <Sub icon={<ClipboardList size={15} />} title="Stock Opname">
            Hitung fisik berkala. Buat sesi → input jumlah fisik → sistem hitung <b>selisih (variance)</b> vs sistem →
            status Review → <b>Owner approve</b> untuk menyesuaikan stok. Jurnal penyesuaian stok otomatis.
          </Sub>
          <Sub icon={<PackageMinus size={15} />} title="Packing / Outbound">
            Scan barang yang dikirim untuk pesanan → stok turun → masuk halaman <b>Terjual</b>. Status: Packing → Dikirim → Selesai.
          </Sub>
          <Sub icon={<RotateCcw size={15} />} title="Retur">
            Tukar size / refund dari customer. Perlu <b>verifikasi fisik</b> (admin gudang) lalu diproses. Status: Menunggu → Siap Diproses → Selesai.
          </Sub>
        </div>
      </Section>

      {/* 4. Pembelian */}
      <Section
        id="pembelian"
        icon={<ClipboardList size={20} />}
        title="4 · Pembelian"
        subtitle="Purchase Order → Penerimaan → Faktur → Bayar Vendor"
      >
        <Steps
          steps={[
            { title: "Purchase Order (PO)", desc: "Pilih vendor + tambah item. Pembayaran: Kredit / Bayar Lunas / DP (pilih akun bank). PO Draft → Disetujui." },
            { title: "Terima Barang (Penerimaan)", desc: "Saat barang datang, terima PO (boleh sebagian). Stok bertambah + HPP dihitung ulang otomatis." },
            { title: "Faktur Pembelian", desc: "Catat tagihan vendor (hutang/AP). Status Belum Dibayar → Sebagian → Lunas. Jurnal otomatis." },
            { title: "Bayar Vendor", desc: "Lunasi faktur dari kas/bank. Saldo bank turun, hutang berkurang, jurnal pembayaran otomatis." },
          ]}
        />
        <div className="mt-4">
          <Note>
            <b>PO barang baru (manual):</b> di “Tambah Item” ada tab <b>Tulis Manual (barang baru)</b> — ketik brand/model/size/
            warna/SKU/harga/qty untuk barang yang <b>belum ada</b> di sistem. Produknya <b>dibuat otomatis &amp; masuk inventori
            saat Penerimaan Barang</b>. Jadi PO tetap bisa jalan walau inventori masih kosong.
          </Note>
        </div>
      </Section>

      {/* 5. Penjualan */}
      <Section
        id="penjualan"
        icon={<ShoppingCart size={20} />}
        title="5 · Penjualan"
        subtitle="POS kasir, invoice, order, terjual."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Sub icon={<Calculator size={15} />} title="POS Kasir (offline)">
            Scan/cari produk → keranjang → pilih customer (atau Walk-in, bisa tambah baru) → diskon → pilih metode bayar + akun bank →
            <b> Bayar</b>. Semua atomik (1 transaksi): stok turun, invoice, jurnal, kas masuk. Bisa <b>cetak struk</b>.
          </Sub>
          <Sub icon={<FileText size={15} />} title="Invoice Penjualan">
            Buat invoice (pilih customer + item) → terbit (piutang/AR). Status: Draft → Terbit → Sebagian → Lunas.
          </Sub>
          <Sub icon={<Wallet size={15} />} title="Penerimaan Kas">
            Saat customer bayar invoice → catat penerimaan ke akun bank → AR lunas, jurnal otomatis.
          </Sub>
          <Sub icon={<ShoppingCart size={15} />} title="Order Masuk & Terjual">
            <b>Order Masuk</b>: monitoring pesanan/packing. <b>Terjual</b>: riwayat barang yang sudah dikirim (jalur packing).
          </Sub>
        </div>
      </Section>

      {/* 6. Marketplace */}
      <Section
        id="marketplace"
        icon={<Download size={20} />}
        title="6 · Sinkronisasi Marketplace"
        subtitle="Berbasis file Excel — dua arah. Sistem = sumber kebenaran, kamu pegang kendali manual."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Sub icon={<Upload size={15} />} title="Import Order">
            Penjualan → Import Marketplace. Pilih channel <b>Shopee / Tokopedia / TikTok</b> → upload Excel pesanan → layar
            <b> Review Diff</b> (cocok / stok kurang / SKU asing / sudah diimport). SKU asing bisa <b>dipetakan</b> (diingat untuk
            berikutnya) → Konfirmasi → jadi invoice + stok turun + jurnal. Aman re-upload (idempotent).
          </Sub>
          <Sub icon={<Download size={15} />} title="Export Stok (Round-Trip)">
            Penjualan → Export Stok. Download template Mass Update / Batch Edit dari Seller Center → upload di sini → sistem isi
            kolom <b>stok (+harga opsional)</b> dengan mencocokkan SKU → download file terisi → upload balik ke marketplace.
            (Shopee &amp; TikTok.)
          </Sub>
          <Sub icon={<Banknote size={15} />} title="Settlement (2 Tahap)">
            Penjualan → Settlement. Tahap 1 saat dana <b>belum cair</b> (tertahan di Saldo Marketplace) → upload laporan.
            Tahap 2 saat dana <b>cair</b> → pilih bank tujuan → dana masuk bank. Biaya admin/komisi terekonsiliasi ke finance otomatis.
          </Sub>
        </div>
      </Section>

      {/* 7. Kas & Bank */}
      <Section id="kasbank" icon={<Wallet size={20} />} title="7 · Kas & Bank" subtitle="Owner / Finance.">
        <div className="grid gap-3 md:grid-cols-2">
          <Sub icon={<Landmark size={15} />} title="Akun Bank & Mutasi">
            Kelola akun (kas/bank/e-wallet/saldo marketplace). <b>Semua Mutasi</b>: daftar pemasukan/pengeluaran tiap akun + saldo berjalan.
          </Sub>
          <Sub icon={<ArrowLeftRight size={15} />} title="Penerimaan & Pengeluaran">
            <b>Penerimaan</b>: kas masuk manual. <b>Pengeluaran</b>: biaya operasional (14 kategori bawaan: gaji, sewa, listrik, packing,
            iklan, ongkir, dll) — kurangi kas + jurnal beban otomatis.
          </Sub>
          <Sub icon={<ClipboardList size={15} />} title="Rekonsiliasi Bank">
            Cocokkan mutasi sistem dengan rekening koran bank. Tandai transaksi yang sudah cocok (reconciled).
          </Sub>
        </div>
      </Section>

      {/* 8. Buku Besar */}
      <Section
        id="bukubesar"
        icon={<BookOpen size={20} />}
        title="8 · Buku Besar (Jurnal Otomatis)"
        subtitle="Standar SAK EMKM. Tidak perlu jurnal manual untuk transaksi normal."
      >
        <Steps
          steps={[
            { title: "Jurnal otomatis", desc: "Setiap penjualan, pembelian, pembayaran, settlement, opname, beban — langsung membentuk jurnal balanced." },
            { title: "Chart of Accounts (CoA)", desc: "37 akun standar sudah ter-seed (Kas, Bank, Piutang, Persediaan, Saldo Marketplace, Penjualan per channel, HPP, beban, dll)." },
            { title: "Jurnal Penyesuaian (manual)", desc: "Buku Besar → Jurnal. Hanya bila perlu koreksi/penyesuaian khusus." },
            { title: "Tutup Buku (Periode)", desc: "Kunci periode (fiscal lock) agar transaksi periode lama tidak berubah." },
          ]}
        />
      </Section>

      {/* 9. Laporan */}
      <Section id="laporan" icon={<FileBarChart size={20} />} title="9 · Laporan Keuangan" subtitle="Real-time dari jurnal.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[13px] text-white/60">
          {[
            ["Neraca", "Posisi aset, liabilitas, ekuitas"],
            ["Laba Rugi", "Pendapatan − HPP − beban = laba"],
            ["Arus Kas", "Aliran kas operasi/investasi/pendanaan"],
            ["Perubahan Ekuitas", "Mutasi modal & laba ditahan"],
            ["Laporan Operasional", "Penjualan, bestseller, laba per model"],
            ["Overview / Finance", "Ringkasan revenue, profit MTD, nilai stok"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
              <p className="font-medium text-white/85">{t}</p>
              <p className="text-white/45">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 10. Audit & Pengaturan */}
      <Section id="audit" icon={<Settings size={20} />} title="10 · Audit & Pengaturan" subtitle="Owner.">
        <div className="grid gap-3 md:grid-cols-2">
          <Sub icon={<ScanLine size={15} />} title="Activity Log">
            Riwayat semua aktivitas (scan, status, buat/ubah, approve, dll) dengan user & waktu — jejak audit.
          </Sub>
          <Sub icon={<RotateCcw size={15} />} title="Req. Hapus">
            Permintaan hapus data butuh persetujuan owner (Approve/Tolak) — mencegah hapus sembarangan.
          </Sub>
          <Sub icon={<Database size={15} />} title="Sinkronisasi Data (Cutover)">
            Pengaturan → Sinkronisasi Data. Import massal dari Excel saat pindah dari sistem lama: supplier, customer, produk,
            akun bank, saldo awal, piutang/hutang berjalan.
          </Sub>
          <Sub icon={<Settings size={15} />} title="Pengaturan">
            Kelola user & role, profil, dll.
          </Sub>
        </div>
      </Section>

      {/* 11. Fitur lintas */}
      <Section id="lintas" icon={<Lightbulb size={20} />} title="11 · Fitur Lintas & Tips">
        <ul className="space-y-2.5 text-[13px] text-white/60">
          <li className="flex gap-2"><ScanLine size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> <span><b>Scan barcode</b> dipakai di Barang Masuk, POS, Packing, Opname — mendukung kamera HP maupun scanner hardware.</span></li>
          <li className="flex gap-2"><Eye size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> <b>Owner</b> bisa “Lihat sebagai” role lain untuk cek tampilan tiap divisi tanpa logout.</li>
          <li className="flex gap-2"><Bell size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> <b>Signal titik</b> di menu memberi tahu apa yang perlu ditindak/dipantau — tanpa buka satu-satu.</li>
          <li className="flex gap-2"><Wallet size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> Sidebar kanan bisa di-<b>collapse</b> (ikon panel) supaya area kerja lebih luas.</li>
          <li className="flex gap-2"><Receipt size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> Semua transaksi penting bersifat <b>atomik</b> — kalau gagal di tengah, tidak ada data setengah jadi.</li>
          <li className="flex gap-2"><Database size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> Dropdown kosong? Isi master data terkait dulu (lihat <a href="#mulai" className="text-emerald-300/80 underline">Urutan Wajib</a>).</li>
        </ul>
      </Section>
    </div>
  );
}
