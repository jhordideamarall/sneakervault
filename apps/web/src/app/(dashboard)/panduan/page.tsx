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

type MenuRule = {
  menu: string;
  akses: string;
  fungsi: string;
  aturan: string[];
  efek: string[];
  koreksi: string[];
};

function RuleCard({ rule }: { rule: MenuRule }) {
  const renderList = (label: string, items: string[]) => (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35">{label}</p>
      <ul className="mt-1.5 space-y-1.5 text-[12px] leading-relaxed text-white/55">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-[7px] size-1 flex-shrink-0 rounded-full bg-white/30" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] p-4">
      <div className="mb-3 flex flex-col gap-1 border-b border-white/[0.05] pb-3">
        <p className="text-sm font-semibold text-white/85">{rule.menu}</p>
        <p className="text-[12px] leading-relaxed text-white/45">
          <span className="font-medium text-white/60">Akses:</span> {rule.akses}
        </p>
        <p className="text-[12px] leading-relaxed text-white/55">{rule.fungsi}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {renderList("Aturan", rule.aturan)}
        {renderList("Efek Sistem", rule.efek)}
        {renderList("Koreksi", rule.koreksi)}
      </div>
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
  { href: "#mulai", label: "0 · Alur Awal" },
  { href: "#role", label: "1 · Role & Akses" },
  { href: "#divisi", label: "2 · Panduan Divisi" },
  { href: "#master", label: "3 · Master Data" },
  { href: "#gudang", label: "4 · Gudang" },
  { href: "#pembelian", label: "5 · Pembelian" },
  { href: "#penjualan", label: "6 · Penjualan" },
  { href: "#marketplace", label: "7 · Marketplace" },
  { href: "#kasbank", label: "8 · Kas & Bank" },
  { href: "#bukubesar", label: "9 · Buku Besar" },
  { href: "#laporan", label: "10 · Laporan" },
  { href: "#audit", label: "11 · Audit" },
  { href: "#troubleshoot", label: "12 · Kendala Umum" },
  { href: "#lintas", label: "13 · Fitur Lintas" },
  { href: "#aturan-menu", label: "14 · Aturan Menu" },
];

const MENU_RULE_GROUPS: { title: string; rules: MenuRule[] }[] = [
  {
    title: "Dasbor",
    rules: [
      {
        menu: "Workspace",
        akses: "Semua role",
        fungsi: "Halaman awal sesuai role untuk melihat pekerjaan yang perlu ditindak dan shortcut operasional.",
        aturan: [
          "Gunakan sebagai titik mulai harian sebelum masuk modul detail.",
          "Signal menu merah berarti perlu tindakan; amber berarti perlu dipantau.",
          "Owner bisa memakai Lihat sebagai untuk mengecek workspace role lain.",
        ],
        efek: [
          "Tidak mengubah data transaksi.",
          "Membaca ringkasan stok, order, finance, dan audit sesuai izin user.",
        ],
        koreksi: [
          "Jika angka ringkasan janggal, buka modul sumbernya: inventory, invoice, settlement, bank, atau jurnal.",
          "Jika menu tidak muncul, cek role user di Pengaturan.",
        ],
      },
      {
        menu: "Overview",
        akses: "Owner, Finance",
        fungsi: "Ringkasan performa: revenue, laba, nilai stok, bestseller, aging, dan metrik finansial.",
        aturan: [
          "Dipakai untuk review, bukan input transaksi.",
          "Angka laba bergantung pada HPP yang sudah terisi.",
          "Data marketplace baru final setelah settlement diimport.",
        ],
        efek: [
          "Tidak membuat jurnal atau mutasi.",
          "Menarik data dari invoice, stok, pembayaran, settlement, dan jurnal.",
        ],
        koreksi: [
          "Jika laba 0 atau terlalu tinggi, cek produk dengan HPP 0.",
          "Jika revenue marketplace belum lunas, cek Import Pesanan dan Rekonsiliasi Settlement.",
        ],
      },
    ],
  },
  {
    title: "Pembelian",
    rules: [
      {
        menu: "Pembelian Barang",
        akses: "Owner, Finance",
        fungsi: "Mencatat Pembelian Barang supplier sebelum barang masuk. Ini berbeda dari Pre Order customer.",
        aturan: [
          "Vendor wajib dipilih; kalau belum ada bisa dibuat dari modal Pembelian Barang atau Master Data.",
          "Item bisa dari produk lama atau tulis manual barang baru.",
          "Pajak diinput persen; contoh 11 berarti 11 persen dari subtotal.",
          "Pembayaran Pembelian Barang bisa Kredit, Bayar Lunas, atau DP.",
        ],
        efek: [
          "Draft Pembelian Barang belum menambah stok.",
          "Barang baru dari Pembelian Barang dibuat ke inventory saat Penerimaan Barang.",
          "Bayar Lunas/DP memotong kas/bank tepat saat Pembelian Barang disetujui.",
          "Penerimaan barang tidak memotong lagi nilai Lunas/DP yang sudah dibayar.",
        ],
        koreksi: [
          "Batalkan Pembelian Barang hanya jika supplier batal order dan belum ada Penerimaan Barang; alasan wajib diisi.",
          "Untuk salah input, hapus berurutan: Pembayaran Vendor, Faktur Pembelian, Penerimaan Barang, lalu Pembelian Barang.",
          "Menghapus Pembelian Barang yang berasal dari pengadaan Pre Order hanya melepas link; data Pre Order customer tetap ada.",
        ],
      },
      {
        menu: "Penerimaan Barang",
        akses: "Owner, Finance, Admin Gudang",
        fungsi: "Mencatat barang fisik yang datang dari Pembelian Barang supplier.",
        aturan: [
          "Terima hanya barang yang benar-benar sudah datang.",
          "Boleh terima sebagian jika Pembelian Barang belum lengkap.",
          "Catatan wajib dipakai jika ada barang cacat, kurang, atau beda kondisi.",
        ],
        efek: [
          "Stok bertambah.",
          "Produk baru dari Pembelian Barang masuk inventory.",
          "HPP weighted average diperbarui dari harga beli.",
        ],
        koreksi: [
          "Jika salah input penerimaan, hapus Faktur Pembelian terkait lebih dulu, lalu hapus dokumen RCV dari Riwayat Penerimaan.",
          "Penghapusan RCV membalik stok, mutasi, HPP, received qty, dan status Pembelian Barang; ditolak jika stok sudah terpakai.",
        ],
      },
      {
        menu: "Faktur Pembelian",
        akses: "Owner, Finance",
        fungsi: "Mencatat tagihan vendor sebagai hutang usaha.",
        aturan: [
          "Faktur dibuat setelah Pembelian Barang dan Penerimaan Barang jelas.",
          "Nomor faktur vendor dan tanggal harus benar.",
          "Faktur yang sudah memiliki Pembayaran Vendor tidak dapat dihapus.",
        ],
        efek: [
          "Membentuk hutang/AP.",
          "Membuat jurnal pembelian sesuai akun persediaan/biaya.",
          "Status berubah dari belum dibayar, sebagian, sampai lunas.",
        ],
        koreksi: [
          "Edit faktur sebelum pembayaran jika ada salah nilai.",
          "Untuk salah input, hapus Pembayaran Vendor lebih dulu, lalu Hapus Faktur Pembelian.",
        ],
      },
      {
        menu: "Bayar Vendor",
        akses: "Owner, Finance",
        fungsi: "Mencatat pembayaran hutang pembelian ke vendor.",
        aturan: [
          "Pilih faktur vendor yang masih outstanding.",
          "Pilih akun bank/kas sumber dana.",
          "Nominal tidak boleh melebihi sisa hutang.",
        ],
        efek: [
          "Saldo bank/kas turun.",
          "Hutang vendor berkurang.",
          "Jurnal pembayaran vendor terbentuk otomatis.",
        ],
        koreksi: [
          "Gunakan Hapus Pembayaran jika salah bank, tanggal, alokasi, atau nominal.",
          "Hapus menghilangkan payment, alokasi, mutasi kas/bank, dan jurnal asli; lalu buat pembayaran yang benar.",
        ],
      },
    ],
  },
  {
    title: "Penjualan",
    rules: [
      {
        menu: "Order Masuk",
        akses: "Semua role",
        fungsi: "Monitoring pesanan yang perlu diproses, dikirim, atau dicek statusnya.",
        aturan: [
          "Gunakan sebagai monitor, bukan sumber utama import marketplace.",
          "Order marketplace resmi masuk dari Import Pesanan.",
          "Cek status sebelum packing agar stok tidak turun dua kali.",
        ],
        efek: [
          "Menampilkan status order dan data pengiriman.",
          "Tidak melunasi invoice tanpa Penerimaan Kas atau Settlement.",
        ],
        koreksi: [
          "Jika order dobel, cek apakah file marketplace pernah diimport ulang.",
          "Jika status tidak sesuai, koreksi dari invoice, packing, atau settlement terkait.",
        ],
      },
      {
        menu: "POS Kasir",
        akses: "Owner, Shopkeeper, Finance",
        fungsi: "Checkout penjualan offline/toko.",
        aturan: [
          "Produk harus punya stok siap jual.",
          "Pilih customer atau gunakan Walk-in.",
          "Pilih metode bayar dan akun kas/bank yang benar.",
          "Jangan dipakai untuk order marketplace yang sudah diimport.",
        ],
        efek: [
          "Invoice langsung dibuat.",
          "Stok turun.",
          "Kas/bank bertambah dan jurnal otomatis terbentuk.",
        ],
        koreksi: [
          "Riwayat POS tetap tersedia dan tidak memiliki tombol pembatalan dari layar kasir.",
          "Flow hapus accounting tidak mencakup invoice POS, marketplace, packing, retur, atau settlement.",
          "Jika stok salah karena POS dobel, audit dari Activity Log dan mutasi stok.",
        ],
      },
      {
        menu: "Invoice Penjualan",
        akses: "Owner, Finance, Admin Online",
        fungsi: "Membuat dan mengelola tagihan customer, termasuk invoice dari marketplace.",
        aturan: [
          "Draft belum menurunkan stok; Terbitkan untuk membuat transaksi berlaku.",
          "Customer dan item wajib jelas; nama manual otomatis disimpan/ditautkan ke Master Data Customer.",
          "Invoice marketplace tidak dianggap lunas sebelum settlement/penerimaan dicatat.",
        ],
        efek: [
          "Invoice terbit membentuk piutang/AR.",
          "Stok turun saat invoice diterbitkan atau order marketplace dikonfirmasi.",
          "Status berubah menjadi belum bayar, sebagian, atau lunas.",
        ],
        koreksi: [
          "Edit selama masih draft atau sebelum pembayaran kompleks.",
          "Untuk salah input, hapus Penerimaan Customer lebih dulu, lalu Hapus Invoice Penjualan.",
          "Invoice POS, marketplace, packing, retur, atau settlement tidak dapat dihapus dari flow accounting ini.",
        ],
      },
      {
        menu: "Penerimaan Kas",
        akses: "Owner, Finance",
        fungsi: "Mencatat pembayaran customer untuk invoice non-settlement atau pembayaran manual.",
        aturan: [
          "Pilih invoice yang masih outstanding.",
          "Pilih akun bank/kas tujuan.",
          "Jangan input manual untuk marketplace jika akan dilunasi lewat settlement.",
        ],
        efek: [
          "Kas/bank bertambah.",
          "Piutang invoice berkurang.",
          "Jurnal penerimaan kas terbentuk.",
        ],
        koreksi: [
          "Hapus Penerimaan jika salah bank, tanggal, alokasi, atau nominal.",
          "Hapus menghilangkan penerimaan, alokasi, mutasi kas/bank, dan jurnal asli; lalu buat penerimaan yang benar.",
        ],
      },
      {
        menu: "Import Pesanan",
        akses: "Owner, Finance, Admin Online",
        fungsi: "Mengubah file pesanan Shopee, TikTok, atau Tokopedia menjadi invoice belum terbayar.",
        aturan: [
          "Pilih channel eksplisit sebelum upload.",
          "Gunakan file pesanan resmi seller center, bukan template custom.",
          "SKU yang tidak dikenali harus dipetakan atau dibuat produknya dulu.",
          "Size bisa angka atau pecahan (mis. 42 2/3, 37,5); hanya Size Lain, Default, atau kosong yang dilewati.",
        ],
        efek: [
          "Baris siap membuat invoice belum terbayar.",
          "Stok tidak turun saat import; stok fisik turun saat Packing / Outbound.",
          "Jurnal import mencatat piutang, pendapatan, diskon, dan estimasi fee marketplace. HPP/persediaan keluar diposting saat packing.",
          "Mapping SKU disimpan untuk import berikutnya.",
          "Ongkir/diskon/nilai order dibaca; biaya final tetap dari settlement.",
        ],
        koreksi: [
          "Gunakan Petakan SKU untuk SKU asing.",
          "Buat produk dari import produk/Pembelian Barang jika belum ada.",
          "Jika file salah channel, batal review lalu upload ulang di tab yang benar.",
        ],
      },
      {
        menu: "Update Stok Marketplace",
        akses: "Owner, Finance, Admin Online",
        fungsi: "Mengisi template stok/harga marketplace dari stok sistem untuk diupload balik ke marketplace.",
        aturan: [
          "Download template resmi dari seller center.",
          "Pilih Shopee, TikTok, atau Tokopedia secara eksplisit.",
          "Sistem hanya mengisi baris SKU yang cocok dengan inventory atau mapping.",
          "Centang update harga hanya jika memang ingin menimpa harga marketplace.",
        ],
        efek: [
          "Tidak mengubah stok sistem.",
          "Menghasilkan file Excel baru berisi stok/harga dari inventory.",
          "Baris yang tidak cocok dibiarkan apa adanya dan dihitung sebagai tidak ada di sistem.",
        ],
        koreksi: [
          "Jika banyak tidak cocok, cek apakah produk diimport dengan key SKU yang sama.",
          "Untuk Shopee non-size seperti Size Lain? Ready, sistem sengaja melewati row itu.",
          "Upload ulang file template resmi jika struktur header berubah.",
        ],
      },
      {
        menu: "Rekonsiliasi Settlement",
        akses: "Owner, Finance",
        fungsi: "Mengubah laporan pencairan dana marketplace menjadi penerimaan penjualan dan biaya marketplace aktual.",
        aturan: [
          "Dipakai satu kali saat dana marketplace sudah dilepas.",
          "Pesanan harus sudah pernah diimport agar invoice ditemukan.",
          "Pilih channel, bank tujuan, tanggal cair, dan referensi.",
          "Workbook multi-sheet resmi boleh; sistem membaca sheet yang relevan.",
        ],
        efek: [
          "Invoice marketplace terkait menjadi lunas/sebagian sesuai dana.",
          "Mutasi bank dibuat sebesar dana bersih.",
          "Biaya marketplace, selisih ongkir, dan potongan aktual dijurnal.",
        ],
        koreksi: [
          "Jika tidak match, cek periode/order ID dan channel file pesanan vs settlement.",
          "Jika bank/tanggal salah, reverse/koreksi penerimaan sesuai status sebelum tutup buku.",
        ],
      },
      {
        menu: "Terjual",
        akses: "Owner, Admin Online, Finance",
        fungsi: "Riwayat barang yang sudah keluar/terjual untuk monitoring dan audit.",
        aturan: [
          "Dipakai untuk baca riwayat, bukan input penjualan baru.",
          "Cari berdasarkan order ID, SKU, atau model saat audit.",
        ],
        efek: [
          "Tidak mengubah stok atau jurnal.",
          "Menampilkan data dari penjualan dan/atau packing yang sudah selesai.",
        ],
        koreksi: [
          "Jika barang terjual tidak muncul, cek invoice/order dan status packing.",
          "Jika muncul dobel, audit jalur POS/import/packing agar tidak ada proses ganda.",
        ],
      },
    ],
  },
  {
    title: "Gudang",
    rules: [
      {
        menu: "Inventori",
        akses: "Semua role; HPP hanya Owner/Finance",
        fungsi: "Daftar produk, varian size, stok, harga jual, foto, status fisik, dan HPP.",
        aturan: [
          "1 varian size = 1 SKU inventory.",
          "Import produk internal wajib brand, model, sku, size, harga, dan HPP jika ingin laba akurat.",
          "Import produk marketplace bisa bootstrap produk, tetapi HPP bisa 0 jika marketplace tidak menyediakan modal.",
          "Edit foto produk memakai upload file, bukan URL bebas.",
        ],
        efek: [
          "Tambah/import produk membuat master inventory.",
          "Perubahan HPP hanya boleh oleh Owner/Finance.",
          "Pagination membatasi daftar agar ribuan SKU tetap ringan; pencarian exact SKU tetap bisa.",
        ],
        koreksi: [
          "Jika produk tidak terlihat, cari exact SKU/model dan cek pagination.",
          "Jika HPP 0, isi lewat edit HPP, Barang Masuk, Pembelian Barang + Penerimaan, atau cutover.",
          "Jika status fisik salah, ubah Normal/Defect/Lama Tidak Laku sesuai izin.",
        ],
      },
      {
        menu: "Barang Masuk",
        akses: "Owner, Admin Gudang",
        fungsi: "Input stok fisik yang masuk langsung ke gudang.",
        aturan: [
          "Scan barcode atau isi produk baru jika barcode belum terdaftar.",
          "Qty dan harga modal wajib benar karena memengaruhi stok dan HPP.",
          "Catat kondisi barang jika ada cacat/keterangan.",
        ],
        efek: [
          "Stok bertambah.",
          "HPP diperbarui.",
          "Mutasi stok dan activity log tercatat.",
        ],
        koreksi: [
          "Jika salah qty, lakukan stock opname atau koreksi stok sesuai prosedur.",
          "Jika salah produk, audit barcode/SKU lalu koreksi sebelum transaksi turunannya terjadi.",
        ],
      },
      {
        menu: "Stock Opname",
        akses: "Owner, Admin Gudang, Finance",
        fungsi: "Mencocokkan stok sistem dengan stok fisik.",
        aturan: [
          "Semua item dalam sesi harus dihitung sebelum submit review.",
          "Selisih wajib diberi catatan penyebab.",
          "Hasil review dikunci setelah hitung fisik selesai.",
        ],
        efek: [
          "Sesi review menampilkan variance antara data fisik dan sistem.",
          "Hasil opname dapat di-export PDF/Excel dan tidak otomatis mengubah stok atau jurnal.",
        ],
        koreksi: [
          "Cancel sesi jika scope salah.",
          "Ulang hitung sebelum hasil dikunci jika selisih belum jelas.",
        ],
      },
      {
        menu: "Generate Barcode",
        akses: "Owner, Admin Gudang",
        fungsi: "Membuat atau mencetak label barcode internal.",
        aturan: [
          "Gunakan untuk produk yang belum punya barcode internal.",
          "Pastikan brand, model, size, dan SKU benar sebelum cetak.",
        ],
        efek: [
          "Barcode bisa dipakai di inbound, POS, packing, dan opname.",
          "Label bisa dicetak untuk ditempel ke barang fisik.",
        ],
        koreksi: [
          "Regenerate barcode hanya jika barcode lama salah atau tidak bisa dipakai.",
          "Audit scan jika barang fisik tidak match dengan SKU.",
        ],
      },
      {
        menu: "Packing / Outbound",
        akses: "Owner, Shopkeeper",
        fungsi: "Mencatat barang yang keluar lewat sesi packing manual.",
        aturan: [
          "Scan item yang benar sebelum finalisasi.",
          "Untuk order marketplace, isi nomor order yang sama dengan invoice agar item tervalidasi dan stok turun di jalur packing.",
          "Isi platform/order ID/kurir agar audit pengiriman jelas.",
        ],
        efek: [
          "Item yang ditambahkan ke sesi packing langsung menurunkan stok. Jika item dihapus atau sesi dibatalkan saat masih packing, stok dikembalikan.",
          "Untuk invoice marketplace baru, HPP/persediaan keluar diposting saat item dipacking.",
          "Riwayat keluar masuk ke monitoring terjual/outbound.",
        ],
        koreksi: [
          "Cancel sesi sebelum finalisasi jika salah scan.",
          "Jika sudah final dan salah, koreksi lewat retur/opname sesuai kondisi fisik.",
        ],
      },
      {
        menu: "Retur",
        akses: "Owner, Admin Gudang, Admin Online",
        fungsi: "Mengelola refund, tukar size, dan barang kembali.",
        aturan: [
          "Admin Online mencatat konteks retur; Admin Gudang verifikasi fisik.",
          "Barang kembali harus ditentukan statusnya: normal, defect, atau tindakan lain.",
          "Tukar size harus memilih varian pengganti yang valid.",
        ],
        efek: [
          "Stok bisa kembali, berpindah status, atau keluar lagi untuk pengganti.",
          "Audit retur tercatat per order/produk.",
        ],
        koreksi: [
          "Jika verifikasi salah, proses koreksi sebelum retur ditutup.",
          "Jika sudah selesai, koreksi lewat stok/opname dan catatan finance bila ada refund.",
        ],
      },
    ],
  },
  {
    title: "Kas & Bank",
    rules: [
      {
        menu: "Akun Bank",
        akses: "Owner, Finance",
        fungsi: "Master rekening bank, kas tunai, e-wallet, dan saldo marketplace.",
        aturan: [
          "Buat minimal satu kas atau bank sebelum transaksi pembayaran.",
          "Saldo awal hanya diisi saat setup/cutover.",
          "Akun yang sudah dipakai sebaiknya dinonaktifkan, bukan dihapus.",
        ],
        efek: [
          "Akun muncul di POS, penerimaan, pengeluaran, settlement, dan pembayaran vendor.",
          "Saldo berjalan dihitung dari mutasi.",
        ],
        koreksi: [
          "Jika saldo awal salah saat setup, koreksi sebelum transaksi harian berjalan.",
          "Jika akun tidak dipakai lagi, nonaktifkan agar history tetap ada.",
        ],
      },
      {
        menu: "Penerimaan",
        akses: "Owner, Finance",
        fungsi: "Mencatat kas masuk manual yang bukan dari invoice customer.",
        aturan: [
          "Gunakan hanya untuk penerimaan non-penjualan atau koreksi yang jelas.",
          "Pilih akun tujuan dan referensi.",
        ],
        efek: [
          "Kas/bank bertambah.",
          "Jurnal penerimaan manual terbentuk sesuai akun.",
        ],
        koreksi: [
          "Void/reverse transaksi jika salah akun atau nominal.",
          "Gunakan Penerimaan Kas untuk pembayaran invoice, bukan penerimaan manual.",
        ],
      },
      {
        menu: "Pengeluaran",
        akses: "Owner, Finance, Admin Gudang, Admin Online",
        fungsi: "Mencatat biaya operasional seperti packing, iklan, listrik, gaji, ongkir, dan lain-lain.",
        aturan: [
          "Pilih kategori biaya yang benar.",
          "Approval/payment mengikuti status expense.",
          "Lampirkan catatan/ref jika biaya perlu audit.",
        ],
        efek: [
          "Biaya masuk laporan laba rugi setelah approved/paid sesuai flow.",
          "Kas/bank turun saat dibayar.",
          "Jurnal beban terbentuk otomatis.",
        ],
        koreksi: [
          "Reject sebelum dibayar jika request biaya salah.",
          "Void setelah paid jika perlu pembatalan dengan alasan audit.",
        ],
      },
      {
        menu: "Semua Mutasi",
        akses: "Owner, Finance",
        fungsi: "Daftar semua transaksi kas/bank dan saldo berjalan.",
        aturan: [
          "Dipakai untuk audit, filter, dan penelusuran referensi.",
          "Tandai reconciled hanya jika cocok dengan rekening koran.",
        ],
        efek: [
          "Tidak mengubah sumber transaksi kecuali status reconciled.",
          "Menjadi dasar rekonsiliasi bank.",
        ],
        koreksi: [
          "Jika mutasi salah, koreksi transaksi sumbernya: POS, pembayaran, settlement, expense, atau jurnal.",
          "Toggle reconciled hanya untuk koreksi status cocok bank.",
        ],
      },
    ],
  },
  {
    title: "Buku Besar & Laporan",
    rules: [
      {
        menu: "Chart of Accounts",
        akses: "Owner, Finance",
        fungsi: "Daftar akun akuntansi standar untuk jurnal dan laporan.",
        aturan: [
          "Akun standar tidak perlu diubah untuk transaksi normal.",
          "Tambah akun hanya jika ada kebutuhan laporan yang jelas.",
          "Jangan mengganti akun yang sudah dipakai transaksi tanpa analisis dampak.",
        ],
        efek: [
          "Menentukan klasifikasi Neraca dan Laba Rugi.",
          "Dipakai semua jurnal otomatis dan manual.",
        ],
        koreksi: [
          "Jika salah mapping akun, koreksi mapping/transaksi sebelum tutup buku.",
          "Gunakan Jurnal Umum jika perlu reklasifikasi yang terkontrol.",
        ],
      },
      {
        menu: "Jurnal Umum",
        akses: "Owner, Finance",
        fungsi: "Membuat, mengedit, dan menghapus jurnal manual untuk koreksi akuntansi.",
        aturan: [
          "Debit harus sama dengan kredit.",
          "Hanya jurnal manual yang bisa diedit langsung.",
          "Jurnal otomatis dari transaksi dikoreksi lewat modul asal atau jurnal reversal/Jurnal Umum.",
        ],
        efek: [
          "Langsung memengaruhi buku besar dan laporan keuangan.",
          "Tidak otomatis mengubah stok, invoice, hutang, atau bank operasional.",
        ],
        koreksi: [
          "Edit/hapus jurnal manual selama periode belum dikunci.",
          "Untuk jurnal otomatis, koreksi dari transaksi sumber agar ledger dan data operasional tetap sinkron.",
        ],
      },
      {
        menu: "Data Karyawan & Penggajian",
        akses: "Owner, Finance",
        fungsi: "Mengelola karyawan, memproses payroll terpilih, slip individual, dan Hutang Gaji.",
        aturan: [
          "Payroll baru selalu kosong; tambah karyawan satu per satu.",
          "Komponen pendapatan/potongan dapat diberi nama sendiri: gaji, harian, lembur, THR, bonus, BPJS, PPh, keterlambatan, dan lainnya.",
          "Pilih akun bayar untuk pembayaran langsung, atau kosongkan untuk mencatat Hutang Gaji.",
        ],
        efek: [
          "Payroll membentuk beban gaji, potongan, dan pembayaran atau Hutang Gaji secara atomik.",
          "Slip PDF diunduh per karyawan dan menampilkan seluruh komponen.",
          "Bayar Hutang Gaji memotong kas/bank dan hanya dapat dilakukan satu kali.",
        ],
        koreksi: [
          "Edit payroll sebelum Hutang Gaji dilunasi.",
          "Payroll yang Hutang Gajinya sudah lunas dikunci untuk menjaga mutasi bank dan jurnal.",
          "Karyawan nonaktif dapat dipulihkan dengan tombol Aktifkan.",
        ],
      },
      {
        menu: "Tutup Buku",
        akses: "Owner, Finance",
        fungsi: "Mengunci periode akuntansi agar data lama tidak berubah.",
        aturan: [
          "Pastikan bank, settlement, invoice, hutang, stok, dan jurnal sudah direview.",
          "Jangan tutup periode saat masih ada transaksi pending besar.",
        ],
        efek: [
          "Periode terkunci dari perubahan transaksi lama.",
          "Reopen periode dibatasi untuk role berwenang.",
        ],
        koreksi: [
          "Reopen hanya jika ada koreksi material dan alasannya jelas.",
          "Setelah koreksi, tutup ulang periode.",
        ],
      },
      {
        menu: "Laporan Operasional",
        akses: "Owner, Finance",
        fungsi: "Melihat penjualan, channel, fee, expense, stok, dan barang aging.",
        aturan: [
          "Pilih Dari/Sampai tanggal sebelum membaca atau export laporan.",
          "Angka channel marketplace paling akurat setelah settlement masuk.",
          "Buku Besar harus ditinjau sampai baris transaksi dan saldo berjalan, bukan hanya total akun.",
        ],
        efek: [
          "Tidak membuat transaksi.",
          "Menyatukan data invoice, settlement, stok, dan expense.",
        ],
        koreksi: [
          "Jika data kosong, cek apakah transaksi sumber sudah dibuat.",
          "Jika fee marketplace kosong, cek settlement.",
        ],
      },
      {
        menu: "Neraca, Laba Rugi, Perubahan Ekuitas, Arus Kas",
        akses: "Owner, Finance",
        fungsi: "Laporan keuangan real-time dari jurnal.",
        aturan: [
          "Laporan bergantung pada jurnal yang balance.",
          "HPP harus terisi agar Laba Rugi akurat.",
          "Bank dan settlement harus direkonsiliasi sebelum dipakai untuk keputusan final.",
          "Laba Tahun Berjalan pada Neraca sama dengan Laba Rugi sejak 1 Januari sampai tanggal Neraca.",
          "Prive dibaca langsung dari akun 3.4, bukan angka rekonsiliasi residual.",
        ],
        efek: [
          "Tidak mengubah data.",
          "Membaca jurnal, saldo akun, dan periode.",
        ],
        koreksi: [
          "Jika laporan tidak cocok, telusuri dari Buku Besar ke transaksi sumber.",
          "Gunakan Jurnal Umum untuk koreksi akuntansi yang tidak punya modul sumber.",
        ],
      },
    ],
  },
  {
    title: "Master Data, Audit, dan Pengaturan",
    rules: [
      {
        menu: "Supplier",
        akses: "Owner, Admin Gudang, Finance",
        fungsi: "Master vendor untuk pembelian dan barang masuk.",
        aturan: [
          "Nama supplier harus unik dan jelas.",
          "Supplier bisa dibuat dari Master Data atau cepat dari modal Pembelian Barang.",
        ],
        efek: [
          "Supplier muncul di Pembelian Barang, penerimaan, faktur pembelian, dan pembayaran vendor.",
          "Nonaktifkan supplier jika tidak dipakai lagi.",
        ],
        koreksi: [
          "Edit kontak/alamat jika berubah.",
          "Jangan hapus supplier yang sudah punya transaksi; nonaktifkan.",
        ],
      },
      {
        menu: "Customer",
        akses: "Owner, Finance, Admin Online",
        fungsi: "Master customer untuk POS, invoice, dan pembayaran.",
        aturan: [
          "Customer bisa dibuat dari Master Data atau on-the-fly saat POS/invoice.",
          "Gunakan Walk-in untuk pembeli toko yang tidak perlu dicatat detail.",
        ],
        efek: [
          "Customer terhubung ke invoice dan piutang.",
          "Riwayat transaksi bisa ditelusuri per customer.",
        ],
        koreksi: [
          "Edit data kontak jika salah.",
          "Nonaktifkan customer duplikat setelah invoice dipastikan benar.",
        ],
      },
      {
        menu: "Panduan Pemakaian",
        akses: "Semua role",
        fungsi: "Dokumentasi operasional, flow divisi, dan aturan fitur.",
        aturan: [
          "Gunakan sebagai SOP internal saat onboarding user.",
          "Update panduan setiap ada perubahan flow besar.",
        ],
        efek: [
          "Tidak mengubah transaksi.",
          "Membantu user memilih menu yang benar.",
        ],
        koreksi: [
          "Jika panduan beda dengan aplikasi, ikuti aplikasi lalu update dokumen.",
          "Catat gap flow sebelum deadline agar tidak jadi kebiasaan operasional salah.",
        ],
      },
      {
        menu: "Activity Log",
        akses: "Owner",
        fungsi: "Audit trail aktivitas user dan perubahan penting.",
        aturan: [
          "Dipakai saat ada selisih stok, bank, invoice, atau perubahan mencurigakan.",
          "Log tidak diedit manual.",
        ],
        efek: [
          "Menampilkan siapa melakukan apa dan kapan.",
          "Menjadi dasar investigasi sebelum koreksi.",
        ],
        koreksi: [
          "Gunakan log untuk menentukan modul sumber yang harus dikoreksi.",
          "Jika ada aktivitas tidak wajar, cek role dan akun user.",
        ],
      },
      {
        menu: "Req. Hapus",
        akses: "Owner",
        fungsi: "Approval permintaan hapus data agar data penting tidak hilang sepihak.",
        aturan: [
          "User meminta hapus; owner approve atau tolak.",
          "Data yang sudah memengaruhi laporan sebaiknya dikoreksi, bukan dihapus.",
        ],
        efek: [
          "Approve menjalankan penghapusan sesuai tipe request.",
          "Reject menyimpan alasan penolakan.",
        ],
        koreksi: [
          "Tolak request jika data masih diperlukan audit.",
          "Minta user melakukan reversal/koreksi modul jika lebih aman dari hapus.",
        ],
      },
      {
        menu: "Sinkronisasi Data",
        akses: "Owner",
        fungsi: "Cutover/import data awal dari sistem lama.",
        aturan: [
          "Jalankan sebelum transaksi harian berjalan.",
          "Saldo awal harus balance.",
          "Jangan import saldo awal dua kali.",
        ],
        efek: [
          "Membuat master data, saldo awal, piutang/hutang berjalan, atau data cutover sesuai template.",
          "Menjadi baseline laporan awal.",
        ],
        koreksi: [
          "Jika salah cutover, koreksi sebelum operasional aktif.",
          "Setelah transaksi berjalan, gunakan Jurnal Umum atau koreksi modul, bukan reimport massal sembarangan.",
        ],
      },
      {
        menu: "Pengaturan",
        akses: "Owner",
        fungsi: "Kelola user, role, profil, dan konfigurasi aplikasi.",
        aturan: [
          "Role harus sesuai pekerjaan user.",
          "Akun yang tidak aktif harus dinonaktifkan.",
          "Jangan memakai akun owner untuk operasional harian jika bisa memakai role divisi.",
        ],
        efek: [
          "Mengubah akses menu dan hak field seperti HPP.",
          "Memengaruhi audit trail aktivitas berikutnya.",
        ],
        koreksi: [
          "Jika user melihat menu salah, cek role di Pengaturan.",
          "Jika ada akun lama, nonaktifkan untuk menjaga audit.",
        ],
      },
    ],
  },
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
            <h1 className="text-2xl font-bold tracking-tight text-white">Panduan Pemakaian Per Divisi</h1>
            <p className="mt-0.5 text-sm text-white/55">
              Flow kerja Dewinst.id dari gudang, online, kasir, finance, sampai owner — termasuk marketplace, stok, dan laporan keuangan.
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
          Kalau langsung buat Pembelian Barang / penjualan saat data kosong akan terasa buntu (dropdown vendor/produk kosong).
          Lakukan 4 langkah ini sekali di awal. Khusus Pembelian Barang, kamu juga bisa <b>tulis barang baru manual</b> (lihat §5).
        </Note>
        <div className="mt-4">
          <Steps
            steps={[
              { title: "Akun Bank & Kas", desc: "Kas & Bank → Akun Bank. Tambah minimal 1 kas tunai + 1 rekening bank. Dipakai semua pembayaran." },
              { title: "Supplier (Vendor)", desc: "Master Data → Supplier. Vendor tempat kulakan barang. Dipakai di Pembelian." },
              { title: "Customer", desc: "Master Data → Customer. Boleh diisi sekarang atau dibuat sambil jalan (POS/Invoice bisa tambah on-the-fly)." },
              { title: "Produk / Stok awal", desc: "Gudang → Barang Masuk (scan), atau Pengaturan → Sinkronisasi Data (import Excel massal), atau lewat Pembelian Barang + Penerimaan. Produk lahir dari sini." },
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
                ["Admin Online", "Order Masuk, Invoice, Import Pesanan, Update Stok Marketplace, Customer, Terjual, Retur"],
                ["Shopkeeper (Kasir)", "POS Kasir, Order Masuk, Inventori (cek stok), Packing"],
                ["Finance", "Buku Besar, Kas & Bank, Pembelian, Rekonsiliasi Settlement, Laporan Keuangan, Overview"],
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
            Titik <span className="text-red-400">merah</span> = perlu tindakan (retur, order baru, persetujuan Pembelian Barang, req hapus),
            titik <span className="text-amber-400">amber</span> = perlu dipantau (opname, AR/AP, settlement, rekonsiliasi).
            Signal tidak dipakai untuk stok rendah biasa supaya menu tidak terus menyala tanpa aksi jelas.
          </Sub>
        </div>
      </Section>

      {/* 2. Panduan per divisi */}
      <Section
        id="divisi"
        icon={<Users size={20} />}
        title="2 · Panduan Per Divisi"
        subtitle="Baca bagian sesuai role. Owner bisa memakai bagian ini untuk briefing tim dan cek operasional harian."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Sub icon={<ShieldCheck size={15} />} title="Owner">
            <p className="mb-2 text-white/65">
              Fokus owner: kontrol akses, approval, audit, dan validasi angka besar.
            </p>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Buka <b>Workspace</b> untuk melihat ringkasan dan signal menu yang perlu ditindak.</li>
              <li>Pakai chip <b>Lihat sebagai</b> untuk cek tampilan Admin Gudang, Admin Online, Shopkeeper, dan Finance.</li>
              <li>Cek <b>Overview</b> untuk stok, revenue, laba, bestseller, dan nilai HPP.</li>
              <li>Approve request hapus, stock opname final, koreksi data besar, dan perubahan user/role.</li>
              <li>Gunakan <b>Activity Log</b> saat ada selisih data untuk melihat siapa melakukan apa dan kapan.</li>
            </ol>
          </Sub>

          <Sub icon={<Package size={15} />} title="Admin Gudang">
            <p className="mb-2 text-white/65">
              Fokus gudang: produk fisik, stok, barcode, penerimaan barang, packing, retur, dan opname.
            </p>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Kalau barang baru belum ada, buat dari <b>Inventori</b>, <b>Import Produk</b>, atau dari Pembelian Barang saat barang diterima.</li>
              <li>Saat barang datang, buka <b>Barang Masuk</b>, scan/isi SKU, input qty, supplier, dan harga modal.</li>
              <li>Gunakan <b>Generate Barcode</b> untuk produk yang belum punya label internal.</li>
              <li>Untuk cek fisik berkala, buat sesi <b>Stock Opname</b>, input hasil hitung, lalu minta owner approve selisih.</li>
              <li>Untuk retur, verifikasi barang fisik dulu sebelum stok dikembalikan atau ditandai defect.</li>
            </ol>
          </Sub>

          <Sub icon={<ShoppingCart size={15} />} title="Admin Online">
            <p className="mb-2 text-white/65">
              Fokus online: pesanan marketplace, invoice marketplace, mapping SKU, update stok marketplace, dan status order.
            </p>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Kalau database kosong, bootstrap produk dulu dari <b>Inventori → Import Produk</b> memakai file produk/listing marketplace.</li>
              <li>Buka <b>Penjualan → Import Pesanan</b>, pilih channel yang benar, lalu upload file pesanan resmi.</li>
              <li>Jika SKU belum dikenali, klik <b>Petakan SKU</b> ke produk sistem. Mapping ini disimpan untuk import berikutnya.</li>
              <li>Konfirmasi hanya baris yang siap. Hasilnya menjadi <b>Invoice Penjualan belum terbayar</b>; stok sistem belum berkurang.</li>
              <li>Buka <b>Update Stok Marketplace</b>, upload template resmi, generate file, lalu upload balik ke seller center.</li>
            </ol>
          </Sub>

          <Sub icon={<Calculator size={15} />} title="Shopkeeper">
            <p className="mb-2 text-white/65">
              Fokus kasir: jual offline, cek stok cepat, dan packing pesanan yang memang perlu dipacking dari sistem.
            </p>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Untuk transaksi toko, buka <b>POS Kasir</b>, scan/cari produk, pilih metode pembayaran, lalu checkout.</li>
              <li>Pakai <b>Inventori</b> untuk cek stok dan harga jual. HPP/modal tidak ditampilkan untuk role ini.</li>
              <li>Untuk packing manual, buka <b>Packing / Outbound</b>, buat sesi, isi nomor order marketplace bila ada, tambah item, lalu tandai dikirim.</li>
              <li>Order marketplace dari <b>Import Pesanan</b> tetap perlu packing agar stok fisik dan HPP/persediaan keluar tercatat.</li>
            </ol>
          </Sub>

          <Sub icon={<Wallet size={15} />} title="Finance">
            <p className="mb-2 text-white/65">
              Fokus finance: kas/bank, invoice, piutang, hutang, settlement marketplace, buku besar, dan laporan.
            </p>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Pastikan <b>Akun Bank & Kas</b> sudah dibuat sebelum transaksi pembayaran/penerimaan.</li>
              <li>Untuk marketplace, tunggu file settlement saat dana dilepas, lalu import di <b>Rekonsiliasi Settlement</b>.</li>
              <li>Settlement membuat <b>Penerimaan Penjualan</b>, alokasi invoice, mutasi bank, dan jurnal biaya marketplace otomatis.</li>
              <li>Untuk pembelian supplier, jalankan alur Pembelian Barang → Penerimaan Barang → Faktur Pembelian → Bayar Vendor.</li>
              <li>Untuk koreksi salah input, hapus dari kanan ke kiri. Batalkan Pembelian Barang hanya untuk supplier batal order sebelum penerimaan.</li>
              <li>Cek <b>Buku Besar</b>, <b>Mutasi Bank</b>, <b>Rekonsiliasi</b>, dan <b>Laporan Keuangan</b> sebelum closing.</li>
            </ol>
          </Sub>

          <Sub icon={<ArrowLeftRight size={15} />} title="Flow Lintas Divisi">
            <p className="mb-2 text-white/65">Flow normal agar stok dan finance tidak saling tabrak:</p>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li><b>Marketplace:</b> Admin Online import produk/pesanan → Finance import settlement saat dana cair.</li>
              <li><b>Offline:</b> Gudang pastikan stok tersedia → Shopkeeper POS checkout → Finance cek kas/bank dan laporan.</li>
              <li><b>Pembelian supplier:</b> Finance buat Pembelian Barang → Gudang terima fisik → Finance cek faktur dan bayar vendor.</li>
              <li><b>Opname:</b> Gudang hitung fisik → Owner/Finance review dampak → Owner approve penyesuaian.</li>
            </ol>
          </Sub>
        </div>
      </Section>

      {/* 3. Master data */}
      <Section id="master" icon={<Boxes size={20} />} title="3 · Master Data" subtitle="Fondasi semua transaksi.">
        <div className="grid gap-3 lg:grid-cols-3">
          <Sub icon={<Landmark size={15} />} title="Akun Bank & Kas">
            Kas & Bank → Akun Bank. Jenis: <b>Kas Tunai, Bank, E-Wallet, Saldo Marketplace</b>. Isi saldo awal bila ada;
            saldo update otomatis tiap penerimaan/pengeluaran.
          </Sub>
          <Sub icon={<Truck size={15} />} title="Supplier">
            Master Data → Supplier. Nama, kontak, dll. Dipakai di Pembelian Barang, Faktur Pembelian, Bayar Vendor.
          </Sub>
          <Sub icon={<Users size={15} />} title="Customer">
            Master Data → Customer (channel WA/Shopee/Tiktok/Offline/Website). Bisa juga dibuat langsung saat POS/Invoice.
            POS boleh tanpa customer (Walk-in).
          </Sub>
        </div>
      </Section>

      {/* 4. Gudang */}
      <Section id="gudang" icon={<Package size={20} />} title="4 · Gudang" subtitle="Stok masuk, label, packing, retur, opname.">
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
            status Review → <b>Owner</b> menyetujui adjustment. Finance dapat memulai, menghitung, dan submit review dari tombol Stock Opname di Inventory.
          </Sub>
          <Sub icon={<PackageMinus size={15} />} title="Packing / Outbound">
            Scan barang yang dikirim untuk pesanan → stok turun → masuk halaman <b>Terjual</b>. Status: Packing → Dikirim → Selesai.
          </Sub>
          <Sub icon={<RotateCcw size={15} />} title="Retur">
            Tukar size / refund dari customer. Perlu <b>verifikasi fisik</b> (admin gudang) lalu diproses. Status: Menunggu → Siap Diproses → Selesai.
          </Sub>
        </div>
      </Section>

      {/* 5. Pembelian */}
      <Section
        id="pembelian"
        icon={<ClipboardList size={20} />}
        title="5 · Pembelian"
        subtitle="Pembelian Barang supplier → Penerimaan Barang → Faktur Pembelian → Pembayaran Vendor"
      >
        <Steps
          steps={[
            { title: "Pembelian Barang Supplier", desc: "Pilih vendor + item. Kredit belum dibayar; Bayar Lunas/DP memotong akun bank tepat saat status Draft disetujui." },
            { title: "Terima Barang (Penerimaan)", desc: "Terima barang (boleh sebagian). Stok/HPP diperbarui; pembayaran Lunas/DP tidak dipotong kedua kali." },
            { title: "Faktur Pembelian", desc: "Faktur Lunas/DP terhubung sejak approval; faktur kredit otomatis terbentuk saat penerimaan selesai." },
            { title: "Bayar Vendor", desc: "Lunasi faktur dari kas/bank. Saldo bank turun, hutang berkurang, jurnal pembayaran otomatis." },
          ]}
        />
        <div className="mt-4 space-y-3">
          <Note>
            <b>Pembelian Barang untuk barang baru:</b> di “Tambah Item” ada tab <b>Tulis Manual (barang baru)</b> — ketik brand/model/size/
            warna/SKU/harga/qty untuk barang yang <b>belum ada</b> di sistem. Produknya <b>dibuat otomatis &amp; masuk inventori
            saat Penerimaan Barang</b>. Pembelian Barang tetap bisa jalan walau inventori masih kosong.
          </Note>
          <Note tone="warn">
            <b>Pembelian Barang supplier bukan Pre Order customer.</b> Untuk koreksi salah input, hapus dari kanan ke kiri:
            Pembayaran Vendor → Faktur Pembelian → Penerimaan RCV → Pembelian Barang. Data Pre Order customer tidak ikut
            dihapus. Tombol <b>Batalkan Pembelian (Supplier)</b> hanya dipakai ketika supplier membatalkan order sebelum penerimaan.
          </Note>
        </div>
      </Section>

      {/* 6. Penjualan */}
      <Section
        id="penjualan"
        icon={<ShoppingCart size={20} />}
        title="6 · Penjualan"
        subtitle="POS kasir, invoice, order, terjual."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Sub icon={<Calculator size={15} />} title="POS Kasir (offline)">
            Scan/cari produk → keranjang → pilih customer (atau Walk-in, bisa tambah baru) → diskon → pilih metode bayar + akun bank →
            <b> Bayar</b>. Semua atomik (1 transaksi): stok turun, invoice, jurnal, kas masuk. Bisa <b>cetak struk</b>.
          </Sub>
          <Sub icon={<FileText size={15} />} title="Invoice Penjualan">
            Buat invoice (pilih customer + item) → terbit (piutang/AR). Status: Draft → Terbit → Sebagian → Lunas.
            Dari baris atau detail invoice, klik <b>Terima Pembayaran</b> untuk langsung membuka Penerimaan Kas dengan
            invoice otomatis terpilih.
          </Sub>
          <Sub icon={<Wallet size={15} />} title="Penerimaan Kas">
            Saat customer bayar invoice → catat penerimaan ke akun bank → AR lunas, jurnal otomatis. Untuk salah input,
            hapus Penerimaan Customer lebih dulu, lalu hapus Invoice Penjualan. Stok, kas/bank, dan jurnal dihitung ulang.
          </Sub>
          <Sub icon={<ShoppingCart size={15} />} title="Order Masuk & Terjual">
            <b>Order Masuk</b>: monitoring pesanan/packing. <b>Terjual</b>: riwayat barang yang sudah dikirim (jalur packing).
          </Sub>
        </div>
      </Section>

      {/* 7. Marketplace */}
      <Section
        id="marketplace"
        icon={<Download size={20} />}
        title="7 · Sinkronisasi Marketplace"
        subtitle="Berbasis file Excel — dua arah. Sistem = sumber kebenaran, kamu pegang kendali manual."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Sub icon={<Upload size={15} />} title="Import Order">
            Penjualan → Import Pesanan. Pilih channel <b>Shopee / Tokopedia / TikTok</b> → upload Excel pesanan → layar
            <b> Review Diff</b> (cocok / stok kurang / SKU asing / sudah diimport). SKU asing bisa <b>dipetakan</b> (diingat untuk
            berikutnya) → Konfirmasi → jadi invoice <b>belum terbayar</b> + jurnal piutang/pendapatan. Stok turun saat Packing / Outbound.
            Aman re-upload (idempotent).
          </Sub>
          <Sub icon={<Download size={15} />} title="Export Stok (Round-Trip)">
            Penjualan → Update Stok Marketplace. Download template Mass Update / Batch Edit dari Seller Center → upload di sini → sistem isi
            kolom <b>stok (+harga opsional)</b> dengan mencocokkan SKU → download file terisi → upload balik ke marketplace.
            Channel dipilih eksplisit: <b>Shopee, TikTok, Tokopedia</b>. Tokopedia didukung untuk template stok yang punya kolom SKU dan stok.
          </Sub>
          <Sub icon={<Banknote size={15} />} title="Settlement (Sekali Import)">
            Penjualan → Rekonsiliasi Settlement. Upload file settlement saat dana marketplace <b>sudah dilepas</b>, pilih bank tujuan,
            lalu terapkan. Sistem membuat penerimaan penjualan, melunasi invoice terkait, mencatat mutasi bank, dan membukukan biaya marketplace aktual.
          </Sub>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Note tone="warn">
            <b>Aturan size:</b> variasi harus berisi size numerik, misalnya <b>40</b>, <b>40.5</b>, atau <b>43.33</b>.
            Row seperti <b>Size Lain? Ready</b>, <b>Default</b>, atau variasi kosong tidak dibuat sebagai SKU inventory karena stok, HPP,
            dan jurnal harus melekat ke size spesifik. Sistem akan menampilkan baris yang ditolak supaya user paham.
          </Note>
          <Note>
            <b>Urutan marketplace yang benar:</b> Import Produk untuk bootstrap listing/stok awal → Import Pesanan untuk membuat invoice belum
            terbayar → Packing / Outbound untuk stok fisik dan HPP keluar → Rekonsiliasi Settlement saat dana dilepas agar invoice lunas dan biaya marketplace tercatat.
          </Note>
        </div>
      </Section>

      {/* 8. Kas & Bank */}
      <Section id="kasbank" icon={<Wallet size={20} />} title="8 · Kas & Bank" subtitle="Owner / Finance.">
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

      {/* 9. Buku Besar */}
      <Section
        id="bukubesar"
        icon={<BookOpen size={20} />}
        title="9 · Buku Besar (Jurnal Otomatis)"
        subtitle="Standar SAK EMKM. Tidak perlu jurnal manual untuk transaksi normal."
      >
        <Steps
          steps={[
            { title: "Jurnal otomatis", desc: "Setiap penjualan, pembelian, pembayaran, settlement, opname, beban — langsung membentuk jurnal balanced." },
            { title: "Chart of Accounts (CoA)", desc: "37 akun standar sudah ter-seed (Kas, Bank, Piutang, Persediaan, Saldo Marketplace, Penjualan per channel, HPP, beban, dll)." },
            { title: "Jurnal Umum (manual)", desc: "Buku Besar → Jurnal Umum. Owner/Finance bisa buat, edit, dan hapus jurnal manual selama periode belum dikunci dan jurnal tetap balance." },
            { title: "Jurnal otomatis tidak diedit langsung", desc: "Jurnal dari invoice accounting, pembelian, pembayaran, dan penerimaan ikut dihapus oleh flow Hapus pada modul asalnya. POS, settlement, packing, retur, dan transaksi lain mengikuti mekanisme koreksi khususnya. Ini menjaga stok, piutang, hutang, bank, dan buku besar tetap sinkron." },
            { title: "Tutup Buku (Periode)", desc: "Kunci periode (fiscal lock) agar transaksi periode lama tidak berubah." },
          ]}
        />
        <div className="mt-4">
          <Note tone="warn">
            <b>Aturan edit jurnal:</b> hanya jurnal manual/penyesuaian yang bisa diedit dari Buku Besar.
            Jurnal otomatis dari transaksi tidak boleh diedit langsung karena sumber angkanya ada di modul operasional.
          </Note>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Sub icon={<Users size={15} />} title="Data Karyawan">
            Tambah, Edit, Nonaktifkan, atau Aktifkan kembali karyawan. Data ini menjadi pilihan pada payroll.
          </Sub>
          <Sub icon={<Receipt size={15} />} title="Penggajian & Slip Individual">
            Payroll dimulai kosong → tambah karyawan satu per satu → isi komponen pendapatan/potongan → pilih akun bayar atau Hutang Gaji.
            Gunakan menu Slip untuk download PDF per karyawan; gunakan Bayar Hutang untuk pelunasan berikutnya.
          </Sub>
        </div>
      </Section>

      {/* 10. Laporan */}
      <Section id="laporan" icon={<FileBarChart size={20} />} title="10 · Laporan Keuangan" subtitle="Real-time dari jurnal.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-[13px] text-white/60">
          {[
            ["Buku Besar Detail", "Seluruh transaksi, saldo awal, dan saldo berjalan per akun"],
            ["Kartu Stock", "Saldo awal, mutasi, saldo berjalan, dan saldo akhir per produk"],
            ["Piutang / Utang", "AR customer dan AP supplier tersedia terpisah"],
            ["Neraca", "Posisi aset, liabilitas, ekuitas, dan laba YTD"],
            ["Laba Rugi", "Pendapatan − HPP − beban = laba"],
            ["Arus Kas", "Aliran kas operasi/investasi/pendanaan"],
            ["Perubahan Ekuitas", "Laba dari P&L; Prive langsung dari akun 3.4"],
            ["Laporan Operasional", "Penjualan, bestseller, laba per model"],
            ["Overview / Finance", "Ringkasan revenue, profit MTD, nilai stok"],
          ].map(([t, d]) => (
            <div key={t} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
              <p className="font-medium text-white/85">{t}</p>
              <p className="text-white/45">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Note>
            Pilih <b>Dari tanggal</b> dan <b>Sampai tanggal</b>, lalu klik <b>Terapkan Periode</b> sebelum export PDF/Excel.
            Label dan isi export mengikuti periode yang dipilih.
          </Note>
        </div>
      </Section>

      {/* 11. Audit & Pengaturan */}
      <Section id="audit" icon={<Settings size={20} />} title="11 · Audit & Pengaturan" subtitle="Owner.">
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

      {/* 12. Kendala umum */}
      <Section
        id="troubleshoot"
        icon={<Lightbulb size={20} />}
        title="12 · Kendala Umum & Tindakan"
        subtitle="Gunakan bagian ini saat proses berhenti di review, dropdown kosong, atau angka belum cocok."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Sub icon={<QrCode size={15} />} title="SKU tidak dikenali saat import pesanan">
            Klik <b>Petakan SKU</b> untuk menghubungkan SKU marketplace ke produk sistem. Jika produknya belum ada,
            buat produk dulu lewat <b>Inventori → Import Produk</b>, <b>Tambah Produk</b>, atau Pembelian Barang + Penerimaan Barang.
            Setelah dipetakan, sistem mengingat mapping untuk import berikutnya.
          </Sub>
          <Sub icon={<Package size={15} />} title="Database masih kosong">
            Urutan paling aman: buat akun bank → buat supplier/customer penting → import atau tambah produk → isi stok/HPP
            lewat Barang Masuk/Pembelian Barang/cutover. File pesanan marketplace bisa membantu bootstrap produk, tetapi HPP perlu diisi
            agar laba dan COGS akurat.
          </Sub>
          <Sub icon={<Banknote size={15} />} title="Settlement tidak match invoice">
            Pastikan file settlement berasal dari channel yang sama dan periode/order yang sama dengan file pesanan yang sudah
            diimport. Settlement contoh dari periode berbeda memang akan tampil <b>tidak ada invoice</b>. Invoice yang sudah paid
            akan dilewati agar tidak dobel.
          </Sub>
          <Sub icon={<Download size={15} />} title="Template marketplace ditolak">
            Pilih tab channel yang sesuai sebelum upload. Sistem sengaja tidak membaca template custom bebas; gunakan template
            resmi Shopee, TikTok, atau Tokopedia sesuai fungsi. Workbook multi-sheet resmi boleh, tetapi hanya sheet yang relevan
            yang dibaca.
          </Sub>
          <Sub icon={<Wallet size={15} />} title="Ongkir, diskon, dan biaya marketplace">
            Import pesanan menyimpan nilai pesanan seperti subtotal, diskon, dan ongkir. Settlement menjadi sumber final untuk
            dana cair dan biaya marketplace aktual, lalu membuat penerimaan penjualan dan jurnal finance.
          </Sub>
          <Sub icon={<Eye size={15} />} title="Produk tidak terlihat setelah import">
            Gunakan pencarian SKU/model di Inventori. Jika volume produk sangat besar, daftar awal tidak selalu menampilkan semua
            baris sekaligus demi performa; pencarian exact SKU adalah cara tercepat memastikan produk sudah masuk.
          </Sub>
        </div>
      </Section>

      {/* 13. Fitur lintas */}
      <Section id="lintas" icon={<Lightbulb size={20} />} title="13 · Fitur Lintas & Tips">
        <ul className="space-y-2.5 text-[13px] text-white/60">
          <li className="flex gap-2"><ScanLine size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> <span><b>Scan barcode</b> dipakai di Barang Masuk, POS, Packing, Opname — mendukung kamera HP maupun scanner hardware.</span></li>
          <li className="flex gap-2"><Eye size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> <b>Owner</b> bisa “Lihat sebagai” role lain untuk cek tampilan tiap divisi tanpa logout.</li>
          <li className="flex gap-2"><Bell size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> <b>Signal titik</b> di menu memberi tahu apa yang perlu ditindak/dipantau — tanpa buka satu-satu.</li>
          <li className="flex gap-2"><Wallet size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> Sidebar kanan bisa di-<b>collapse</b> (ikon panel) supaya area kerja lebih luas.</li>
          <li className="flex gap-2"><Receipt size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> Semua transaksi penting bersifat <b>atomik</b> — kalau gagal di tengah, tidak ada data setengah jadi.</li>
          <li className="flex gap-2"><Database size={15} className="mt-0.5 flex-shrink-0 text-white/40" /> Dropdown kosong? Isi master data terkait dulu (lihat <a href="#mulai" className="text-emerald-300/80 underline">Urutan Wajib</a>).</li>
        </ul>
      </Section>

      {/* 14. Aturan per menu */}
      <Section
        id="aturan-menu"
        icon={<BookOpen size={20} />}
        title="14 · Aturan Tiap Menu & Fitur"
        subtitle="Dipakai sebagai SOP singkat: siapa boleh akses, apa fungsi menu, aturan input, efek sistem, dan cara koreksi."
      >
        <Note>
          Cara membaca bagian ini: <b>Aturan</b> adalah syarat sebelum klik simpan/import/approve; <b>Efek Sistem</b> adalah data
          yang berubah setelah aksi berhasil; <b>Koreksi</b> adalah jalur perbaikan kalau user salah input.
        </Note>
        <div className="mt-4 space-y-5">
          {MENU_RULE_GROUPS.map((group) => (
            <div key={group.title} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-white/35">{group.title}</h3>
              <div className="space-y-3">
                {group.rules.map((rule) => (
                  <RuleCard key={rule.menu} rule={rule} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
