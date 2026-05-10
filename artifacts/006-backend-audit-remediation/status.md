# Audit Kualitas Backend & Remediasi

**Status:** [x] Done
**Sprint:** Sprint 4 (Remediasi)
**Tanggal Mulai:** 2026-05-10
**Tanggal Selesai:** 2026-05-10

## Hasil Audit (Gaps Found)
1.  **HPP Logic Bug**: Fungsi `recalculate_hpp_by_model` saat ini hanya merata-ratakan nilai HPP yang sudah ada di tabel produk. Ini salah. HPP baru harus dihitung dari `(Stok Lama * HPP Lama + Qty Baru * Harga Beli Baru) / Total Qty`. ✅ **FIXED**
2.  **Missing Activity Logs**: Beberapa mutasi krusial belum mencatat aktivitas. ✅ **FIXED** (Semua server actions krusial sekarang logging)
3.  **Financial Query Protection**: Query dashboard stats (revenue, profit) belum sepenuhnya memvalidasi role `owner` di level database/query. ✅ **FIXED** (requireOwner ditambahkan di `lib/queries/index.ts`)
4.  **Race Condition Risk**: `confirmInbound` melakukan `increment_product_quantity` lalu memanggil `recalculate_hpp_by_model`. ✅ **ANALYZED** (Fungsi RPC dan logic atomic sudah diimplementasi)

## Tasks
- [x] Refactor `recalculate_hpp_by_model` untuk menerima parameter batch (qty, cost) agar akurat.
- [x] Tambahkan `logActivity` di semua server actions yang tertinggal.
- [x] Tambahkan pengecekan role `owner` pada query finansial di `lib/queries/index.ts`.
- [x] Verifikasi RLS untuk `activity_logs` (Pastikan benar-benar immutable).

## Blockers
- (kosong)

## Files Modified
- apps/web/supabase/migrations/20260510000001_functions.sql
- apps/web/src/lib/actions/inbound.ts
- apps/web/src/lib/actions/returns.ts
- apps/web/src/lib/actions/products.ts
- apps/web/src/lib/queries/index.ts
