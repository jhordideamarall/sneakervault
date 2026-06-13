# UI Polish — Collapse Sidebar Kanan, Format Standar, Signal Aktivitas

**Status:** [x] Done (pending visual QA manual)
**Sprint:** UI Polish pre-demo
**Tanggal:** 2026-06-12

## Part A — Sidebar kanan collapsible (rail ikon)
- [x] `right-sidebar-slot.tsx`: state collapsed + persist localStorage (`rsb:collapsed`), rail 48px (ikon profil/kalender/aktivitas) klik expand, tombol PanelRightClose/Open, POS tetap null, anti-SSR-mismatch (mount effect).

## Part B — Format data terstandar (menyeluruh)
- [x] `lib/format.ts` (baru): formatRupiah/Accounting/Short, formatNumber, formatDate/Short/Long/Month/DateTime/TimeOnly — **WIB di-pin** (Asia/Jakarta) cegah tanggal meleset di Vercel UTC.
- [x] Status badge konsolidasi ke `packages/shared/constants.ts`: ORDER/RETURN/DELETE_REQUEST/EXPENSE/STOCK_OPNAME LABELS+TONES (+type BadgeTone).
- [x] Sweep ~30 file: ganti helper currency/date lokal → import pusat; status map lokal → shared (orders, recent-orders, returns, delete-requests, expenses, stock-opname). Fix 2 bug locale di rekonsiliasi-client.

## Part C — Signal aktivitas lengkap di sidebar (titik warna)
- [x] `lib/sidebar-signals.ts` (baru): getSidebarSignals(roles) — retur, stok rendah, opname, order packing, PO approve, PO terima, faktur AP, invoice AR, settlement pending, bank belum rekon, req hapus. Gated per-role.
- [x] Layout pass `signals` (effective roles) ke Sidebar.
- [x] `sidebar.tsx`: titik merah (urgent)/amber (perhatian) di item + header grup (saat grup tertutup).
- [x] `use-realtime-refresh.ts`: +stock_opname_sessions, purchase_orders, purchase_invoices, sales_invoices, bank_transactions.
- [x] Migration `20260612000300_realtime_signal_tables.sql`: tambah 5 tabel ke publication supabase_realtime (idempotent).

## Part D — Input nominal pakai pemisah ribuan
- [x] Sweep lanjutan input uang mentah ke `NumberInput`: faktur pembelian, pembayaran vendor, akun/mutasi kas-bank, pengeluaran, penerimaan kas customer, invoice penjualan, jurnal manual, DP/manual PO, dan modal edit produk.
- [x] Input angka non-uang tetap `type="number"`: qty, size, persen DP, sort order, stock opname, barcode quantity, dan axis chart.

## Part E — Modal inventory proporsional
- [x] `packages/ui/src/dialog.tsx`: tambah padding default, batas tinggi viewport, scroll aman, width mobile, dan posisi close button responsif untuk semua `DialogContent` default.
- [x] `condition-updater-modal.tsx`: lebarkan status modal ke `max-w-xl` supaya tiga pilihan status tidak sesak.
- [x] Audit statis modal lain: customer, akun bank, mutasi, jurnal, retur, supplier, delete request, dan POS memakai padding/header/body sendiri atau `Card` padded; tidak kena bug clipping `DialogContent`.

## Verifikasi
- type-check & `pnpm build` hijau.
- `pnpm --filter @sneakervault/web type-check` hijau.
- `pnpm --filter @sneakervault/web lint` hijau dengan 81 warning existing (tidak ada error).
- `git diff --check` hijau.
- Prettier tidak dijalankan: config mencari `prettier-plugin-tailwindcss` yang belum terpasang.
- Browser in-app QA terblokir: sesi Browser `iab` tidak tersedia di runtime Codex saat dicek.
- Playwright screenshot QA terblokir: `pnpm exec playwright --version` gagal karena command `playwright` belum tersedia di repo.
- Visual QA manual (collapse persist, titik per role via chip view-as, format WIB) — belum dijalankan.

## Files (utama)
- apps/web/src/lib/{format,sidebar-signals}.ts (baru)
- packages/shared/src/constants.ts (status maps)
- apps/web/src/components/dashboard/{right-sidebar-slot,sidebar}.tsx
- apps/web/src/lib/use-realtime-refresh.ts
- apps/web/src/app/(dashboard)/layout.tsx
- ~30 client components (sweep format/status)
- apps/web/src/components/{pembelian,penjualan,kas-bank,buku-besar,inventory}/* client form nominal
- packages/ui/src/dialog.tsx
- apps/web/src/components/inventory/condition-updater-modal.tsx
- migration 20260612000300_realtime_signal_tables.sql
