# Marketplace Journal UI Hardening

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** UAT marketplace accounting
**Tanggal Mulai:** 2026-06-27
**Tanggal Selesai:** 2026-06-27

## Tasks
- [x] Buat nomor order marketplace dan jenis pesanan tampil eksplisit di UI invoice dan order
- [x] Izinkan owner/finance mengedit jurnal posted sebagai koreksi accounting manual
- [x] Perjelas pesan bahwa fee marketplace final diposting dari settlement
- [x] Verifikasi type-check/build dan jurnal settlement di Supabase

## Blockers
- (kosong)

## Files Modified
- artifacts/039-marketplace-journal-ui-hardening/status.md
- apps/web/src/components/buku-besar/journal-client.tsx
- apps/web/src/components/orders/orders-client.tsx
- apps/web/src/components/outbound/outbound-client.tsx
- apps/web/src/components/penjualan/import-marketplace-client.tsx
- apps/web/src/components/penjualan/invoice-client.tsx
- apps/web/src/lib/actions/journal-entries.ts
- apps/web/src/lib/actions/marketplace-import.ts
- apps/web/src/lib/marketplace/parsers.ts
