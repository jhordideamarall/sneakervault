# Marketplace Stock Ledger Hardening

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** Fase A UAT UX
**Tanggal Mulai:** 2026-06-29
**Tanggal Selesai:** 2026-06-29

## Tasks
- [x] Audit import marketplace, packing, fee order, dan gap data UAT.
- [x] Ubah import marketplace agar tidak mengurangi stok fisik.
- [x] Tampilkan notifikasi UI bahwa stok turun saat packing/manual outbound.
- [x] Perbaiki alias fee order marketplace.
- [x] Tutup gap fiscal period dan harga marketplace Puma.
- [x] Verifikasi type-check, build, dan MCP database.

## Blockers
- -

## Files Modified
- apps/web/supabase/migrations/20260628221849_marketplace_order_no_stock.sql
- apps/web/src/lib/marketplace/parsers.ts
- apps/web/src/lib/actions/marketplace-import.ts
- apps/web/src/lib/actions/products.ts
- apps/web/src/components/penjualan/import-marketplace-client.tsx
- apps/web/src/app/(dashboard)/panduan/page.tsx
- docs/manual-book.md
- scripts/generate-user-guide-pdf.py
- output/pdf/panduan-alur-pemakaian-sneakervault-dewinst.pdf
