# UAT Clean Slate & Return Report

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** UAT Preparation
**Tanggal Mulai:** 2026-08-17
**Tanggal Selesai:** 2026-08-17

## Tasks
- [x] Baca aturan repo, dokumen produk/arsitektur, dan artifact retur/accounting/UAT
- [x] Verifikasi target Supabase SneakerVault (`jogqvffdjtjqdnflvubi`)
- [x] Ambil baseline exact untuk tabel transaksi dan tabel yang wajib dipertahankan
- [x] Reset hanya data transaksi/demo dengan `TRUNCATE ... RESTART IDENTITY CASCADE`
- [x] Reset counter nomor transaksi dan sequence laporan UAT
- [x] Verifikasi akun, COA, config, periode, rekening, dan preferensi tetap utuh
- [x] Tambahkan laporan retur terfilter periode dengan ekspor PDF/Excel
- [x] Jalankan type-check, lint relevan, dan verifikasi hasil akhir

## Baseline Supabase Sebelum Reset
- `profiles`: 3
- `chart_of_accounts`: 45
- `expense_categories`: 14
- `app_settings`: 6
- `fiscal_periods`: 12
- `bank_accounts`: 3
- `notification_preferences`: 0
- `products`: 914
- `stock_movements`: 922
- `journal_entries`: 19
- `stock_opname_lines`: 1.828

## Safety Scope
- Tetap utuh: `profiles`, `chart_of_accounts`, `expense_categories`, `app_settings`,
  `fiscal_periods`, `bank_accounts`, `notification_preferences`, beserta schema/RLS/RPC/index.
- Master pegawai, supplier, dan status tur fitur juga dipertahankan karena bukan transaksi.
- Reset hanya data transaksi/demo beserta child-table terkait dan counter nomor dokumen.

## Blockers
- Tidak ada.

## Hasil Reset
- Seluruh tabel transaksi/demo terverifikasi `0` baris.
- Protected master sama dengan baseline; `auth.users` juga tetap 3.
- `private.transaction_number_counters` kosong.
- `feedback_report_seq` kembali ke nilai 1 dengan `is_called = false`.

## Keputusan COA
- COA remote diaudit: belum ada akun khusus retur penjualan.
- Tidak menambah akun/posting pendapatan otomatis karena flow retur belum memiliki
  nominal refund dan rekening tujuan; memaksanya akan berisiko salah saji kas/pendapatan.
- Pembalikan persediaan/HPP tetap memakai `1.1.05 Persediaan Barang` dan
  `5.1 HPP Barang Terjual`; refund uang tetap dicatat eksplisit di Kas & Bank.
- Keputusan ini kemudian disempurnakan oleh artifact `053`: setelah flow refund
  mendapat nominal dan rekening eksplisit, COA kontra-pendapatan `4.1.90` dan
  posting refund atomik ditambahkan dengan aman.

## Verification
- Exact post-reset count seluruh tabel transaksi/demo: `0`.
- Exact protected count sama dengan baseline; `auth.users = 3`.
- `pnpm --filter @sneakervault/web type-check` — pass.
- ESLint untuk query/report files — pass.
- `pnpm --filter @sneakervault/web build` — pass, termasuk route `/reports`.
- `git diff --check` — pass.

## Files Modified
- `artifacts/052-uat-clean-slate-return-report/status.md`
- `docs/superpowers/2026-08-17-uat-clean-slate-return-report.md`
- `apps/web/src/lib/queries/index.ts`
- `apps/web/src/app/(dashboard)/reports/page.tsx`
- `apps/web/src/components/reports/mandatory-reports-client.tsx`
