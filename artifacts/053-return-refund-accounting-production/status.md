# Return Refund Accounting — Production

**Status:** [ ] In Progress | [x] Done | [ ] Blocked
**Sprint:** UAT Production Follow-up
**Tanggal Mulai:** 2026-08-17
**Tanggal Selesai:** 2026-08-17

## Tasks
- [x] Audit flow retur, rekening bank/kas, COA, laporan laba rugi, role, dan migration history
- [x] Tetapkan desain COA contra-revenue dan pemisahan role operasional/keuangan
- [x] Buat migration baru yang additive dan idempotent
- [x] Tambahkan refund atomik: stok, HPP, rekening, jurnal, mutasi, dan audit
- [x] Tambahkan pilihan rekening existing, saran sistem, dan tambah rekening inline
- [x] Tambahkan akses Finance ke halaman retur dan perbaiki tampilan contra-revenue di laba rugi
- [x] Jalankan regression SQL, database lint, type-check, lint, build, dan diff review
- [x] Apply migration ke Supabase production SneakerVault
- [x] Commit, push feature branch, dan deploy Vercel production
- [x] Verifikasi production dan dokumentasikan URL/release

## Keputusan
- Tambah COA `4.1.90 Retur Penjualan`, tipe revenue dengan normal balance debit.
- Refund uang hanya dapat diselesaikan Owner/Finance; Admin Gudang/Online tetap
  menangani inisiasi/verifikasi operasional.
- Saran rekening: akun saldo marketplace yang cocok dengan platform, kemudian
  rekening default, lalu rekening aktif pertama. Operator tetap bebas mengganti.
- Tambah rekening inline menggunakan flow rekening existing sehingga COA aset
  rekening dibuat otomatis dan tidak ada UUID yang di-hardcode.

## Blockers
- Tidak ada.

## Verification Evidence

- Migration diterapkan dan diterapkan ulang di database disposable tanpa error.
- Regression `20260817_return_refund_accounting.sql` lulus dan seluruh fixture
  di-rollback; mencakup stok, saldo rekening, mutasi, dua jurnal, audit,
  idempotensi, dan role gate.
- Function public adalah `SECURITY INVOKER`; core berada di schema `private`
  dengan locked empty `search_path`. `anon` tidak dapat execute dan
  `authenticated` mendapat grant minimum yang dibutuhkan wrapper.
- `pnpm type-check`, ESLint web, `pnpm build`, dan `git diff --check` lulus.
- Database lint tidak menemukan isu pada function baru. Temuan yang tampil
  terbatas pada function lama dengan temporary table/parameter yang sudah ada.
- Production `jogqvffdjtjqdnflvubi` sudah mencatat migration
  `20260817103247_return_refund_accounting.sql` dan dry-run berikutnya up-to-date.
- Production COA `4.1.90` aktif, system, parent `4.1`, bertipe revenue dengan
  normal balance debit.
- Protected master tetap utuh: profiles 3, COA 46, expense categories 14,
  settings 6, fiscal periods 12, dan rekening 3.
- Data transaksi UAT tetap bersih: products, returns, stock movements, bank
  transactions, dan journal entries masing-masing 0.
- Feature branch `feat/return-refund-accounting` dipush dengan commit utama
  `9ef881c`; draft PR [#25](https://github.com/jhordideamarall/sneakervault/pull/25)
  dibuat terhadap `main`.
- Vercel production deployment `dpl_DtVJGM5FPEyZwtYhLW36D3ZtWsos` berstatus
  `READY`; build TypeScript dan seluruh route berhasil.
- URL production: [https://dewinst.vercel.app](https://dewinst.vercel.app).

## Files Modified
- `artifacts/053-return-refund-accounting-production/status.md`
- `docs/superpowers/2026-08-17-return-refund-accounting-production.md`
- `apps/web/supabase/migrations/20260817103247_return_refund_accounting.sql`
- `apps/web/supabase/tests/20260817_return_refund_accounting.sql`
- `apps/web/src/components/returns/returns-client.tsx`
- `apps/web/src/lib/actions/returns.ts`
- `apps/web/src/lib/queries/index.ts`
- `apps/web/src/components/laporan-keuangan/laba-rugi-client.tsx`
- `apps/web/src/config/permissions.ts`
- `packages/shared/src/validators.ts`
- `packages/supabase/src/types.ts`
