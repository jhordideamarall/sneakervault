import type { Role } from "@sneakervault/shared";

/**
 * Route-level permission matrix.
 *
 * Struktur IA mengikuti pola Accurate Online supaya client familiar:
 * - Dasbor, Pembelian, Penjualan, Gudang, Kas & Bank, Buku Besar, Laporan, Master Data, Pengaturan.
 *
 * Route stub (Phase 2/3/4) sudah dimasukkan di sini supaya sidebar render
 * lengkap; halaman aktual pakai <ModuleSkeleton/> sampai modul deep-built.
 */
export const routePermissions: Record<string, Role[]> = {
  // Dasbor
  "/workspace": ["owner", "admin_gudang", "admin_online", "shopkeeper", "finance"],
  "/overview": ["owner", "finance"],
  "/finance": ["owner", "finance"],

  // Gudang
  "/inventory": ["owner", "admin_gudang", "admin_online", "shopkeeper", "finance"],
  "/inventory/opname": ["owner", "admin_gudang", "finance"],
  "/inbound": ["owner", "admin_gudang"],
  "/outbound": ["owner", "shopkeeper"],
  "/returns": ["owner", "admin_gudang", "admin_online"],
  "/barcode-generate": ["owner", "admin_gudang"],

  // Pembelian (Phase 2)
  "/pembelian": ["owner", "finance"],
  "/pembelian/purchase-order": ["owner", "finance"],
  "/pembelian/penerimaan": ["owner", "finance", "admin_gudang"],
  "/pembelian/faktur": ["owner", "finance"],
  "/pembelian/pembayaran": ["owner", "finance"],

  // Penjualan (Phase 3)
  "/penjualan": ["owner", "finance", "admin_online"],
  "/penjualan/pos": ["owner", "shopkeeper", "finance"],
  "/penjualan/invoice": ["owner", "finance", "admin_online"],
  "/penjualan/penerimaan-kas": ["owner", "finance"],
  "/penjualan/import-marketplace": ["owner", "finance"],
  "/pre-order": ["owner", "finance", "admin_online", "admin_gudang", "shopkeeper"],
  "/penjualan/export-stok": ["owner", "finance", "admin_online"],
  "/penjualan/settlement": ["owner", "finance"],
  "/orders": ["owner", "admin_gudang", "admin_online", "shopkeeper", "finance"],
  "/sold": ["owner", "admin_online", "finance"],

  // Kas & Bank
  "/kas-bank": ["owner", "finance"],
  "/kas-bank/akun": ["owner", "finance"],
  "/kas-bank/penerimaan": ["owner", "finance"],
  "/kas-bank/pengeluaran": ["owner", "finance", "admin_gudang", "admin_online"],
  "/kas-bank/mutasi": ["owner", "finance"],
  "/kas-bank/rekonsiliasi": ["owner", "finance"],

  // Buku Besar (Phase 4)
  "/buku-besar": ["owner", "finance"],
  "/buku-besar/coa": ["owner", "finance"],
  "/buku-besar/journal": ["owner", "finance"],
  "/buku-besar/periode": ["owner", "finance"],
  "/buku-besar/payroll": ["owner", "finance"],
  "/aset": ["owner", "finance"],

  // Laporan
  "/reports": ["owner", "finance"],
  "/laporan-keuangan": ["owner", "finance"],
  "/laporan-keuangan/neraca": ["owner", "finance"],
  "/laporan-keuangan/laba-rugi": ["owner", "finance"],
  "/laporan-keuangan/perubahan-ekuitas": ["owner", "finance"],
  "/laporan-keuangan/arus-kas": ["owner", "finance"],

  // Master Data
  "/suppliers": ["owner", "admin_gudang", "finance"],
  "/customers": ["owner", "finance", "admin_online"],
  "/employees": ["owner", "finance"],

  // Pengaturan & audit
  "/panduan": ["owner", "admin_gudang", "admin_online", "shopkeeper", "finance"],
  "/feedback": ["owner", "admin_gudang", "admin_online", "shopkeeper", "finance"],
  "/settings": ["owner"],
  "/settings/data-sync": ["owner"],
  "/activity-log": ["owner"],
  "/delete-requests": ["owner"],
};

export function hasRouteAccess(pathname: string, roles: Role[]): boolean {
  if (roles.includes("owner")) return true;

  // Pilih route terpanjang yang match (supaya /pembelian/faktur match sebelum /pembelian)
  const matches = Object.keys(routePermissions).filter(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );
  if (matches.length === 0) return true;
  const route = matches.sort((a, b) => b.length - a.length)[0]!;
  const allowed = routePermissions[route];
  if (!allowed) return true;
  return allowed.some((r: Role) => roles.includes(r));
}

/**
 * Field-level visibility helpers (Phase 1).
 * Shopkeeper tidak lihat HPP (cost). Harga jual (online/offline) visible ke semua
 * karena shopkeeper perlu tahu saat listing di marketplace.
 */
export function canSeeHpp(roles: Role[]): boolean {
  return roles.includes("owner") || roles.includes("finance");
}

export function canEditPrice(roles: Role[]): boolean {
  return roles.includes("owner") || roles.includes("finance");
}

export function canChangeProductCondition(roles: Role[]): boolean {
  return roles.includes("owner") || roles.includes("admin_gudang");
}

export function canSeeFinancialDashboard(roles: Role[]): boolean {
  return roles.includes("owner") || roles.includes("finance");
}
