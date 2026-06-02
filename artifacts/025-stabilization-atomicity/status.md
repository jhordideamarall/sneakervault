# Stabilization, Atomicity & Reproducibility

**Status:** [x] In Progress | [ ] Done | [ ] Blocked
**Sprint:** Post-024 hardening (review lanjutan)
**Tanggal Mulai:** 2026-06-02
**Owner:** Jhordi + Claude

## Konteks
Lanjutan setelah audit Codex (024). Fokus: tutup celah korektnes paling sensitif (akuntansi/stok), bikin sistem **siap di-test dari nol**, lalu reset data di akhir.

## Selesai (terverifikasi)
- [x] **Bug input POS "mentok 4 digit"** — `parseFormattedNumber` di `packages/ui/src/input.tsx` deterministik per-locale. Verified: simulasi keystroke + type-check.
- [x] **Migration `operational_hardening_no_reset` di-APPLY ke remote** — sebelumnya belum, sehingga `create_stock_movement` tidak ada → semua flow stok error. Verified via `pg_proc`.
- [x] **Role gate `adjustment` = owner + admin_gudang** — selaras `WAREHOUSE_ROLES` opname (sebelumnya owner-only → opname admin_gudang bakal gagal).
- [x] **Auth perf** — `getCurrentUser` dibungkus React `cache()` (file `lib/auth-session.ts`); render-side auth lookup 3x→1x per navigasi. Type-check ✅.
- [x] **POS checkout ATOMIK** — migration `20260602173000_atomic_pos_checkout.sql`: `app_post_journal` (poster jurnal generik reusable) + `pos_checkout` (semua write 1 transaksi, anti-oversell). `pos.ts` di-rewire (290→81 baris). Verified end-to-end via MCP (stok/bank/jurnal balanced) lalu rollback.
- [x] **Seed CoA + kategori reproducible** — migration `20260602180000_seed_chart_of_accounts.sql` (idempotent, derived dari DB). Menutup kerapuhan: CoA dulu hanya di remote → fresh DB bakal kosong → jurnal gagal. Dry-run + apply no-op (36/26/14).

## Belum (hardening lanjutan — kerjakan fokus per flow, pola POS)
Gunakan `app_post_journal` yang sudah ada. Tiap flow: baca penuh → 1 PL/pgSQL function → dry-run rollback (verifikasi jurnal balance + stok + saldo) → rewire TS → type-check.

- [ ] **A. PO receive atomik** (`purchase-receive.ts`, 422 baris) — rantai terpanjang: stok+HPP+movement per line → auto faktur + `journalForPurchaseInvoice` (Dr 1.1.05 + Dr 2.1.02 PPN / Cr 2.1.01) → auto vendor payment (cash/dp) + alokasi + saldo bank + bank_tx + `journalForVendorPayment` (Dr 2.1.01 / Cr bank). Catatan: HPP recalc & status PO ikut.
- [ ] **B. Reversal payment atomik** (`customer-payments.ts`, `vendor-payments.ts`) — update invoice + restore saldo bank + bank_tx + `reverseJournalBySource` + delete payment, 1 transaksi.
- [ ] **C. Approve opname atomik** (`stock-opname.ts`) — per line update qty + movement + jurnal penyesuaian; pindahkan movement SEBELUM update qty.

## Catatan
- Flow A/B/C **sudah berfungsi** dengan error-handling (Codex) — yang kurang hanya rollback-otomatis saat gagal di tengah (jarang). Bukan blocker untuk UAT/test.
- Duplikasi sementara: jurnal POS di SQL vs `journalForSalesInvoice` di TS untuk sales non-POS. Versi TS baru bisa dihapus setelah semua flow pindah ke RPC.

## Reset DB (LANGKAH TERAKHIR, setelah ≥90% & disetujui)
Reset DATA saja (BUKAN `db reset`/schema): hapus produk + semua transaksi; **pertahankan** auth/profiles, chart_of_accounts, expense_categories, bank_accounts (saldo→0). Lalu panduan test dari nol.
