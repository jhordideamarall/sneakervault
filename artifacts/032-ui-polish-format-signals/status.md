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

## Verifikasi
- type-check & `pnpm build` hijau.
- Visual QA manual (collapse persist, titik per role via chip view-as, format WIB) — belum dijalankan.

## Files (utama)
- apps/web/src/lib/{format,sidebar-signals}.ts (baru)
- packages/shared/src/constants.ts (status maps)
- apps/web/src/components/dashboard/{right-sidebar-slot,sidebar}.tsx
- apps/web/src/lib/use-realtime-refresh.ts
- apps/web/src/app/(dashboard)/layout.tsx
- ~30 client components (sweep format/status)
- migration 20260612000300_realtime_signal_tables.sql
