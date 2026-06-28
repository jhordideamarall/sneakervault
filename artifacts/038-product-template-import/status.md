# Product Template Import

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** UAT data preparation
**Tanggal Mulai:** 2026-06-27
**Tanggal Selesai:** 2026-06-27

## Tasks
- [x] Cek MCP Supabase dan count produk awal
- [x] Inspect workbook `Update-Template-Import-Produk-Dewinst (1).xlsx`
- [x] Cocokkan mapping kolom dengan schema/import logic
- [x] Import produk ke Supabase tanpa reset/destructive write
- [x] Verifikasi row count, duplikasi, SKU+size, dan sample produk
- [x] Import order sample Shopee/TikTok/Tokopedia via atomic RPC
- [x] Import settlement sample Shopee/TikTok/Tokopedia ke dummy bank
- [x] Verifikasi invoice, stok, bank, dan jurnal balanced

## Blockers
- (kosong)

## Files Modified
- artifacts/038-product-template-import/status.md
- apps/web/src/lib/marketplace/parsers.ts
- apps/web/src/lib/marketplace/settlement-parsers.ts
- apps/web/src/lib/actions/marketplace-import.ts
- apps/web/src/lib/actions/products.ts
- apps/web/src/components/inventory/bulk-import-button.tsx
- apps/web/src/components/inventory/edit-product-modal.tsx
- apps/web/src/components/inventory/inventory-client.tsx
- apps/web/src/components/penjualan/import-marketplace-client.tsx
- apps/web/src/components/penjualan/settlement-import-client.tsx
- apps/web/src/lib/queries/index.ts
- apps/web/supabase/migrations/20260627122636_parse_us_size_labels.sql
- apps/web/supabase/migrations/20260627123325_inventory_channel_prices.sql
- apps/web/supabase/migrations/20260627125635_normalize_compact_half_sizes.sql
- packages/shared/src/validators.ts
