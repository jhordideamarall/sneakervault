# Settlement 2-Fase -> Finance Reconciliation

**Status:** [x] Done (pending E2E dgn file nyata)
**Sprint:** Marketplace File-Based Sync
**Tanggal Mulai:** 2026-06-12
**Tanggal Selesai:** 2026-06-12

## Tasks
- [x] RPC atomik `settle_marketplace_atomic` (pending + released)
- [x] Parser settlement (`settlement-parsers.ts`) — alias Shopee & Tiktok/Tokopedia
- [x] Server action: `listActiveBankAccounts`, `reconcileSettlement`, `commitSettlement`
- [x] UI `settlement-import-client.tsx` — phase toggle, channel, diff table, bank picker (released)
- [x] Page `/penjualan/settlement` + permission (owner/finance) + sidebar
- [x] Catat batch ke `marketplace_imports` (kind=settlement)
- [x] type-check hijau

## Blockers
- E2E dgn file settlement nyata belum dijalankan. Shopee settlement template yg diberi hanya header period — kolom data perlu validasi saat ada file income report asli.

## Files Modified
- apps/web/supabase/migrations/20260612000200_settle_marketplace_atomic.sql
- apps/web/src/lib/marketplace/settlement-parsers.ts (baru)
- apps/web/src/lib/actions/settlement-import.ts (baru)
- apps/web/src/components/penjualan/settlement-import-client.tsx (baru)
- apps/web/src/app/(dashboard)/penjualan/settlement/page.tsx (baru)
- permissions.ts, sidebar.tsx

## Treatment Akuntansi (disetujui di plan)
- Fase pending (belum cair): Dr 1.1.03 Saldo Marketplace (net) + Dr 6.1 biaya aktual (total-net) ; Cr 1.1.04 Piutang (total). AR lunas, dana parkir di Saldo Marketplace.
- Fase released (cair): Dr Bank (net) ; Cr 1.1.03 ; invoice status=paid; bank balance + bank_transaction.
- Idempotent: re-upload skip yg sudah >= fase target. TIDAK menyentuh stok (hindari double-count vs packing).
