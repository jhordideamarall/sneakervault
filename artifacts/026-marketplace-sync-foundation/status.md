# Marketplace Sync Foundation (DB)

**Status:** [x] Done
**Sprint:** Marketplace File-Based Sync
**Tanggal Mulai:** 2026-06-12
**Tanggal Selesai:** 2026-06-12

## Tasks
- [x] Verifikasi objek remote via MCP (migration divergence guard)
- [x] Enum `customer_channel` + `tokopedia` (migration standalone)
- [x] CoA `4.1.04 Penjualan Tokopedia`
- [x] Tabel `marketplace_sku_map` + RLS + index (learned SKU bridge)
- [x] Extend `marketplace_imports`: `kind`, `file_name`, `matched_count`, `mismatch_count`
- [x] Kolom settlement di `sales_invoices`: `settlement_status/fee_actual/net/settled_at/ref`
- [x] RPC `import_marketplace_order_atomic()` (atomic invoice+lines+stock+journal)
- [x] Cek advisor security (hanya WARN pre-existing; RPC baru = pola sama pos_checkout)

## Blockers
- (kosong)

## Files Modified
- apps/web/supabase/migrations/20260612000000_marketplace_add_tokopedia_channel.sql
- apps/web/supabase/migrations/20260612000100_marketplace_sync_foundation.sql

## Catatan
- `marketplace_imports` ternyata SUDAH ADA di remote (skema settlement: period/gmv/fee/net) — di-extend additive, bukan dibuat ulang.
- Enum type channel = `customer_channel` (dipakai sales_invoices.channel & customers.channel).
- RPC pakai `app_post_journal()` internal (sudah ada dari atomic_pos_checkout) untuk jurnal balanced. Revenue code: shopee 4.1.02, tiktok 4.1.03, tokopedia 4.1.04.
- Semua migration additive + idempotent (IF NOT EXISTS / ON CONFLICT / ADD VALUE IF NOT EXISTS).
