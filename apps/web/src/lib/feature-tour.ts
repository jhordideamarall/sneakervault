import { hasRouteAccess } from "@/config/permissions";
import type { Role } from "@sneakervault/shared";

export const CLIENT_REVISION_TOUR_KEY = "client_revision_2026_07";

export type FeatureTourStep = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  bullets: string[];
  routes: { href: string; label: string }[];
};

export type VisibleFeatureTourStep = FeatureTourStep & {
  ctaHref: string;
  ctaLabel: string;
};

export const FEATURE_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: "coa-kas-bank",
    eyebrow: "Akuntansi",
    title: "COA, kas, dan bank sekarang saling terhubung",
    summary:
      "Setiap akun kas/bank bisa punya COA sendiri, jadi transaksi langsung terbaca di neraca dan laba rugi.",
    bullets: [
      "Tambah dan edit Chart of Account sesuai kebutuhan operasional.",
      "Akun seperti BCA Dewinst, BRI, dan Kas Kecil tampil sebagai akun terpisah.",
      "Penerimaan dan pengeluaran memilih akun lawan COA yang tepat.",
    ],
    routes: [
      { href: "/kas-bank/akun", label: "Buka Akun Bank" },
      { href: "/buku-besar/coa", label: "Buka COA" },
    ],
  },
  {
    id: "pembelian",
    eyebrow: "Pembelian",
    title: "PO, penerimaan, dan faktur lebih cepat diproses",
    summary:
      "Flow pembelian sekarang punya shortcut dari PO, faktur manual dengan item barang, dan delete guard yang lebih aman.",
    bullets: [
      "Dari PO bisa langsung lanjut ke penerimaan barang atau faktur.",
      "Faktur manual bisa input barang dan langsung menambah stok.",
      "Hapus PO approved dibatasi agar stok, pembayaran, dan jurnal tetap aman.",
    ],
    routes: [
      { href: "/pembelian/purchase-order", label: "Buka Purchase Order" },
      { href: "/pembelian/penerimaan", label: "Buka Penerimaan" },
      { href: "/pembelian/faktur", label: "Buka Faktur" },
    ],
  },
  {
    id: "stock-opname",
    eyebrow: "Gudang",
    title: "Stock opname kini menjadi laporan perbandingan",
    summary:
      "Scan barcode untuk menghitung fisik, bandingkan dengan stok sistem, lalu export hasil tanpa mengubah stok otomatis.",
    bullets: [
      "Scan barang satu per satu untuk membentuk data fisik.",
      "Sistem menampilkan selisih fisik vs sistem.",
      "Saldo awal persediaan diposting ke Persediaan dan Modal Awal.",
    ],
    routes: [
      { href: "/inventory/opname", label: "Buka Stock Opname" },
      { href: "/settings/data-sync", label: "Buka Import Data" },
    ],
  },
  {
    id: "marketplace-customer",
    eyebrow: "Penjualan",
    title: "Marketplace dan data customer lebih fleksibel",
    summary:
      "Import marketplace bisa disesuaikan saat barang aktual berbeda dari order, dan data pelanggan lebih mudah dipakai.",
    bullets: [
      "Override barang, size, atau model sebelum import marketplace dikonfirmasi.",
      "Customer master dipakai untuk invoice dan penerimaan kas.",
      "Order yang salah input bisa ditangani lewat flow cancel/hapus yang aman.",
    ],
    routes: [
      { href: "/penjualan/import-marketplace", label: "Buka Import Marketplace" },
      { href: "/customers", label: "Buka Customer" },
      { href: "/orders", label: "Buka Orders" },
    ],
  },
  {
    id: "asset-payroll",
    eyebrow: "Operasional",
    title: "Aset tetap dan payroll sudah masuk accounting flow",
    summary:
      "Aset toko, depresiasi, master karyawan, payroll run, dan slip gaji sekarang punya flow sendiri.",
    bullets: [
      "Aset tetap mencatat harga perolehan, umur manfaat, akumulasi depresiasi, dan nilai buku.",
      "Payroll mengambil data karyawan, menghitung gaji bersih, dan membuat slip PDF.",
      "Jurnal aset dan payroll otomatis masuk ke buku besar.",
    ],
    routes: [
      { href: "/aset", label: "Buka Aset" },
      { href: "/buku-besar/payroll", label: "Buka Payroll" },
      { href: "/employees", label: "Buka Karyawan" },
    ],
  },
  {
    id: "laporan-keuangan",
    eyebrow: "Laporan",
    title: "Laporan keuangan lebih lengkap dan balance",
    summary:
      "Neraca, laba rugi, dan perubahan ekuitas sekarang membaca transaksi double-entry dari buku besar.",
    bullets: [
      "Akun bank tampil per nama akun di neraca.",
      "Pendapatan lain-lain masuk dari penerimaan kas.",
      "Perubahan ekuitas memakai label Prive sesuai revisi client.",
    ],
    routes: [
      { href: "/laporan-keuangan/neraca", label: "Buka Neraca" },
      { href: "/laporan-keuangan/laba-rugi", label: "Buka Laba Rugi" },
      { href: "/reports", label: "Buka Reports" },
    ],
  },
];

export function getVisibleFeatureTourSteps(
  roles: Role[],
): VisibleFeatureTourStep[] {
  return FEATURE_TOUR_STEPS.flatMap((step) => {
    const route = step.routes.find((candidate) =>
      hasRouteAccess(candidate.href, roles),
    );
    if (!route) return [];
    return [{ ...step, ctaHref: route.href, ctaLabel: route.label }];
  });
}
