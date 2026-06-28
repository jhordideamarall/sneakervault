# Marketplace Cancel & Fee Hardening

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** UAT marketplace accounting
**Tanggal Mulai:** 2026-06-27
**Tanggal Selesai:** 2026-06-27

## Tasks
- [x] Tambah cancel marketplace yang aman untuk invoice unpaid/unsettled
- [x] Baca row batal/return dari file pesanan dan tampilkan hasilnya jelas
- [x] Pakai fee aktual settlement/COA untuk laporan channel dan marketplace
- [x] Perjelas UI packing bahwa scan langsung mengurangi stok dan cancel restore stok
- [x] Verifikasi type-check/build dan query Supabase

## Blockers
- (kosong)

## Files Modified
- artifacts/040-marketplace-cancel-fee-hardening/status.md
- apps/web/supabase/migrations/20260627141805_marketplace_cancel_fee_hardening.sql
- apps/web/src/lib/marketplace/parsers.ts
- apps/web/src/lib/actions/marketplace-import.ts
- apps/web/src/lib/queries/index.ts
- apps/web/src/app/(dashboard)/reports/page.tsx
- apps/web/src/components/reports/reports-export.tsx
- apps/web/src/components/outbound/outbound-client.tsx
- apps/web/src/components/penjualan/import-marketplace-client.tsx
