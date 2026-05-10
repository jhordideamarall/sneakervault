# Overview Dashboard & Chart Enhancement

**Status:** [x] Done
**Sprint:** Sprint 8 (Maintenance)
**Tanggal Mulai:** 2026-05-10
**Tanggal Selesai:** 2026-05-10

## Tasks
- [x] Investigasi penyebab data terpotong (hardcoded 6 bulan)
- [x] Hapus filter 6 bulan di `getMonthlySales`
- [x] Jadikan rentang waktu chart dinamis berdasarkan data tertua (Year-aware weeks)
- [x] Tambahkan detail per Model (bukan hanya Brand) di query
- [x] Refactor UI chart menjadi Stacked Bar (Brand) + Cumulative Lines (Top Models)
- [x] Pisahkan Bar Chart dan Line Chart secara vertikal
- [x] Tambahkan Filter Bulan di samping Search Bar
- [x] Implementasi Detail Harian ketika filter bulan aktif
- [x] Fix CSS syntax error di `globals.css`
- [x] Verifikasi data di dashboard

## Blockers
- (kosong)

## Files Modified
- apps/web/src/lib/queries/index.ts
- apps/web/src/components/dashboard/sales-chart.tsx
- apps/web/src/app/(dashboard)/overview/page.tsx
- apps/web/src/components/dashboard/month-filter.tsx
- apps/web/src/app/globals.css
