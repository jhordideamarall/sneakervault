# Import Order per-Marketplace + Review Diff + Tokopedia

**Status:** [x] Done (pending E2E dgn file nyata)
**Sprint:** Marketplace File-Based Sync
**Tanggal Mulai:** 2026-06-12
**Tanggal Selesai:** 2026-06-12

## Tasks
- [x] Parser per-channel client-safe (`parsers.ts`) — Shopee, Tokopedia, TikTok (alias header dari template nyata)
- [x] Tab channel eksplisit = label sumber import
- [x] Server `reconcileMarketplaceOrders` — resolve via exact SKU + `marketplace_sku_map`, dup-guard, stok, harga
- [x] Layar Review Diff (summary siap/perlu-tindakan/sudah-diimport, per-order, per-line status)
- [x] Manual map SKU tak dikenal -> `mapMarketplaceSku` (learned) + `searchProductsForMapping`
- [x] Commit atomik via RPC `import_marketplace_order_atomic`
- [x] Catat batch ke `marketplace_imports` (kind=order, marketplace, period dari order_date, status confirmed)
- [x] Regenerate Database types (`packages/supabase/src/types.ts`)
- [x] type-check hijau

## Blockers
- E2E dengan file Excel nyata belum dijalankan (perlu file + login). Header Tiktok/Tokopedia perlu validasi mapping saat ada file asli — parser sudah pakai alias + fallback.

## Files Modified
- apps/web/src/lib/marketplace/parsers.ts (baru)
- apps/web/src/lib/actions/marketplace-import.ts (rewrite: reconcile/commit/map/search)
- apps/web/src/components/penjualan/import-marketplace-client.tsx (rewrite: tabs + diff)
- packages/supabase/src/types.ts (regenerated)

## Catatan
- Single source of truth = sistem; diff hanya expose mismatch, owner approve/remap manual.
- Commit re-resolve server-side (otoritatif) lalu RPC per order; blocked/duplicate dilewati.
- RPC mirror pos_checkout (terbukti) — risiko runtime rendah; kolom identik.
